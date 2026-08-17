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
});
