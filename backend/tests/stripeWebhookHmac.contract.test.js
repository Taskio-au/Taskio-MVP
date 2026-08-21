'use strict';

const Stripe = require('stripe');
const https = require('https');
const request = require('supertest');

const TEST_WEBHOOK_SECRET = 'whsec_test_taskio_hmac_only';
const AUDIENCE = 'https://taskio-api.example.run.app';

const mockForward = jest.fn(async () => ({ httpStatus: 200, body: { received: true } }));

const { createWebhookApp, WEBHOOK_RAW_BODY_LIMIT } = require('../src/webhookApp');

const ENV_KEYS = [
  'STRIPE_ENABLED',
  'STRIPE_SECRET_KEY',
  'STRIPE_WEBHOOK_SECRET',
  'STRIPE_EXPECTED_LIVEMODE',
  'STRIPE_INTERNAL_AUDIENCE',
  'STRIPE_WEBHOOK_PROCESSING_MODE',
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

describe('Stripe webhook HMAC / raw body (public forward runtime)', () => {
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
    mockForward.mockClear();
    mockForward.mockImplementation(async () => ({ httpStatus: 200, body: { received: true } }));
    process.env.STRIPE_ENABLED = 'true';
    process.env.STRIPE_WEBHOOK_SECRET = TEST_WEBHOOK_SECRET;
    process.env.STRIPE_EXPECTED_LIVEMODE = 'false';
    process.env.STRIPE_INTERNAL_AUDIENCE = AUDIENCE;
    delete process.env.STRIPE_SECRET_KEY;
    delete process.env.STRIPE_WEBHOOK_PROCESSING_MODE;
    app = createWebhookApp({ forwardVerifiedStripeEvent: mockForward });
  });

  test('valid signed raw request verifies and forwards once', async () => {
    const { payload, header } = signedPayload(baseEvent());
    const httpsSpy = jest.spyOn(https, 'request');
    const constructSpy = jest.spyOn(Stripe.webhooks, 'constructEvent');
    try {
      const res = await postWebhook(app, payload, header);

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ received: true });
      expect(mockForward).toHaveBeenCalledTimes(1);
      expect(mockForward.mock.calls[0][0].id).toBe('evt_hmac_1');
      expect(mockForward.mock.calls[0][0].type).toBe('payment_intent.succeeded');
      expect(httpsSpy).not.toHaveBeenCalled();
      expect(constructSpy).toHaveBeenCalledTimes(1);
      const rawArg = constructSpy.mock.calls[0][0];
      expect(Buffer.isBuffer(rawArg) || typeof rawArg === 'string').toBe(true);
      expect(Buffer.isBuffer(rawArg) ? rawArg.toString('utf8') : rawArg).toBe(payload);
    } finally {
      constructSpy.mockRestore();
      httpsSpy.mockRestore();
    }
  });

  test('missing Stripe-Signature returns 400 and does not forward', async () => {
    const { payload } = signedPayload(baseEvent());
    const res = await postWebhook(app, payload);

    expect(res.status).toBe(400);
    expect(res.body.message).toBe('Missing Stripe-Signature header');
    expect(mockForward).not.toHaveBeenCalled();
  });

  test('invalid signature returns 400 and does not forward', async () => {
    const { payload } = signedPayload(baseEvent());
    const res = await postWebhook(app, payload, 't=1,v1=deadbeef');

    expect(res.status).toBe(400);
    expect(res.body.message).toBe('Invalid signature');
    expect(res.text).not.toMatch(/whsec_/);
    expect(mockForward).not.toHaveBeenCalled();
  });

  test('body changed by one byte fails verification', async () => {
    const { payload, header } = signedPayload(baseEvent());
    const tampered = `${payload.slice(0, -2)}X${payload.slice(-1)}`;
    const res = await postWebhook(app, tampered, header);

    expect(res.status).toBe(400);
    expect(res.body.message).toBe('Invalid signature');
    expect(mockForward).not.toHaveBeenCalled();
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
    expect(mockForward).not.toHaveBeenCalled();
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
      expect(mockForward).toHaveBeenCalledTimes(1);
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
    expect(mockForward).not.toHaveBeenCalled();
  });

  test('livemode mismatch fails closed without forwarding', async () => {
    process.env.STRIPE_EXPECTED_LIVEMODE = 'true';
    const { payload, header } = signedPayload(baseEvent({ id: 'evt_hmac_live_mismatch', livemode: false }));
    const res = await postWebhook(app, payload, header);

    expect(res.status).toBe(400);
    expect(res.body.message).toBe('Stripe livemode mismatch');
    expect(mockForward).not.toHaveBeenCalled();
  });
});
