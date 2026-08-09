'use strict';

const { admin } = require('../firebaseAdmin');
const { buildVariationPaymentFeeSnapshot } = require('./variationFeeSnapshotService');

/**
 * Idempotently mark a variation as paid / secured in escrow after Stripe Checkout or PaymentIntent success.
 * Safe to call from webhooks (checkout.session.completed, payment_intent.succeeded) or client sync.
 *
 * @param {import('firebase-admin/firestore').Firestore} db
 * @param {object} opts
 * @param {string} opts.jobId
 * @param {string} opts.variationId
 * @param {string} [opts.paymentIntentId]
 * @param {string} [opts.checkoutSessionId]
 * @param {number|null} [opts.amountReceived] — PaymentIntent.amount or Checkout Session amount_total (cents)
 * @param {string|null} [opts.currency]
 * @returns {Promise<{ applied: boolean, reason?: string }>}
 */
async function applyVariationPaymentSuccess(db, {
  jobId,
  variationId,
  paymentIntentId = null,
  checkoutSessionId = null,
  amountReceived = null,
  currency = null,
}) {
  if (!jobId || !variationId) {
    return { applied: false, reason: 'missing_ids' };
  }

  const varRef = db.collection('jobs').doc(jobId).collection('variations').doc(variationId);
  const jobRef = db.collection('jobs').doc(jobId);

  let applied = false;

  await db.runTransaction(async (tx) => {
    const varDoc = await tx.get(varRef);
    const jobSnap = await tx.get(jobRef);
    if (!varDoc.exists) return;

    const jobPayload = jobSnap.exists ? jobSnap.data() || {} : {};
    const variation = varDoc.data();

    // Idempotency: do not double-apply or double-increment job totals.
    if (variation.paymentState === 'in_escrow') {
      return;
    }

    const expected = Math.floor(Number(variation.priceChangeCents || 0));
    if (expected > 0 && amountReceived !== null && typeof amountReceived === 'number') {
      if (Math.abs(amountReceived - expected) > 1) {
        tx.update(varRef, {
          requiresAdminAttention: true,
          flagNote: `Amount mismatch: expected ${expected}, received ${amountReceived}`,
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
        return;
      }
    }

    let grossApplied = expected > 0 ? expected : Math.floor(Number(amountReceived || 0));

    const update = {
      status: 'approved',
      paymentState: 'in_escrow',
      paymentStatus: 'paid',
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      paidAt: admin.firestore.FieldValue.serverTimestamp(),
    };
    if (paymentIntentId) update.paymentIntentId = paymentIntentId;
    if (checkoutSessionId) update.checkoutSessionId = checkoutSessionId;
    if (amountReceived !== null && typeof amountReceived === 'number') {
      update.amountPaidCents = amountReceived;
      grossApplied = Math.round(Number(amountReceived));
    }
    if (currency) update.paymentCurrency = String(currency).toLowerCase();

    const snap = buildVariationPaymentFeeSnapshot({
      job: jobPayload,
      jobId,
      variationId,
      variationGrossCents: grossApplied,
      now: new Date(),
    });
    if (snap) update.feeSnapshot = snap;

    tx.update(varRef, update);

    const increment = admin.firestore.FieldValue.increment(expected > 0 ? expected : grossApplied);

    tx.update(jobRef, {
      variationTotalInCents: increment,
      securedVariationTotalInCents: increment,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    applied = true;
  });

  if (applied) {
    try {
      await db.collection('job_events').add({
        jobId,
        actorId: 'system',
        actorRole: 'system',
        action: 'VARIATION_PAYMENT_SECURED',
        metadata: {
          variationId,
          paymentIntentId: paymentIntentId || null,
          checkoutSessionId: checkoutSessionId || null,
        },
        timestamp: admin.firestore.FieldValue.serverTimestamp(),
      });
    } catch (_) {
      /* non-critical */
    }
  }

  return { applied };
}

function isVariationPaymentMetadata(meta) {
  if (!meta || typeof meta !== 'object') return false;
  const type = meta.type || meta.paymentType;
  return type === 'variation_payment' || type === 'variation';
}

module.exports = {
  applyVariationPaymentSuccess,
  isVariationPaymentMetadata,
};
