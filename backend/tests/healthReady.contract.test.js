'use strict';

const express = require('express');
const request = require('supertest');

jest.mock('../src/firebaseAdmin', () => ({
  db: {
    collection: jest.fn(),
  },
}));

const { db } = require('../src/firebaseAdmin');
const healthRoutes = require('../src/routes/health');

const ENV_KEYS = [
  'NODE_ENV',
  'CORS_ORIGINS',
  'TRUST_PROXY',
  'ALERT_WEBHOOK_URL',
  'OTP_SALT',
  'STRIPE_ENABLED',
  'STRIPE_SECRET_KEY',
  'STRIPE_WEBHOOK_SECRET',
  'STRIPE_CONNECT_WEBHOOK_SECRET',
  'STRIPE_EXPECTED_LIVEMODE',
  'STRIPE_INTERNAL_AUDIENCE',
  'STRIPE_WEBHOOK_CALLER_SERVICE_ACCOUNT',
  'FRONTEND_URL',
  'TASKIO_SHOW_DEV_OTP',
];

function buildApp() {
  const app = express();
  app.use(healthRoutes);
  return app;
}

describe('GET /health/ready production env', () => {
  const original = {};
  let app;

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
    process.env.STRIPE_ENABLED = 'false';

    db.collection.mockReset();
    db.collection.mockReturnValue({
      limit: jest.fn().mockReturnValue({
        get: jest.fn().mockResolvedValue({ empty: true, docs: [] }),
      }),
    });

    app = buildApp();
  });

  it('is not unhealthy solely because ALERT_WEBHOOK_URL is absent', async () => {
    const res = await request(app).get('/health/ready');

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.checks.env.ok).toBe(true);
    expect(res.body.checks.firestore.ok).toBe(true);
  });

  it('still reports env unhealthy when OTP_SALT is absent', async () => {
    delete process.env.OTP_SALT;

    const res = await request(app).get('/health/ready');

    expect(res.status).toBe(503);
    expect(res.body.ok).toBe(false);
    expect(res.body.checks.env.ok).toBe(false);
  });

  it('reports Stripe as intentionally disabled even if secrets are present', async () => {
    process.env.STRIPE_ENABLED = 'false';
    process.env.STRIPE_SECRET_KEY = 'sk_live_present_but_disabled';
    process.env.STRIPE_WEBHOOK_SECRET = 'whsec_present';
    process.env.FRONTEND_URL = 'https://taskio.com.au';

    const res = await request(app).get('/health/ready');

    expect(res.status).toBe(200);
    expect(res.body.checks.stripe.ok).toBe(true);
    expect(res.body.checks.stripe.enabled).toBe(false);
    expect(res.body.checks.stripe.internalWebhookConfigured).toBeUndefined();
  });

  it('fails readiness when Stripe is enabled but STRIPE_EXPECTED_LIVEMODE is missing', async () => {
    process.env.STRIPE_ENABLED = 'true';
    process.env.STRIPE_SECRET_KEY = 'sk_live_example';
    process.env.FRONTEND_URL = 'https://taskio.com.au';
    delete process.env.STRIPE_EXPECTED_LIVEMODE;

    const res = await request(app).get('/health/ready');

    expect(res.status).toBe(503);
    expect(res.body.ok).toBe(false);
    expect(res.body.checks.stripe.ok).toBe(false);
    expect(res.body.checks.stripe.livemode).toBeNull();
  });

  it('fails readiness when Stripe is enabled but required configuration is missing', async () => {
    process.env.STRIPE_ENABLED = 'true';
    delete process.env.STRIPE_SECRET_KEY;

    const res = await request(app).get('/health/ready');

    expect(res.status).toBe(503);
    expect(res.body.ok).toBe(false);
    expect(res.body.checks.stripe.ok).toBe(false);
    expect(res.body.checks.stripe.enabled).toBe(true);
  });

  it('fails readiness when Stripe is enabled but internal ingest identity is missing', async () => {
    process.env.STRIPE_ENABLED = 'true';
    process.env.STRIPE_SECRET_KEY = 'sk_live_example';
    process.env.FRONTEND_URL = 'https://taskio.com.au';
    process.env.STRIPE_EXPECTED_LIVEMODE = 'true';
    delete process.env.STRIPE_INTERNAL_AUDIENCE;
    delete process.env.STRIPE_WEBHOOK_CALLER_SERVICE_ACCOUNT;

    const res = await request(app).get('/health/ready');

    expect(res.status).toBe(503);
    expect(res.body.ok).toBe(false);
    expect(res.body.checks.stripe.ok).toBe(false);
    expect(res.body.checks.stripe.internalWebhookConfigured).toBe(false);
    expect(JSON.stringify(res.body)).not.toMatch(/gserviceaccount\.com/);
    expect(JSON.stringify(res.body)).not.toMatch(/run\.app/);
  });

  it('reports internal ingest as configured without exposing audience or caller', async () => {
    process.env.STRIPE_ENABLED = 'true';
    process.env.STRIPE_SECRET_KEY = 'sk_live_example';
    process.env.FRONTEND_URL = 'https://taskio.com.au';
    process.env.STRIPE_EXPECTED_LIVEMODE = 'true';
    process.env.STRIPE_INTERNAL_AUDIENCE = 'https://taskio-api.example.run.app';
    process.env.STRIPE_WEBHOOK_CALLER_SERVICE_ACCOUNT = 'webhook@example.iam.gserviceaccount.com';

    const res = await request(app).get('/health/ready');

    expect(res.status).toBe(200);
    expect(res.body.checks.stripe.ok).toBe(true);
    expect(res.body.checks.stripe.internalWebhookConfigured).toBe(true);
    expect(JSON.stringify(res.body)).not.toContain('https://taskio-api.example.run.app');
    expect(JSON.stringify(res.body)).not.toContain('webhook@example.iam.gserviceaccount.com');
  });

  it('does not require STRIPE_WEBHOOK_SECRET or STRIPE_CONNECT_WEBHOOK_SECRET for Stripe-enabled API readiness', async () => {
    process.env.STRIPE_ENABLED = 'true';
    process.env.STRIPE_SECRET_KEY = 'sk_live_example';
    process.env.FRONTEND_URL = 'https://taskio.com.au';
    process.env.STRIPE_EXPECTED_LIVEMODE = 'true';
    process.env.STRIPE_INTERNAL_AUDIENCE = 'https://taskio-api.example.run.app';
    process.env.STRIPE_WEBHOOK_CALLER_SERVICE_ACCOUNT = 'webhook@example.iam.gserviceaccount.com';
    delete process.env.STRIPE_WEBHOOK_SECRET;
    delete process.env.STRIPE_CONNECT_WEBHOOK_SECRET;

    const res = await request(app).get('/health/ready');

    expect(res.status).toBe(200);
    expect(res.body.checks.stripe.ok).toBe(true);
    expect(res.body.checks.stripe.enabled).toBe(true);
  });
});
