'use strict';

/**
 * Authoritative server-side Stripe feature flag.
 * Secrets (STRIPE_SECRET_KEY, webhook secret, publishable key) never imply enablement.
 * Fail closed: only the exact string "true" enables Stripe.
 */
function isStripeEnabled() {
  return process.env.STRIPE_ENABLED === 'true';
}

function stripeDisabledBody() {
  return {
    message: 'Payments are currently unavailable.',
    code: 'stripe_disabled',
  };
}

function stripeDisabledError() {
  const err = new Error('Payments are currently unavailable.');
  err.code = 'stripe_disabled';
  err.httpStatus = 503;
  return err;
}

function requireStripeEnabled() {
  if (!isStripeEnabled()) {
    throw stripeDisabledError();
  }
}

function sendStripeDisabled(res) {
  return res.status(503).send(stripeDisabledBody());
}

function sendIfStripeDisabled(res, error) {
  if (error && error.code === 'stripe_disabled') {
    sendStripeDisabled(res);
    return true;
  }
  return false;
}

module.exports = {
  isStripeEnabled,
  requireStripeEnabled,
  stripeDisabledBody,
  stripeDisabledError,
  sendStripeDisabled,
  sendIfStripeDisabled,
};
