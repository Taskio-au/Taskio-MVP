'use strict';

const express = require('express');
const request = require('supertest');

jest.mock('../src/firebaseAdmin', () => ({
  admin: {
    auth: () => ({
      verifyIdToken: async (token) => {
        if (token === 'admin-token') {
          return { uid: 'admin-1', admin: true, email: 'admin@example.com' };
        }
        if (token === 'user-token') {
          return { uid: 'homeowner-1', admin: false, role: 'homeowner' };
        }
        const err = new Error('Invalid token');
        err.code = 'auth/argument-error';
        throw err;
      },
    }),
  },
  db: {
    collection: jest.fn(() => ({
      limit: jest.fn(() => ({
        get: jest.fn(async () => ({ empty: true, docs: [] })),
      })),
    })),
  },
}));

const healthRoutes = require('../src/routes/health');

function buildApp() {
  const app = express();
  app.use(healthRoutes);
  return app;
}

describe('GET /health/metrics authorization', () => {
  let app;

  beforeEach(() => {
    app = buildApp();
  });

  it('returns 401 for anonymous callers', async () => {
    const res = await request(app).get('/health/metrics');
    expect(res.status).toBe(401);
    expect(res.body.message).toMatch(/no token/i);
  });

  it('returns 403 for authenticated non-admins', async () => {
    const res = await request(app)
      .get('/health/metrics')
      .set('Authorization', 'Bearer user-token');
    expect(res.status).toBe(403);
    expect(res.body.message).toMatch(/admin/i);
  });

  it('returns 200 for admins without secrets', async () => {
    const res = await request(app)
      .get('/health/metrics')
      .set('Authorization', 'Bearer admin-token');
    expect(res.status).toBe(200);
    expect(res.body.process).toEqual(expect.objectContaining({
      rss: expect.any(Number),
      heapUsed: expect.any(Number),
    }));
    expect(res.body.uptimeSec).toEqual(expect.any(Number));
    const blob = JSON.stringify(res.body);
    expect(blob).not.toMatch(/sk_test_|sk_live_|whsec_|OTP_SALT|BEGIN PRIVATE KEY/i);
  });

  it('leaves /health/live anonymous', async () => {
    const res = await request(app).get('/health/live');
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
  });
});
