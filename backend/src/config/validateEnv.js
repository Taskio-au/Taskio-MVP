'use strict';

const { isStripeEnabled } = require('./stripeEnabled');
const { parseStripeExpectedLivemode } = require('./stripeLivemode');
const {
  DEPLOYMENT_ENV_PRODUCTION,
  DEPLOYMENT_ENV_STAGING,
  validateDeploymentEnvironment,
} = require('./deploymentEnvironment');

function requireNonEmpty(name, value) {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`Missing required env var: ${name}`);
  }
}

function validateEnv() {
  const env = process.env.NODE_ENV || 'development';

  // In production, require explicit CORS allowlist (safe-by-default).
  if (env === 'production') {
    requireNonEmpty('CORS_ORIGINS', process.env.CORS_ORIGINS);
    requireNonEmpty('TRUST_PROXY', process.env.TRUST_PROXY);
    requireNonEmpty('OTP_SALT', process.env.OTP_SALT);
    if (String(process.env.TASKIO_SHOW_DEV_OTP || '').toLowerCase() === 'true') {
      throw new Error('TASKIO_SHOW_DEV_OTP must be disabled in production.');
    }
    // Observability only: never block process start if critical-alert forwarding is unset.
    if (!String(process.env.ALERT_WEBHOOK_URL || '').trim()) {
      // eslint-disable-next-line no-console
      console.warn('[env] Critical alert forwarding is not configured.');
    }
  }

  // If Stripe flows are enabled, the private API must have its own Stripe
  // API secret. HMAC signing secrets belong only on the webhook-only runtime.
  // Enable Stripe only with the explicit value STRIPE_ENABLED=true.
  if (isStripeEnabled()) {
    requireNonEmpty('STRIPE_SECRET_KEY', process.env.STRIPE_SECRET_KEY);
    // Used for Stripe Connect account link return/refresh URLs
    requireNonEmpty('FRONTEND_URL', process.env.FRONTEND_URL);
    const expectedLivemode = parseStripeExpectedLivemode(process.env.STRIPE_EXPECTED_LIVEMODE);
    if (expectedLivemode !== true && expectedLivemode !== false) {
      throw new Error('Missing required env var: STRIPE_EXPECTED_LIVEMODE');
    }
    if (env === 'production') {
      const deploymentEnvironment = validateDeploymentEnvironment();
      if (deploymentEnvironment === DEPLOYMENT_ENV_PRODUCTION && expectedLivemode !== true) {
        throw new Error('Production Stripe must expect live mode.');
      }
      if (
        deploymentEnvironment === DEPLOYMENT_ENV_PRODUCTION
        && !String(process.env.STRIPE_SECRET_KEY).startsWith('sk_live_')
      ) {
        throw new Error('Production Stripe must use a live secret key.');
      }
      if (deploymentEnvironment === DEPLOYMENT_ENV_STAGING && expectedLivemode !== false) {
        throw new Error('Staging Stripe must expect test mode.');
      }
      if (
        deploymentEnvironment === DEPLOYMENT_ENV_STAGING
        && !String(process.env.STRIPE_SECRET_KEY).startsWith('sk_test_')
      ) {
        throw new Error('Staging Stripe must use a test secret key.');
      }
    }
  }

  // Gemini endpoints already fail with 500 if GEMINI_API_KEY missing; keep as soft requirement.

  // Firebase Admin:
  // - In many deploys you rely on default credentials (e.g. GCP). So we do NOT hard-require
  //   GOOGLE_APPLICATION_CREDENTIALS / FIREBASE_SERVICE_ACCOUNT_JSON here.
  // - If neither is present in development, you'll likely need one; warn (don’t throw).
  if (env !== 'production') {
    const hasExplicitCreds =
      (process.env.GOOGLE_APPLICATION_CREDENTIALS && process.env.GOOGLE_APPLICATION_CREDENTIALS.trim()) ||
      (process.env.FIREBASE_SERVICE_ACCOUNT_JSON && process.env.FIREBASE_SERVICE_ACCOUNT_JSON.trim());
    if (!hasExplicitCreds) {
      // eslint-disable-next-line no-console
      console.warn('[env] No explicit Firebase credentials found. If you see auth/Firestore errors locally, set GOOGLE_APPLICATION_CREDENTIALS or FIREBASE_SERVICE_ACCOUNT_JSON.');
    }
  }
}

module.exports = { validateEnv };

