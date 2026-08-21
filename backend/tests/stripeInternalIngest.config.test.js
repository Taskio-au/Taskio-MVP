'use strict';

const {
  parseInternalStripeIngestConfig,
  isInternalStripeIngestConfigured,
  validateInternalStripeIngestEnv,
  validateMainApiStripeIngestEnv,
} = require('../src/config/stripeInternalIngest');
const { validateEnv } = require('../src/config/validateEnv');

const KEYS = [
  'STRIPE_ENABLED',
  'STRIPE_INTERNAL_AUDIENCE',
  'STRIPE_WEBHOOK_CALLER_SERVICE_ACCOUNT',
  'NODE_ENV',
  'CORS_ORIGINS',
  'TRUST_PROXY',
  'OTP_SALT',
  'STRIPE_SECRET_KEY',
  'STRIPE_WEBHOOK_SECRET',
  'FRONTEND_URL',
  'STRIPE_EXPECTED_LIVEMODE',
  'TASKIO_SHOW_DEV_OTP',
  'ALERT_WEBHOOK_URL',
];

describe('internal Stripe ingest env', () => {
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

  it('is not configured when Stripe is disabled and vars are absent', () => {
    process.env.STRIPE_ENABLED = 'false';
    expect(isInternalStripeIngestConfigured()).toBe(false);
    expect(parseInternalStripeIngestConfig()).toBeNull();
    expect(() => validateMainApiStripeIngestEnv()).not.toThrow();
  });

  it('does not make global validateEnv require ingest vars when Stripe is enabled', () => {
    process.env.NODE_ENV = 'production';
    process.env.CORS_ORIGINS = 'https://taskio.com.au';
    process.env.TRUST_PROXY = 'true';
    process.env.OTP_SALT = 'unit-test-otp-salt';
    process.env.STRIPE_ENABLED = 'true';
    process.env.STRIPE_SECRET_KEY = 'sk_live_example';
    process.env.STRIPE_WEBHOOK_SECRET = 'whsec_example';
    process.env.FRONTEND_URL = 'https://taskio.com.au';
    process.env.STRIPE_EXPECTED_LIVEMODE = 'true';
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    expect(() => validateEnv()).not.toThrow();
    console.warn.mockRestore();
    expect(() => validateMainApiStripeIngestEnv()).toThrow('Missing required env var: STRIPE_INTERNAL_AUDIENCE');
  });

  it('requires exact audience and caller email for main-API ingest validation', () => {
    process.env.STRIPE_ENABLED = 'true';
    expect(() => validateInternalStripeIngestEnv()).toThrow('Missing required env var: STRIPE_INTERNAL_AUDIENCE');
    process.env.STRIPE_INTERNAL_AUDIENCE = 'https://taskio-api.example.run.app';
    expect(() => validateInternalStripeIngestEnv()).toThrow('Missing required env var: STRIPE_WEBHOOK_CALLER_SERVICE_ACCOUNT');
    process.env.STRIPE_WEBHOOK_CALLER_SERVICE_ACCOUNT = 'not-an-email';
    expect(() => validateInternalStripeIngestEnv()).toThrow('service-account email');
    process.env.STRIPE_WEBHOOK_CALLER_SERVICE_ACCOUNT = 'webhook@example.iam.gserviceaccount.com';
    expect(() => validateInternalStripeIngestEnv()).not.toThrow();
    expect(() => validateMainApiStripeIngestEnv()).not.toThrow();
    expect(parseInternalStripeIngestConfig()).toEqual({
      audience: 'https://taskio-api.example.run.app',
      callerEmail: 'webhook@example.iam.gserviceaccount.com',
    });
  });
});
