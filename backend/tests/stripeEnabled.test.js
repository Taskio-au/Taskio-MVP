'use strict';

const {
  isStripeEnabled,
  requireStripeEnabled,
  stripeDisabledBody,
} = require('../src/config/stripeEnabled');

const STRIPE_ENV_KEYS = [
  'STRIPE_ENABLED',
  'STRIPE_SECRET_KEY',
  'STRIPE_WEBHOOK_SECRET',
  'FRONTEND_URL',
];

describe('STRIPE_ENABLED fail-closed helper', () => {
  const original = {};

  beforeEach(() => {
    STRIPE_ENV_KEYS.forEach((key) => {
      original[key] = process.env[key];
      delete process.env[key];
    });
  });

  afterEach(() => {
    STRIPE_ENV_KEYS.forEach((key) => {
      if (original[key] === undefined) delete process.env[key];
      else process.env[key] = original[key];
    });
  });

  it.each([
    ['missing', undefined],
    ['empty', ''],
    ['false', 'false'],
    ['FALSE', 'FALSE'],
    ['TRUE', 'TRUE'],
    ['true with space', 'true '],
    ['1', '1'],
    ['yes', 'yes'],
    ['on', 'on'],
  ])('treats %s as disabled', (_label, value) => {
    if (value === undefined) delete process.env.STRIPE_ENABLED;
    else process.env.STRIPE_ENABLED = value;
    expect(isStripeEnabled()).toBe(false);
    expect(() => requireStripeEnabled()).toThrow(
      expect.objectContaining({ code: 'stripe_disabled', httpStatus: 503 })
    );
  });

  it('enables only for the exact string true', () => {
    process.env.STRIPE_ENABLED = 'true';
    expect(isStripeEnabled()).toBe(true);
    expect(() => requireStripeEnabled()).not.toThrow();
  });

  it('does not infer enablement from Stripe secrets', () => {
    process.env.STRIPE_ENABLED = 'false';
    process.env.STRIPE_SECRET_KEY = 'sk_test_present';
    process.env.STRIPE_WEBHOOK_SECRET = 'whsec_present';
    expect(isStripeEnabled()).toBe(false);
    expect(stripeDisabledBody().code).toBe('stripe_disabled');
  });
});

describe('stripe.js mutations respect STRIPE_ENABLED', () => {
  const original = {};
  const stripeCtor = jest.fn();

  beforeEach(() => {
    ['STRIPE_ENABLED', 'STRIPE_SECRET_KEY'].forEach((key) => {
      original[key] = process.env[key];
    });
    stripeCtor.mockReset();
    jest.resetModules();
    jest.doMock('stripe', () => stripeCtor);
  });

  afterEach(() => {
    ['STRIPE_ENABLED', 'STRIPE_SECRET_KEY'].forEach((key) => {
      if (original[key] === undefined) delete process.env[key];
      else process.env[key] = original[key];
    });
    jest.dontMock('stripe');
    jest.resetModules();
  });

  function loadStripeService() {
    return require('../src/services/stripe');
  }

  it('does not construct the Stripe SDK when disabled even if a secret key is present', async () => {
    process.env.STRIPE_ENABLED = 'false';
    process.env.STRIPE_SECRET_KEY = 'sk_test_present_but_disabled';
    const stripe = loadStripeService();

    await expect(stripe.createCheckoutSession({
      amountInCents: 1000,
      successUrl: 'https://example.test/ok',
      cancelUrl: 'https://example.test/cancel',
    })).rejects.toMatchObject({ code: 'stripe_disabled' });

    await expect(stripe.createRefund({ paymentIntentId: 'pi_x' }))
      .rejects.toMatchObject({ code: 'stripe_disabled' });
    await expect(stripe.createTransfer({
      amountInCents: 100,
      currency: 'aud',
      destinationAccountId: 'acct_x',
    })).rejects.toMatchObject({ code: 'stripe_disabled' });
    await expect(stripe.createExpressAccount({ taskioUid: 'u1' }))
      .rejects.toMatchObject({ code: 'stripe_disabled' });
    await expect(stripe.createAccountLink({
      accountId: 'acct_x',
      refreshUrl: 'https://example.test/r',
      returnUrl: 'https://example.test/n',
    })).rejects.toMatchObject({ code: 'stripe_disabled' });
    await expect(stripe.retrieveCheckoutSession('cs_x'))
      .rejects.toMatchObject({ code: 'stripe_disabled' });

    expect(stripeCtor).not.toHaveBeenCalled();
  });

  it('constructs the Stripe SDK when enabled and a secret is present', async () => {
    process.env.STRIPE_ENABLED = 'true';
    process.env.STRIPE_SECRET_KEY = 'sk_test_present';
    stripeCtor.mockImplementation(() => ({
      checkout: { sessions: { create: jest.fn().mockResolvedValue({ id: 'cs_1' }) } },
    }));
    const stripe = loadStripeService();
    await stripe.createCheckoutSession({
      amountInCents: 1000,
      successUrl: 'https://example.test/ok',
      cancelUrl: 'https://example.test/cancel',
    });
    expect(stripeCtor).toHaveBeenCalled();
  });
});
