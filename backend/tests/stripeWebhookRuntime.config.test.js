'use strict';

const {
  validateWebhookRuntimeEnv,
  getWebhookForwardDestination,
  getStripeInternalIngestUrl,
  FORWARD_TIMEOUT_MS,
} = require('../src/config/stripeWebhookRuntime');
const { parseStripeInternalAudience } = require('../src/config/stripeInternalAudience');

const KEYS = [
  'STRIPE_ENABLED',
  'STRIPE_WEBHOOK_SECRET',
  'STRIPE_CONNECT_WEBHOOK_SECRET',
  'STRIPE_EXPECTED_LIVEMODE',
  'STRIPE_INTERNAL_AUDIENCE',
  'STRIPE_SECRET_KEY',
  'STRIPE_WEBHOOK_PROCESSING_MODE',
  'STRIPE_WEBHOOK_CALLER_SERVICE_ACCOUNT',
  'OTP_SALT',
  'ABN_LOOKUP_GUID',
  'GEMINI_API_KEY',
  'FRONTEND_URL',
  'NODE_ENV',
  'CORS_ORIGINS',
  'TRUST_PROXY',
  'TASKIO_DEPLOYMENT_ENV',
  'GOOGLE_CLOUD_PROJECT',
  'GCLOUD_PROJECT',
  'FIREBASE_PROJECT_ID',
];

describe('webhook runtime env validation', () => {
  const original = {};

  beforeEach(() => {
    KEYS.forEach((key) => {
      original[key] = process.env[key];
      delete process.env[key];
    });
  });

  afterEach(() => {
    KEYS.forEach((key) => {
      if (original[key] === undefined) delete process.env[key];
      else process.env[key] = original[key];
    });
  });

  test('STRIPE_ENABLED=false starts without Stripe or internal config', () => {
    process.env.STRIPE_ENABLED = 'false';
    expect(() => validateWebhookRuntimeEnv()).not.toThrow();
    expect(getWebhookForwardDestination()).toBeNull();
  });

  test('STRIPE_ENABLED=true with webhook secret, livemode, and audience is valid', () => {
    process.env.STRIPE_ENABLED = 'true';
    process.env.STRIPE_WEBHOOK_SECRET = 'whsec_example';
    process.env.STRIPE_CONNECT_WEBHOOK_SECRET = 'whsec_connect_example';
    process.env.STRIPE_EXPECTED_LIVEMODE = 'false';
    process.env.STRIPE_INTERNAL_AUDIENCE = 'https://taskio-api.example.run.app';
    expect(() => validateWebhookRuntimeEnv()).not.toThrow();
    expect(getWebhookForwardDestination()).toEqual({
      audience: 'https://taskio-api.example.run.app',
      ingestUrl: 'https://taskio-api.example.run.app/internal/stripe/verified-event',
    });
    expect(getStripeInternalIngestUrl()).toBe(
      'https://taskio-api.example.run.app/internal/stripe/verified-event',
    );
    expect(FORWARD_TIMEOUT_MS).toBeGreaterThanOrEqual(5000);
    expect(FORWARD_TIMEOUT_MS).toBeLessThanOrEqual(10000);
  });

  test('does not require STRIPE_SECRET_KEY, OTP, ABN, Gemini, or caller SA', () => {
    process.env.STRIPE_ENABLED = 'true';
    process.env.STRIPE_WEBHOOK_SECRET = 'whsec_example';
    process.env.STRIPE_CONNECT_WEBHOOK_SECRET = 'whsec_connect_example';
    process.env.STRIPE_EXPECTED_LIVEMODE = 'false';
    process.env.STRIPE_INTERNAL_AUDIENCE = 'https://taskio-api.example.run.app';
    expect(() => validateWebhookRuntimeEnv()).not.toThrow();
  });

  test('missing webhook secret is invalid when enabled', () => {
    process.env.STRIPE_ENABLED = 'true';
    process.env.STRIPE_CONNECT_WEBHOOK_SECRET = 'whsec_connect_example';
    process.env.STRIPE_EXPECTED_LIVEMODE = 'false';
    process.env.STRIPE_INTERNAL_AUDIENCE = 'https://taskio-api.example.run.app';
    expect(() => validateWebhookRuntimeEnv()).toThrow('STRIPE_WEBHOOK_SECRET');
  });

  test('missing connect webhook secret is invalid when enabled', () => {
    process.env.STRIPE_ENABLED = 'true';
    process.env.STRIPE_WEBHOOK_SECRET = 'whsec_example';
    process.env.STRIPE_EXPECTED_LIVEMODE = 'false';
    process.env.STRIPE_INTERNAL_AUDIENCE = 'https://taskio-api.example.run.app';
    expect(() => validateWebhookRuntimeEnv()).toThrow('STRIPE_CONNECT_WEBHOOK_SECRET');
  });

  test('missing expected livemode is invalid when enabled', () => {
    process.env.STRIPE_ENABLED = 'true';
    process.env.STRIPE_WEBHOOK_SECRET = 'whsec_example';
    process.env.STRIPE_CONNECT_WEBHOOK_SECRET = 'whsec_connect_example';
    process.env.STRIPE_INTERNAL_AUDIENCE = 'https://taskio-api.example.run.app';
    expect(() => validateWebhookRuntimeEnv()).toThrow('STRIPE_EXPECTED_LIVEMODE');
  });

  test('missing audience is invalid when enabled', () => {
    process.env.STRIPE_ENABLED = 'true';
    process.env.STRIPE_WEBHOOK_SECRET = 'whsec_example';
    process.env.STRIPE_CONNECT_WEBHOOK_SECRET = 'whsec_connect_example';
    process.env.STRIPE_EXPECTED_LIVEMODE = 'false';
    expect(() => validateWebhookRuntimeEnv()).toThrow('STRIPE_INTERNAL_AUDIENCE');
  });

  test('malformed audience is invalid', () => {
    process.env.STRIPE_ENABLED = 'true';
    process.env.STRIPE_WEBHOOK_SECRET = 'whsec_example';
    process.env.STRIPE_CONNECT_WEBHOOK_SECRET = 'whsec_connect_example';
    process.env.STRIPE_EXPECTED_LIVEMODE = 'false';
    process.env.STRIPE_INTERNAL_AUDIENCE = 'http://taskio-api.example.run.app';
    expect(() => validateWebhookRuntimeEnv()).toThrow('HTTPS origin');
    expect(parseStripeInternalAudience('http://taskio-api.example.run.app')).toBeNull();
  });

  test('audience with a path is rejected', () => {
    expect(parseStripeInternalAudience('https://taskio-api.example.run.app/internal/stripe/verified-event')).toBeNull();
    expect(parseStripeInternalAudience('https://taskio-api.example.run.app/api')).toBeNull();
    process.env.STRIPE_ENABLED = 'true';
    process.env.STRIPE_WEBHOOK_SECRET = 'whsec_example';
    process.env.STRIPE_CONNECT_WEBHOOK_SECRET = 'whsec_connect_example';
    process.env.STRIPE_EXPECTED_LIVEMODE = 'false';
    process.env.STRIPE_INTERNAL_AUDIENCE = 'https://taskio-api.example.run.app/internal/stripe/verified-event';
    expect(() => validateWebhookRuntimeEnv()).toThrow('HTTPS origin');
  });

  test('audience with credentials or query is rejected', () => {
    expect(parseStripeInternalAudience('https://user:pass@taskio-api.example.run.app')).toBeNull();
    expect(parseStripeInternalAudience('https://taskio-api.example.run.app?x=1')).toBeNull();
  });

  test('trailing slash is normalized to the HTTPS origin', () => {
    expect(parseStripeInternalAudience('https://taskio-api.example.run.app/')).toBe(
      'https://taskio-api.example.run.app',
    );
  });

  test('unknown processing mode fails closed', () => {
    process.env.STRIPE_ENABLED = 'false';
    process.env.STRIPE_WEBHOOK_PROCESSING_MODE = 'direct';
    expect(() => validateWebhookRuntimeEnv()).toThrow('forward');
  });

  test('production-hardened staging webhook accepts test events only in staging', () => {
    process.env.NODE_ENV = 'production';
    process.env.TASKIO_DEPLOYMENT_ENV = 'staging';
    process.env.GOOGLE_CLOUD_PROJECT = 'taskio-v2-staging';
    process.env.STRIPE_ENABLED = 'true';
    process.env.STRIPE_WEBHOOK_SECRET = 'whsec_example';
    process.env.STRIPE_CONNECT_WEBHOOK_SECRET = 'whsec_connect_example';
    process.env.STRIPE_EXPECTED_LIVEMODE = 'false';
    process.env.STRIPE_INTERNAL_AUDIENCE = 'https://taskio-api.example.run.app';
    expect(() => validateWebhookRuntimeEnv()).not.toThrow();
  });

  test('production-hardened webhook rejects a forged staging declaration', () => {
    process.env.NODE_ENV = 'production';
    process.env.TASKIO_DEPLOYMENT_ENV = 'staging';
    process.env.GOOGLE_CLOUD_PROJECT = 'taskio-v2';
    process.env.STRIPE_ENABLED = 'true';
    process.env.STRIPE_WEBHOOK_SECRET = 'whsec_example';
    process.env.STRIPE_CONNECT_WEBHOOK_SECRET = 'whsec_connect_example';
    process.env.STRIPE_EXPECTED_LIVEMODE = 'false';
    process.env.STRIPE_INTERNAL_AUDIENCE = 'https://taskio-api.example.run.app';
    expect(() => validateWebhookRuntimeEnv()).toThrow(
      'Staging deployment requires Google Cloud project taskio-v2-staging.',
    );
  });

  test('production-hardened webhook rejects treating staging as production', () => {
    process.env.NODE_ENV = 'production';
    process.env.TASKIO_DEPLOYMENT_ENV = 'production';
    process.env.GOOGLE_CLOUD_PROJECT = 'taskio-v2-staging';
    process.env.STRIPE_ENABLED = 'true';
    process.env.STRIPE_WEBHOOK_SECRET = 'whsec_example';
    process.env.STRIPE_CONNECT_WEBHOOK_SECRET = 'whsec_connect_example';
    process.env.STRIPE_EXPECTED_LIVEMODE = 'true';
    process.env.STRIPE_INTERNAL_AUDIENCE = 'https://taskio-api.example.run.app';
    expect(() => validateWebhookRuntimeEnv()).toThrow(
      'Google Cloud project taskio-v2-staging requires TASKIO_DEPLOYMENT_ENV=staging.',
    );
  });
});
