'use strict';

/**
 * Base private taskio-api Cloud Run URL used as the Google ID-token audience.
 * HTTPS origin only: no credentials, query, hash, or path.
 */
function parseStripeInternalAudience(raw) {
  const trimmed = typeof raw === 'string' ? raw.trim() : '';
  if (!trimmed) return null;

  let url;
  try {
    url = new URL(trimmed);
  } catch {
    return null;
  }

  if (url.protocol !== 'https:') return null;
  if (url.username || url.password) return null;
  if (url.search || url.hash) return null;

  const pathname = url.pathname === '' ? '/' : url.pathname;
  if (pathname !== '/') return null;
  if (!url.hostname) return null;

  return `https://${url.host}`;
}

function getStripeInternalAudience() {
  return parseStripeInternalAudience(process.env.STRIPE_INTERNAL_AUDIENCE);
}

module.exports = {
  parseStripeInternalAudience,
  getStripeInternalAudience,
};
