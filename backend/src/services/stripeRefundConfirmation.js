'use strict';

const { variationAmountCents } = require('./jobRefundPlan');

function paymentIntentIdOf(value) {
  if (!value) return '';
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'object' && value.id) return String(value.id).trim();
  return '';
}

function expectedBaseRefundCents(job) {
  const n = Math.floor(Number(job?.paymentAmountCents || 0));
  return Number.isFinite(n) && n > 0 ? n : null;
}

function expectedVariationRefundCents(variation) {
  const n = variationAmountCents(variation);
  return n > 0 ? n : null;
}

function expectedRefundCents(item, kind) {
  return kind === 'variation' ? expectedVariationRefundCents(item) : expectedBaseRefundCents(item);
}

function refundListIncludesId(refunds, refundId) {
  const wanted = String(refundId || '').trim();
  if (!wanted) return false;
  const list = Array.isArray(refunds?.data) ? refunds.data : Array.isArray(refunds) ? refunds : [];
  return list.some((row) => String(row?.id || '').trim() === wanted);
}

function metadataLooksLikeVariation(meta) {
  if (!meta || typeof meta !== 'object') return false;
  const type = String(meta.type || meta.paymentType || '');
  return type === 'variation_refund' || type === 'variation_payment' || type === 'variation';
}

function metadataLooksLikeBase(meta) {
  if (!meta || typeof meta !== 'object') return false;
  const type = String(meta.type || meta.paymentType || '');
  return type === 'job_refund' || type === 'base';
}

function amountCoversExpected(actual, expectedCents) {
  if (!Number.isFinite(expectedCents) || expectedCents <= 0) return false;
  const n = Math.floor(Number(actual));
  if (!Number.isFinite(n) || n <= 0) return false;
  return n >= expectedCents;
}

/**
 * charge.refunded is emitted for partial refunds. Confirm a Taskio item only when
 * Stripe proves the whole charge/payment has been refunded.
 */
function evaluateChargeRefundedConfirmation({ charge, item, kind }) {
  if (!charge || typeof charge !== 'object') {
    return { confirm: false, partial: false, reason: 'missing_charge' };
  }
  const expectedPi = String(item?.paymentIntentId || '').trim();
  const eventPi = paymentIntentIdOf(charge.payment_intent);
  if (!expectedPi || !eventPi || expectedPi !== eventPi) {
    return { confirm: false, partial: false, reason: 'payment_intent_mismatch' };
  }

  const expectedCents = expectedRefundCents(item, kind);
  if (!expectedCents) {
    return { confirm: false, partial: false, reason: 'missing_expected_amount' };
  }

  const amountRefunded = Math.floor(Number(charge.amount_refunded));
  const hasAmountRefunded = Number.isFinite(amountRefunded);
  const partial = charge.refunded !== true && hasAmountRefunded && amountRefunded > 0 && amountRefunded < expectedCents;

  if (charge.refunded !== true) {
    return { confirm: false, partial, reason: 'charge_not_fully_refunded' };
  }

  if (hasAmountRefunded && amountRefunded < expectedCents) {
    return { confirm: false, partial: amountRefunded > 0, reason: 'amount_refunded_below_expected' };
  }

  const chargeAmount = Math.floor(Number(charge.amount));
  if (Number.isFinite(chargeAmount) && chargeAmount > 0 && hasAmountRefunded && amountRefunded < chargeAmount) {
    return { confirm: false, partial: true, reason: 'amount_refunded_below_charge_amount' };
  }

  if (!hasAmountRefunded && !(Number.isFinite(chargeAmount) && chargeAmount >= expectedCents)) {
    return { confirm: false, partial: false, reason: 'missing_refunded_amount' };
  }

  const persistedRefundId = String(item?.refundId || '').trim();
  const refundsPresent = charge.refunds && (Array.isArray(charge.refunds.data) || Array.isArray(charge.refunds));
  const refundsList = Array.isArray(charge.refunds?.data) ? charge.refunds.data : Array.isArray(charge.refunds) ? charge.refunds : [];
  if (persistedRefundId && refundsPresent && refundsList.length > 0 && !refundListIncludesId(charge.refunds, persistedRefundId)) {
    return { confirm: false, partial: false, reason: 'refund_id_not_on_charge' };
  }

  return { confirm: true, partial: false, reason: 'charge_fully_refunded' };
}

/**
 * A succeeded Refund object confirms a Taskio item only when it is the Taskio
 * refund for that payment and the amount covers the server-side paid amount.
 */
function evaluateSucceededRefundObjectConfirmation({ refund, item, kind }) {
  if (!refund || typeof refund !== 'object') {
    return { confirm: false, partial: false, reason: 'missing_refund' };
  }
  const status = String(refund.status || '').trim().toLowerCase();
  if (status !== 'succeeded') {
    return { confirm: false, partial: false, reason: 'refund_not_succeeded' };
  }

  const expectedPi = String(item?.paymentIntentId || '').trim();
  const eventPi = paymentIntentIdOf(refund.payment_intent);
  if (!expectedPi || !eventPi || expectedPi !== eventPi) {
    return { confirm: false, partial: false, reason: 'payment_intent_mismatch' };
  }

  const persistedRefundId = String(item?.refundId || '').trim();
  const eventRefundId = String(refund.id || '').trim();
  if (persistedRefundId) {
    if (!eventRefundId || persistedRefundId !== eventRefundId) {
      return { confirm: false, partial: false, reason: 'refund_id_mismatch' };
    }
  } else {
    const meta = refund.metadata || {};
    if (kind === 'variation') {
      if (!metadataLooksLikeVariation(meta) || !String(meta.variationId || '').trim()) {
        return { confirm: false, partial: false, reason: 'insufficient_variation_association' };
      }
    } else if (metadataLooksLikeVariation(meta) || !metadataLooksLikeBase(meta)) {
      return { confirm: false, partial: false, reason: 'insufficient_base_association' };
    }
  }

  if (kind === 'variation') {
    const metaVar = String(refund.metadata?.variationId || '').trim();
    const itemVar = String(item?.id || item?.variationId || '').trim();
    if (metaVar && itemVar && metaVar !== itemVar) {
      return { confirm: false, partial: false, reason: 'variation_id_mismatch' };
    }
  } else if (metadataLooksLikeVariation(refund.metadata || {})) {
    return { confirm: false, partial: false, reason: 'variation_metadata_on_base' };
  }

  const expectedCents = expectedRefundCents(item, kind);
  if (!expectedCents) {
    return { confirm: false, partial: false, reason: 'missing_expected_amount' };
  }
  const refundAmount = Math.floor(Number(refund.amount));
  if (!amountCoversExpected(refundAmount, expectedCents)) {
    return {
      confirm: false,
      partial: Number.isFinite(refundAmount) && refundAmount > 0 && refundAmount < expectedCents,
      reason: 'amount_below_expected',
    };
  }

  return { confirm: true, partial: false, reason: 'refund_succeeded_full' };
}

module.exports = {
  paymentIntentIdOf,
  expectedBaseRefundCents,
  expectedVariationRefundCents,
  evaluateChargeRefundedConfirmation,
  evaluateSucceededRefundObjectConfirmation,
  metadataLooksLikeVariation,
};
