'use strict';

const Stripe = require('stripe');
const request = require('supertest');
const { createMemoryFirestore } = require('./helpers/memoryFirestore');

const TEST_WEBHOOK_SECRET = 'whsec_test_taskio_webhook_app';
const mockMemory = createMemoryFirestore();

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
  return { payload, header };
}

describe('webhook-only Express app', () => {
  const original = {};
  const envKeys = ['STRIPE_ENABLED', 'STRIPE_WEBHOOK_SECRET', 'STRIPE_EXPECTED_LIVEMODE', 'STRIPE_SECRET_KEY'];

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
    dispatchStripeEventHandlers.mockClear();
    process.env.STRIPE_ENABLED = 'true';
    process.env.STRIPE_WEBHOOK_SECRET = TEST_WEBHOOK_SECRET;
    process.env.STRIPE_EXPECTED_LIVEMODE = 'false';
    delete process.env.STRIPE_SECRET_KEY;
  });

  test('POST /api/stripe/webhook is the only functional route', async () => {
    const app = createWebhookApp();
    const { payload, header } = signedEvent();
    const res = await request(app)
      .post('/api/stripe/webhook')
      .set('Stripe-Signature', header)
      .set('Content-Type', 'application/json')
      .send(payload);
    expect(res.status).toBe(200);
    expect(res.body.received).toBe(true);
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
  ])('%s %s returns 404', async (method, path) => {
    const app = createWebhookApp();
    const res = await request(app)[method.toLowerCase()](path);
    expect(res.status).toBe(404);
    expect(res.body.message).toBe('Not found');
    expect(dispatchStripeEventHandlers).not.toHaveBeenCalled();
  });

  test('STRIPE_ENABLED=false returns 404 without processing', async () => {
    process.env.STRIPE_ENABLED = 'false';
    const app = createWebhookApp();
    const { payload, header } = signedEvent('evt_disabled');
    const res = await request(app)
      .post('/api/stripe/webhook')
      .set('Stripe-Signature', header)
      .set('Content-Type', 'application/json')
      .send(payload);

    expect(res.status).toBe(404);
    expect(res.body.message).toBe('Not found');
    expect(dispatchStripeEventHandlers).not.toHaveBeenCalled();
    expect(mockMemory.store('stripe_events').size).toBe(0);
  });

  test('full Taskio application factory is distinct from webhook-only app', () => {
    const full = createApp();
    const webhookOnly = createWebhookApp();
    expect(full).not.toBe(webhookOnly);
    expect(typeof full.handle).toBe('function');
    expect(typeof webhookOnly.handle).toBe('function');
  });
});
