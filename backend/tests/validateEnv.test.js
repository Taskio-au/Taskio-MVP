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
  'FRONTEND_URL',
  'TASKIO_SHOW_DEV_OTP',
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
});
