'use strict';

const { logger } = require('../observability/logger');
const { getExpectedStripeLivemode } = require('../config/stripeLivemode');
const { claimStripeEvent, settleStripeEvent } = require('./stripeEventClaim');
const { dispatchStripeEventHandlers } = require('./stripeEventHandlers');

function livemodeMismatchError() {
  const err = new Error('Stripe livemode mismatch');
  err.code = 'stripe_livemode_mismatch';
  err.httpStatus = 400;
  return err;
}

/**
 * Process an already-verified parsed Stripe event.
 * Does not read HTTP raw body or Stripe-Signature.
 */
async function processVerifiedStripeEvent(event, options = {}) {
  const expectedLivemode = getExpectedStripeLivemode();
  if (expectedLivemode !== true && expectedLivemode !== false) {
    const err = new Error('Stripe livemode is not configured.');
    err.code = 'stripe_livemode_not_configured';
    err.httpStatus = 400;
    throw err;
  }
  if (!!event.livemode !== expectedLivemode) {
    throw livemodeMismatchError();
  }

  const claim = await claimStripeEvent(event, options);
  if (claim.outcome === 'duplicate') {
    logger.info('stripe_webhook', {
      eventId: event.id || null,
      eventType: event.type || null,
      livemode: !!event.livemode,
      result: 'duplicate',
    });
    return { httpStatus: 200, body: { received: true, duplicate: true } };
  }
  if (claim.outcome === 'in_flight') {
    logger.info('stripe_webhook', {
      eventId: event.id || null,
      eventType: event.type || null,
      livemode: !!event.livemode,
      result: 'in_flight',
    });
    return { httpStatus: 503, body: { message: 'Webhook handler busy' } };
  }

  try {
    await dispatchStripeEventHandlers(event);
    const settled = await settleStripeEvent({
      eventId: event.id,
      claimId: claim.claimId,
      result: 'processed',
    });
    if (settled.outcome === 'stale') {
      logger.info('stripe_webhook', {
        eventId: event.id || null,
        eventType: event.type || null,
        livemode: !!event.livemode,
        result: 'stale_claim',
      });
      return { httpStatus: 503, body: { message: 'Webhook handler busy' } };
    }
    logger.info('stripe_webhook', {
      eventId: event.id || null,
      eventType: event.type || null,
      livemode: !!event.livemode,
      result: 'processed',
    });
    return { httpStatus: 200, body: { received: true } };
  } catch (handlerErr) {
    await settleStripeEvent({
      eventId: event.id,
      claimId: claim.claimId,
      result: 'failed',
      failureMessage: handlerErr && handlerErr.message ? handlerErr.message : 'error',
    });
    logger.warn('stripe_webhook', {
      eventId: event.id || null,
      eventType: event.type || null,
      livemode: !!event.livemode,
      result: 'failed',
    });
    throw handlerErr;
  }
}

module.exports = {
  processVerifiedStripeEvent,
};
