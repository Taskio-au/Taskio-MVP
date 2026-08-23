'use strict';

const { validateEnv } = require('../src/config/validateEnv');

const ENV_KEYS = [
  'NODE_ENV',
  'CORS_ORIGINS',
  'TRUST_PROXY',
  'ALERT_WEBHOOK_URL',
  'OTP_SALT',
  'STRIPE_ENABLED',
  'STRIPE_SECRET_KEY',
  'STRIPE_WEBHOOK_SECRET',
  'STRIPE_EXPECTED_LIVEMODE',
  'FRONTEND_URL',
  'TASKIO_SHOW_DEV_OTP',
  'TASKIO_DEPLOYMENT_ENV',
  'GOOGLE_CLOUD_PROJECT',
  'GCLOUD_PROJECT',
  'FIREBASE_PROJECT_ID',
];

describe('validateEnv production secrets', () => {
  const original = {};
  let warnSpy;

  beforeAll(() => {
    ENV_KEYS.forEach((key) => {
      original[key] = process.env[key];
    });
  });

  afterAll(() => {
    ENV_KEYS.forEach((key) => {
      if (original[key] === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = original[key];
      }
    });
  });

  beforeEach(() => {
    ENV_KEYS.forEach((key) => {
      delete process.env[key];
    });
    process.env.NODE_ENV = 'production';
    process.env.CORS_ORIGINS = 'https://taskio.com.au';
    process.env.TRUST_PROXY = 'true';
    process.env.OTP_SALT = 'unit-test-otp-salt';
    warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    warnSpy.mockRestore();
  });

  it('succeeds with a valid OTP_SALT and no ALERT_WEBHOOK_URL', () => {
    expect(() => validateEnv()).not.toThrow();
    expect(warnSpy).toHaveBeenCalledWith('[env] Critical alert forwarding is not configured.');
    expect(warnSpy.mock.calls.flat().join(' ')).not.toMatch(/https?:\/\//i);
  });

  it('still fails when OTP_SALT is absent', () => {
    delete process.env.OTP_SALT;
    expect(() => validateEnv()).toThrow('Missing required env var: OTP_SALT');
  });

  it('starts without Stripe secrets when STRIPE_ENABLED is false', () => {
    process.env.STRIPE_ENABLED = 'false';
    delete process.env.STRIPE_SECRET_KEY;
    delete process.env.STRIPE_WEBHOOK_SECRET;
    expect(() => validateEnv()).not.toThrow();
  });

  it('starts without Stripe secrets when STRIPE_ENABLED is missing or malformed', () => {
    delete process.env.STRIPE_ENABLED;
    expect(() => validateEnv()).not.toThrow();
    process.env.STRIPE_ENABLED = 'TRUE';
    expect(() => validateEnv()).not.toThrow();
  });

  it('requires Stripe API configuration when STRIPE_ENABLED is true, but not STRIPE_WEBHOOK_SECRET', () => {
    process.env.STRIPE_ENABLED = 'true';
    expect(() => validateEnv()).toThrow('Missing required env var: STRIPE_SECRET_KEY');
    process.env.STRIPE_SECRET_KEY = 'sk_live_example';
    expect(() => validateEnv()).toThrow('Missing required env var: FRONTEND_URL');
    process.env.FRONTEND_URL = 'https://taskio.com.au';
    expect(() => validateEnv()).toThrow('Missing required env var: STRIPE_EXPECTED_LIVEMODE');
    process.env.STRIPE_EXPECTED_LIVEMODE = 'true';
    delete process.env.STRIPE_WEBHOOK_SECRET;
    expect(() => validateEnv()).not.toThrow();
  });

  it('production Stripe-enabled config succeeds with a live key and no webhook HMAC secret', () => {
    process.env.STRIPE_ENABLED = 'true';
    process.env.STRIPE_SECRET_KEY = 'sk_live_example';
    process.env.FRONTEND_URL = 'https://taskio.com.au';
    process.env.STRIPE_EXPECTED_LIVEMODE = 'true';
    delete process.env.STRIPE_WEBHOOK_SECRET;
    expect(() => validateEnv()).not.toThrow();
  });

  it('still rejects a non-live secret key in production when Stripe is enabled', () => {
    process.env.STRIPE_ENABLED = 'true';
    process.env.STRIPE_SECRET_KEY = 'sk_test_example';
    process.env.FRONTEND_URL = 'https://taskio.com.au';
    process.env.STRIPE_EXPECTED_LIVEMODE = 'true';
    delete process.env.STRIPE_WEBHOOK_SECRET;
    expect(() => validateEnv()).toThrow('Production Stripe must use a live secret key.');
  });

  it('allows Stripe test mode only for the explicitly identified staging project without a webhook HMAC secret', () => {
    process.env.TASKIO_DEPLOYMENT_ENV = 'staging';
    process.env.GOOGLE_CLOUD_PROJECT = 'taskio-v2-staging';
    process.env.STRIPE_ENABLED = 'true';
    process.env.STRIPE_SECRET_KEY = 'sk_test_example';
    process.env.FRONTEND_URL = 'https://staging.taskio.com.au';
    process.env.STRIPE_EXPECTED_LIVEMODE = 'false';
    delete process.env.STRIPE_WEBHOOK_SECRET;
    expect(() => validateEnv()).not.toThrow();
  });

  it('rejects a staging declaration outside the staging project', () => {
    process.env.TASKIO_DEPLOYMENT_ENV = 'staging';
    process.env.GOOGLE_CLOUD_PROJECT = 'taskio-v2';
    process.env.STRIPE_ENABLED = 'true';
    process.env.STRIPE_SECRET_KEY = 'sk_test_example';
    process.env.FRONTEND_URL = 'https://staging.taskio.com.au';
    process.env.STRIPE_EXPECTED_LIVEMODE = 'false';
    expect(() => validateEnv()).toThrow(
      'Staging deployment requires Google Cloud project taskio-v2-staging.',
    );
  });

  it('rejects live Stripe configuration in the staging project', () => {
    process.env.TASKIO_DEPLOYMENT_ENV = 'staging';
    process.env.GOOGLE_CLOUD_PROJECT = 'taskio-v2-staging';
    process.env.STRIPE_ENABLED = 'true';
    process.env.STRIPE_SECRET_KEY = 'sk_live_example';
    process.env.FRONTEND_URL = 'https://staging.taskio.com.au';
    process.env.STRIPE_EXPECTED_LIVEMODE = 'true';
    expect(() => validateEnv()).toThrow('Staging Stripe must expect test mode.');
  });

  it('rejects treating the staging project as production', () => {
    process.env.TASKIO_DEPLOYMENT_ENV = 'production';
    process.env.GOOGLE_CLOUD_PROJECT = 'taskio-v2-staging';
    process.env.STRIPE_ENABLED = 'true';
    process.env.STRIPE_SECRET_KEY = 'sk_live_example';
    process.env.FRONTEND_URL = 'https://staging.taskio.com.au';
    process.env.STRIPE_EXPECTED_LIVEMODE = 'true';
    expect(() => validateEnv()).toThrow(
      'Google Cloud project taskio-v2-staging requires TASKIO_DEPLOYMENT_ENV=staging.',
    );
  });
});
