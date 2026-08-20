'use strict';

const { variationNeedsCancellationRefund } = require('./cancellationRefundService');

const STRIPE_REFUND_SUCCEEDED = 'succeeded';
const STRIPE_REFUND_FAILED = new Set(['failed', 'canceled', 'cancelled']);
const STRIPE_REFUND_NON_FINAL = new Set(['pending', 'requires_action']);

function paymentStateOf(value) {
  return String(value || '').toLowerCase();
}

function variationAmountCents(v) {
  const n = Math.floor(Number(v?.amountPaidCents ?? v?.priceChangeCents ?? 0));
  return Number.isFinite(n) && n > 0 ? n : 0;
}

function isBaseReleased(job) {
  const ps = paymentStateOf(job?.paymentState);
  return ps === 'released'
    || Boolean(String(job?.transferId || '').trim())
    || Boolean(job?.releasedAt);
}

function isVariationReleased(v) {
  return v?.releaseStatus === 'released'
    || paymentStateOf(v?.paymentState) === 'released'
    || Boolean(String(v?.transferId || '').trim());
}

function normalizeStripeRefundStatus(value) {
  return String(value || '').trim().toLowerCase();
}

/**
 * Classify a Stripe Refund object returned by refunds.create().
 * Missing/unknown status is non-final — not treated as success.
 */
function classifyStripeRefundCreateStatus(status) {
  const rs = normalizeStripeRefundStatus(status);
  if (rs === STRIPE_REFUND_SUCCEEDED) return 'succeeded';
  if (STRIPE_REFUND_FAILED.has(rs)) return 'failed';
  return 'pending';
}

/**
 * Classify persisted Taskio refund state for one payment (base job doc or variation doc).
 * refundId alone is never confirmation.
 *
 * @param {object} doc
 * @param {'base'|'variation'} kind
 * @returns {'confirmed'|'pending'|'failed'|'none'}
 */
function classifyPersistedRefundState(doc, kind) {
  const rs = normalizeStripeRefundStatus(doc?.refundStatus);
  const ps = paymentStateOf(doc?.paymentState);
  if (rs === STRIPE_REFUND_SUCCEEDED) return 'confirmed';
  if (STRIPE_REFUND_FAILED.has(rs)) return 'failed';
  if (STRIPE_REFUND_NON_FINAL.has(rs)) return 'pending';
  if (kind === 'base' && doc?.baseRefundConfirmed === true && !STRIPE_REFUND_FAILED.has(rs) && !STRIPE_REFUND_NON_FINAL.has(rs)) {
    return 'confirmed';
  }
  if (kind === 'variation' && ps === 'refunded' && !STRIPE_REFUND_NON_FINAL.has(rs) && !STRIPE_REFUND_FAILED.has(rs)) {
    return 'confirmed';
  }
  if (kind === 'base' && ps === 'refunded' && !rs && !String(doc?.refundId || '').trim()) {
    return 'confirmed';
  }
  if (rs) return 'pending';
  if (String(doc?.refundId || '').trim()) return 'pending';
  if (ps === 'refund_failed') return 'failed';
  if (kind === 'variation' && ps === 'refund_pending') return 'pending';
  return 'none';
}

function isItemRefundConfirmed(doc, kind) {
  return classifyPersistedRefundState(doc, kind) === 'confirmed';
}

function baseHasSuccessfulPayment(job) {
  const pi = String(job?.paymentIntentId || '').trim();
  if (!pi) return false;
  const ps = paymentStateOf(job?.paymentState);
  return ps === 'in_escrow'
    || ps === 'disputed'
    || ps === 'refund_pending'
    || ps === 'refund_failed'
    || ps === 'refunded'
    || ps === 'released'
    || String(job?.paymentStatus || '') === 'succeeded';
}

function fundedReleasedVariation(v) {
  return variationAmountCents(v) > 0
    && isVariationReleased(v)
    && Boolean(String(v?.paymentIntentId || '').trim());
}

function mapVariationEntries(variationEntries) {
  return (Array.isArray(variationEntries) ? variationEntries : []).map((entry) => {
    if (entry && typeof entry === 'object' && entry.data != null) {
      return { id: String(entry.id), data: entry.data || {} };
    }
    const id = String(entry?.id || '');
    return { id, data: entry || {} };
  });
}

function variationIsRequiredRefund(v) {
  if (!v || variationAmountCents(v) <= 0) return false;
  if (!String(v.paymentIntentId || '').trim()) return false;
  if (isVariationReleased(v)) return false;
  const state = classifyPersistedRefundState(v, 'variation');
  if (state === 'confirmed' || state === 'pending' || state === 'failed') return true;
  return variationNeedsCancellationRefund(v);
}

function variationNeedsRefundCreate(v) {
  if (!v || isVariationReleased(v)) return false;
  const state = classifyPersistedRefundState(v, 'variation');
  if (state === 'confirmed' || state === 'pending') return false;
  if (state === 'failed') {
    return variationAmountCents(v) > 0 && Boolean(String(v.paymentIntentId || '').trim());
  }
  return variationNeedsCancellationRefund(v);
}

function baseNeedsRefundCreate(job) {
  if (!job || isBaseReleased(job)) return false;
  const pi = String(job.paymentIntentId || '').trim();
  if (!pi || !baseHasSuccessfulPayment(job)) return false;
  const state = classifyPersistedRefundState(job, 'base');
  if (state === 'confirmed' || state === 'pending') return false;
  return true;
}

function baseIsRequiredRefund(job) {
  if (!job || isBaseReleased(job)) return false;
  const pi = String(job.paymentIntentId || '').trim();
  if (!pi || !baseHasSuccessfulPayment(job)) return false;
  return true;
}

/**
 * True only when every required funded payment has a confirmed successful refund.
 * refundId / createRefund returning / variationRefundIds are not sufficient.
 */
function allRequiredRefundsConfirmed(job, variationEntries) {
  if (!job) return false;
  const variations = mapVariationEntries(variationEntries);
  if (variations.some(({ data }) => fundedReleasedVariation(data))) return false;
  if (baseHasSuccessfulPayment(job) && isBaseReleased(job)) return false;

  const required = [];
  if (baseIsRequiredRefund(job)) required.push({ kind: 'base', confirmed: isItemRefundConfirmed(job, 'base') });
  for (const { data } of variations) {
    if (!variationIsRequiredRefund(data)) continue;
    required.push({ kind: 'variation', confirmed: isItemRefundConfirmed(data, 'variation') });
  }
  if (required.length === 0) return false;
  return required.every((item) => item.confirmed === true);
}

/**
 * Deterministic admin full-refund plan from persisted job + variation docs.
 * Amounts and PaymentIntent IDs come from server state only.
 */
function buildAdminFullRefundPlan(job, variationEntries) {
  const variations = mapVariationEntries(variationEntries);
  const releasedVariations = variations.filter(({ data }) => fundedReleasedVariation(data));
  const baseReleased = baseHasSuccessfulPayment(job) && isBaseReleased(job);
  const blocked = (baseReleased || releasedVariations.length > 0)
    ? {
      code: 'funds_already_released',
      baseReleased,
      releasedVariationIds: releasedVariations.map((row) => row.id),
    }
    : null;

  const basePi = String(job?.paymentIntentId || '').trim();
  const basePs = paymentStateOf(job?.paymentState);
  const baseConfirmation = classifyPersistedRefundState(job, 'base');
  const baseRefundable = baseNeedsRefundCreate(job);

  const variationItems = variations.map(({ id, data }) => {
    const v = data || {};
    const confirmation = classifyPersistedRefundState(v, 'variation');
    return {
      kind: 'variation',
      variationId: id,
      paymentIntentId: String(v.paymentIntentId || '').trim() || null,
      amountCents: variationAmountCents(v),
      refundable: variationNeedsRefundCreate(v),
      settled: confirmation === 'confirmed',
      confirmation,
      released: isVariationReleased(v),
      paymentState: paymentStateOf(v.paymentState),
      refundId: v.refundId || null,
      refundStatus: normalizeStripeRefundStatus(v.refundStatus) || null,
      status: String(v.status || ''),
    };
  });

  return {
    blocked,
    base: {
      kind: 'base',
      paymentIntentId: basePi || null,
      amountCents: Math.floor(Number(job?.paymentAmountCents || 0)) || null,
      refundable: baseRefundable,
      settled: baseConfirmation === 'confirmed',
      confirmation: baseConfirmation,
      released: isBaseReleased(job),
      paymentState: basePs,
      refundId: job?.refundId || null,
      refundStatus: normalizeStripeRefundStatus(job?.refundStatus) || null,
    },
    variations: variationItems,
  };
}

function planOutstandingItems(plan) {
  if (!plan || plan.blocked) return [];
  const items = [];
  if (plan.base.refundable) items.push(plan.base);
  for (const v of plan.variations) {
    if (v.refundable) items.push(v);
  }
  return items;
}

function planHadFundedPayment(plan) {
  if (!plan) return false;
  if (plan.base.paymentIntentId) return true;
  return plan.variations.some((v) => v.paymentIntentId && v.amountCents > 0 && (v.refundable || v.settled || v.confirmation === 'failed' || v.confirmation === 'pending'));
}

function webhookMayMarkJobRefunded(job, variationEntries) {
  return allRequiredRefundsConfirmed(job, variationEntries);
}

module.exports = {
  paymentStateOf,
  variationAmountCents,
  isBaseReleased,
  isVariationReleased,
  baseHasSuccessfulPayment,
  normalizeStripeRefundStatus,
  classifyStripeRefundCreateStatus,
  classifyPersistedRefundState,
  isItemRefundConfirmed,
  allRequiredRefundsConfirmed,
  buildAdminFullRefundPlan,
  planOutstandingItems,
  planHadFundedPayment,
  webhookMayMarkJobRefunded,
};
