'use strict';

const {
  FOUNDING_EXPERT_ZERO_FEE_TASK_LIMIT,
  FOUNDING_EXPERT_REDUCED_FEE_MONTHS,
  FOUNDING_EXPERT_REDUCED_FEE_BPS,
  STANDARD_LAUNCH_FEE_BPS,
} = require('../../../shared/feePlans');

/**
 * Assumed Firestore/user-doc fragment for founding cohort (Stage 2 persists admin enrolment):
 *
 * foundingExpert: {
 *   status: 'active' | 'removed' | 'test_reset' | string,
 *   programId?: string,
 *   approvedAt?, approvedBy?, sequenceNumber?, city?,
 *   zeroFeeTaskLimit?, zeroFeeSlotsUsed?,
 *   reducedFeeStartsAt?, reducedFeeEndsAt?, reducedFeeBps?, standardFeeBpsAfter?,
 *   removedAt?, removedBy?,
 * }
 */

const STAGE = {
  FOUNDING_FIRST_THREE: 'founding_first_three',
  FOUNDING_REDUCED: 'founding_reduced',
  STANDARD_LAUNCH: 'standard_launch',
};

const BENEFIT_STANDARD = 'Standard launch fee';
const BENEFIT_FOUNDING_ZERO = 'Founding Expert benefit applied';
const BENEFIT_FOUNDING_REDUCED = 'Reduced Founding Expert fee applied';

function assertPositiveIntegerCents(name, value) {
  if (!Number.isFinite(value) || !Number.isInteger(value) || value <= 0) {
    const err = new Error(`${name} must be a positive integer (cents).`);
    err.code = 'INVALID_GROSS_CENTS';
    throw err;
  }
}

function assertValidFeeBps(feeBps) {
  if (!Number.isFinite(feeBps) || !Number.isInteger(feeBps) || feeBps < 0 || feeBps > 10000) {
    const err = new Error('feeBps must be an integer between 0 and 10000 (basis points).');
    err.code = 'INVALID_FEE_BPS';
    throw err;
  }
}

/** @param {unknown} value */
function toDate(value) {
  if (value == null) return null;
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  if (typeof value === 'string' && value.trim()) {
    const d = new Date(value.trim());
    return Number.isNaN(d.getTime()) ? null : d;
  }
  const sec = value._seconds ?? value.seconds;
  if (sec != null && Number.isFinite(Number(sec))) {
    const ns = value._nanoseconds ?? value.nanoseconds ?? 0;
    const d = new Date(Number(sec) * 1000 + Math.floor(Number(ns) / 1e6));
    return Number.isNaN(d.getTime()) ? null : d;
  }
  return null;
}

/** @param {Date} date */
function addCalendarMonths(date, months) {
  const d = new Date(date.getTime());
  d.setUTCMonth(d.getUTCMonth() + months);
  return d;
}

function normalizeNow(now) {
  if (now instanceof Date && !Number.isNaN(now.getTime())) return now;
  const d = toDate(now);
  if (d) return d;
  return new Date();
}

/**
 * Taskio fee in cents from gross and basis points.
 * taskioFeeCents = round(gross * bps / 10000)
 *
 * @param {number} grossAmountCents
 * @param {number} feeBps
 * @returns {number}
 */
function calculateFeeCents(grossAmountCents, feeBps) {
  assertPositiveIntegerCents('grossAmountCents', grossAmountCents);
  assertValidFeeBps(feeBps);
  return Math.round((grossAmountCents * feeBps) / 10000);
}

/**
 * Effective end of reduced-fee window when only start is stored.
 * @param {Date} startsAt
 * @returns {Date}
 */
function deriveReducedFeeEndsAt(startsAt) {
  return addCalendarMonths(startsAt, FOUNDING_EXPERT_REDUCED_FEE_MONTHS);
}

/**
 * Resolve founding stage and fee bps from profile (no gross amount).
 *
 * @param {object|null|undefined} expertProfileOrDoc
 * @param {Date|number|string|undefined} [nowInput]
 * @returns {{
 *   stage: string,
 *   expertFeeBps: number,
 *   benefitLabel: string,
 *   effectiveReducedFeeEndsAt: Date|null,
 *   derivedReducedFeeEndsAt: boolean,
 * }}
 */
function getFoundingExpertStage(expertProfileOrDoc, nowInput) {
  const now = normalizeNow(nowInput);
  const profile = expertProfileOrDoc && typeof expertProfileOrDoc === 'object' ? expertProfileOrDoc : {};
  const fe = profile.foundingExpert && typeof profile.foundingExpert === 'object' ? profile.foundingExpert : {};

  const status = typeof fe.status === 'string' ? fe.status.trim().toLowerCase() : '';
  const isActive = status === 'active';

  const zeroUsedRaw = fe.zeroFeeSlotsUsed;
  const zeroFeeSlotsUsed =
    Number.isFinite(Number(zeroUsedRaw)) && Number.isInteger(Number(zeroUsedRaw))
      ? Math.max(0, Number(zeroUsedRaw))
      : 0;

  if (!isActive) {
    return {
      stage: STAGE.STANDARD_LAUNCH,
      expertFeeBps: STANDARD_LAUNCH_FEE_BPS,
      benefitLabel: BENEFIT_STANDARD,
      effectiveReducedFeeEndsAt: null,
      derivedReducedFeeEndsAt: false,
    };
  }

  const limit = FOUNDING_EXPERT_ZERO_FEE_TASK_LIMIT;
  if (zeroFeeSlotsUsed < limit) {
    return {
      stage: STAGE.FOUNDING_FIRST_THREE,
      expertFeeBps: 0,
      benefitLabel: BENEFIT_FOUNDING_ZERO,
      effectiveReducedFeeEndsAt: null,
      derivedReducedFeeEndsAt: false,
    };
  }

  let reducedEnds = toDate(fe.reducedFeeEndsAt);
  let derivedReducedFeeEndsAt = false;
  if (!reducedEnds) {
    const reducedStarts = toDate(fe.reducedFeeStartsAt);
    if (reducedStarts) {
      reducedEnds = deriveReducedFeeEndsAt(reducedStarts);
      derivedReducedFeeEndsAt = true;
    }
  }

  if (reducedEnds && now.getTime() <= reducedEnds.getTime()) {
    return {
      stage: STAGE.FOUNDING_REDUCED,
      expertFeeBps: FOUNDING_EXPERT_REDUCED_FEE_BPS,
      benefitLabel: BENEFIT_FOUNDING_REDUCED,
      effectiveReducedFeeEndsAt: reducedEnds,
      derivedReducedFeeEndsAt,
    };
  }

  return {
    stage: STAGE.STANDARD_LAUNCH,
    expertFeeBps: STANDARD_LAUNCH_FEE_BPS,
    benefitLabel: BENEFIT_STANDARD,
    effectiveReducedFeeEndsAt: reducedEnds,
    derivedReducedFeeEndsAt,
  };
}

/** Expert-visible benefit line (distinct from persisted snapshot strings). */
const EXPERT_FACE_BENEFIT = {
  [STAGE.FOUNDING_FIRST_THREE]: 'Founding Expert offer',
  [STAGE.FOUNDING_REDUCED]: 'Reduced Founding Expert fee',
  [STAGE.STANDARD_LAUNCH]: 'Standard launch fee',
};

function expertFacingBenefitLabel(stage) {
  return EXPERT_FACE_BENEFIT[stage] || EXPERT_FACE_BENEFIT[STAGE.STANDARD_LAUNCH];
}

function timestampToMillis(value) {
  const d = toDate(value);
  return d ? d.getTime() : null;
}

function formatAuCurrencyFromCents(cents) {
  const n = Number(cents);
  if (!Number.isFinite(n)) {
    try {
      return new Intl.NumberFormat('en-AU', {
        style: 'currency',
        currency: 'AUD',
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }).format(0);
    } catch {
      return '$0.00';
    }
  }
  return new Intl.NumberFormat('en-AU', {
    style: 'currency',
    currency: 'AUD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n / 100);
}

function expertFeeProfileDisplayCopy({ stage, effectiveReducedEndsAt }) {
  if (stage === STAGE.FOUNDING_FIRST_THREE) {
    return '0% Taskio fee on your first 3 funded tasks.';
  }
  if (stage === STAGE.FOUNDING_REDUCED) {
    const endMs = effectiveReducedEndsAt instanceof Date ? effectiveReducedEndsAt.getTime() : null;
    let endLabel = '';
    if (endMs != null && Number.isFinite(endMs)) {
      try {
        endLabel = new Intl.DateTimeFormat('en-AU', { dateStyle: 'medium' }).format(new Date(endMs));
      } catch {
        endLabel = '';
      }
    }
    return endLabel
      ? `7.5% Taskio fee until ${endLabel}.`
      : '7.5% Taskio fee during your founding reduced period.';
  }
  return '10% Taskio fee.';
}

/**
 * Safe Expert-facing founding fee profile for GET /api/me (estimate / display only).
 *
 * @param {object|null|undefined} expertProfileOrDoc
 * @param {Date|number|string|undefined} [nowInput]
 */
function buildExpertFoundingFeeProfile(expertProfileOrDoc, nowInput) {
  const now = normalizeNow(nowInput);
  const profile = expertProfileOrDoc && typeof expertProfileOrDoc === 'object' ? expertProfileOrDoc : {};
  const fe = profile.foundingExpert && typeof profile.foundingExpert === 'object' ? profile.foundingExpert : {};
  const rawStatus = typeof fe.status === 'string' ? fe.status.trim() : '';
  const normalizedStatusLower = rawStatus.toLowerCase();
  const isActive = normalizedStatusLower === 'active';
  const status = rawStatus === '' ? null : rawStatus;
  const enrolled = isActive;
  const programId =
    isActive && fe.programId != null && String(fe.programId).trim() ? String(fe.programId).trim() : null;

  let zeroFeeSlotsUsed = null;
  if (isActive) {
    const z = Number(fe.zeroFeeSlotsUsed);
    zeroFeeSlotsUsed =
      Number.isFinite(z) && Number.isInteger(z) ? Math.max(0, z) : 0;
  }

  const stageInfo = getFoundingExpertStage(profile, now);

  let reducedFeeEndsAtMs = isActive ? timestampToMillis(fe.reducedFeeEndsAt) : null;
  const reducedFeeStartsAtMs = isActive ? timestampToMillis(fe.reducedFeeStartsAt) : null;
  if (
    isActive &&
    reducedFeeEndsAtMs == null &&
    stageInfo.effectiveReducedFeeEndsAt instanceof Date &&
    Number.isFinite(stageInfo.effectiveReducedFeeEndsAt.getTime())
  ) {
    reducedFeeEndsAtMs = stageInfo.effectiveReducedFeeEndsAt.getTime();
  }

  const limit = FOUNDING_EXPERT_ZERO_FEE_TASK_LIMIT;
  let zeroFeeSlotsRemaining = null;
  if (isActive && stageInfo.stage === STAGE.FOUNDING_FIRST_THREE) {
    zeroFeeSlotsRemaining = Math.max(0, limit - (zeroFeeSlotsUsed ?? 0));
  }

  const badgeEligible =
    isActive &&
    (stageInfo.stage === STAGE.FOUNDING_FIRST_THREE || stageInfo.stage === STAGE.FOUNDING_REDUCED);

  const standardFeeBpsAfterRaw = fe.standardFeeBpsAfter;
  const standardFeeBpsAfter =
    Number.isFinite(Number(standardFeeBpsAfterRaw)) && Number.isInteger(Number(standardFeeBpsAfterRaw))
      ? Number(standardFeeBpsAfterRaw)
      : STANDARD_LAUNCH_FEE_BPS;

  return {
    enrolled,
    status,
    programId,
    stage: stageInfo.stage,
    expertFeeBps: stageInfo.expertFeeBps,
    benefitLabel: expertFacingBenefitLabel(stageInfo.stage),
    zeroFeeSlotsUsed,
    zeroFeeTaskLimit: limit,
    zeroFeeSlotsRemaining,
    reducedFeeStartsAtMs,
    reducedFeeEndsAtMs,
    standardFeeBpsAfter,
    badgeLabel: badgeEligible ? 'Founding Expert' : null,
    displayCopy: expertFeeProfileDisplayCopy({
      stage: stageInfo.stage,
      effectiveReducedEndsAt: stageInfo.effectiveReducedFeeEndsAt,
    }),
    estimateOnly: true,
  };
}

/**
 * Quote fee breakdown for Experts (estimate only).
 *
 * @param {{
 *   expertProfile?: object|null,
 *   grossAmountCents: number,
 *   now?: Date|number|string,
 * }} params
 */
function estimateExpertFeeForGross({ expertProfile = {}, grossAmountCents, now: nowInput }) {
  assertPositiveIntegerCents('grossAmountCents', grossAmountCents);
  const now = normalizeNow(nowInput);
  const stageInfo = getFoundingExpertStage(expertProfile, now);
  const expertFeeBps = stageInfo.expertFeeBps;
  const taskioFeeCents = calculateFeeCents(grossAmountCents, expertFeeBps);
  const expertReceivesCents = grossAmountCents - taskioFeeCents;
  const benefitLabel = expertFacingBenefitLabel(stageInfo.stage);
  const feeLine = `Taskio fee: ${formatAuCurrencyFromCents(taskioFeeCents)} (${benefitLabel})`;
  const receiveLine = `You receive: ${formatAuCurrencyFromCents(expertReceivesCents)}`;
  const note = 'Estimate only. Final fee is locked when the Client funds the task.';

  return {
    grossAmountCents,
    taskioFeeCents,
    expertReceivesCents,
    expertFeeBps,
    stage: stageInfo.stage,
    benefitLabel,
    estimateOnly: true,
    finalisedWhen: 'client_funds_task',
    copy: {
      feeLine,
      receiveLine,
      note,
    },
  };
}

/**
 * Full fee snapshot for persistence (Stage 2+ may set lockedAt when snapshot is committed).
 *
 * @param {{
 *   expertProfile?: object|null,
 *   grossAmountCents: number,
 *   jobId: string,
 *   now?: Date|number|string,
 * }} params
 */
function calculateExpertFeeSnapshot({ expertProfile = {}, grossAmountCents, jobId, now: nowInput }) {
  assertPositiveIntegerCents('grossAmountCents', grossAmountCents);
  const jobIdStr = jobId != null ? String(jobId).trim() : '';
  if (!jobIdStr) {
    const err = new Error('jobId is required.');
    err.code = 'INVALID_JOB_ID';
    throw err;
  }

  const now = normalizeNow(nowInput);
  const profileObj = expertProfile && typeof expertProfile === 'object' ? expertProfile : {};
  const feRaw =
    profileObj.foundingExpert && typeof profileObj.foundingExpert === 'object'
      ? profileObj.foundingExpert
      : {};
  const feStatus = typeof feRaw.status === 'string' ? feRaw.status.trim().toLowerCase() : '';
  const enrolledProgramId =
    feStatus === 'active' && feRaw.programId != null && String(feRaw.programId).trim()
      ? String(feRaw.programId).trim()
      : null;

  const stageInfo = getFoundingExpertStage(expertProfile, now);
  const expertFeeBps = stageInfo.expertFeeBps;
  const taskioFeeCents = calculateFeeCents(grossAmountCents, expertFeeBps);
  const expertNetCents = grossAmountCents - taskioFeeCents;

  return {
    programId: enrolledProgramId,
    stage: stageInfo.stage,
    expertFeeBps,
    grossAmountCents,
    taskioFeeCents,
    expertNetCents,
    benefitLabel: stageInfo.benefitLabel,
    calculatedAt: now.toISOString(),
    lockedAt: null,
    jobId: jobIdStr,
  };
}

module.exports = {
  calculateFeeCents,
  getFoundingExpertStage,
  calculateExpertFeeSnapshot,
  deriveReducedFeeEndsAt,
  buildExpertFoundingFeeProfile,
  estimateExpertFeeForGross,
  STAGE,
};
