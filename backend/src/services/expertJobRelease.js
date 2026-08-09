'use strict';

const { admin, db } = require('../firebaseAdmin');
const { validateBaseJobFeeSnapshotForRelease } = require('./jobFeeSnapshotService');
const { STANDARD_LAUNCH_FEE_BPS } = require('../../../shared/feePlans');
const {
  deriveVariationReleaseSlice,
  VARIATION_FEE_SOURCE_LEGACY_PERCENT,
} = require('./variationFeeSnapshotService');

/**
 * Paid variation: approved, secured in escrow, paid, positive amount, not already released, has PaymentIntent.
 * Excludes pending, awaiting_payment, declined, cancelled, not_required ($0), draft, unpaid.
 *
 * @param {object} v — variation document fields (may include `id`)
 * @returns {boolean}
 */
function shouldIncludeVariationInExpertRelease(v) {
  if (!v || typeof v !== 'object') return false;
  if (v.releaseStatus === 'released') return false;
  if (String(v.status || '') !== 'approved') return false;
  if (String(v.paymentState || '') !== 'in_escrow') return false;
  if (String(v.paymentStatus || '') !== 'paid') return false;
  const gross = Math.floor(Number(v.priceChangeCents ?? v.amountPaidCents ?? 0));
  if (!Number.isFinite(gross) || gross <= 0) return false;
  const pi = String(v.paymentIntentId || '').trim();
  if (!pi) return false;
  return true;
}

function computeFeeSlice(grossCents, platformFeePercent) {
  const pctFallback = STANDARD_LAUNCH_FEE_BPS / 100;
  const pct = Number.isFinite(platformFeePercent) ? platformFeePercent : pctFallback;
  const platformFeeCents = Math.round((grossCents * pct) / 100);
  const providerCents = grossCents - platformFeeCents;
  return { grossCents, platformFeeCents, providerCents };
}

/**
 * @param {object} job
 * @param {Array<{ id: string, data: object }>} variationEntries
 * @param {number} platformFeePercent
 * @param {{
 *   baseSliceOverride?: { grossCents: number, platformFeeCents: number, providerCents: number },
 *   baseFeeSource?: string,
 *   variationFeeSource?: string,
 *   releaseJobId?: string,
 * }} [options]
 */
function buildExpertReleasePlan(job, variationEntries, platformFeePercent, options = {}) {
  const opts = options && typeof options === 'object' ? options : {};
  const baseGross = Math.floor(Number(job.paymentAmountCents || 0));
  const releaseJobIdRaw = opts.releaseJobId != null ? String(opts.releaseJobId).trim() : '';
  const jobIdResolved = releaseJobIdRaw || String(job.jobId || job.id || '').trim();
  const ov = opts.baseSliceOverride;
  let baseSlice;
  let baseFeeSource;
  if (ov && typeof ov === 'object') {
    baseSlice = {
      grossCents: Math.floor(Number(ov.grossCents)),
      platformFeeCents: Math.floor(Number(ov.platformFeeCents)),
      providerCents: Math.floor(Number(ov.providerCents)),
    };
    baseFeeSource = typeof opts.baseFeeSource === 'string' ? opts.baseFeeSource : 'fee_snapshot_v1';
  } else {
    baseSlice = computeFeeSlice(baseGross, platformFeePercent);
    baseFeeSource = typeof opts.baseFeeSource === 'string' ? opts.baseFeeSource : 'legacy_platform_fee_percent';
  }

  const releasePlanVersion = Number.isFinite(Number(opts.releasePlanVersion)) ? Math.floor(Number(opts.releasePlanVersion)) : 2;

  const variationSlices = variationEntries.map(({ id, data: v }) => (
    deriveVariationReleaseSlice(job, jobIdResolved, id, v)
  ));

  const totals = {
    totalGrossCents: baseSlice.grossCents + variationSlices.reduce((s, x) => s + x.grossCents, 0),
    totalPlatformFeeCents: baseSlice.platformFeeCents + variationSlices.reduce((s, x) => s + x.platformFeeCents, 0),
    totalProviderCents: baseSlice.providerCents + variationSlices.reduce((s, x) => s + x.providerCents, 0),
  };

  let variationFeeSource = typeof opts.variationFeeSource === 'string'
    ? opts.variationFeeSource
    : VARIATION_FEE_SOURCE_LEGACY_PERCENT;
  if (variationSlices.length > 0) {
    const uniqSrc = [...new Set(variationSlices.map((z) => z.variationFeeSource).filter(Boolean))];
    variationFeeSource = uniqSrc.length === 1 ? uniqSrc[0] : 'mixed_variation_fee_v1';
  }

  return {
    baseSlice,
    variationSlices,
    totals,
    platformFeePercent,
    baseFeeSource,
    variationFeeSource,
    releasePlanVersion,
  };
}

/**
 * Load variation docs from Firestore and return entries eligible for this release.
 * @param {FirebaseFirestore.DocumentReference} jobRef
 */
async function loadEligibleVariationEntriesForRelease(jobRef) {
  const snap = await jobRef.collection('variations').get();
  const out = [];
  for (const doc of snap.docs) {
    const data = doc.data() || {};
    const flat = { id: doc.id, ...data };
    if (!shouldIncludeVariationInExpertRelease(flat)) continue;
    out.push({ id: doc.id, data });
  }
  return out;
}

/**
 * Create Connect transfers: one for base job charge, one per paid variation charge.
 *
 * Idempotency families (base key / variation uses `_var_${jobId}_${variationId}`):
 * - Homeowner: `taskio_release_${jobId}`
 * - Admin manual: `taskio_admin_release_${jobId}`
 * - Admin dispute → expert: `taskio_admin_resolve_expert_${jobId}`
 *
 * @returns {Promise<{ plan: object, baseTransfer: object, variationTransfers: Array<{ variationId: string, transfer: object, slice: object }> } | { error: object }>}
 */
async function createExpertReleaseStripeTransfers({
  jobId,
  job,
  homeownerUid,
  tradieUid,
  destinationAccountId,
  currency,
  platformFeePercent,
  createTransfer,
  getSucceededChargeIdForConnectTransfer,
  idempotencyPrefix,
}) {
  const jobRef = db.collection('jobs').doc(jobId);
  const variationEntries = await loadEligibleVariationEntriesForRelease(jobRef);

  const snapValidation = validateBaseJobFeeSnapshotForRelease(job, jobId);
  let planOptions;
  if (snapValidation.ok) {
    planOptions = {
      releaseJobId: jobId,
      baseSliceOverride: snapValidation.baseSlice,
      baseFeeSource: snapValidation.feeSource,
      releasePlanVersion: 2,
    };
  } else {
    if (job?.feeSnapshot && typeof job.feeSnapshot === 'object') {
      // eslint-disable-next-line no-console
      console.warn(
        `expertJobRelease: fee snapshot ignored for job ${jobId}, using legacy platform fee for base slice (${snapValidation.reason}).`
      );
    }
    planOptions = {
      releaseJobId: jobId,
      baseFeeSource: 'legacy_platform_fee_percent',
      releasePlanVersion: 2,
    };
  }

  const plan = buildExpertReleasePlan(job, variationEntries, platformFeePercent, planOptions);

  if (plan.baseSlice.grossCents <= 0 || plan.baseSlice.providerCents <= 0) {
    return {
      error: {
        httpStatus: 400,
        message: 'Missing payment amount.',
        code: 'missing_payment_amount',
      },
    };
  }

  for (const vs of plan.variationSlices) {
    if (vs.providerCents <= 0) {
      return {
        error: {
          httpStatus: 400,
          message: `Computed provider amount is invalid for variation ${vs.variationId}.`,
          code: 'invalid_variation_provider_amount',
        },
      };
    }
  }

  const transferGroup = `taskio_job_${jobId}`;

  const baseChargeRes = await getSucceededChargeIdForConnectTransfer(job.paymentIntentId);
  if (baseChargeRes.error) return { error: baseChargeRes.error };

  const jid = String(jobId);
  let baseIdempotencyKey;
  let variationKeyPrefix;
  if (idempotencyPrefix === 'taskio_admin_release') {
    baseIdempotencyKey = `taskio_admin_release_${jid}`;
    variationKeyPrefix = 'taskio_admin_release_var';
  } else if (idempotencyPrefix === 'taskio_admin_resolve_expert') {
    baseIdempotencyKey = `taskio_admin_resolve_expert_${jid}`;
    variationKeyPrefix = 'taskio_admin_resolve_expert_var';
  } else {
    baseIdempotencyKey = `taskio_release_${jid}`;
    variationKeyPrefix = 'taskio_release_var';
  }

  const baseTransfer = await createTransfer({
    amountInCents: plan.baseSlice.providerCents,
    currency,
    destinationAccountId,
    sourceTransaction: baseChargeRes.chargeId,
    transferGroup,
    metadata: {
      type: 'job_release_base',
      jobId,
      tradieUid,
      paymentIntentId: job.paymentIntentId || '',
      platformFeePercent: String(plan.baseSlice.grossCents > 0
        ? Math.round((10000 * plan.baseSlice.platformFeeCents) / plan.baseSlice.grossCents) / 100
        : platformFeePercent),
      platformFeeAmount: String(plan.baseSlice.platformFeeCents),
      providerAmount: String(plan.baseSlice.providerCents),
      ...(homeownerUid ? { homeownerUid } : { adminOverride: 'true' }),
    },
    idempotencyKey: baseIdempotencyKey,
  });

  const variationTransfers = [];
  for (const vs of plan.variationSlices) {
    const cr = await getSucceededChargeIdForConnectTransfer(vs.paymentIntentId);
    if (cr.error) {
      return {
        error: {
          ...cr.error,
          message: `${cr.error.message} (variation ${vs.variationId})`,
          code: cr.error.code,
          variationId: vs.variationId,
        },
      };
    }

    const varIdempotencyKey = `${variationKeyPrefix}_${jid}_${vs.variationId}`;

    const transfer = await createTransfer({
      amountInCents: vs.providerCents,
      currency,
      destinationAccountId,
      sourceTransaction: cr.chargeId,
      transferGroup,
      metadata: {
        type: 'job_release_variation',
        jobId,
        tradieUid,
        variationId: vs.variationId,
        paymentIntentId: vs.paymentIntentId || '',
        expertFeeBps: String(vs.expertFeeBps),
        variationFeeSource: vs.variationFeeSource,
        platformFeePercent: String(vs.expertFeeBps / 100),
        platformFeeAmount: String(vs.platformFeeCents),
        providerAmount: String(vs.providerCents),
        ...(homeownerUid ? { homeownerUid } : { adminOverride: 'true' }),
      },
      idempotencyKey: varIdempotencyKey,
    });

    variationTransfers.push({ variationId: vs.variationId, transfer, slice: vs });
  }

  return { plan, baseTransfer, variationTransfers, variationEntries };
}

/**
 * Persist job + variation docs after all Stripe transfers succeeded.
 */
async function persistExpertReleaseAfterTransfers({
  jobRef,
  statusPaid,
  plan,
  baseTransfer,
  variationTransfers,
  extraJobFields = {},
}) {
  const releaseVariationTransferIds = {};
  for (const { variationId, transfer } of variationTransfers) {
    releaseVariationTransferIds[variationId] = transfer.id;
  }

  const variationGrossReleasedCents = plan.variationSlices.reduce((s, x) => s + x.grossCents, 0);
  const variationPlatformFeeReleasedCents = plan.variationSlices.reduce((s, x) => s + x.platformFeeCents, 0);
  const variationProviderReleasedCents = plan.variationSlices.reduce((s, x) => s + x.providerCents, 0);

  const batch = db.batch();

  batch.update(jobRef, {
    status: statusPaid,
    paymentState: 'released',
    transferId: baseTransfer.id,
    releaseVariationTransferIds,
    releasePlanVersion: plan.releasePlanVersion ?? 2,
    baseReleaseFeeSource: plan.baseFeeSource,
    variationReleaseFeeSource: plan.variationFeeSource,
    baseAmountReleasedCents: plan.baseSlice.grossCents,
    basePlatformFeeReleasedCents: plan.baseSlice.platformFeeCents,
    baseProviderReleasedCents: plan.baseSlice.providerCents,
    variationGrossReleasedCents,
    variationPlatformFeeReleasedCents,
    variationProviderReleasedCents,
    totalGrossReleasedCents: plan.totals.totalGrossCents,
    totalPlatformFeeReleasedCents: plan.totals.totalPlatformFeeCents,
    totalProviderReleasedCents: plan.totals.totalProviderCents,
    platformFeePercent: plan.platformFeePercent,
    platformFeeAmount: plan.totals.totalPlatformFeeCents,
    providerAmount: plan.totals.totalProviderCents,
    releasedAt: admin.firestore.FieldValue.serverTimestamp(),
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    ...extraJobFields,
  });

  for (const { variationId, transfer, slice } of variationTransfers) {
    const vref = jobRef.collection('variations').doc(variationId);
    batch.update(vref, {
      releaseStatus: 'released',
      releasedAt: admin.firestore.FieldValue.serverTimestamp(),
      transferId: transfer.id,
      expertGrossReleasedCents: slice.grossCents,
      expertPlatformFeeReleasedCents: slice.platformFeeCents,
      expertProviderReleasedCents: slice.providerCents,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
  }

  await batch.commit();
  return { releaseVariationTransferIds };
}

module.exports = {
  shouldIncludeVariationInExpertRelease,
  computeFeeSlice,
  buildExpertReleasePlan,
  loadEligibleVariationEntriesForRelease,
  createExpertReleaseStripeTransfers,
  persistExpertReleaseAfterTransfers,
};
