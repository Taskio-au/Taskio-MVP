'use strict';

/**
 * Validate a Stripe-hosted Checkout Session URL before sending it to the browser.
 * Only HTTPS checkout.stripe.com pay paths are accepted. Client-supplied URLs
 * must never be passed here.
 */

const STRIPE_CHECKOUT_HOST = 'checkout.stripe.com';
const PAY_PATH = /^\/(c\/)?pay(\/|$)/i;

function invalid(code, message) {
  const err = new Error(message);
  err.code = code;
  return err;
}

function validateStripeHostedCheckoutUrl(raw) {
  if (raw == null || typeof raw !== 'string' || !raw.trim()) {
    throw invalid('stripe_checkout_url_missing', 'Stripe Checkout Session is missing a hosted URL.');
  }

  let parsed;
  try {
    parsed = new URL(raw.trim());
  } catch (_e) {
    throw invalid('stripe_checkout_url_invalid', 'Stripe Checkout Session URL is invalid.');
  }

  if (parsed.protocol !== 'https:') {
    throw invalid('stripe_checkout_url_invalid', 'Stripe Checkout Session URL must use HTTPS.');
  }
  if (parsed.hostname !== STRIPE_CHECKOUT_HOST) {
    throw invalid('stripe_checkout_url_invalid', 'Stripe Checkout Session URL host is not allowed.');
  }
  if (parsed.username || parsed.password) {
    throw invalid('stripe_checkout_url_invalid', 'Stripe Checkout Session URL must not include credentials.');
  }
  if (!PAY_PATH.test(parsed.pathname)) {
    throw invalid('stripe_checkout_url_invalid', 'Stripe Checkout Session URL path is not a hosted pay page.');
  }

  return parsed.toString();
}

/**
 * @param {{ sessionId?: string, checkoutUrl?: string }} sessionLike Stripe Session or { id, url }
 * @param {object} [extra] additional JSON fields (reused, status, kind, …)
 */
function toHostedCheckoutPayload(sessionLike, extra = {}) {
  const sessionId = typeof sessionLike?.id === 'string'
    ? sessionLike.id.trim()
    : (typeof sessionLike?.sessionId === 'string' ? sessionLike.sessionId.trim() : '');
  if (!sessionId) {
    throw invalid('stripe_checkout_session_missing', 'Stripe Checkout Session is missing an id.');
  }
  const checkoutUrl = validateStripeHostedCheckoutUrl(sessionLike?.url || sessionLike?.checkoutUrl);
  return {
    sessionId,
    checkoutUrl,
    ...(extra && typeof extra === 'object' ? extra : {}),
  };
}

function isHostedCheckoutUrlError(error) {
  const code = error && error.code;
  return code === 'stripe_checkout_url_missing'
    || code === 'stripe_checkout_url_invalid'
    || code === 'stripe_checkout_session_missing';
}

module.exports = {
  STRIPE_CHECKOUT_HOST,
  validateStripeHostedCheckoutUrl,
  toHostedCheckoutPayload,
  isHostedCheckoutUrlError,
};
