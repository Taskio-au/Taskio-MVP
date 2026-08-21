'use strict';

/**
 * Explicit Stripe livemode expectation for webhook processing.
 * Fail closed: only the exact strings "true" and "false" are valid.
 * Do not infer livemode from STRIPE_SECRET_KEY or webhook secret presence.
 */
function parseStripeExpectedLivemode(raw) {
  if (raw === 'true') return true;
  if (raw === 'false') return false;
  return null;
}

function getExpectedStripeLivemode() {
  return parseStripeExpectedLivemode(process.env.STRIPE_EXPECTED_LIVEMODE);
}

function requireStripeExpectedLivemode() {
  const parsed = getExpectedStripeLivemode();
  if (parsed !== true && parsed !== false) {
    const err = new Error('Stripe livemode is not configured.');
    err.code = 'stripe_livemode_not_configured';
    err.httpStatus = 400;
    throw err;
  }
  return parsed;
}

module.exports = {
  parseStripeExpectedLivemode,
  getExpectedStripeLivemode,
  requireStripeExpectedLivemode,
};
