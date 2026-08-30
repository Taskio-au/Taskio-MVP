/**
 * Validate a Stripe-hosted Checkout Session URL before browser navigation.
 * Only HTTPS checkout.stripe.com pay paths are accepted.
 */

const STRIPE_CHECKOUT_HOST = 'checkout.stripe.com';
const PAY_PATH = /^\/(c\/)?pay(\/|$)/i;

export class InvalidStripeCheckoutUrlError extends Error {
  constructor(message = 'Invalid Stripe Checkout URL.') {
    super(message);
    this.name = 'InvalidStripeCheckoutUrlError';
    this.code = 'stripe_checkout_url_invalid';
  }
}

export function validateStripeHostedCheckoutUrl(raw) {
  if (raw == null || typeof raw !== 'string' || !raw.trim()) {
    throw new InvalidStripeCheckoutUrlError('Stripe Checkout URL is missing.');
  }

  let parsed;
  try {
    parsed = new URL(raw.trim());
  } catch (_e) {
    throw new InvalidStripeCheckoutUrlError('Stripe Checkout URL is invalid.');
  }

  if (parsed.protocol !== 'https:') {
    throw new InvalidStripeCheckoutUrlError('Stripe Checkout URL must use HTTPS.');
  }
  if (parsed.hostname !== STRIPE_CHECKOUT_HOST) {
    throw new InvalidStripeCheckoutUrlError('Stripe Checkout URL host is not allowed.');
  }
  if (parsed.username || parsed.password) {
    throw new InvalidStripeCheckoutUrlError('Stripe Checkout URL must not include credentials.');
  }
  if (!PAY_PATH.test(parsed.pathname)) {
    throw new InvalidStripeCheckoutUrlError('Stripe Checkout URL path is not a hosted pay page.');
  }

  return parsed.toString();
}

export function navigateToStripeHostedCheckout(raw, assign = (url) => window.location.assign(url)) {
  const url = validateStripeHostedCheckoutUrl(raw);
  assign(url);
  return url;
}
