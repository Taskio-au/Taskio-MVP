'use strict';

const { isStripeEnabled } = require('./stripeEnabled');

/**
 * Private taskio-api ingest for already HMAC-verified Stripe events.
 * Required only on the main API process when Stripe is enabled — not on
 * the webhook-only ingress, and not while STRIPE_ENABLED=false.
 */
function parseInternalStripeIngestConfig() {
  const audience = typeof process.env.STRIPE_INTERNAL_AUDIENCE === 'string'
    ? process.env.STRIPE_INTERNAL_AUDIENCE.trim()
    : '';
  const callerEmail = typeof process.env.STRIPE_WEBHOOK_CALLER_SERVICE_ACCOUNT === 'string'
    ? process.env.STRIPE_WEBHOOK_CALLER_SERVICE_ACCOUNT.trim()
    : '';
  if (!audience || !callerEmail) return null;
  if (!callerEmail.includes('@')) return null;
  return { audience, callerEmail };
}

function isInternalStripeIngestConfigured() {
  return parseInternalStripeIngestConfig() !== null;
}

function requireInternalStripeIngestConfig() {
  const config = parseInternalStripeIngestConfig();
  if (!config) {
    const err = new Error('Internal Stripe ingest is not configured.');
    err.code = 'stripe_internal_ingest_not_configured';
    err.httpStatus = 503;
    throw err;
  }
  return config;
}

function validateInternalStripeIngestEnv() {
  const audience = typeof process.env.STRIPE_INTERNAL_AUDIENCE === 'string'
    ? process.env.STRIPE_INTERNAL_AUDIENCE.trim()
    : '';
  const callerEmail = typeof process.env.STRIPE_WEBHOOK_CALLER_SERVICE_ACCOUNT === 'string'
    ? process.env.STRIPE_WEBHOOK_CALLER_SERVICE_ACCOUNT.trim()
    : '';
  if (!audience) {
    throw new Error('Missing required env var: STRIPE_INTERNAL_AUDIENCE');
  }
  if (!callerEmail) {
    throw new Error('Missing required env var: STRIPE_WEBHOOK_CALLER_SERVICE_ACCOUNT');
  }
  if (!callerEmail.includes('@')) {
    throw new Error('STRIPE_WEBHOOK_CALLER_SERVICE_ACCOUNT must be a service-account email.');
  }
}

/**
 * Main private API only. Webhook-only processes must not call this.
 * No-op while Stripe is disabled so current production startup stays valid.
 */
function validateMainApiStripeIngestEnv() {
  if (!isStripeEnabled()) return;
  validateInternalStripeIngestEnv();
}

module.exports = {
  parseInternalStripeIngestConfig,
  isInternalStripeIngestConfigured,
  requireInternalStripeIngestConfig,
  validateInternalStripeIngestEnv,
  validateMainApiStripeIngestEnv,
};
