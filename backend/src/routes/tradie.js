'use strict';

const express = require('express');

const { db } = require('../firebaseAdmin');
const { requireAuth, requireRole } = require('../middleware/auth');
const { safeToMillis } = require('../utils/firestore');
const { JOB_STATUSES, normalizeStatus } = require('../constants/jobStatuses');
const {
  createExpressAccount,
  createAccountLink,
  retrieveAccount,
  createExpressDashboardLoginLink,
  retrieveConnectAccountBalance,
} = require('../services/stripe');
const { phase1KeysSet } = require('../shared/expertiseCatalog');
const { computeProfileCompleted } = require('../utils/v11TradieEligibility');
const { getShortJobRef } = require('../../../shared/taskReference');
const { paymentDisplayTaskTitle } = require('../../../shared/paymentDisplayTaskTitle');
const { admin } = require('../firebaseAdmin');
const { standardLaunchFeePercent } = require('../../../shared/feePlans');
const { expressAccountIdempotencyKey } = require('../services/stripeIdempotency');
const { isStripeEnabled, sendStripeDisabled, sendIfStripeDisabled } = require('../config/stripeEnabled');
const {
  DEFAULT_AUTO_ACTOR_UID,
  foundingExpertAutoEnrollEnabled,
  scheduleMaybeAutoEnrollFoundingExpert,
} = require('../services/foundingExpertAutoEnrollmentService');
const { estimateExpertFeeForGross } = require('../services/expertFeeProgram');
const {
  deriveReleasedFeeBenefitLabel,
  granularReleasedPlatformFees,
} = require('../utils/paymentActivityReleasedDisplay');

const router = express.Router();

const DEFAULT_PLATFORM_FEE_PERCENT = standardLaunchFeePercent();

/** When true, Experts UI may show itemised Taskio platform fee; otherwise show fee as not itemised in payments views. */
function paymentsPlatformFeeLineExplicit() {
  return String(process.env.TASKIO_PLATFORM_FEE_EXPLICIT || '').toLowerCase() === 'true';
}

function timestampToMillis(ts) {
  if (!ts || typeof ts !== 'object') return null;
  const sec = ts._seconds ?? ts.seconds;
  if (sec == null) return null;
  const ns = ts._nanoseconds ?? ts.nanoseconds ?? 0;
  return sec * 1000 + Math.floor(Number(ns) / 1e6);
}

function providerCentsForTradieJob(job) {
  if (Number.isFinite(job.totalProviderReleasedCents) && job.totalProviderReleasedCents > 0) {
    return Math.round(job.totalProviderReleasedCents);
  }
  if (Number.isFinite(job.providerAmount) && job.providerAmount > 0) {
    return Math.round(job.providerAmount);
  }
  const gross = Number.isFinite(job.paymentAmountCents) ? job.paymentAmountCents : 0;
  if (!gross) return 0;
  const pct = Number.isFinite(job.platformFeePercent) ? job.platformFeePercent : DEFAULT_PLATFORM_FEE_PERCENT;
  const fee = Math.round((gross * pct) / 100);
  return gross - fee;
}

function platformFeeCentsForTradieJob(job) {
  if (Number.isFinite(job.totalPlatformFeeReleasedCents) && job.totalPlatformFeeReleasedCents >= 0) {
    return Math.round(job.totalPlatformFeeReleasedCents);
  }
  if (Number.isFinite(job.platformFeeAmount) && job.platformFeeAmount >= 0) {
    return Math.round(job.platformFeeAmount);
  }
  const gross = Number.isFinite(job.paymentAmountCents) ? job.paymentAmountCents : 0;
  if (!gross) return 0;
  const pct = Number.isFinite(job.platformFeePercent) ? job.platformFeePercent : DEFAULT_PLATFORM_FEE_PERCENT;
  return Math.round((gross * pct) / 100);
}

/** Expert share breakdown for released jobs (new fields + legacy fallback). */
function releasedExpertBreakdownCents(job) {
  const total = providerCentsForTradieJob(job);
  const hasBase = job.baseProviderReleasedCents != null && Number.isFinite(Number(job.baseProviderReleasedCents));
  const hasVar = job.variationProviderReleasedCents != null && Number.isFinite(Number(job.variationProviderReleasedCents));
  if (hasBase || hasVar) {
    const varPart = hasVar ? Math.round(Number(job.variationProviderReleasedCents)) : 0;
    const basePart = hasBase ? Math.round(Number(job.baseProviderReleasedCents)) : Math.max(0, total - varPart);
    return {
      baseProviderReleasedCents: basePart,
      variationProviderReleasedCents: varPart,
      totalProviderReleasedCents: total,
    };
  }
  return {
    baseProviderReleasedCents: total,
    variationProviderReleasedCents: 0,
    totalProviderReleasedCents: total,
  };
}

function normalizeStringArray(input) {
  const arr = Array.isArray(input) ? input : [];
  const out = [];
  for (const x of arr) {
    const s = String(x || '').trim();
    if (!s) continue;
    if (!out.includes(s)) out.push(s);
  }
  return out;
}

/**
 * Adds `expertNeedsQuoteAction` so dashboards can prioritise quote/revision work without N per-job reads from the client.
 */
function quoteDocJobId(raw) {
  if (raw == null) return '';
  if (typeof raw === 'string') return raw;
  if (typeof raw === 'object' && raw.id) return String(raw.id);
  return String(raw);
}

async function attachExpertQuoteAttentionFields(jobs, tradieUid) {
  if (!Array.isArray(jobs) || jobs.length === 0) return jobs;

  const jobIds = jobs.map((j) => j.id).filter(Boolean);
  const jobIdSet = new Set(jobIds);

  const quotesSnap = await db.collection('quotes').where('tradieUid', '==', tradieUid).get();
  const quotesByJobId = new Map();
  for (const doc of quotesSnap.docs) {
    const q = doc.data() || {};
    const jid = quoteDocJobId(q.jobId);
    if (!jid || !jobIdSet.has(jid)) continue;
    const list = quotesByJobId.get(jid) || [];
    list.push(q);
    quotesByJobId.set(jid, list);
  }
  for (const [, list] of quotesByJobId) {
    list.sort((a, b) => safeToMillis(b.createdAt) - safeToMillis(a.createdAt));
  }

  const revisionRefs = jobIds.map((jid) =>
    db.collection('jobs').doc(jid).collection('quote_revision_requests').doc(tradieUid)
  );
  const revisionSnaps = revisionRefs.length > 0 ? await db.getAll(...revisionRefs) : [];

  return jobs.map((job, idx) => {
    const st = normalizeStatus(job.status);
    const allowsQuote = st === JOB_STATUSES.OPEN || st === JOB_STATUSES.QUOTED;
    const arr = quotesByJobId.get(String(job.id)) || [];
    const latest = arr[0];
    const latestStatus = latest?.status;
    const hasActiveQuote = latestStatus === 'submitted' || latestStatus === 'accepted';
    const revSnap = revisionSnaps[idx];
    const hasOpenRevision = revSnap && revSnap.exists && revSnap.data()?.status === 'open';
    const expertNeedsQuoteAction = allowsQuote && (!hasActiveQuote || hasOpenRevision);
    return { ...job, expertNeedsQuoteAction };
  });
}

async function recoverAcceptedTradieUid(jobRef, jobData) {
  const current = jobData && typeof jobData === 'object' ? { ...jobData } : {};
  if (current.acceptedTradieUid || !current.acceptedQuoteId) {
    return current;
  }

  const acceptedQuoteDoc = await db.collection('quotes').doc(current.acceptedQuoteId).get();
  if (!acceptedQuoteDoc.exists) {
    return current;
  }

  const acceptedQuote = acceptedQuoteDoc.data() || {};
  const acceptedTradieUid = String(acceptedQuote.tradieUid || '').trim();
  if (!acceptedTradieUid) {
    return current;
  }

  await jobRef.update({
    acceptedTradieUid,
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  });

  return {
    ...current,
    acceptedTradieUid,
  };
}

function validatePhase1Keys(keys) {
  for (const k of keys) {
    if (!phase1KeysSet.has(k)) {
      const err = new Error('This task category is not available in the current release.');
      err.code = 'PHASE1_ONLY';
      throw err;
    }
  }
}

async function ensureExpertiseApprovedPhase1({ uid, userRef, userDoc }) {
  // NOTE: Firestore does not allow FieldValue.serverTimestamp() inside arrays.
  const now = admin.firestore.Timestamp.now();
  const existingApproved = Array.isArray(userDoc?.expertiseApproved) ? userDoc.expertiseApproved : null;
  const legacy = userDoc?.expertise;
  const log = Array.isArray(userDoc?.expertiseChangeLog) ? userDoc.expertiseChangeLog.slice(0, 50) : [];
  let approved = existingApproved;
  let changed = false;

  if (!approved && legacy) {
    const legacyArr = Array.isArray(legacy)
      ? legacy
      : String(legacy || '')
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
    approved = legacyArr;
    log.push({ action: 'migrate', category: 'legacy_expertise', by: 'admin', at: now });
    changed = true;
  }

  approved = normalizeStringArray(approved || []);
  const kept = approved.filter((k) => phase1KeysSet.has(k));
  const removed = approved.filter((k) => !phase1KeysSet.has(k));
  if (removed.length > 0) {
    for (const r of removed) log.push({ action: 'phase1_prune', category: r, by: 'admin', at: now });
    approved = kept;
    changed = true;
  } else {
    approved = kept;
  }

  if (!changed) return userDoc;

  await userRef.set(
    {
      expertiseApproved: approved,
      expertiseUpdatedAt: admin.firestore.FieldValue.serverTimestamp(),
      expertiseChangeLog: log.slice(-50),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    },
    { merge: true }
  );
  const fresh = await userRef.get();
  return fresh.data() || userDoc;
}

/**
 * GET /api/tradie/profile
 * Phase 1: returns ONLY expertiseApproved (Tier 1 keys).
 */
router.get('/api/tradie/profile', requireAuth, requireRole('tradie'), async (req, res) => {
  try {
    const uid = req.user.uid;
    const userRef = db.collection('users').doc(uid);
    const snap = await userRef.get();
    if (!snap.exists) return res.status(404).send({ message: 'User not found.' });
    const raw = snap.data() || {};
    const data = await ensureExpertiseApprovedPhase1({ uid, userRef, userDoc: raw });

    return res.status(200).send({
      uid,
      role: 'tradie',
      expertiseApproved: Array.isArray(data.expertiseApproved) ? data.expertiseApproved : [],
      expertiseUpdatedAt: data.expertiseUpdatedAt || null,
    });
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error('GET /api/tradie/profile failed:', e);
    return res.status(500).send({ message: 'Failed to load expert profile.' });
  }
});

/**
 * POST /api/tradie/fee-estimate
 * Body: { grossAmountCents: number, jobId?: string } — jobId is accepted but not used for fee math.
 */
function parseFeeEstimateGrossCents(body) {
  const raw = body?.grossAmountCents;
  if (typeof raw !== 'number' || !Number.isFinite(raw)) return null;
  if (!Number.isInteger(raw) || raw <= 0) return null;
  return raw;
}

router.post('/api/tradie/fee-estimate', requireAuth, requireRole('tradie'), async (req, res) => {
  try {
    const grossAmountCents = parseFeeEstimateGrossCents(req.body || {});
    if (grossAmountCents == null) {
      return res.status(400).send({
        message: 'grossAmountCents must be a positive integer (cents).',
      });
    }

    const uid = req.user.uid;
    const userRef = db.collection('users').doc(uid);
    const snap = await userRef.get();
    if (!snap.exists) return res.status(404).send({ message: 'User not found.' });
    const expertProfile = snap.data() || {};

    const out = estimateExpertFeeForGross({
      expertProfile,
      grossAmountCents,
      now: new Date(),
    });
    return res.status(200).send(out);
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error('POST /api/tradie/fee-estimate failed:', e);
    if (e?.code === 'INVALID_GROSS_CENTS' || e?.code === 'INVALID_FEE_BPS') {
      return res.status(400).send({ message: String(e.message || 'Invalid request.') });
    }
    return res.status(500).send({ message: 'Failed to estimate fees.' });
  }
});

/**
 * PUT /api/tradie/expertise
 * Body: { add: string[], remove: string[] }
 */
router.put('/api/tradie/expertise', requireAuth, requireRole('tradie'), async (req, res) => {
  try {
    const uid = req.user.uid;
    const add = normalizeStringArray(req.body?.add);
    const remove = normalizeStringArray(req.body?.remove);

    // Validate strictly Phase 1 only
    validatePhase1Keys(add);
    validatePhase1Keys(remove);

    const userRef = db.collection('users').doc(uid);
    const snap = await userRef.get();
    if (!snap.exists) return res.status(404).send({ message: 'User not found.' });
    const raw = snap.data() || {};
    const data = await ensureExpertiseApprovedPhase1({ uid, userRef, userDoc: raw });

    const before = Array.isArray(data.expertiseApproved) ? data.expertiseApproved : [];
    const next = before.slice();

    // NOTE: Firestore does not allow FieldValue.serverTimestamp() inside arrays.
    const now = admin.firestore.Timestamp.now();
    const log = Array.isArray(data.expertiseChangeLog) ? data.expertiseChangeLog.slice(0, 50) : [];

    for (const k of add) {
      if (!next.includes(k)) {
        next.push(k);
        log.push({ action: 'add', category: k, by: 'tradie', at: now });
      }
    }
    for (const k of remove) {
      const idx = next.indexOf(k);
      if (idx >= 0) {
        next.splice(idx, 1);
        log.push({ action: 'remove', category: k, by: 'tradie', at: now });
      }
    }

    // Always keep Phase 1 only (defensive)
    const final = next.filter((k) => phase1KeysSet.has(k));

    const mergedForCompletion = { ...(data || {}), expertiseApproved: final };
    const profileCompleted = computeProfileCompleted(mergedForCompletion, req.user);

    await userRef.set(
      {
        expertiseApproved: final,
        expertiseUpdatedAt: admin.firestore.FieldValue.serverTimestamp(),
        expertiseChangeLog: log.slice(-50),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        profileCompleted,
      },
      { merge: true }
    );

    if (foundingExpertAutoEnrollEnabled()) {
      await scheduleMaybeAutoEnrollFoundingExpert({
        db,
        admin,
        expertUid: uid,
        trigger: 'tradie_expertise_updated',
        actorUidForApproval: DEFAULT_AUTO_ACTOR_UID,
      });
    }

    return res.status(200).send({
      message: 'Expertise updated.',
      expertiseApproved: final,
      profileCompleted,
    });
  } catch (e) {
    if (e?.code === 'PHASE1_ONLY') {
      return res.status(400).send({ message: 'This task category is not available in the current release.' });
    }
    // eslint-disable-next-line no-console
    console.error('PUT /api/tradie/expertise failed:', e);
    return res.status(500).send({ message: 'Failed to update expertise.' });
  }
});

/* -------------------------------------------------------------------------- */
/* Tradie Endpoints                                                            */
/* -------------------------------------------------------------------------- */

// Get all jobs a tradie has been invited to
router.get('/api/tradie/jobs', requireAuth, requireRole('tradie'), async (req, res) => {
  try {
    const tradieUid = req.user.uid;

    const jobsSnapshot = await db.collection('jobs')
      .where('invitedTradieUids', 'array-contains', tradieUid)
      .get();

    if (jobsSnapshot.empty) return res.status(200).send([]);

    // Always use the Firestore document id — spread data second so a stale/wrong `id` field in the payload cannot win.
    const jobs = jobsSnapshot.docs
      .map((doc) => {
        const data = doc.data() || {};
        return { ...data, id: doc.id };
      })
      .filter((job) => job.postingReady !== false);
    jobs.sort((a, b) => safeToMillis(b.createdAt) - safeToMillis(a.createdAt));

    const enriched = await attachExpertQuoteAttentionFields(jobs, tradieUid);
    return res.status(200).send(enriched);
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error("Error fetching tradie's jobs:", error);
    return res.status(500).send({ message: 'Failed to fetch tasks for expert.' });
  }
});

// Get a single job for an invited tradie
router.get('/api/tradie/jobs/:jobId', requireAuth, requireRole('tradie'), async (req, res) => {
  try {
    const tradieUid = req.user.uid;
    const { jobId } = req.params;

    const jobRef = db.collection('jobs').doc(jobId);
    const jobDoc = await jobRef.get();
    if (!jobDoc.exists) return res.status(404).send({ message: 'Task not found.' });

    const jobData = await recoverAcceptedTradieUid(jobRef, jobDoc.data());

    if (jobData.postingReady === false) {
      return res.status(404).send({ message: 'Task not found.' });
    }

    if (!jobData.invitedTradieUids || !jobData.invitedTradieUids.includes(tradieUid)) {
      return res.status(403).send({ message: 'Forbidden: You are not invited to quote on this task.' });
    }

    const [enriched] = await attachExpertQuoteAttentionFields([{ ...jobData, id: jobDoc.id }], tradieUid);
    return res.status(200).send(enriched);
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('Error fetching single job for tradie:', error);
    return res.status(500).send({ message: 'Failed to fetch task details.' });
  }
});

/**
 * GET /api/tradie/payment-activity
 * Jobs where this expert received a Connect transfer (paymentState released) plus secured-funds summary.
 */
router.get('/api/tradie/payment-activity', requireAuth, requireRole('tradie'), async (req, res) => {
  try {
    const tradieUid = req.user.uid;
    const snap = await db.collection('jobs').where('acceptedTradieUid', '==', tradieUid).limit(400).get();
    const jobs = snap.docs.map((doc) => ({ ...doc.data(), id: doc.id }));

    const released = jobs.filter((j) => j.paymentState === 'released');
    const securedInEscrow = jobs.filter(
      (j) => j.paymentState === 'in_escrow' && normalizeStatus(j.status) !== JOB_STATUSES.CANCELLED
    );

    let totalReleasedToStripeCents = 0;
    const releasedRows = released
      .map((j) => {
        const br = releasedExpertBreakdownCents(j);
        const providerAmountCents = br.totalProviderReleasedCents;
        totalReleasedToStripeCents += providerAmountCents;
        const displayTaskTitle = paymentDisplayTaskTitle(j);
        const taskNumber = j.taskNumber != null ? String(j.taskNumber) : null;
        const displayReference = getShortJobRef({ id: j.id, taskNumber: j.taskNumber, referenceNumber: j.referenceNumber });
        const grossTotal = Number.isFinite(j.totalGrossReleasedCents)
          ? j.totalGrossReleasedCents
          : (Number.isFinite(j.paymentAmountCents) ? j.paymentAmountCents : 0)
            + (Number.isFinite(j.variationGrossReleasedCents) ? j.variationGrossReleasedCents : 0);
        const baseClientPaid = Number.isFinite(j.baseAmountReleasedCents)
          ? j.baseAmountReleasedCents
          : (Number.isFinite(j.paymentAmountCents) ? j.paymentAmountCents : 0);
        const variationClientPaid = Number.isFinite(j.variationGrossReleasedCents) ? j.variationGrossReleasedCents : 0;
        const taskioFeeCents = platformFeeCentsForTradieJob(j);
        const feeParts = granularReleasedPlatformFees(j);
        const feeBenefitLabel =
          deriveReleasedFeeBenefitLabel(j, {
            taskioFeeCents,
            grossReleasedCents: grossTotal,
          }) || null;
        const statusReleased = 'Released to Stripe';

        const baseReleaseFeeSrc =
          j.baseReleaseFeeSource != null && String(j.baseReleaseFeeSource).trim()
            ? String(j.baseReleaseFeeSource).trim()
            : null;
        const variationReleaseFeeSrc =
          j.variationReleaseFeeSource != null && String(j.variationReleaseFeeSource).trim()
            ? String(j.variationReleaseFeeSource).trim()
            : null;

        return {
          jobId: j.id,
          title: displayTaskTitle,
          displayTaskTitle,
          taskNumber,
          displayReference,
          providerAmountCents,
          taskioFeeCents,
          expertReleasedCents: providerAmountCents,
          feeBenefitLabel,
          baseReleaseFeeSource: baseReleaseFeeSrc,
          variationReleaseFeeSource: variationReleaseFeeSrc,
          baseProviderReleasedCents: br.baseProviderReleasedCents,
          variationProviderReleasedCents: br.variationProviderReleasedCents,
          platformFeeAmountCents: taskioFeeCents,
          grossPaymentCents: Number.isFinite(j.paymentAmountCents) ? j.paymentAmountCents : 0,
          totalGrossReleasedCents: grossTotal,
          clientPaidCents: grossTotal,
          feesTotalCents: taskioFeeCents,
          currency: (j.paymentCurrency && String(j.paymentCurrency).toLowerCase()) || 'aud',
          transferId: j.transferId || null,
          releasedAtMs: timestampToMillis(j.releasedAt),
          statusLabel: statusReleased,
          includesVariations: br.variationProviderReleasedCents > 0,
          breakdown: {
            title: displayTaskTitle,
            taskRef: taskNumber,
            taskDisplayReference: displayReference,
            releasedAtMs: timestampToMillis(j.releasedAt),
            statusLabel: statusReleased,
            baseJobClientPaidCents: baseClientPaid,
            variationClientPaidCents: variationClientPaid,
            totalClientPaidCents: grossTotal,
            stripeProcessingFeeCents: null,
            stripeProcessingNote:
              'Card processing is handled by Stripe. See balances and fees in your Stripe Express Dashboard.',
            taskioPlatformFeeCents: taskioFeeCents,
            baseTaskioFeeCents: feeParts.baseTaskioFeeCents,
            variationTaskioFeeCents: feeParts.variationTaskioFeeCents,
            baseExpertReleasedCents: br.baseProviderReleasedCents,
            variationExpertReleasedCents: br.variationProviderReleasedCents,
            feeBenefitLabel,
            baseReleaseFeeSource: baseReleaseFeeSrc,
            variationReleaseFeeSource: variationReleaseFeeSrc,
            paymentsShowPlatformFeeLine: paymentsPlatformFeeLineExplicit(),
            expertReleasedCents: providerAmountCents,
            baseTransferId: j.transferId || null,
            variationTransferIds: j.releaseVariationTransferIds && typeof j.releaseVariationTransferIds === 'object'
              ? j.releaseVariationTransferIds
              : {},
            bankPayoutStatus: null,
            bankPayoutNote: 'Bank payout timing is managed by Stripe.',
          },
        };
      })
      .sort((a, b) => (b.releasedAtMs || 0) - (a.releasedAtMs || 0));

    let totalSecuredInEscrowCents = 0;
    for (const j of securedInEscrow) {
      totalSecuredInEscrowCents += providerCentsForTradieJob(j);
    }

    const userDocPay = await db.collection('users').doc(tradieUid).get();
    const uPay = userDocPay.exists ? userDocPay.data() : {};
    const connectAcct = uPay.stripeAccountId || uPay.stripeConnectedAccountId;
    const hasStripeConnectedAccount = !!(connectAcct && String(connectAcct).trim());

    let stripeBalance = { dataAvailable: false };
    if (isStripeEnabled() && hasStripeConnectedAccount) {
      try {
        const bal = await retrieveConnectAccountBalance(connectAcct);
        const pick = (arr, cur) => {
          if (!Array.isArray(arr) || arr.length === 0) return { amount: 0, currency: cur };
          const match = arr.find((x) => String(x.currency || '').toLowerCase() === cur);
          const row = match || arr[0];
          return { amount: row.amount ?? 0, currency: String(row.currency || cur).toLowerCase() };
        };
        const cur = 'aud';
        const av = pick(bal.available, cur);
        const pe = pick(bal.pending, cur);
        stripeBalance = {
          dataAvailable: true,
          availableCents: av.amount,
          pendingCents: pe.amount,
          currency: av.currency || pe.currency || cur,
        };
      } catch (e) {
        // eslint-disable-next-line no-console
        console.error('payment-activity: Stripe balance read failed:', e?.message || e);
        stripeBalance = { dataAvailable: false };
      }
    }

    return res.status(200).send({
      summary: {
        totalReleasedToStripeCents,
        totalSecuredInEscrowCents,
        releasedJobCount: releasedRows.length,
        stripeBalance,
        hasStripeConnectedAccount,
        paymentsShowPlatformFeeLine: paymentsPlatformFeeLineExplicit(),
      },
      released: releasedRows,
    });
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('GET /api/tradie/payment-activity failed:', error);
    return res.status(500).send({ message: 'Failed to load payment activity.' });
  }
});

/* -------------------------------------------------------------------------- */
/* Stripe Connect (Express) Onboarding                                         */
/* -------------------------------------------------------------------------- */

/**
 * POST /api/tradie/stripe-dashboard-link
 * Returns a Stripe Express Dashboard URL for the authenticated expert.
 */
router.post('/api/tradie/stripe-dashboard-link', requireAuth, requireRole('tradie'), async (req, res) => {
  try {
    if (!isStripeEnabled()) {
      return sendStripeDisabled(res);
    }

    const uid = req.user.uid;
    const userDoc = await db.collection('users').doc(uid).get();
    if (!userDoc.exists) {
      return res.status(404).send({ message: 'User not found.' });
    }
    const u = userDoc.data() || {};
    const accountId = u.stripeAccountId || u.stripeConnectedAccountId;
    if (!accountId || !String(accountId).trim()) {
      return res.status(409).send({ message: 'Your payout account is not fully set up yet.' });
    }

    const link = await createExpressDashboardLoginLink(accountId);
    return res.status(200).send({ url: link.url });
  } catch (error) {
    if (sendIfStripeDisabled(res, error)) return;
    if (error && error.code === 'stripe_not_configured') {
      return res.status(400).send({ message: 'Stripe is not configured on the server.' });
    }
    // eslint-disable-next-line no-console
    console.error('POST /api/tradie/stripe-dashboard-link failed:', error);
    return res.status(500).send({ message: 'Could not open Stripe dashboard. Try again later.' });
  }
});

router.get('/api/tradie/stripe/status', requireAuth, requireRole('tradie'), async (req, res) => {
  try {
    if (!isStripeEnabled()) {
      return res.status(200).send({ enabled: false, onboardingStatus: 'not_enabled', code: 'stripe_disabled' });
    }

    const uid = req.user.uid;
    const userRef = db.collection('users').doc(uid);
    const userDoc = await userRef.get();
    const userData = userDoc.exists ? userDoc.data() : {};

    // Optional live refresh (useful in dev if webhooks are not reachable)
    const refresh = req.query.refresh === 'true';
    if (refresh && userData?.stripeAccountId) {
      const account = await retrieveAccount(userData.stripeAccountId);
      await userRef.set(
        {
          stripeChargesEnabled: !!account.charges_enabled,
          stripePayoutsEnabled: !!account.payouts_enabled,
          stripeRequirements: account.requirements || null,
          stripeOnboardingStatus: (account.charges_enabled && account.payouts_enabled) ? 'completed'
            : ((account.requirements?.currently_due || []).length > 0 ? 'action_required' : 'pending'),
        },
        { merge: true }
      );
    }

    const freshDoc = await userRef.get();
    const fresh = freshDoc.exists ? freshDoc.data() : {};

    return res.status(200).send({
      enabled: true,
      onboardingStatus: fresh.stripeOnboardingStatus || 'pending',
      chargesEnabled: !!fresh.stripeChargesEnabled,
      payoutsEnabled: !!fresh.stripePayoutsEnabled,
      requirements: fresh.stripeRequirements || null,
    });
  } catch (error) {
    if (sendIfStripeDisabled(res, error)) return;
    // eslint-disable-next-line no-console
    console.error('Error getting Stripe onboarding status:', error);
    return res.status(500).send({ message: 'Failed to get Stripe onboarding status.' });
  }
});

router.post('/api/tradie/stripe/onboarding-link', requireAuth, requireRole('tradie'), async (req, res) => {
  try {
    if (!isStripeEnabled()) {
      return sendStripeDisabled(res);
    }

    const uid = req.user.uid;
    const userRef = db.collection('users').doc(uid);
    const userDoc = await userRef.get();
    if (!userDoc.exists) return res.status(404).send({ message: 'User not found.' });
    const userData = userDoc.data();

    let stripeAccountId = userData.stripeAccountId;
    if (!stripeAccountId) {
      const account = await createExpressAccount({
        taskioUid: uid,
        email: userData.email,
        idempotencyKey: expressAccountIdempotencyKey(uid),
      });
      stripeAccountId = account.id;
      await userRef.set(
        {
          stripeAccountId,
          stripeOnboardingStatus: 'pending',
          stripeChargesEnabled: !!account.charges_enabled,
          stripePayoutsEnabled: !!account.payouts_enabled,
          stripeRequirements: account.requirements || null,
          stripeCreatedAt: new Date(),
        },
        { merge: true }
      );
    }

    const base = process.env.FRONTEND_URL.replace(/\/$/, '');
    const returnUrl = `${base}/tradie/dashboard?stripe=return`;
    const refreshUrl = `${base}/tradie/dashboard?stripe=refresh`;

    const link = await createAccountLink({
      accountId: stripeAccountId,
      refreshUrl,
      returnUrl,
    });

    return res.status(200).send({ url: link.url });
  } catch (error) {
    if (sendIfStripeDisabled(res, error)) return;
    // eslint-disable-next-line no-console
    console.error('Error creating Stripe onboarding link:', error);
    return res.status(500).send({ message: 'Failed to create Stripe onboarding link.' });
  }
});

module.exports = router;
