'use strict';

const {
  parseStripeExpectedLivemode,
  getExpectedStripeLivemode,
} = require('../src/config/stripeLivemode');
const { validateEnv } = require('../src/config/validateEnv');

describe('STRIPE_EXPECTED_LIVEMODE', () => {
  const original = {};
  const keys = [
    'STRIPE_EXPECTED_LIVEMODE',
    'STRIPE_SECRET_KEY',
    'STRIPE_ENABLED',
  ];

  beforeEach(() => {
    keys.forEach((key) => {
      original[key] = process.env[key];
      delete process.env[key];
    });
  });

  afterEach(() => {
    keys.forEach((key) => {
      if (original[key] === undefined) delete process.env[key];
      else process.env[key] = original[key];
    });
  });

  it.each([
    [undefined, null],
    ['', null],
    ['TRUE', null],
    ['FALSE', null],
    ['true ', null],
    ['1', null],
    ['0', null],
    ['yes', null],
    ['live', null],
    ['sk_live_example', null],
  ])('treats %j as unset/invalid', (value, expected) => {
    if (value === undefined) delete process.env.STRIPE_EXPECTED_LIVEMODE;
    else process.env.STRIPE_EXPECTED_LIVEMODE = value;
    expect(parseStripeExpectedLivemode(value)).toBe(expected);
    expect(getExpectedStripeLivemode()).toBe(null);
  });

  it('parses exact true and false only', () => {
    expect(parseStripeExpectedLivemode('true')).toBe(true);
    expect(parseStripeExpectedLivemode('false')).toBe(false);
    process.env.STRIPE_EXPECTED_LIVEMODE = 'true';
    expect(getExpectedStripeLivemode()).toBe(true);
    process.env.STRIPE_EXPECTED_LIVEMODE = 'false';
    expect(getExpectedStripeLivemode()).toBe(false);
  });

  it('does not infer livemode from STRIPE_SECRET_KEY', () => {
    process.env.STRIPE_SECRET_KEY = 'sk_live_example';
    delete process.env.STRIPE_EXPECTED_LIVEMODE;
    expect(getExpectedStripeLivemode()).toBe(null);
    process.env.STRIPE_SECRET_KEY = 'sk_test_example';
    expect(getExpectedStripeLivemode()).toBe(null);
  });
});

describe('validateEnv requires explicit livemode when Stripe is enabled', () => {
  const original = {};
  const keys = [
    'NODE_ENV',
    'CORS_ORIGINS',
    'TRUST_PROXY',
    'OTP_SALT',
    'STRIPE_ENABLED',
    'STRIPE_SECRET_KEY',
    'STRIPE_WEBHOOK_SECRET',
    'FRONTEND_URL',
    'STRIPE_EXPECTED_LIVEMODE',
    'TASKIO_SHOW_DEV_OTP',
    'ALERT_WEBHOOK_URL',
  ];

  beforeEach(() => {
    keys.forEach((key) => {
      original[key] = process.env[key];
      delete process.env[key];
    });
    process.env.NODE_ENV = 'production';
    process.env.CORS_ORIGINS = 'https://taskio.com.au';
    process.env.TRUST_PROXY = 'true';
    process.env.OTP_SALT = 'unit-test-otp-salt';
    process.env.STRIPE_ENABLED = 'true';
    process.env.STRIPE_SECRET_KEY = 'sk_live_example';
    process.env.FRONTEND_URL = 'https://taskio.com.au';
    jest.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    console.warn.mockRestore();
    keys.forEach((key) => {
      if (original[key] === undefined) delete process.env[key];
      else process.env[key] = original[key];
    });
  });

  it('fails closed when STRIPE_EXPECTED_LIVEMODE is missing', () => {
    expect(() => validateEnv()).toThrow('Missing required env var: STRIPE_EXPECTED_LIVEMODE');
  });

  it('fails closed when STRIPE_EXPECTED_LIVEMODE is malformed', () => {
    process.env.STRIPE_EXPECTED_LIVEMODE = 'TRUE';
    expect(() => validateEnv()).toThrow('Missing required env var: STRIPE_EXPECTED_LIVEMODE');
  });

  it('requires live mode in production when Stripe is enabled', () => {
    process.env.STRIPE_EXPECTED_LIVEMODE = 'false';
    expect(() => validateEnv()).toThrow('Production Stripe must expect live mode.');
  });

  it('accepts explicit live mode in production', () => {
    process.env.STRIPE_EXPECTED_LIVEMODE = 'true';
    expect(() => validateEnv()).not.toThrow();
  });
});
