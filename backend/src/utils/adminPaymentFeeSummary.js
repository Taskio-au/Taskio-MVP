'use strict';

const { normalizeStatus } = require('../constants/jobStatuses');
const { safeToMillis } = require('./firestore');
const {
  deriveReleasedFeeBenefitLabel,
  granularReleasedPlatformFees,
  SNAP_BENEFIT_TO_DISPLAY,
} = require('./paymentActivityReleasedDisplay');
const { deriveVariationReleaseSlice } = require('../services/variationFeeSnapshotService');
const { STAGE } = require('../services/expertFeeProgram');

const LEGACY_WARNING =
  'Legacy payment record — some fee details may be estimated from stored release totals.';

/** @returns {number|null} non-negative finite int or null */
function nonNegInt(n) {
  if (n == null || !Number.isFinite(Number(n))) return null;
  const x = Math.round(Number(n));
  return x >= 0 ? x : null;
}

function feeSnapshotLockedAtMs(fs) {
  if (!fs || typeof fs !== 'object') return null;
  const la = fs.lockedAt;
  if (typeof la === 'string' && la.trim()) {
    const t = Date.parse(la.trim());
    return Number.isFinite(t) ? t : null;
  }
  if (la && typeof la === 'object') {
    const sec = la._seconds ?? la.seconds;
    if (sec != null && Number.isFinite(Number(sec))) {
      const ns = la._nanoseconds ?? la.nanoseconds ?? 0;
      return Number(sec) * 1000 + Math.floor(Number(ns) / 1e6);
    }
  }
  return null;
}

/**
 * @param {string|null|undefined} snapshotBenefitRaw
 * @param {string|null} stage
 * @param {number|null} feeBps
 * @param {number|null} taskioFeeCents
 */
function normalizeAdminBenefitLabel(snapshotBenefitRaw, stage, feeBps, taskioFeeCents) {
  const raw =
    typeof snapshotBenefitRaw === 'string' && snapshotBenefitRaw.trim()
      ? snapshotBenefitRaw.trim()
      : '';
  const mappedSnap = SNAP_BENEFIT_TO_DISPLAY[raw] || null;
  if (mappedSnap) return mappedSnap;

  const bps =
    typeof feeBps === 'number' && Number.isFinite(feeBps)
      ? Math.round(feeBps)
      : null;
  const st = typeof stage === 'string' ? stage.trim() : '';

  if (st === STAGE.FOUNDING_FIRST_THREE || bps === 0) return 'Founding Expert offer applied';
  if (st === STAGE.FOUNDING_REDUCED || (bps != null && bps >= 748 && bps <= 752)) {
    return 'Reduced Founding Expert fee applied';
  }
  if (st === STAGE.STANDARD_LAUNCH || bps === 1000) return 'Standard launch fee';
  if ((taskioFeeCents ?? 0) > 0) return 'Taskio fee';
  return 'Taskio fee';
}

function hasPaidSecuredVariation(v) {
  if (!v || typeof v !== 'object') return false;
  if (String(v.status || '') !== 'approved') return false;
  if (String(v.paymentState || '').toLowerCase() !== 'in_escrow') return false;
  if (String(v.paymentStatus || '').toLowerCase() !== 'paid') return false;
  const gross = Math.floor(Number(v.priceChangeCents ?? v.amountPaidCents ?? 0));
  return Number.isFinite(gross) && gross > 0 && String(v.paymentIntentId || '').trim() !== '';
}

function rollupSecuredVariations(job, jobId, variationEntries) {
  let gross = 0;
  let tf = 0;
  let provider = 0;
  for (const v of variationEntries) {
    if (!hasPaidSecuredVariation(v)) continue;
    const vid = String(v.id || '').trim();
    const slice = deriveVariationReleaseSlice(job, jobId, vid, v);
    gross += slice.grossCents;
    tf += slice.platformFeeCents;
    provider += slice.providerCents;
  }
  return { grossCents: gross, taskioFeeCents: tf, providerCents: provider };
}

function hasFeeSnapshot(job) {
  const fs = job?.feeSnapshot;
  return !!(fs && typeof fs === 'object' && Object.keys(fs).length > 0);
}

function releasedHasModernTotals(job) {
  return (
    nonNegInt(job.totalGrossReleasedCents) != null
    && nonNegInt(job.totalPlatformFeeReleasedCents) != null
    && nonNegInt(job.totalProviderReleasedCents) != null
  );
}

function basePaymentSecured(j) {
  const ps = String(j.paymentState || '').toLowerCase();
  const st = String(j.paymentStatus || '').toLowerCase();
  return ps === 'in_escrow' || st === 'succeeded';
}

/**
 * @param {FirebaseFirestore.DocumentReference} jobRef
 * @param {Record<string, unknown>} job — includes id
 */
async function buildAdminPaymentFeeSummary(jobRef, job) {
  const jid = job.id != null ? String(job.id) : jobRef?.id ? String(jobRef.id) : '';
  const j = job && typeof job === 'object' ? job : {};

  let variationEntries = [];
  try {
    if (jobRef && typeof jobRef.collection === 'function') {
      const vSnap = await jobRef.collection('variations').get();
      variationEntries = vSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
    }
  } catch (_) {
    variationEntries = [];
  }

  const paymentState = String(j.paymentState || '');
  const paymentStateLower = paymentState.toLowerCase();
  const status = normalizeStatus(j.status);
  const isReleased = paymentStateLower === 'released';

  const basePi = typeof j.paymentIntentId === 'string' && j.paymentIntentId.trim()
    ? j.paymentIntentId.trim()
    : null;
  const basePayCents = nonNegInt(j.paymentAmountCents);

  const securedRoll = rollupSecuredVariations(j, jid, variationEntries);

  const baseSecuredForSummary = basePaymentSecured(j);
  const variationSecured = securedRoll.grossCents > 0;

  /** @type {'none'|'released'|'secured'|'amounts_only'} */
  let mode = 'none';
  if (isReleased) mode = 'released';
  else if (baseSecuredForSummary || variationSecured) mode = 'secured';
  else if (
    nonNegInt(j.platformFeeAmount) != null
    || nonNegInt(j.providerAmount) != null
    || (basePayCents != null && basePayCents > 0)
  ) mode = 'amounts_only';

  let legacyOrMissingSnapshot = false;
  if (mode === 'released')
    legacyOrMissingSnapshot = !releasedHasModernTotals(j) || !hasFeeSnapshot(j);
  else if (mode === 'secured') legacyOrMissingSnapshot = !hasFeeSnapshot(j);
  else if (mode === 'amounts_only') legacyOrMissingSnapshot = !hasFeeSnapshot(j);

  const warning = legacyOrMissingSnapshot ? LEGACY_WARNING : null;

  const fs = hasFeeSnapshot(j) ? j.feeSnapshot : null;
  const feeStage = fs && typeof fs.stage === 'string' ? fs.stage : null;
  const feeBps =
    typeof fs?.expertFeeBps === 'number' && Number.isFinite(Number(fs.expertFeeBps))
      ? Math.round(Number(fs.expertFeeBps))
      : null;
  const snapshotLockedAtMs = feeSnapshotLockedAtMs(fs);
  const zeroFeeSlotConsumed =
    typeof fs?.zeroFeeSlotConsumed === 'boolean' ? fs.zeroFeeSlotConsumed : null;

  const variationTransferIds =
    j.releaseVariationTransferIds && typeof j.releaseVariationTransferIds === 'object'
      ? { ...j.releaseVariationTransferIds }
      : {};

  const paymentStatus = String(j.paymentStatus || '');

  /** @type {Record<string, unknown>} */
  const out = {
    available: false,
    paymentState,
    paymentStatus,
    status,
    clientPaidCents: null,
    baseClientPaidCents: null,
    variationClientPaidCents: null,
    taskioFeeCents: null,
    baseTaskioFeeCents: null,
    variationTaskioFeeCents: null,
    expertReleasedCents: null,
    baseExpertReleasedCents: null,
    variationExpertReleasedCents: null,
    feeStage,
    feeBps,
    feeBenefitLabel: null,
    zeroFeeSlotConsumed,
    baseReleaseFeeSource:
      j.baseReleaseFeeSource != null && String(j.baseReleaseFeeSource).trim()
        ? String(j.baseReleaseFeeSource).trim()
        : null,
    variationReleaseFeeSource:
      j.variationReleaseFeeSource != null && String(j.variationReleaseFeeSource).trim()
        ? String(j.variationReleaseFeeSource).trim()
        : null,
    releasedToStripe: isReleased,
    releasedAtMs: null,
    basePaymentIntentId: basePi,
    baseTransferId: typeof j.transferId === 'string' && j.transferId.trim() ? j.transferId.trim() : null,
    variationTransferIds,
    snapshotLockedAtMs,
    legacyOrMissingSnapshot,
    warning,
  };

  if (mode === 'released') {
    out.releasedAtMs = safeToMillis(j.releasedAt) || null;

    let clientPaid = nonNegInt(j.totalGrossReleasedCents);
    if (clientPaid == null) {
      const b = nonNegInt(j.baseAmountReleasedCents);
      const v = nonNegInt(j.variationGrossReleasedCents);
      if (b != null || v != null) clientPaid = (b || 0) + (v || 0);
    }
    if (clientPaid == null) clientPaid = basePayCents;

    let baseCli = nonNegInt(j.baseAmountReleasedCents);
    if (baseCli == null) baseCli = basePayCents ?? 0;

    let varCli = nonNegInt(j.variationGrossReleasedCents);
    if (varCli == null && clientPaid != null) varCli = Math.max(0, clientPaid - baseCli);

    let taskio = nonNegInt(j.totalPlatformFeeReleasedCents);
    if (taskio == null) taskio = nonNegInt(j.platformFeeAmount);

    let expert = nonNegInt(j.totalProviderReleasedCents);
    if (expert == null) expert = nonNegInt(j.providerAmount);

    const partsTf = granularReleasedPlatformFees(j);
    let baseTaskio = partsTf.baseTaskioFeeCents;
    let varTaskio = partsTf.variationTaskioFeeCents;

    let baseExpert = nonNegInt(j.baseProviderReleasedCents);
    let varExpert = nonNegInt(j.variationProviderReleasedCents);
    if (expert != null && baseExpert == null && varExpert != null) baseExpert = Math.max(0, expert - varExpert);
    if (expert != null && varExpert == null && baseExpert != null) varExpert = Math.max(0, expert - baseExpert);

    const derivedBenefit =
      deriveReleasedFeeBenefitLabel(j, {
        taskioFeeCents: taskio ?? 0,
        grossReleasedCents: clientPaid ?? 0,
      })
      || normalizeAdminBenefitLabel(
        typeof fs?.benefitLabel === 'string' ? fs.benefitLabel : '',
        feeStage,
        feeBps,
        taskio,
      );

    out.available = !!(clientPaid && clientPaid > 0)
      || (taskio != null && taskio > 0)
      || (expert != null && expert > 0)
      || isReleased;
    out.clientPaidCents = clientPaid;
    out.baseClientPaidCents = baseCli;
    out.variationClientPaidCents = varCli ?? 0;
    out.taskioFeeCents = taskio;
    out.baseTaskioFeeCents = baseTaskio;
    out.variationTaskioFeeCents = varTaskio ?? 0;
    out.expertReleasedCents = expert;
    out.baseExpertReleasedCents = baseExpert;
    out.variationExpertReleasedCents = varExpert ?? 0;
    out.feeBenefitLabel = derivedBenefit;
    return out;
  }

  if (mode === 'secured') {
    const baseCli = basePayCents ?? 0;
    const baseSnapshotTf = nonNegInt(fs?.taskioFeeCents);
    const baseSnapshotExpert = nonNegInt(fs?.expertNetCents);

    let bTf = baseSnapshotTf;
    let bEx = baseSnapshotExpert;

    const pctFallback = Number(j.platformFeePercent);
    if (baseCli > 0) {
      if (bTf != null && bEx == null) bEx = Math.max(0, baseCli - bTf);
      else if (bTf == null && bEx != null) bTf = Math.max(0, baseCli - bEx);
      else if (
        (bTf == null || bEx == null)
        && Number.isFinite(pctFallback)
      ) {
        const estTf = Math.round((baseCli * pctFallback) / 100);
        bTf = bTf ?? (nonNegInt(estTf) ?? 0);
        bEx = bEx ?? Math.max(0, baseCli - bTf);
      }
    }

    const vG = securedRoll.grossCents;
    const vTf = securedRoll.taskioFeeCents;
    const vPr = securedRoll.providerCents;

    const totalClient = baseCli + vG;
    const totalTf = (bTf ?? 0) + vTf;
    const totalExpert = (bEx ?? 0) + vPr;

    out.available = totalClient > 0 || !!basePi || variationSecured;
    out.clientPaidCents = totalClient;
    out.baseClientPaidCents = baseCli;
    out.variationClientPaidCents = vG;
    out.taskioFeeCents = totalTf;
    out.baseTaskioFeeCents = bTf;
    out.variationTaskioFeeCents = vTf;
    out.expertReleasedCents = totalExpert;
    out.baseExpertReleasedCents = bEx;
    out.variationExpertReleasedCents = vPr;
    out.releasedToStripe = false;
    out.releasedAtMs = null;
    out.baseReleaseFeeSource = null;
    out.variationReleaseFeeSource = null;

    const snapLabel = typeof fs?.benefitLabel === 'string' ? fs.benefitLabel : '';
    out.feeBenefitLabel = normalizeAdminBenefitLabel(
      snapLabel,
      feeStage,
      feeBps,
      totalTf === 0 ? 0 : totalTf,
    );
    return out;
  }

  if (mode === 'amounts_only') {
    out.available = true;
    const amt = basePayCents;
    const legacyPf = nonNegInt(j.platformFeeAmount);
    const legacyPr = nonNegInt(j.providerAmount);

    const clientPaid =
      amt != null && amt > 0
        ? amt
        : (legacyPf != null || legacyPr != null ? (legacyPf || 0) + (legacyPr || 0) : null);

    const taskioGuess = legacyPf;
    let expertGuess = legacyPr;
    if (
      expertGuess == null
      && clientPaid != null
      && taskioGuess != null
      && clientPaid >= taskioGuess
    )
      expertGuess = clientPaid - taskioGuess;

    out.clientPaidCents = clientPaid;
    out.baseClientPaidCents = clientPaid ?? amt ?? 0;
    out.variationClientPaidCents = 0;
    out.taskioFeeCents = taskioGuess ?? 0;
    out.baseTaskioFeeCents = taskioGuess ?? 0;
    out.variationTaskioFeeCents = 0;
    out.expertReleasedCents = expertGuess;
    out.baseExpertReleasedCents = expertGuess;
    out.variationExpertReleasedCents = 0;

    const effBpsCalc =
      out.clientPaidCents != null &&
      out.clientPaidCents > 0 &&
      typeof out.taskioFeeCents === 'number'
        ? Math.round((out.taskioFeeCents * 10000) / out.clientPaidCents)
        : null;

    out.feeBenefitLabel = normalizeAdminBenefitLabel(
      typeof fs?.benefitLabel === 'string' ? fs.benefitLabel : '',
      feeStage || null,
      feeBps ?? effBpsCalc,
      typeof out.taskioFeeCents === 'number' ? out.taskioFeeCents : null,
    );

    const psLower = paymentStateLower;
    if (psLower === 'in_escrow' || psLower === 'released') {
      /** keep persisted fee sources visible when present even in amounts-only summaries */
      out.baseReleaseFeeSource =
        j.baseReleaseFeeSource != null && String(j.baseReleaseFeeSource).trim()
          ? String(j.baseReleaseFeeSource).trim()
          : null;
      out.variationReleaseFeeSource =
        j.variationReleaseFeeSource != null && String(j.variationReleaseFeeSource).trim()
          ? String(j.variationReleaseFeeSource).trim()
          : null;
    }
    return out;
  }

  out.available = false;
  return out;
}

module.exports = {
  buildAdminPaymentFeeSummary,
  normalizeAdminBenefitLabel,
};
