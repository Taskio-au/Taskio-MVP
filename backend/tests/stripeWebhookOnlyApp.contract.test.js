'use strict';

const Stripe = require('stripe');
const request = require('supertest');
const { createMemoryFirestore } = require('./helpers/memoryFirestore');

const TEST_WEBHOOK_SECRET = 'whsec_test_taskio_webhook_app';
const AUDIENCE = 'https://taskio-api.example.run.app';
const mockMemory = createMemoryFirestore();
const mockForward = jest.fn(async () => ({ httpStatus: 200, body: { received: true } }));

jest.mock('../src/firebaseAdmin', () => ({
  admin: mockMemory.admin,
  db: mockMemory.db,
}));

jest.mock('../src/services/stripeEventHandlers', () => ({
  dispatchStripeEventHandlers: jest.fn(async () => undefined),
  handleOperationalStripeEvent: jest.fn(async () => false),
}));

const { createWebhookApp } = require('../src/webhookApp');
const { createApp } = require('../src/app');
const { dispatchStripeEventHandlers } = require('../src/services/stripeEventHandlers');

function signedEvent(id = 'evt_app_1') {
  const event = {
    id,
    object: 'event',
    type: 'payout.failed',
    livemode: false,
    created: Math.floor(Date.now() / 1000),
    data: { object: { id: 'po_app_1', object: 'payout', status: 'failed' } },
  };
  const payload = JSON.stringify(event);
  const header = Stripe.webhooks.generateTestHeaderString({
    payload,
    secret: TEST_WEBHOOK_SECRET,
  });
  return { payload, header, event };
}

describe('webhook-only Express app', () => {
  const original = {};
  const envKeys = [
    'STRIPE_ENABLED',
    'STRIPE_WEBHOOK_SECRET',
    'STRIPE_EXPECTED_LIVEMODE',
    'STRIPE_SECRET_KEY',
    'STRIPE_INTERNAL_AUDIENCE',
  ];

  beforeAll(() => {
    envKeys.forEach((key) => {
      original[key] = process.env[key];
    });
  });

  afterAll(() => {
    envKeys.forEach((key) => {
      if (original[key] === undefined) delete process.env[key];
      else process.env[key] = original[key];
    });
  });

  beforeEach(() => {
    mockMemory.reset();
    mockForward.mockClear();
    dispatchStripeEventHandlers.mockClear();
    process.env.STRIPE_ENABLED = 'true';
    process.env.STRIPE_WEBHOOK_SECRET = TEST_WEBHOOK_SECRET;
    process.env.STRIPE_EXPECTED_LIVEMODE = 'false';
    process.env.STRIPE_INTERNAL_AUDIENCE = AUDIENCE;
    delete process.env.STRIPE_SECRET_KEY;
  });

  test('POST /api/stripe/webhook is the only functional route', async () => {
    const app = createWebhookApp({ forwardVerifiedStripeEvent: mockForward });
    const { payload, header } = signedEvent();
    const res = await request(app)
      .post('/api/stripe/webhook')
      .set('Stripe-Signature', header)
      .set('Content-Type', 'application/json')
      .send(payload);
    expect(res.status).toBe(200);
    expect(res.body.received).toBe(true);
    expect(mockForward).toHaveBeenCalledTimes(1);
    expect(dispatchStripeEventHandlers).not.toHaveBeenCalled();
    expect(mockMemory.store('stripe_events').size).toBe(0);
  });

  test.each([
    ['GET', '/'],
    ['GET', '/health/live'],
    ['GET', '/health/ready'],
    ['GET', '/api/jobs/job-1'],
    ['POST', '/api/jobs'],
    ['GET', '/api/admin/jobs'],
    ['GET', '/api/tradie/me'],
    ['POST', '/api/auth/otp/request'],
    ['POST', '/api/ai/chat'],
    ['GET', '/api/stripe/webhook'],
    ['PUT', '/api/stripe/webhook'],
    ['POST', '/internal/stripe/verified-event'],
    ['GET', '/internal/stripe/verified-event'],
  ])('%s %s returns 404', async (method, path) => {
    const app = createWebhookApp({ forwardVerifiedStripeEvent: mockForward });
    const res = await request(app)[method.toLowerCase()](path);
    expect(res.status).toBe(404);
    expect(res.body.message).toBe('Not found');
    expect(mockForward).not.toHaveBeenCalled();
    expect(dispatchStripeEventHandlers).not.toHaveBeenCalled();
  });

  test('STRIPE_ENABLED=false returns 404 without HMAC or forward', async () => {
    process.env.STRIPE_ENABLED = 'false';
    const constructSpy = jest.spyOn(Stripe.webhooks, 'constructEvent');
    const app = createWebhookApp({ forwardVerifiedStripeEvent: mockForward });
    const { payload, header } = signedEvent('evt_disabled');
    try {
      const res = await request(app)
        .post('/api/stripe/webhook')
        .set('Stripe-Signature', header)
        .set('Content-Type', 'application/json')
        .send(payload);

      expect(res.status).toBe(404);
      expect(res.body.message).toBe('Not found');
      expect(constructSpy).not.toHaveBeenCalled();
      expect(mockForward).not.toHaveBeenCalled();
      expect(dispatchStripeEventHandlers).not.toHaveBeenCalled();
      expect(mockMemory.store('stripe_events').size).toBe(0);
    } finally {
      constructSpy.mockRestore();
    }
  });

  test('private taskio-api HMAC route still processes locally', async () => {
    const { payload, header } = signedEvent('evt_private_hmac_1');
    const res = await request(createApp())
      .post('/api/stripe/webhook')
      .set('Stripe-Signature', header)
      .set('Content-Type', 'application/json')
      .send(payload);
    expect(res.status).toBe(200);
    expect(res.body.received).toBe(true);
    expect(dispatchStripeEventHandlers).toHaveBeenCalledTimes(1);
    expect(mockForward).not.toHaveBeenCalled();
  });

  test('full Taskio application factory is distinct from webhook-only app', () => {
    const full = createApp();
    const webhookOnly = createWebhookApp({ forwardVerifiedStripeEvent: mockForward });
    expect(full).not.toBe(webhookOnly);
    expect(typeof full.handle).toBe('function');
    expect(typeof webhookOnly.handle).toBe('function');
  });
});
