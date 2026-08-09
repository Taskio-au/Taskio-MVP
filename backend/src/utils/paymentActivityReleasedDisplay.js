'use strict';

/**
 * Expert-facing labels for released payment rows (payments activity UI only).
 */

const SNAP_BENEFIT_TO_DISPLAY = Object.freeze({
  'Founding Expert benefit applied': 'Founding Expert offer applied',
  'Reduced Founding Expert fee applied': 'Reduced Founding Expert fee applied',
  'Standard launch fee': 'Standard launch fee',
});

function clampInt(n) {
  if (n == null || !Number.isFinite(Number(n))) return 0;
  return Math.round(Number(n));
}

function effectiveFeeBpsFromTotals(taskioFeeCents, grossCents) {
  const g = clampInt(grossCents);
  const t = clampInt(taskioFeeCents);
  if (g <= 0) return null;
  return Math.round((t * 10000) / g);
}

function mapSnapshotBenefitLabel(job) {
  const fs = job.feeSnapshot && typeof job.feeSnapshot === 'object' ? job.feeSnapshot : {};
  const raw = typeof fs.benefitLabel === 'string' ? fs.benefitLabel.trim() : '';
  if (!raw) return null;
  return SNAP_BENEFIT_TO_DISPLAY[raw] || null;
}

/**
 * Resolve base / variation Taskio fee cents from persisted release fields.
 *
 * @param {Record<string, unknown>} job
 * @returns {{ baseTaskioFeeCents: number, variationTaskioFeeCents: number }}
 */
function granularReleasedPlatformFees(job) {
  const j = job && typeof job === 'object' ? job : {};
  let baseTf =
    Number.isFinite(Number(j.basePlatformFeeReleasedCents))
      ? clampInt(j.basePlatformFeeReleasedCents)
      : null;
  let varTf =
    Number.isFinite(Number(j.variationPlatformFeeReleasedCents))
      ? clampInt(j.variationPlatformFeeReleasedCents)
      : null;
  const totalStored = Number.isFinite(Number(j.totalPlatformFeeReleasedCents))
    ? clampInt(j.totalPlatformFeeReleasedCents)
    : null;
  const legacyPf = Number.isFinite(Number(j.platformFeeAmount)) ? clampInt(j.platformFeeAmount) : null;

  if (totalStored != null) {
    if (baseTf == null && varTf == null) {
      baseTf = totalStored;
      varTf = 0;
    } else if (baseTf != null && varTf == null) {
      varTf = Math.max(0, totalStored - baseTf);
    } else if (baseTf == null && varTf != null) {
      baseTf = Math.max(0, totalStored - varTf);
    }
  }

  if (baseTf == null && legacyPf != null) {
    baseTf = legacyPf;
    if (varTf == null) varTf = 0;
  }
  if (baseTf == null) baseTf = 0;
  if (varTf == null) varTf = 0;

  return {
    baseTaskioFeeCents: Math.max(0, baseTf),
    variationTaskioFeeCents: Math.max(0, varTf),
  };
}

/**
 * @param {Record<string, unknown>} job
 * @param {{
 *   taskioFeeCents: number,
 *   grossReleasedCents: number,
 * }} ctx
 */
function deriveReleasedFeeBenefitLabel(job, ctx) {
  const j = job && typeof job === 'object' ? job : {};
  const tf = clampInt(ctx?.taskioFeeCents);
  const gross = clampInt(ctx?.grossReleasedCents);

  const baseSrc =
    typeof j.baseReleaseFeeSource === 'string' ? j.baseReleaseFeeSource.trim().toLowerCase() : '';
  const basePf = Number.isFinite(Number(j.basePlatformFeeReleasedCents))
    ? clampInt(j.basePlatformFeeReleasedCents)
    : 0;

  if (baseSrc === 'fee_snapshot_v1' && basePf === 0 && tf === 0) {
    return 'Founding Expert offer applied';
  }

  if (baseSrc === 'fee_snapshot_v1' && gross > 0 && tf > 0) {
    const bps = effectiveFeeBpsFromTotals(tf, gross);
    if (bps != null && bps >= 748 && bps <= 752) {
      return 'Reduced Founding Expert fee applied';
    }
  }

  const bpsAll = effectiveFeeBpsFromTotals(tf, gross);
  if (bpsAll != null && bpsAll >= 998 && bpsAll <= 1002 && gross > 0) {
    return 'Standard launch fee';
  }

  const mapped = mapSnapshotBenefitLabel(j);
  if (mapped) return mapped;

  if (tf > 0) return 'Taskio fee';

  return null;
}

module.exports = {
  deriveReleasedFeeBenefitLabel,
  granularReleasedPlatformFees,
  SNAP_BENEFIT_TO_DISPLAY,
};
