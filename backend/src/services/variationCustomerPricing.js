'use strict';

const { calculateVariationCustomerPricing, validCustomerPricing } = require('../../../shared/bookingPricing');
const { normalizeStatus, JOB_STATUSES } = require('../constants/jobStatuses');
const { validateBaseJobFeeSnapshotForRelease } = require('./jobFeeSnapshotService');

// Serialise priced amendments so concurrent requests cannot each consume the
// same remaining portion of the booking's customer-fee cap.
async function createPricedVariation(db, jobRef, variationRef, payload) {
  return db.runTransaction(async tx => {
    const snap = await tx.get(jobRef);
    const job = snap.data() || {};
    if (!validCustomerPricing(job.customerPricing) || job.customerPricing.previousTaskCents != null) {
      throw new Error('Invalid booking pricing.');
    }
    if (!validateBaseJobFeeSnapshotForRelease(job, jobRef.id).ok) {
      throw Object.assign(new Error('The booking fee needs review before adding work.'), { statusCode: 409 });
    }
    if (job.activePricedVariationId) {
      const active = await tx.get(jobRef.collection('variations').doc(job.activePricedVariationId));
      if (active.exists && ['pending', 'awaiting_payment'].includes(active.data().status)) {
        const err = new Error('Resolve the current variation before requesting another price change.');
        err.statusCode = 409;
        throw err;
      }
    }
    if (job.acceptedTradieUid !== payload.createdByUid || ![JOB_STATUSES.FUNDED, JOB_STATUSES.IN_PROGRESS].includes(normalizeStatus(job.status))
      || job.paymentState !== 'in_escrow') {
      const err = new Error('This task is no longer available for a variation.');
      err.statusCode = 409;
      throw err;
    }
    const customerPricing = calculateVariationCustomerPricing(
      job.customerPricing.taskPriceCents + (job.securedVariationTotalInCents || 0), payload.priceChangeCents);
    tx.set(variationRef, { ...payload, customerPricing });
    tx.update(jobRef, { activePricedVariationId: variationRef.id });
  });
}

async function closePricedVariation(db, varRef, variation, patch) {
  let expiredSessionId = null;
  if (variation.status === 'awaiting_payment') {
    const { retrieveCheckoutSession, expireCheckoutSession } = require('./stripe');
    if (!variation.checkoutSessionId) throw Object.assign(new Error('Payment setup is in progress. Try again shortly.'), { statusCode: 409 });
    const session = await retrieveCheckoutSession(variation.checkoutSessionId);
    if (session.payment_status === 'paid' || session.status === 'complete') {
      throw Object.assign(new Error('Payment is already processing or paid. Contact support for cancellation.'), { statusCode: 409 });
    }
    const expired = session.status === 'expired' ? session : await expireCheckoutSession(session.id);
    if (expired.status !== 'expired') throw new Error('Payment session could not be closed.');
    expiredSessionId = session.id;
  }
  return db.runTransaction(async tx => {
    const snap = await tx.get(varRef);
    const current = snap.data() || {};
    if (!['pending', 'awaiting_payment'].includes(current.status)
      || current.paymentState === 'in_escrow'
      || (current.status === 'awaiting_payment' && (!expiredSessionId || current.checkoutSessionId !== expiredSessionId))) {
      throw Object.assign(new Error('Variation payment changed. Refresh before trying again.'), { statusCode: 409 });
    }
    tx.update(varRef, patch);
  });
}

async function publishVariationCheckout(db, varRef, variation, patch) {
  if (!variation.customerPricing) return varRef.update(patch);
  const published = await db.runTransaction(async tx => {
    const snap = await tx.get(varRef);
    const current = snap.data() || {};
    if (current.status !== 'awaiting_payment' || current.paymentState === 'in_escrow'
      || current.paymentCheckoutGeneration !== patch.paymentCheckoutGeneration) return false;
    tx.update(varRef, patch);
    return true;
  });
  if (!published) {
    const { retrieveCheckoutSession, expireCheckoutSession } = require('./stripe');
    const session = await retrieveCheckoutSession(patch.checkoutSessionId);
    if (session.status === 'open' && session.payment_status !== 'paid') await expireCheckoutSession(session.id);
    throw Object.assign(new Error('Variation changed while payment was starting. Refresh to continue.'), { code: 'not_pending' });
  }
}

module.exports = { createPricedVariation, closePricedVariation, publishVariationCheckout };
