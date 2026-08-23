'use strict';

const { isStripeEnabled } = require('./stripeEnabled');
const { parseStripeExpectedLivemode } = require('./stripeLivemode');
const { parseStripeInternalAudience } = require('./stripeInternalAudience');
const { STRIPE_INTERNAL_INGEST_PATH } = require('./stripeInternalPath');
const {
  DEPLOYMENT_ENV_PRODUCTION,
  DEPLOYMENT_ENV_STAGING,
  validateDeploymentEnvironment,
} = require('./deploymentEnvironment');

const FORWARD_TIMEOUT_MS = 8000;
const WEBHOOK_PROCESSING_MODE_FORWARD = 'forward';

function getWebhookProcessingMode() {
  const raw = typeof process.env.STRIPE_WEBHOOK_PROCESSING_MODE === 'string'
    ? process.env.STRIPE_WEBHOOK_PROCESSING_MODE.trim()
    : '';
  if (!raw) return WEBHOOK_PROCESSING_MODE_FORWARD;
  return raw;
}

function isForwardWebhookProcessingMode() {
  return getWebhookProcessingMode() === WEBHOOK_PROCESSING_MODE_FORWARD;
}

function getStripeInternalIngestUrl() {
  const audience = parseStripeInternalAudience(process.env.STRIPE_INTERNAL_AUDIENCE);
  if (!audience) return null;
  return `${audience}${STRIPE_INTERNAL_INGEST_PATH}`;
}

function getWebhookForwardDestination() {
  const audience = parseStripeInternalAudience(process.env.STRIPE_INTERNAL_AUDIENCE);
  if (!audience) return null;
  return {
    audience,
    ingestUrl: `${audience}${STRIPE_INTERNAL_INGEST_PATH}`,
  };
}

/**
 * Webhook-only process env. Must not require STRIPE_SECRET_KEY, OTP, ABN,
 * Gemini, Firebase, caller SA email, or frontend URL.
 * When Stripe is enabled, both STRIPE_WEBHOOK_SECRET (platform) and
 * STRIPE_CONNECT_WEBHOOK_SECRET (connected accounts) are required.
 */
function validateWebhookRuntimeEnv() {
  const mode = getWebhookProcessingMode();
  if (mode !== WEBHOOK_PROCESSING_MODE_FORWARD) {
    throw new Error('STRIPE_WEBHOOK_PROCESSING_MODE must be "forward" for the webhook runtime.');
  }

  if (!isStripeEnabled()) return;

  const webhookSecret = typeof process.env.STRIPE_WEBHOOK_SECRET === 'string'
    ? process.env.STRIPE_WEBHOOK_SECRET.trim()
    : '';
  if (!webhookSecret) {
    throw new Error('Missing required env var: STRIPE_WEBHOOK_SECRET');
  }

  const connectWebhookSecret = typeof process.env.STRIPE_CONNECT_WEBHOOK_SECRET === 'string'
    ? process.env.STRIPE_CONNECT_WEBHOOK_SECRET.trim()
    : '';
  if (!connectWebhookSecret) {
    throw new Error('Missing required env var: STRIPE_CONNECT_WEBHOOK_SECRET');
  }

  const expectedLivemode = parseStripeExpectedLivemode(process.env.STRIPE_EXPECTED_LIVEMODE);
  if (expectedLivemode !== true && expectedLivemode !== false) {
    throw new Error('Missing required env var: STRIPE_EXPECTED_LIVEMODE');
  }

  const audienceRaw = typeof process.env.STRIPE_INTERNAL_AUDIENCE === 'string'
    ? process.env.STRIPE_INTERNAL_AUDIENCE.trim()
    : '';
  if (!audienceRaw) {
    throw new Error('Missing required env var: STRIPE_INTERNAL_AUDIENCE');
  }
  if (!parseStripeInternalAudience(audienceRaw)) {
    throw new Error('STRIPE_INTERNAL_AUDIENCE must be an HTTPS origin with no path.');
  }

  const env = process.env.NODE_ENV || 'development';
  if (env === 'production') {
    const deploymentEnvironment = validateDeploymentEnvironment();
    if (deploymentEnvironment === DEPLOYMENT_ENV_PRODUCTION && expectedLivemode !== true) {
      throw new Error('Production Stripe must expect live mode.');
    }
    if (deploymentEnvironment === DEPLOYMENT_ENV_STAGING && expectedLivemode !== false) {
      throw new Error('Staging Stripe must expect test mode.');
    }
  }
}

module.exports = {
  FORWARD_TIMEOUT_MS,
  WEBHOOK_PROCESSING_MODE_FORWARD,
  getWebhookProcessingMode,
  isForwardWebhookProcessingMode,
  getStripeInternalIngestUrl,
  getWebhookForwardDestination,
  validateWebhookRuntimeEnv,
};
