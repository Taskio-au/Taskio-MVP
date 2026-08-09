'use strict';

const { STANDARD_LAUNCH_FEE_BPS } = require('../../../shared/feePlans');
const {
  BASE_FUNDING_SOURCE,
  lockedAtPresent,
} = require('./jobFeeSnapshotService');
const { calculateFeeCents } = require('./expertFeeProgram');

const VARIATION_PAYMENT_SOURCE = 'variation_payment';
const BENEFIT_STANDARD_FALLBACK = 'Standard launch fee';
const STANDARD_STAGE = 'standard_launch';

const VARIATION_FEE_SOURCE_LEGACY_PERCENT = 'platform_fee_percent';
const VARIATION_FEE_SOURCE_SNAPSHOT = 'variation_fee_snapshot_v1';
const VARIATION_FEE_SOURCE_BASE_INHERIT = 'base_fee_snapshot_inherited';
const VARIATION_FEE_SOURCE_STANDARD_FALLBACK = 'standard_launch_fallback';

/**
 * @typedef {{
 *   inheritedFromBaseJobFeeSnapshot: boolean,
 *   expertFeeBps: number,
 *   stage: string,
 *   benefitLabel: string,
 *   programId?: string|null,
 *   baseJobFeeSnapshotLockedAt: string|null,
 * }} ResolvedVariationFeeRule
 */

/** @returns {ResolvedVariationFeeRule} */
function resolveInheritedBaseJobFeeRule(job, jobId) {
  const jid = jobId != null ? String(jobId).trim() : '';
  const fs = job?.feeSnapshot;
  if (!fs || typeof fs !== 'object') {
    return standardRule(false, null);
  }
  if (fs.source !== BASE_FUNDING_SOURCE || fs.version !== 1 || String(fs.jobId || '') !== jid) {
    return standardRule(false, null);
  }
  const acceptedExpert = job.acceptedTradieUid != null ? String(job.acceptedTradieUid) : '';
  if (!acceptedExpert || String(fs.expertUid || '') !== acceptedExpert) {
    return standardRule(false, null);
  }
  if (!lockedAtPresent(fs.lockedAt)) {
    return standardRule(false, null);
  }
  const stage = fs.stage;
  if (stage == null || typeof stage !== 'string' || !String(stage).trim()) {
    return standardRule(false, null);
  }
  const expertFeeBpsRaw = fs.expertFeeBps;
  if (
    expertFeeBpsRaw == null
    || !Number.isFinite(Number(expertFeeBpsRaw))
    || !Number.isInteger(Number(expertFeeBpsRaw))
    || Number(expertFeeBpsRaw) < 0
    || Number(expertFeeBpsRaw) > 10000
  ) {
    return standardRule(false, null);
  }

  let baseLockedIso = null;
  if (typeof fs.lockedAt === 'string' && fs.lockedAt.trim()) {
    baseLockedIso = fs.lockedAt.trim();
  } else if (typeof fs.lockedAt === 'object') {
    const sec = fs.lockedAt._seconds ?? fs.lockedAt.seconds;
    const ns = fs.lockedAt._nanoseconds ?? fs.lockedAt.nanoseconds ?? 0;
    if (sec != null && Number.isFinite(Number(sec))) {
      const d = new Date(Number(sec) * 1000 + Math.floor(Number(ns) / 1e6));
      if (!Number.isNaN(d.getTime())) baseLockedIso = d.toISOString();
    }
  }

  const benefitLabel = typeof fs.benefitLabel === 'string' && fs.benefitLabel.trim()
    ? fs.benefitLabel.trim()
    : BENEFIT_STANDARD_FALLBACK;
  const programId = fs.programId != null && String(fs.programId).trim()
    ? String(fs.programId).trim()
    : null;

  return {
    inheritedFromBaseJobFeeSnapshot: true,
    expertFeeBps: Number(expertFeeBpsRaw),
    stage: String(stage).trim(),
    benefitLabel,
    programId,
    baseJobFeeSnapshotLockedAt: baseLockedIso,
  };
}

/** @returns {ResolvedVariationFeeRule} */
function standardRule(inherited, baseLocked) {
  return {
    inheritedFromBaseJobFeeSnapshot: inherited,
    expertFeeBps: STANDARD_LAUNCH_FEE_BPS,
    stage: STANDARD_STAGE,
    benefitLabel: BENEFIT_STANDARD_FALLBACK,
    programId: null,
    baseJobFeeSnapshotLockedAt: baseLocked,
  };
}

/**
 * Persists after successful variation escrow payment.
 *
 * Does not mutate expert zeroFeeSlotsUsed.
 *
 * @param {{
 *   job: object,
 *   jobId: string,
 *   variationId: string,
 *   variationGrossCents: number,
 *   now?: Date,
 * }} params
 */
function buildVariationPaymentFeeSnapshot(params) {
  const { job, jobId, variationId, variationGrossCents: grossRaw, now: nowInput } = params;
  const now = nowInput instanceof Date && !Number.isNaN(nowInput.getTime()) ? nowInput : new Date();
  const variationGrossCents = Math.floor(Number(grossRaw));
  const jid = jobId != null ? String(jobId).trim() : '';
  const vid = variationId != null ? String(variationId).trim() : '';
  const expertUidRaw = job?.acceptedTradieUid;
  const expertUid = expertUidRaw != null ? String(expertUidRaw).trim() : '';

  if (!jid || !vid || !expertUid) {
    return null;
  }
  if (!Number.isFinite(variationGrossCents) || !Number.isInteger(variationGrossCents) || variationGrossCents <= 0) {
    return null;
  }

  const rule = resolveInheritedBaseJobFeeRule(job, jid);
  const taskioFeeCents = calculateFeeCents(variationGrossCents, rule.expertFeeBps);
  const expertNetCents = variationGrossCents - taskioFeeCents;

  const lockedAtIso = now.toISOString();
  const calculatedAt = lockedAtIso;

  return {
    source: VARIATION_PAYMENT_SOURCE,
    version: 1,
    inheritedFromBaseJobFeeSnapshot: rule.inheritedFromBaseJobFeeSnapshot,
    baseJobFeeSnapshotSource: BASE_FUNDING_SOURCE,
    baseJobFeeSnapshotLockedAt: rule.baseJobFeeSnapshotLockedAt,
    jobId: jid,
    variationId: vid,
    expertUid,
    stage: rule.stage,
    expertFeeBps: rule.expertFeeBps,
    grossAmountCents: variationGrossCents,
    taskioFeeCents,
    expertNetCents,
    benefitLabel: rule.benefitLabel,
    ...(rule.programId != null ? { programId: rule.programId } : {}),
    calculatedAt,
    lockedAt: lockedAtIso,
  };
}

function isValidVariationPaymentFeeSnapshotVsGross(fs, grossCents) {
  if (!fs || typeof fs !== 'object') return false;
  if (fs.source !== VARIATION_PAYMENT_SOURCE || fs.version !== 1) return false;
  const gross = Math.floor(Number(fs.grossAmountCents));
  const expectedGross = Math.floor(Number(grossCents));
  if (!Number.isFinite(gross) || !Number.isFinite(expectedGross) || gross <= 0) return false;
  if (Math.abs(gross - expectedGross) > 1) return false;
  const tf = Math.floor(Number(fs.taskioFeeCents));
  const en = Math.floor(Number(fs.expertNetCents));
  if (!Number.isFinite(tf) || !Number.isFinite(en) || tf < 0) return false;
  if (tf + en !== gross) return false;
  const feeBps = fs.expertFeeBps;
  if (
    feeBps == null
    || !Number.isFinite(Number(feeBps))
    || !Number.isInteger(Number(feeBps))
    || Number(feeBps) < 0
    || Number(feeBps) > 10000
  ) {
    return false;
  }
  return true;
}

/**
 * Single variation release slice consistent with persisted snapshot or inherited base rules.
 *
 * @returns {{
 *   variationId: string,
 *   paymentIntentId: string,
 *   grossCents: number,
 *   platformFeeCents: number,
 *   providerCents: number,
 *   variationFeeSource: string,
 *   expertFeeBps: number,
 * }}
 */
function deriveVariationReleaseSlice(job, jobId, variationEntryId, variationData) {
  const grossCents = Math.floor(Number(variationData.priceChangeCents ?? variationData.amountPaidCents ?? 0));
  const paymentIntentId = String(variationData.paymentIntentId || '').trim();

  const fs = variationData.feeSnapshot;
  if (isValidVariationPaymentFeeSnapshotVsGross(fs, grossCents)) {
    const platformFeeCents = Math.floor(Number(fs.taskioFeeCents));
    const providerCents = Math.floor(Number(fs.expertNetCents));
    return {
      variationId: variationEntryId,
      paymentIntentId,
      grossCents,
      platformFeeCents,
      providerCents,
      variationFeeSource: VARIATION_FEE_SOURCE_SNAPSHOT,
      expertFeeBps: Number(fs.expertFeeBps),
    };
  }

  const jid = jobId != null ? String(jobId).trim() : '';
  const rule = resolveInheritedBaseJobFeeRule(job, jid);
  if (rule.inheritedFromBaseJobFeeSnapshot) {
    const platformFeeCents = calculateFeeCents(grossCents, rule.expertFeeBps);
    return {
      variationId: variationEntryId,
      paymentIntentId,
      grossCents,
      platformFeeCents,
      providerCents: grossCents - platformFeeCents,
      variationFeeSource: VARIATION_FEE_SOURCE_BASE_INHERIT,
      expertFeeBps: rule.expertFeeBps,
    };
  }

  const pctFallback = STANDARD_LAUNCH_FEE_BPS / 100;
  const platformFeeCents = Math.round((grossCents * pctFallback) / 100);
  return {
    variationId: variationEntryId,
    paymentIntentId,
    grossCents,
    platformFeeCents,
    providerCents: grossCents - platformFeeCents,
    variationFeeSource: VARIATION_FEE_SOURCE_STANDARD_FALLBACK,
    expertFeeBps: STANDARD_LAUNCH_FEE_BPS,
  };
}

module.exports = {
  VARIATION_PAYMENT_SOURCE,
  BENEFIT_STANDARD_FALLBACK,
  resolveInheritedBaseJobFeeRule,
  buildVariationPaymentFeeSnapshot,
  deriveVariationReleaseSlice,
  isValidVariationPaymentFeeSnapshotVsGross,
  VARIATION_FEE_SOURCE_LEGACY_PERCENT,
  VARIATION_FEE_SOURCE_SNAPSHOT,
  VARIATION_FEE_SOURCE_BASE_INHERIT,
  VARIATION_FEE_SOURCE_STANDARD_FALLBACK,
};
