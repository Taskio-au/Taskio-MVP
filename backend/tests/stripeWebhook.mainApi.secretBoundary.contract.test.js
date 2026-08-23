'use strict';

const express = require('express');
const request = require('supertest');
const Stripe = require('stripe');

jest.mock('../src/services/stripeEventProcessor', () => ({
  processVerifiedStripeEvent: jest.fn(),
}));

const { processVerifiedStripeEvent } = require('../src/services/stripeEventProcessor');
const webhookRoutes = require('../src/routes/stripeWebhook');

const ENV_KEYS = [
  'STRIPE_ENABLED',
  'STRIPE_WEBHOOK_SECRET',
  'STRIPE_EXPECTED_LIVEMODE',
];

function buildApp() {
  const app = express();
  app.use(webhookRoutes);
  return app;
}

function baseEvent(overrides = {}) {
  return {
    id: 'evt_api_hmac_1',
    object: 'event',
    type: 'payment_intent.succeeded',
    livemode: false,
    created: Math.floor(Date.now() / 1000),
    data: { object: { id: 'pi_api_hmac_1', object: 'payment_intent', status: 'succeeded' } },
    ...overrides,
  };
}

describe('legacy main API HMAC webhook fail-closed without signing secret', () => {
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
    processVerifiedStripeEvent.mockReset();
    process.env.STRIPE_ENABLED = 'true';
    process.env.STRIPE_EXPECTED_LIVEMODE = 'false';
    delete process.env.STRIPE_WEBHOOK_SECRET;
    app = buildApp();
  });

  test('signed-looking request fails closed when STRIPE_WEBHOOK_SECRET is absent', async () => {
    const payload = JSON.stringify(baseEvent());
    const header = Stripe.webhooks.generateTestHeaderString({
      payload,
      secret: 'whsec_must_not_be_used_as_fallback',
    });

    const res = await request(app)
      .post('/api/stripe/webhook')
      .set('Content-Type', 'application/json')
      .set('Stripe-Signature', header)
      .send(payload);

    expect(res.status).toBe(503);
    expect(res.body.message).toBe('Webhook handler failed');
    expect(res.text).not.toMatch(/whsec_/);
    expect(processVerifiedStripeEvent).not.toHaveBeenCalled();
  });

  test('unsigned request is rejected and does not process', async () => {
    const payload = JSON.stringify(baseEvent({ id: 'evt_api_hmac_unsigned' }));
    const res = await request(app)
      .post('/api/stripe/webhook')
      .set('Content-Type', 'application/json')
      .send(payload);

    expect(res.status).toBe(400);
    expect(res.body.message).toBe('Missing Stripe-Signature header');
    expect(processVerifiedStripeEvent).not.toHaveBeenCalled();
  });

  test('does not fabricate a signing secret for constructWebhookEvent', () => {
    const { constructWebhookEvent } = require('../src/services/stripe');
    const payload = JSON.stringify(baseEvent({ id: 'evt_api_hmac_construct' }));
    const header = Stripe.webhooks.generateTestHeaderString({
      payload,
      secret: 'whsec_unrelated',
    });
    expect(() => constructWebhookEvent(Buffer.from(payload), header)).toThrow(
      expect.objectContaining({ code: 'stripe_webhook_not_configured' }),
    );
  });
});
