'use strict';

const express = require('express');

const { admin, db } = require('../../firebaseAdmin');
const { requireAuth, requireAdmin, requireSuperAdmin } = require('../../middleware/auth');
const { safeToMillis } = require('../../utils/firestore');
const {
  createTransfer,
  createRefund,
  createCheckoutSession,
  retrieveCheckoutSession,
  getSucceededChargeIdForConnectTransfer,
} = require('../../services/stripe');
const { logAdminJobAction, logJobEvent } = require('./shared/audit');
const { JOB_STATUSES, normalizeStatus } = require('../../constants/jobStatuses');
const { updateJobStatus } = require('../../services/jobStatusUpdates');
const { getTaskReferenceCode } = require('../../../../shared/taskReference');
const { getAdminRiskSignalsForJob } = require('../../services/adminRiskService');
const { getExpertTrustSummary } = require('../../services/expertTrustService');
const { evaluateJobRiskById } = require('../../services/riskAutomationPipeline');
const { defaultPlatformFeePercentFromEnv } = require('../../../../shared/feePlans');
const {
  createExpertReleaseStripeTransfers,
  persistExpertReleaseAfterTransfers,
} = require('../../services/expertJobRelease');
const { buildAdminPaymentFeeSummary } = require('../../utils/adminPaymentFeeSummary');

const router = express.Router();

/** Batch-load display names for homeowner + expert UIDs (single getAll per request). */
async function batchDisplayNamesByUid(jobs) {
  const uids = new Set();
  for (const j of jobs) {
    if (j.homeownerUid) uids.add(String(j.homeownerUid));
    if (j.acceptedTradieUid) uids.add(String(j.acceptedTradieUid));
  }
  const uidList = Array.from(uids);
  if (uidList.length === 0) return new Map();

  const refs = uidList.map((uid) => db.collection('users').doc(uid));
  const snaps = await db.getAll(...refs);
  const map = new Map();
  snaps.forEach((snap, i) => {
    if (!snap.exists) return;
    const d = snap.data() || {};
    const name = String(d.displayName || d.name || '').trim() || null;
    map.set(uidList[i], name);
  });
  return map;
}

router.get('/api/admin/jobs', requireAuth, requireAdmin, async (req, res) => {
  try {
    const statusFilter = req.query.status ? String(req.query.status).trim() : '';
    const refSearch = req.query.ref ? String(req.query.ref).trim().toUpperCase() : '';

    const jobsSnapshot = await db.collection('jobs').get();
    let jobs = jobsSnapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
    jobs.sort((a, b) => safeToMillis(b.createdAt) - safeToMillis(a.createdAt));

    if (statusFilter && statusFilter.toLowerCase() !== 'all') {
      const want = normalizeStatus(statusFilter);
      jobs = jobs.filter((j) => normalizeStatus(j.status) === want);
    }

    if (refSearch) {
      const needle = refSearch.replace(/\s/g, '');
      jobs = jobs.filter((j) => {
        const fromId = getTaskReferenceCode(String(j.id || '')).toUpperCase();
        if (fromId === needle || fromId.includes(needle)) return true;
        const rawNum = j.taskNumber ?? j.referenceNumber;
        if (rawNum != null && String(rawNum).trim() !== '') {
          const n = Number(rawNum);
          if (Number.isFinite(n) && n >= 0) {
            const padded = `TSK-${String(Math.min(Math.floor(Math.abs(n)), 999999)).padStart(4, '0')}`.toUpperCase();
            if (padded === needle) return true;
          }
        }
        return false;
      });
    }

    const nameByUid = await batchDisplayNamesByUid(jobs);
    const enriched = jobs.map((j) => ({
      ...j,
      homeownerName: j.homeownerUid ? nameByUid.get(String(j.homeownerUid)) || null : null,
      expertName: j.acceptedTradieUid ? nameByUid.get(String(j.acceptedTradieUid)) || null : null,
    }));

    return res.status(200).send(enriched);
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('Failed to fetch jobs:', error);
    return res.status(500).send({ message: 'Failed to fetch tasks' });
  }
});

/**
 * GET /api/admin/ops-summary
 * Aggregated operational counts for dashboard cards (same job set as list endpoint).
 */
router.get('/api/admin/ops-summary', requireAuth, requireAdmin, async (req, res) => {
  try {
    const jobsSnapshot = await db.collection('jobs').get();
    const jobs = jobsSnapshot.docs.map((d) => ({ id: d.id, ...d.data() }));

    let failedPayments = 0;
    let refundsInProgress = 0;
    let disputesAwaiting = 0;
    let disputesStale24h = 0;
    let riskHighJobs = 0;
    let riskCriticalJobs = 0;
    const STALE_MS = 24 * 60 * 60 * 1000;
    const now = Date.now();

    for (const j of jobs) {
      const ps = String(j.paymentState || '').toLowerCase();
      if (ps === 'payment_failed' || ps === 'refund_failed') failedPayments += 1;
      const st = normalizeStatus(j.status);
      if (st === JOB_STATUSES.REFUND_PENDING || ps === 'refund_pending') refundsInProgress += 1;
      if (st === JOB_STATUSES.DISPUTED) {
        disputesAwaiting += 1;
        const t = safeToMillis(j.disputedAt);
        if (t && now - t >= STALE_MS) disputesStale24h += 1;
      }
      const lvl = String(j.riskSummary?.level || '').toLowerCase();
      if (lvl === 'high') riskHighJobs += 1;
      if (lvl === 'critical') riskCriticalJobs += 1;
    }

    return res.status(200).send({
      failedPayments,
      refundsInProgress,
      disputesAwaiting,
      disputesStale24h,
      riskHighJobs,
      riskCriticalJobs,
    });
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('GET /api/admin/ops-summary failed:', error);
    return res.status(500).send({ message: 'Failed to load operational summary.' });
  }
});

/**
 * GET /api/admin/jobs/:jobId
 * Job + display names + job_events (for admin console).
 */
router.get('/api/admin/jobs/:jobId', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { jobId } = req.params;
    const jobRef = db.collection('jobs').doc(jobId);
    const jobDoc = await jobRef.get();
    if (!jobDoc.exists) return res.status(404).send({ message: 'Task not found.' });
    const job = { id: jobDoc.id, ...jobDoc.data() };

    let homeownerName = null;
    let expertName = null;
    if (job.homeownerUid) {
      const u = await db.collection('users').doc(String(job.homeownerUid)).get();
      if (u.exists) {
        const d = u.data() || {};
        homeownerName = String(d.displayName || d.name || '').trim() || null;
      }
    }
    if (job.acceptedTradieUid) {
      const u = await db.collection('users').doc(String(job.acceptedTradieUid)).get();
      if (u.exists) {
        const d = u.data() || {};
        expertName = String(d.displayName || d.name || '').trim() || null;
      }
    }

    const evSnap = await db.collection('job_events').where('jobId', '==', jobId).limit(200).get();
    const events = evSnap.docs
      .map((d) => ({ id: d.id, ...d.data() }))
      .sort((a, b) => safeToMillis(b.timestamp) - safeToMillis(a.timestamp))
      .slice(0, 100);

    const riskSignals = getAdminRiskSignalsForJob(job);
    const rs = job.riskSummary || {};
    const riskScore = rs.score != null
      ? {
        score: rs.score,
        level: rs.level,
        topFactors: Array.isArray(rs.topFactors) ? rs.topFactors : [],
        lastEvaluatedAtMs: rs.lastEvaluatedAtMs || null,
      }
      : null;
    let expertTrust = null;
    if (job.acceptedTradieUid) {
      try {
        expertTrust = await getExpertTrustSummary(String(job.acceptedTradieUid));
      } catch (_) {
        expertTrust = null;
      }
    }

    const paymentFeeSummary = await buildAdminPaymentFeeSummary(jobRef, job);

    return res.status(200).send({
      job,
      homeownerName,
      expertName,
      events,
      riskSignals,
      riskScore,
      expertTrust,
      paymentFeeSummary,
    });
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('GET /api/admin/jobs/:jobId failed:', error);
    return res.status(500).send({ message: 'Failed to load task.' });
  }
});

router.post('/api/admin/jobs/:jobId/recompute-risk', requireAuth, requireAdmin, async (req, res) => {
  try {
    const jobId = String(req.params.jobId || '').trim();
    if (!jobId) return res.status(400).send({ message: 'Invalid task id.' });
    const out = await evaluateJobRiskById(jobId);
    if (!out) return res.status(404).send({ message: 'Task not found.' });
    return res.status(200).send({
      score: out.score,
      level: out.level,
      topFactors: out.topFactors,
    });
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('POST /api/admin/jobs/:jobId/recompute-risk failed:', error);
    return res.status(500).send({ message: 'Failed to recompute risk.' });
  }
});

router.post('/api/admin/jobs/:jobId/assign', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { jobId } = req.params;
    const { tradieUid } = req.body;

    if (!tradieUid) {
      return res.status(400).send({ message: 'Expert ID is required in the request body.' });
    }

    // Server-side enforcement: must be verified, active tradie
    const tradieDoc = await db.collection('users').doc(tradieUid).get();
    if (!tradieDoc.exists) return res.status(404).send({ message: 'Task expert not found.' });

    const tradieData = tradieDoc.data();
    if (tradieData.role !== 'tradie') return res.status(400).send({ message: 'User is not an expert.' });
    if (tradieData.verified !== true) return res.status(400).send({ message: 'Task expert is not verified.' });
    if (tradieData.status !== 'active') return res.status(400).send({ message: 'Task expert is not active.' });

    const jobRef = db.collection('jobs').doc(jobId);
    const jobDoc = await jobRef.get();
    if (!jobDoc.exists) return res.status(404).send({ message: 'Task not found.' });

    await jobRef.update({
      invitedTradieUids: admin.firestore.FieldValue.arrayUnion(tradieUid),
      // IMPORTANT: inviting a task expert to quote must NOT advance job status.
      // Status should remain OPEN until at least one quote exists (QUOTED),
      // and only become ASSIGNED when a homeowner accepts a quote.
      [`invites.${tradieUid}`]: {
        invitedAt: admin.firestore.FieldValue.serverTimestamp(),
        lastNudgedAt: null,
        invitedBy: req.user.uid,
      },
      invitedCount: admin.firestore.FieldValue.increment(1),
      lastAdminActionAt: admin.firestore.FieldValue.serverTimestamp(),
      lastAdminActionBy: req.user.uid,
    });

    return res.status(200).send({ message: `Successfully invited expert ${tradieUid} to task ${jobId}.` });
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('Error assigning job:', error);
    return res.status(500).send({ message: 'Failed to assign task' });
  }
});

router.delete('/api/admin/jobs/:jobId/assign/:tradieId', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { jobId, tradieId } = req.params;

    const jobRef = db.collection('jobs').doc(jobId);

    await jobRef.update({
      invitedTradieUids: admin.firestore.FieldValue.arrayRemove(tradieId),
      lastAdminActionAt: admin.firestore.FieldValue.serverTimestamp(),
      lastAdminActionBy: req.user.uid,
    });

    const updatedJobDoc = await jobRef.get();
    if (!updatedJobDoc.exists) return res.status(404).send({ message: 'Task not found.' });

    const updatedJobData = updatedJobDoc.data();
    if (updatedJobData.invitedTradieUids && updatedJobData.invitedTradieUids.length === 0) {
      await jobRef.update({
        status: JOB_STATUSES.OPEN,
        lastAdminActionAt: admin.firestore.FieldValue.serverTimestamp(),
        lastAdminActionBy: req.user.uid,
      });
    }

    return res.status(200).send({ message: `Successfully removed expert ${tradieId} from task ${jobId}.` });
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('Error unassigning job:', error);
    return res.status(500).send({ message: 'Failed to unassign task' });
  }
});

/**
 * POST /api/admin/jobs/:jobId/admin-tags/toggle
 * Body: { tag: string }
 * Toggles a single admin tag on a job. Uses Admin SDK (bypasses Firestore client rules).
 */
router.post('/api/admin/jobs/:jobId/admin-tags/toggle', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { jobId } = req.params;
    const raw = req.body?.tag;
    const tag = String(raw || '').trim().slice(0, 40);
    if (!tag) return res.status(400).send({ message: 'tag is required.' });

    const jobRef = db.collection('jobs').doc(jobId);
    const snap = await jobRef.get();
    if (!snap.exists) return res.status(404).send({ message: 'Task not found.' });
    const job = snap.data() || {};

    const existing = Array.isArray(job.adminTags) ? job.adminTags.map((x) => String(x || '').trim()).filter(Boolean) : [];
    const has = existing.includes(tag);
    const next = has ? existing.filter((x) => x !== tag) : Array.from(new Set([...existing, tag])).slice(0, 20);

    await jobRef.set(
      {
        adminTags: next,
        lastAdminActionAt: admin.firestore.FieldValue.serverTimestamp(),
        lastAdminActionBy: req.user.uid,
      },
      { merge: true }
    );

    return res.status(200).send({ adminTags: next });
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error('POST /api/admin/jobs/:jobId/admin-tags/toggle failed:', e);
    return res.status(500).send({ message: 'Failed to update tags.' });
  }
});

router.put('/api/admin/jobs/:jobId/status', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { jobId } = req.params;
    const { status } = req.body;

    const validStatuses = [
      JOB_STATUSES.OPEN,
      JOB_STATUSES.QUOTED,
      JOB_STATUSES.ASSIGNED,
      JOB_STATUSES.AWAITING_FUNDING,
      JOB_STATUSES.FUNDED,
      JOB_STATUSES.IN_PROGRESS,
      JOB_STATUSES.COMPLETED,
      JOB_STATUSES.PAID,
      JOB_STATUSES.CANCELLED,
      JOB_STATUSES.DISPUTED,
      JOB_STATUSES.REFUND_PENDING,
      JOB_STATUSES.REFUNDED,
    ];
    if (!status || !validStatuses.includes(status)) {
      return res.status(400).send({ message: 'A valid status is required.' });
    }

    const jobRef = db.collection('jobs').doc(jobId);
    const beforeSnap = await jobRef.get();
    if (!beforeSnap.exists) return res.status(404).send({ message: 'Task not found.' });
    const fromStatus = normalizeStatus(beforeSnap.data().status);

    const adminEmail = typeof req.user?.email === 'string' && req.user.email.trim() ? req.user.email.trim() : null;

    await updateJobStatus(db, admin, jobRef, status, {
      lastAdminActionAt: admin.firestore.FieldValue.serverTimestamp(),
      lastAdminActionBy: req.user.uid,
      adminStatusOverride: true,
      updatedByAdminId: req.user.uid,
      ...(adminEmail ? { updatedByAdminEmail: adminEmail } : {}),
    });

    await logAdminJobAction({ req, jobId, action: 'STATUS_OVERRIDE', metadata: { from: fromStatus, to: status } });
    await logJobEvent({
      jobId,
      actorId: req.user.uid,
      actorRole: 'admin',
      action: 'ADMIN_STATUS_OVERRIDE',
      metadata: { from: fromStatus, to: status },
    });

    return res.status(200).send({ message: `Successfully updated task ${jobId} status to ${status}.` });
  } catch (error) {
    if (error?.code === 'invalid_status_transition') {
      return res.status(409).send({ message: 'Invalid status transition for this task.', from: error.from, to: error.to });
    }
    // eslint-disable-next-line no-console
    console.error('Error updating job status:', error);
    return res.status(500).send({ message: 'Failed to update task status' });
  }
});

// Nudge invited expert again (manual ops; no automation beyond timestamping)
router.post('/api/admin/jobs/:jobId/invites/:tradieUid/nudge', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { jobId, tradieUid } = req.params;
    const jobRef = db.collection('jobs').doc(jobId);
    const jobDoc = await jobRef.get();
    if (!jobDoc.exists) return res.status(404).send({ message: 'Task not found.' });

    await jobRef.set(
      {
        invites: {
          [tradieUid]: {
            lastNudgedAt: admin.firestore.FieldValue.serverTimestamp(),
            nudgedBy: req.user.uid,
          },
        },
        lastAdminActionAt: admin.firestore.FieldValue.serverTimestamp(),
        lastAdminActionBy: req.user.uid,
      },
      { merge: true }
    );

    return res.status(200).send({ message: 'Nudge recorded.' });
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('Error recording nudge:', error);
    return res.status(500).send({ message: 'Failed to record nudge.' });
  }
});

router.post('/api/admin/jobs/:jobId/flag-dispute', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { jobId } = req.params;
    const { reason } = req.body || {};
    const jobRef = db.collection('jobs').doc(jobId);
    const jobDoc = await jobRef.get();
    if (!jobDoc.exists) return res.status(404).send({ message: 'Task not found.' });
    const job = jobDoc.data() || {};

    await jobRef.set(
      {
        preDisputeStatus: job.status || null,
        preDisputePaymentState: job.paymentState || null,
        status: JOB_STATUSES.DISPUTED,
        paymentState: 'disputed',
        disputeFlag: true,
        requiresAdminAttention: true,
        disputeReason: typeof reason === 'string' ? reason.trim().slice(0, 500) : null,
        disputedAt: admin.firestore.FieldValue.serverTimestamp(),
        lastAdminActionAt: admin.firestore.FieldValue.serverTimestamp(),
        lastAdminActionBy: req.user.uid,
      },
      { merge: true }
    );

    await logAdminJobAction({ req, jobId, action: 'FLAG_DISPUTE', metadata: { reason: typeof reason === 'string' ? reason.trim().slice(0, 500) : null } });
    await logJobEvent({ jobId, actorId: req.user.uid, actorRole: 'admin', action: 'ADMIN_FLAG_DISPUTE' });

    return res.status(200).send({ message: 'Task flagged as disputed.' });
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('Error flagging dispute:', error);
    return res.status(500).send({ message: 'Failed to flag dispute.' });
  }
});

router.post('/api/admin/jobs/:jobId/clear-dispute', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { jobId } = req.params;
    const jobRef = db.collection('jobs').doc(jobId);
    const jobDoc = await jobRef.get();
    if (!jobDoc.exists) return res.status(404).send({ message: 'Task not found.' });
    const job = jobDoc.data() || {};

    if (normalizeStatus(job.status) !== JOB_STATUSES.DISPUTED && job.paymentState !== 'disputed' && job.disputeFlag !== true) {
      return res.status(409).send({ message: 'Task is not currently disputed.' });
    }

    const restoredPaymentState = job.preDisputePaymentState || (job.paymentStatus === 'succeeded' ? 'in_escrow' : null);
    const restoredStatus = job.preDisputeStatus
      || (restoredPaymentState === 'in_escrow' ? JOB_STATUSES.FUNDED : JOB_STATUSES.ASSIGNED);

    await jobRef.set(
      {
        status: restoredStatus,
        paymentState: restoredPaymentState,
        disputeFlag: false,
        disputeReason: null,
        requiresAdminAttention: false,
        disputeResolvedAt: admin.firestore.FieldValue.serverTimestamp(),
        disputeResolution: 'cleared',
        disputeResolvedBy: req.user.uid,
        lastAdminActionAt: admin.firestore.FieldValue.serverTimestamp(),
        lastAdminActionBy: req.user.uid,
      },
      { merge: true }
    );

    await logAdminJobAction({ req, jobId, action: 'CLEAR_DISPUTE' });
    await logJobEvent({ jobId, actorId: req.user.uid, actorRole: 'admin', action: 'ADMIN_CLEAR_DISPUTE', metadata: { restoredStatus, restoredPaymentState } });

    return res.status(200).send({ message: 'Dispute cleared and task restored.' });
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('Error clearing dispute:', error);
    return res.status(500).send({ message: 'Failed to clear dispute.' });
  }
});

router.post('/api/admin/jobs/:jobId/manual-release', requireAuth, requireAdmin, async (req, res) => {
  try {
    if (process.env.STRIPE_ENABLED !== 'true') {
      return res.status(400).send({ message: 'Stripe is not enabled on this server.' });
    }

    const { jobId } = req.params;
    const jobRef = db.collection('jobs').doc(jobId);
    const jobDoc = await jobRef.get();
    if (!jobDoc.exists) return res.status(404).send({ message: 'Task not found.' });
    const job = jobDoc.data();

    if (job.paymentState === 'released' && job.transferId) {
      return res.status(200).send({ message: 'Payment already released.', transferId: job.transferId });
    }
    if (job.paymentState !== 'in_escrow') return res.status(409).send({ message: `Invalid state transition (paymentState: ${job.paymentState}).` });
    if (job.paymentState === 'refunded') return res.status(409).send({ message: 'Task has been refunded.' });

    const tradieUid = job.acceptedTradieUid;
    if (!tradieUid) return res.status(400).send({ message: 'Missing assigned expert.' });
    const tradieDoc = await db.collection('users').doc(tradieUid).get();
    if (!tradieDoc.exists) return res.status(400).send({ message: 'Assigned expert not found.' });
    const tradie = tradieDoc.data();
    if (tradie.role !== 'tradie') return res.status(400).send({ message: 'Assigned user is not an expert.' });
    if (tradie.stripeOnboardingStatus !== 'completed' || tradie.stripeChargesEnabled !== true || tradie.stripePayoutsEnabled !== true) {
      return res.status(409).send({ message: 'Task expert is not ready for payouts (Stripe onboarding incomplete).' });
    }
    if (!tradie.stripeAccountId) return res.status(409).send({ message: 'Task expert is missing Stripe account.' });

    const amountCents = Number.isFinite(job.paymentAmountCents) ? job.paymentAmountCents : null;
    if (!amountCents || amountCents <= 0) return res.status(400).send({ message: 'Missing payment amount.' });

    const platformFeePercent = Number.isFinite(job.platformFeePercent)
      ? job.platformFeePercent
      : defaultPlatformFeePercentFromEnv();

    const stripeResult = await createExpertReleaseStripeTransfers({
      jobId,
      job,
      homeownerUid: null,
      tradieUid,
      destinationAccountId: tradie.stripeAccountId,
      currency: job.paymentCurrency || 'aud',
      platformFeePercent,
      createTransfer,
      getSucceededChargeIdForConnectTransfer,
      idempotencyPrefix: 'taskio_admin_release',
    });

    if (stripeResult.error) {
      const e = stripeResult.error;
      return res.status(e.httpStatus).send({ message: e.message, code: e.code });
    }

    const { plan, baseTransfer, variationTransfers } = stripeResult;

    await persistExpertReleaseAfterTransfers({
      jobRef,
      statusPaid: JOB_STATUSES.PAID,
      plan,
      baseTransfer,
      variationTransfers,
      extraJobFields: {
        adminReleasedAt: admin.firestore.FieldValue.serverTimestamp(),
        requiresAdminAttention: false,
        disputeFlag: false,
        lastAdminActionAt: admin.firestore.FieldValue.serverTimestamp(),
        lastAdminActionBy: req.user.uid,
        ...(job.disputeFlag === true
          ? {
            disputeResolvedAt: admin.firestore.FieldValue.serverTimestamp(),
            disputeResolution: 'released',
            disputeResolvedBy: req.user.uid,
          }
          : {}),
      },
    });

    await logAdminJobAction({
      req,
      jobId,
      action: 'MANUAL_RELEASE',
      metadata: {
        transferId: baseTransfer.id,
        variationTransferCount: variationTransfers.length,
      },
    });
    await logJobEvent({
      jobId,
      actorId: req.user.uid,
      actorRole: 'admin',
      action: 'ADMIN_MANUAL_RELEASE',
      metadata: {
        transferId: baseTransfer.id,
        variationTransferCount: variationTransfers.length,
      },
    });

    return res.status(200).send({
      message: 'Payment released (admin override).',
      transferId: baseTransfer.id,
      variationTransferIds: Object.fromEntries(
        variationTransfers.map((v) => [v.variationId, v.transfer.id])
      ),
      totalProviderAmountCents: plan.totals.totalProviderCents,
    });
  } catch (error) {
    if (error && error.code === 'stripe_not_configured') {
      return res.status(400).send({ message: 'Stripe is not configured on the server.' });
    }
    // eslint-disable-next-line no-console
    console.error('Error manual releasing payment:', error);
    return res.status(500).send({ message: 'Failed to manually release payment.' });
  }
});

/**
 * POST /api/admin/jobs/:jobId/resolve-dispute
 * Body: { resolution: "expert" | "refund" }
 * expert → release escrow to expert (same as manual release, allows disputed paymentState).
 * refund → full refund (same as refund route).
 */
router.post('/api/admin/jobs/:jobId/resolve-dispute', requireAuth, requireSuperAdmin, async (req, res) => {
  try {
    const resolution = String(req.body?.resolution || '').trim().toLowerCase();
    if (!['expert', 'refund'].includes(resolution)) {
      return res.status(400).send({ message: 'resolution must be "expert" or "refund".' });
    }

    const { jobId } = req.params;
    const jobRef = db.collection('jobs').doc(jobId);
    const jobDoc = await jobRef.get();
    if (!jobDoc.exists) return res.status(404).send({ message: 'Task not found.' });
    const job = jobDoc.data();

    if (normalizeStatus(job.status) !== JOB_STATUSES.DISPUTED) {
      return res.status(409).send({ message: 'Task is not in DISPUTED status.' });
    }

    if (resolution === 'refund') {
      if (process.env.STRIPE_ENABLED !== 'true') {
        return res.status(400).send({ message: 'Stripe is not enabled on this server.' });
      }
      if (job.paymentState === 'refunded') {
        return res.status(400).send({ message: 'Already refunded.' });
      }
      if (normalizeStatus(job.status) === JOB_STATUSES.REFUND_PENDING || job.paymentState === 'refund_pending') {
        return res.status(400).send({ message: 'Refund already in progress.' });
      }
      if (!job.paymentIntentId) return res.status(400).send({ message: 'No payment intent found for this task.' });

      const refund = await createRefund({
        paymentIntentId: job.paymentIntentId,
        amountInCents: null,
        reason: 'requested_by_customer',
        idempotencyKey: `refund_${jobId}`,
      });

      await jobRef.update({
        status: JOB_STATUSES.DISPUTED,
        paymentState: 'refunded',
        refundId: refund.id,
        refundedAt: admin.firestore.FieldValue.serverTimestamp(),
        requiresAdminAttention: false,
        lastAdminActionAt: admin.firestore.FieldValue.serverTimestamp(),
        lastAdminActionBy: req.user.uid,
        disputeResolvedAt: admin.firestore.FieldValue.serverTimestamp(),
        disputeResolution: 'refunded',
        disputeResolvedBy: req.user.uid,
      });

      await logAdminJobAction({ req, jobId, action: 'RESOLVE_DISPUTE_REFUND', metadata: { refundId: refund.id } });
      await logJobEvent({
        jobId,
        actorId: req.user.uid,
        actorRole: 'admin',
        action: 'ADMIN_RESOLVE_DISPUTE_REFUND',
        metadata: { refundId: refund.id },
      });

      return res.status(200).send({ message: 'Refund initiated.', refundId: refund.id });
    }

    // resolution === 'expert' — uses expertJobRelease (feeSnapshot base slice, variations, full breakdown)
    if (process.env.STRIPE_ENABLED !== 'true') {
      return res.status(400).send({ message: 'Stripe is not enabled on this server.' });
    }
    if (job.paymentState === 'released' && job.transferId) {
      return res.status(200).send({ message: 'Payment already released.', transferId: job.transferId });
    }
    if (job.transferId && job.paymentState !== 'released') {
      return res.status(409).send({
        message:
          'This task has a transfer id but is not marked released. Ops review required before retrying dispute resolution.',
        code: 'release_transfer_state_mismatch',
      });
    }
    const escrowOk = job.paymentState === 'in_escrow' || job.paymentState === 'disputed';
    if (!escrowOk) {
      return res.status(409).send({ message: `Cannot release (paymentState: ${job.paymentState}).` });
    }
    if (job.paymentState === 'refunded') return res.status(409).send({ message: 'Task has been refunded.' });

    const tradieUid = job.acceptedTradieUid;
    if (!tradieUid) return res.status(400).send({ message: 'Missing assigned expert.' });
    const tradieDoc = await db.collection('users').doc(tradieUid).get();
    if (!tradieDoc.exists) return res.status(400).send({ message: 'Assigned expert not found.' });
    const tradie = tradieDoc.data();
    if (tradie.role !== 'tradie') return res.status(400).send({ message: 'Assigned user is not an expert.' });
    if (tradie.stripeOnboardingStatus !== 'completed' || tradie.stripeChargesEnabled !== true || tradie.stripePayoutsEnabled !== true) {
      return res.status(409).send({ message: 'Task expert is not ready for payouts (Stripe onboarding incomplete).' });
    }
    if (!tradie.stripeAccountId) return res.status(409).send({ message: 'Task expert is missing Stripe account.' });

    const amountCents = Number.isFinite(job.paymentAmountCents) ? job.paymentAmountCents : null;
    if (!amountCents || amountCents <= 0) return res.status(400).send({ message: 'Missing payment amount.' });

    const platformFeePercent = Number.isFinite(job.platformFeePercent)
      ? job.platformFeePercent
      : defaultPlatformFeePercentFromEnv();

    const stripeResult = await createExpertReleaseStripeTransfers({
      jobId,
      job,
      homeownerUid: null,
      tradieUid,
      destinationAccountId: tradie.stripeAccountId,
      currency: job.paymentCurrency || 'aud',
      platformFeePercent,
      createTransfer,
      getSucceededChargeIdForConnectTransfer,
      idempotencyPrefix: 'taskio_admin_resolve_expert',
    });

    if (stripeResult.error) {
      const e = stripeResult.error;
      return res.status(e.httpStatus).send({ message: e.message, code: e.code });
    }

    const { plan, baseTransfer, variationTransfers } = stripeResult;

    await persistExpertReleaseAfterTransfers({
      jobRef,
      statusPaid: JOB_STATUSES.PAID,
      plan,
      baseTransfer,
      variationTransfers,
      extraJobFields: {
        adminReleasedAt: admin.firestore.FieldValue.serverTimestamp(),
        requiresAdminAttention: false,
        disputeFlag: false,
        lastAdminActionAt: admin.firestore.FieldValue.serverTimestamp(),
        lastAdminActionBy: req.user.uid,
        disputeResolvedAt: admin.firestore.FieldValue.serverTimestamp(),
        disputeResolution: 'released_expert',
        disputeResolvedBy: req.user.uid,
      },
    });

    const releaseVariationTransferIds = Object.fromEntries(
      variationTransfers.map((v) => [v.variationId, v.transfer.id])
    );

    const auditMeta = {
      transferId: baseTransfer.id,
      releaseVariationTransferIds,
      totalProviderReleasedCents: plan.totals.totalProviderCents,
      totalPlatformFeeReleasedCents: plan.totals.totalPlatformFeeCents,
      baseReleaseFeeSource: plan.baseFeeSource,
      variationReleaseFeeSource: plan.variationFeeSource,
    };

    await logAdminJobAction({ req, jobId, action: 'RESOLVE_DISPUTE_EXPERT', metadata: auditMeta });
    await logJobEvent({
      jobId,
      actorId: req.user.uid,
      actorRole: 'admin',
      action: 'ADMIN_RESOLVE_DISPUTE_EXPERT',
      metadata: auditMeta,
    });

    return res.status(200).send({
      message: 'Dispute resolved: payment released to expert.',
      transferId: baseTransfer.id,
      variationTransferIds: releaseVariationTransferIds,
      totalProviderAmountCents: plan.totals.totalProviderCents,
    });
  } catch (error) {
    if (error && error.code === 'stripe_not_configured') {
      return res.status(400).send({ message: 'Stripe is not configured on the server.' });
    }
    // eslint-disable-next-line no-console
    console.error('Error resolving dispute:', error);
    return res.status(500).send({ message: 'Failed to resolve dispute.' });
  }
});

/**
 * POST /api/admin/jobs/:jobId/mark-refunded
 * Fallback when Stripe webhook did not arrive — REFUND_PENDING → REFUNDED.
 */
router.post('/api/admin/jobs/:jobId/mark-refunded', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { jobId } = req.params;
    const jobRef = db.collection('jobs').doc(jobId);
    const jobDoc = await jobRef.get();
    if (!jobDoc.exists) return res.status(404).send({ message: 'Task not found.' });
    const job = jobDoc.data();
    if (normalizeStatus(job.status) !== JOB_STATUSES.REFUND_PENDING) {
      return res.status(409).send({ message: 'Task is not in REFUND_PENDING status.' });
    }

    await updateJobStatus(db, admin, jobRef, JOB_STATUSES.REFUNDED, {
      paymentState: 'refunded',
      lastAdminActionAt: admin.firestore.FieldValue.serverTimestamp(),
      lastAdminActionBy: req.user.uid,
      adminMarkedRefundedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    await logAdminJobAction({ req, jobId, action: 'MARK_REFUNDED' });
    await logJobEvent({
      jobId,
      actorId: req.user.uid,
      actorRole: 'admin',
      action: 'ADMIN_MARK_REFUNDED',
    });

    return res.status(200).send({ message: 'Marked as refunded.', status: JOB_STATUSES.REFUNDED });
  } catch (error) {
    if (error?.code === 'invalid_status_transition') {
      return res.status(409).send({ message: 'Invalid status transition for this task.' });
    }
    // eslint-disable-next-line no-console
    console.error('Error marking refunded:', error);
    return res.status(500).send({ message: 'Failed to mark refunded.' });
  }
});

router.post('/api/admin/jobs/:jobId/refund', requireAuth, requireAdmin, async (req, res) => {
  try {
    if (process.env.STRIPE_ENABLED !== 'true') {
      return res.status(400).send({ message: 'Stripe is not enabled on this server.' });
    }

    const { jobId } = req.params;
    const jobRef = db.collection('jobs').doc(jobId);
    const jobDoc = await jobRef.get();
    if (!jobDoc.exists) return res.status(404).send({ message: 'Task not found.' });
    const job = jobDoc.data();

    if (job.paymentState === 'refunded') {
      return res.status(400).send({ message: 'Already refunded.' });
    }
    if (normalizeStatus(job.status) === JOB_STATUSES.REFUNDED) {
      return res.status(400).send({ message: 'Already refunded.' });
    }
    if (normalizeStatus(job.status) === JOB_STATUSES.REFUND_PENDING || job.paymentState === 'refund_pending') {
      return res.status(400).send({ message: 'Refund already in progress.' });
    }
    if (!job.paymentIntentId) return res.status(400).send({ message: 'No payment intent found for this task.' });

    // MVP: full refund only
    const refund = await createRefund({
      paymentIntentId: job.paymentIntentId,
      amountInCents: null,
      reason: 'requested_by_customer',
      idempotencyKey: `refund_${jobId}`,
    });

    const newStatus = job.disputeFlag === true ? JOB_STATUSES.DISPUTED : JOB_STATUSES.REFUNDED;
    await jobRef.update({
      status: newStatus,
      paymentState: 'refunded',
      refundId: refund.id,
      refundedAt: admin.firestore.FieldValue.serverTimestamp(),
      requiresAdminAttention: false,
      lastAdminActionAt: admin.firestore.FieldValue.serverTimestamp(),
      lastAdminActionBy: req.user.uid,
      ...(job.disputeFlag === true ? { disputeResolvedAt: admin.firestore.FieldValue.serverTimestamp(), disputeResolution: 'refunded', disputeResolvedBy: req.user.uid } : {}),
    });

    await logAdminJobAction({ req, jobId, action: 'REFUND', metadata: { refundId: refund.id } });
    await logJobEvent({ jobId, actorId: req.user.uid, actorRole: 'admin', action: 'ADMIN_REFUND', metadata: { refundId: refund.id } });

    return res.status(200).send({ message: 'Refund initiated.', refundId: refund.id });
  } catch (error) {
    if (error && error.code === 'stripe_not_configured') {
      return res.status(400).send({ message: 'Stripe is not configured on the server.' });
    }
    // eslint-disable-next-line no-console
    console.error('Error refunding payment:', error);
    return res.status(500).send({ message: 'Failed to refund payment.' });
  }
});

/**
 * POST /api/admin/jobs/:jobId/retry-payment
 * Recreate Checkout after funding failure, or retry Stripe refund after refund failure.
 */
router.post('/api/admin/jobs/:jobId/retry-payment', requireAuth, requireSuperAdmin, async (req, res) => {
  try {
    if (process.env.STRIPE_ENABLED !== 'true') {
      return res.status(400).send({ message: 'Stripe is not enabled on this server.' });
    }

    const { jobId } = req.params;
    const jobRef = db.collection('jobs').doc(jobId);
    const jobDoc = await jobRef.get();
    if (!jobDoc.exists) return res.status(404).send({ message: 'Task not found.' });
    const job = jobDoc.data();
    const ps = String(job.paymentState || '').toLowerCase();
    const st = normalizeStatus(job.status);

    if (ps === 'payment_failed' && st === JOB_STATUSES.AWAITING_FUNDING) {
      const quoteId = job.acceptedQuoteId;
      if (!quoteId) return res.status(400).send({ message: 'No accepted quote for this task.' });

      const quoteDoc = await db.collection('quotes').doc(String(quoteId)).get();
      if (!quoteDoc.exists) return res.status(404).send({ message: 'Quote not found.' });
      const quote = quoteDoc.data();
      const amountInCents = Math.round(Number(quote.amount) * 100);
      if (!Number.isFinite(amountInCents) || amountInCents <= 0) {
        return res.status(400).send({ message: 'Quote amount is invalid.' });
      }

      const existingSessionId = job.paymentCheckoutSessionId || null;
      if (existingSessionId) {
        try {
          const existingSession = await retrieveCheckoutSession(existingSessionId);
          const canReuse = existingSession?.status === 'open' && existingSession?.payment_status === 'unpaid';
          if (canReuse) {
            return res.status(200).send({ kind: 'checkout', sessionId: existingSessionId, reused: true });
          }
        } catch (_) {
          // fall through to new session
        }
      }

      const homeownerUid = String(job.homeownerUid || '');
      const frontend = (process.env.FRONTEND_URL || 'http://localhost:3000').replace(/\/$/, '');
      const successUrl = `${frontend}/job/${jobId}?checkout=success&session_id={CHECKOUT_SESSION_ID}`;
      const cancelUrl = `${frontend}/job/${jobId}?checkout=cancel`;
      const currency = String(job.paymentCurrency || 'aud').toLowerCase();

      const session = await createCheckoutSession({
        amountInCents,
        currency,
        name: 'Secure payment for Taskio task',
        description: `Job ID: ${jobId}`,
        successUrl,
        cancelUrl,
        metadata: { jobId, quoteId, homeownerUid },
        idempotencyKey: `taskio_admin_retry_checkout_${jobId}_${Date.now()}`,
        customerEmail: undefined,
      });

      await jobRef.update({
        paymentCheckoutSessionId: session.id,
        ...(session.payment_intent ? { paymentIntentId: session.payment_intent } : {}),
        paymentState: 'pending_payment',
        paymentStatus: 'requires_payment_method',
        paymentUpdatedAt: admin.firestore.FieldValue.serverTimestamp(),
        lastAdminActionAt: admin.firestore.FieldValue.serverTimestamp(),
        lastAdminActionBy: req.user.uid,
      });

      await logJobEvent({
        jobId,
        actorId: req.user.uid,
        actorRole: 'admin',
        action: 'ADMIN_RETRY_CHECKOUT',
        metadata: { sessionId: session.id },
      });

      return res.status(200).send({ kind: 'checkout', sessionId: session.id, reused: false });
    }

    if (ps === 'refund_failed') {
      if (!job.paymentIntentId) return res.status(400).send({ message: 'No payment intent found for this task.' });

      const refund = await createRefund({
        paymentIntentId: job.paymentIntentId,
        amountInCents: null,
        reason: 'requested_by_customer',
        idempotencyKey: `refund_retry_${jobId}_${Date.now()}`,
      });

      await jobRef.update({
        paymentState: 'refund_pending',
        refundRetryId: refund.id,
        lastAdminActionAt: admin.firestore.FieldValue.serverTimestamp(),
        lastAdminActionBy: req.user.uid,
      });

      await logJobEvent({
        jobId,
        actorId: req.user.uid,
        actorRole: 'admin',
        action: 'ADMIN_RETRY_REFUND',
        metadata: { refundId: refund.id },
      });

      return res.status(200).send({ kind: 'refund', refundId: refund.id, message: 'Refund retry initiated.' });
    }

    return res.status(409).send({
      message: `Retry is only for failed funding (payment_failed while awaiting funding) or refund_failed. Current paymentState: ${ps || '—'}`,
    });
  } catch (error) {
    if (error && error.code === 'stripe_not_configured') {
      return res.status(400).send({ message: 'Stripe is not configured on the server.' });
    }
    // eslint-disable-next-line no-console
    console.error('POST /api/admin/jobs/:jobId/retry-payment failed:', error);
    return res.status(500).send({ message: 'Failed to retry payment.' });
  }
});

module.exports = router;
