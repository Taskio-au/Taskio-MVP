'use strict';

const { homeownerCancelVariationRefundKey } = require('./stripeIdempotency');

function variationNeedsCancellationRefund(variation) {
  const v = variation || {};
  const amount = Math.floor(Number(v.amountPaidCents ?? v.priceChangeCents ?? 0));
  return amount > 0
    && String(v.paymentIntentId || '').trim().length > 0
    && (v.paymentState === 'in_escrow' || v.paymentStatus === 'paid')
    && v.releaseStatus !== 'released';
}

async function refundFundedVariationsForCancellation({
  jobRef,
  jobId,
  createRefund,
  serverTimestamp,
}) {
  const snap = await jobRef.collection('variations').get();
  const entries = snap.docs.map((doc) => ({ doc, data: doc.data() || {} }));

  const released = entries.find(({ data }) => (
    data.releaseStatus === 'released'
      && Math.floor(Number(data.amountPaidCents ?? data.priceChangeCents ?? 0)) > 0
  ));
  if (released) {
    const error = new Error('A funded variation has already been released. Use the admin dispute workflow.');
    error.code = 'variation_already_released';
    error.variationId = released.doc.id;
    throw error;
  }

  const refundIds = {};
  for (const { doc, data } of entries) {
    if (data.paymentState === 'refunded' || data.paymentState === 'refund_pending') {
      if (data.refundId) refundIds[doc.id] = data.refundId;
      continue;
    }
    if (!variationNeedsCancellationRefund(data)) continue;

    const refund = await createRefund({
      paymentIntentId: String(data.paymentIntentId),
      amountInCents: null,
      reason: 'requested_by_customer',
      idempotencyKey: homeownerCancelVariationRefundKey(jobId, doc.id),
    });
    refundIds[doc.id] = refund.id;
    await doc.ref.set({
      paymentState: 'refund_pending',
      refundId: refund.id,
      refundRequestedAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    }, { merge: true });
  }

  return refundIds;
}

module.exports = {
  refundFundedVariationsForCancellation,
  variationNeedsCancellationRefund,
};
