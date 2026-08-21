'use strict';

const Stripe = require('stripe');
const https = require('https');
const request = require('supertest');
const { createMemoryFirestore } = require('./helpers/memoryFirestore');

const TEST_WEBHOOK_SECRET = 'whsec_test_taskio_hmac_only';

const mockMemory = createMemoryFirestore();

jest.mock('../src/firebaseAdmin', () => ({
  admin: mockMemory.admin,
  db: mockMemory.db,
}));

jest.mock('../src/services/stripeEventHandlers', () => ({
  dispatchStripeEventHandlers: jest.fn(async () => undefined),
  handleOperationalStripeEvent: jest.fn(async () => false),
}));

const { createWebhookApp, WEBHOOK_RAW_BODY_LIMIT } = require('../src/webhookApp');
const { dispatchStripeEventHandlers } = require('../src/services/stripeEventHandlers');

const ENV_KEYS = [
  'STRIPE_ENABLED',
  'STRIPE_SECRET_KEY',
  'STRIPE_WEBHOOK_SECRET',
  'STRIPE_EXPECTED_LIVEMODE',
];

function postWebhook(app, payload, header) {
  const req = request(app)
    .post('/api/stripe/webhook')
    .set('Content-Type', 'application/json');
  if (header) req.set('Stripe-Signature', header);
  return req.send(payload);
}

function signedPayload(event, secret = TEST_WEBHOOK_SECRET) {
  const payload = JSON.stringify(event);
  const header = Stripe.webhooks.generateTestHeaderString({ payload, secret });
  return { payload, header };
}

function baseEvent(overrides = {}) {
  return {
    id: 'evt_hmac_1',
    object: 'event',
    type: 'payment_intent.succeeded',
    livemode: false,
    created: Math.floor(Date.now() / 1000),
    data: { object: { id: 'pi_hmac_1', object: 'payment_intent', status: 'succeeded' } },
    ...overrides,
  };
}

describe('Stripe webhook HMAC / raw body', () => {
  const original = {};
  let app;

  beforeAll(() => {
    ENV_KEYS.forEach((key) => {
      original[key] = process.env[key];
    });
  });

  afterAll(() => {
    ENV_KEYS.forEach((key) => {
      if (original[key] === undefined) delete process.env[key];
      else process.env[key] = original[key];
    });
  });

  beforeEach(() => {
    mockMemory.reset();
    dispatchStripeEventHandlers.mockClear();
    process.env.STRIPE_ENABLED = 'true';
    process.env.STRIPE_WEBHOOK_SECRET = TEST_WEBHOOK_SECRET;
    process.env.STRIPE_EXPECTED_LIVEMODE = 'false';
    delete process.env.STRIPE_SECRET_KEY;
    app = createWebhookApp();
  });

  test('valid signed raw request verifies and processes', async () => {
    const { payload, header } = signedPayload(baseEvent());
    const httpsSpy = jest.spyOn(https, 'request');
    const constructSpy = jest.spyOn(Stripe.webhooks, 'constructEvent');
    try {
      const res = await postWebhook(app, payload, header);

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ received: true });
      expect(dispatchStripeEventHandlers).toHaveBeenCalledTimes(1);
      expect(httpsSpy).not.toHaveBeenCalled();
      expect(constructSpy).toHaveBeenCalledTimes(1);
      const rawArg = constructSpy.mock.calls[0][0];
      expect(Buffer.isBuffer(rawArg) || typeof rawArg === 'string').toBe(true);
      expect(Buffer.isBuffer(rawArg) ? rawArg.toString('utf8') : rawArg).toBe(payload);
      expect(mockMemory.store('stripe_events').get('evt_hmac_1').processingState).toBe('processed');
    } finally {
      constructSpy.mockRestore();
      httpsSpy.mockRestore();
    }
  });

  test('missing Stripe-Signature returns 400 and writes nothing', async () => {
    const { payload } = signedPayload(baseEvent());
    const res = await postWebhook(app, payload);

    expect(res.status).toBe(400);
    expect(res.body.message).toBe('Missing Stripe-Signature header');
    expect(dispatchStripeEventHandlers).not.toHaveBeenCalled();
    expect(mockMemory.store('stripe_events').size).toBe(0);
  });

  test('invalid signature returns 400 and writes nothing', async () => {
    const { payload } = signedPayload(baseEvent());
    const res = await postWebhook(app, payload, 't=1,v1=deadbeef');

    expect(res.status).toBe(400);
    expect(res.body.message).toBe('Invalid signature');
    expect(res.text).not.toMatch(/whsec_/);
    expect(dispatchStripeEventHandlers).not.toHaveBeenCalled();
    expect(mockMemory.store('stripe_events').size).toBe(0);
  });

  test('body changed by one byte fails verification', async () => {
    const { payload, header } = signedPayload(baseEvent());
    const tampered = `${payload.slice(0, -2)}X${payload.slice(-1)}`;
    const res = await postWebhook(app, tampered, header);

    expect(res.status).toBe(400);
    expect(res.body.message).toBe('Invalid signature');
    expect(dispatchStripeEventHandlers).not.toHaveBeenCalled();
    expect(mockMemory.store('stripe_events').size).toBe(0);
  });

  test('JSON-parsed body is rejected before verification', async () => {
    const { constructWebhookEvent } = require('../src/services/stripe');
    const event = baseEvent();
    const { header } = signedPayload(event);
    expect(() => constructWebhookEvent(event, header)).toThrow(
      expect.objectContaining({ code: 'stripe_webhook_invalid_body' })
    );
  });

  test('webhook body larger than 256kb returns 413', async () => {
    const oversized = 'x'.repeat(WEBHOOK_RAW_BODY_LIMIT + 1);
    const res = await postWebhook(app, oversized, 't=1,v1=abc');

    expect(res.status).toBe(413);
    expect(res.body.message).toBe('Payload too large');
    expect(dispatchStripeEventHandlers).not.toHaveBeenCalled();
    expect(mockMemory.store('stripe_events').size).toBe(0);
  });

  test('verification does not read STRIPE_SECRET_KEY', async () => {
    Object.defineProperty(process.env, 'STRIPE_SECRET_KEY', {
      configurable: true,
      get() {
        throw new Error('STRIPE_SECRET_KEY must not be read for webhook HMAC');
      },
    });
    try {
      const { payload, header } = signedPayload(baseEvent({ id: 'evt_hmac_no_sk' }));
      const res = await postWebhook(app, payload, header);
      expect(res.status).toBe(200);
    } finally {
      delete process.env.STRIPE_SECRET_KEY;
    }
  });

  test('missing webhook secret fails closed', async () => {
    delete process.env.STRIPE_WEBHOOK_SECRET;
    const { payload, header } = signedPayload(baseEvent({ id: 'evt_hmac_no_secret' }));
    const res = await postWebhook(app, payload, header);

    expect(res.status).toBe(400);
    expect(res.body.message).toBe('Invalid signature');
    expect(res.text).not.toMatch(/not configured/i);
    expect(dispatchStripeEventHandlers).not.toHaveBeenCalled();
    expect(mockMemory.store('stripe_events').size).toBe(0);
  });

  test('livemode mismatch fails closed without claiming', async () => {
    process.env.STRIPE_EXPECTED_LIVEMODE = 'true';
    const { payload, header } = signedPayload(baseEvent({ id: 'evt_hmac_live_mismatch', livemode: false }));
    const res = await postWebhook(app, payload, header);

    expect(res.status).toBe(400);
    expect(res.body.message).toBe('Stripe livemode mismatch');
    expect(dispatchStripeEventHandlers).not.toHaveBeenCalled();
    expect(mockMemory.store('stripe_events').size).toBe(0);
  });
});
