'use strict';

/**
 * Melbourne Founding Expert programme — shared config (Stages 1–2).
 * Stage 2: test vs production program IDs and active-program resolution from env.
 *
 * Cap strategy (Stage 2): up to `foundingExpertCap` **active** approvals per programId at a time.
 * Sequence numbers are never reused after removal; `nextSequenceNumber` only increases.
 */

const testProgramId = 'melbourne_founding_expert_test_2026';
const productionProgramId = 'melbourne_founding_expert_2026';

/** Defaults to test program unless env explicitly selects production (with guard). */
const defaultProgramId = testProgramId;

const foundingExpertCap = 50;
const foundingExpertZeroFeeTaskLimit = 3;

const foundingExpertZeroFeeBps = 0;
const foundingExpertReducedFeeBps = 750;
const foundingExpertReducedFeeMonths = 3;

const standardLaunchFeeBps = 1000;

/** Percent points for standard launch (= basis points ÷ 100). Current launch default is 10%. */
function standardLaunchFeePercent() {
  return standardLaunchFeeBps / 100;
}

/**
 * Resolved default Taskio fee percent when `job.platformFeePercent` is unset.
 *
 * If `PLATFORM_FEE_PERCENT` is set to a finite number in [0,100], it still overrides this.
 * Missing or invalid env falls back to {@link standardLaunchFeePercent}.
 */
function defaultPlatformFeePercentFromEnv(env = process.env) {
  const raw = env.PLATFORM_FEE_PERCENT;
  if (raw === undefined || raw === null || String(raw).trim() === '') {
    return standardLaunchFeePercent();
  }
  const p = Number(raw);
  if (!Number.isFinite(p) || p < 0 || p > 100) {
    return standardLaunchFeePercent();
  }
  return p;
}

/** @deprecated Use `testProgramId` / `productionProgramId` / `getActiveFoundingExpertProgramId()`. */
const FOUNDING_EXPERT_CAP = foundingExpertCap;
const FOUNDING_EXPERT_ZERO_FEE_TASK_LIMIT = foundingExpertZeroFeeTaskLimit;
const FOUNDING_EXPERT_ZERO_FEE_BPS = foundingExpertZeroFeeBps;
const FOUNDING_EXPERT_REDUCED_FEE_BPS = foundingExpertReducedFeeBps;
const FOUNDING_EXPERT_REDUCED_FEE_MONTHS = foundingExpertReducedFeeMonths;
const STANDARD_LAUNCH_FEE_BPS = standardLaunchFeeBps;

/**
 * Active program ID for new admin approvals and server-side defaults.
 *
 * Rules:
 * - Missing `FOUNDING_EXPERT_PROGRAM_ID` → test program (safe default).
 * - `FOUNDING_EXPERT_PROGRAM_ID=testProgramId` → test.
 * - Production ID is accepted only when `FOUNDING_EXPERT_ALLOW_PRODUCTION_PROGRAM === 'true'`.
 * - Unknown values fall back to test (with optional stderr warning in non-test environments).
 *
 * Does not auto-select from NODE_ENV alone.
 */
function getActiveFoundingExpertProgramId() {
  const raw = process.env.FOUNDING_EXPERT_PROGRAM_ID;
  const trimmed = raw != null ? String(raw).trim() : '';
  if (!trimmed) return testProgramId;

  if (trimmed === testProgramId) return testProgramId;

  if (trimmed === productionProgramId) {
    return process.env.FOUNDING_EXPERT_ALLOW_PRODUCTION_PROGRAM === 'true' ? productionProgramId : testProgramId;
  }

  if (process.env.NODE_ENV !== 'test') {
    // eslint-disable-next-line no-console
    console.warn(
      `[feePlans] Unknown FOUNDING_EXPERT_PROGRAM_ID="${trimmed}"; falling back to test program "${testProgramId}".`
    );
  }
  return testProgramId;
}

function isKnownFoundingExpertProgramId(programId) {
  const id = programId != null ? String(programId).trim() : '';
  return id === testProgramId || id === productionProgramId;
}

const baseExports = {
  testProgramId,
  productionProgramId,
  defaultProgramId,
  getActiveFoundingExpertProgramId,
  isKnownFoundingExpertProgramId,

  foundingExpertCap,
  foundingExpertZeroFeeTaskLimit,
  foundingExpertZeroFeeBps,
  foundingExpertReducedFeeBps,
  foundingExpertReducedFeeMonths,
  standardLaunchFeeBps,
  standardLaunchFeePercent,
  defaultPlatformFeePercentFromEnv,

  FOUNDING_EXPERT_CAP,
  FOUNDING_EXPERT_ZERO_FEE_TASK_LIMIT,
  FOUNDING_EXPERT_ZERO_FEE_BPS,
  FOUNDING_EXPERT_REDUCED_FEE_BPS,
  FOUNDING_EXPERT_REDUCED_FEE_MONTHS,
  STANDARD_LAUNCH_FEE_BPS,
};

module.exports = baseExports;

/** Resolved active program (reflects env at read time). */
Object.defineProperty(module.exports, 'PROGRAM_ID', {
  enumerable: true,
  get: () => getActiveFoundingExpertProgramId(),
});

Object.defineProperty(module.exports, 'programId', {
  enumerable: true,
  get: () => getActiveFoundingExpertProgramId(),
});
