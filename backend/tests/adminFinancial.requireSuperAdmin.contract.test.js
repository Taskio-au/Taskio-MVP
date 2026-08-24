'use strict';

/**
 * Manual financial mutations require real requireSuperAdmin.
 * Ordinary admin must 403 before any Stripe call.
 */

const express = require('express');
const request = require('supertest');

const currentUser = {
  uid: 'plain-admin',
  admin: true,
  role: 'admin',
  super_admin: false,
};

jest.mock('../src/firebaseAdmin', () => ({
  admin: { firestore: { FieldValue: { serverTimestamp: jest.fn(() => '__ts__') } } },
  db: {
    collection: jest.fn(() => ({
      doc: jest.fn(() => ({
        get: jest.fn(async () => ({ exists: false, data: () => null })),
      })),
    })),
  },
}));

const mockCreateTransfer = jest.fn();
const mockCreateRefund = jest.fn();
const mockCreateCheckoutSession = jest.fn();

jest.mock('../src/services/stripe', () => ({
  createTransfer: (...args) => mockCreateTransfer(...args),
  getSucceededChargeIdForConnectTransfer: jest.fn(),
  createRefund: (...args) => mockCreateRefund(...args),
  createCheckoutSession: (...args) => mockCreateCheckoutSession(...args),
  retrieveCheckoutSession: jest.fn(),
}));

jest.mock('../src/routes/admin/shared/audit', () => ({
  logAdminJobAction: jest.fn(),
  logJobEvent: jest.fn(),
}));

jest.mock('../src/middleware/auth', () => {
  const actual = jest.requireActual('../src/middleware/auth');
  return {
    ...actual,
    requireAuth: (req, _res, next) => {
      req.user = { ...currentUser };
      next();
    },
  };
});

const jobRoutes = require('../src/routes/admin/jobRoutes');

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use(jobRoutes);
  return app;
}

describe('admin financial routes require super_admin', () => {
  let app;
  let envSnapshot;

  beforeEach(() => {
    envSnapshot = { STRIPE_ENABLED: process.env.STRIPE_ENABLED };
    process.env.STRIPE_ENABLED = 'true';
    currentUser.uid = 'plain-admin';
    currentUser.admin = true;
    currentUser.super_admin = false;
    mockCreateTransfer.mockReset();
    mockCreateRefund.mockReset();
    mockCreateCheckoutSession.mockReset();
    app = buildApp();
  });

  afterEach(() => {
    if (envSnapshot.STRIPE_ENABLED === undefined) {
      delete process.env.STRIPE_ENABLED;
    } else {
      process.env.STRIPE_ENABLED = envSnapshot.STRIPE_ENABLED;
    }
  });

  it('ordinary admin cannot manual-release and Stripe transfer is not called', async () => {
    const res = await request(app).post('/api/admin/jobs/job-1/manual-release').send({});

    expect(res.status).toBe(403);
    expect(res.body.message).toMatch(/super admin/i);
    expect(mockCreateTransfer).not.toHaveBeenCalled();
  });

  it('ordinary admin cannot manual-refund and Stripe refund is not called', async () => {
    const res = await request(app).post('/api/admin/jobs/job-1/refund').send({});

    expect(res.status).toBe(403);
    expect(res.body.message).toMatch(/super admin/i);
    expect(mockCreateRefund).not.toHaveBeenCalled();
  });

  it('ordinary admin cannot retry-payment', async () => {
    const res = await request(app).post('/api/admin/jobs/job-1/retry-payment').send({});

    expect(res.status).toBe(403);
    expect(res.body.message).toMatch(/super admin/i);
    expect(mockCreateRefund).not.toHaveBeenCalled();
    expect(mockCreateCheckoutSession).not.toHaveBeenCalled();
  });

  it('ordinary admin still reaches non-financial admin routes', async () => {
    const res = await request(app).post('/api/admin/jobs/missing-job/flag-dispute').send({ reason: 'test' });

    expect(res.status).toBe(404);
    expect(res.body.message).toMatch(/not found/i);
  });

  it('super_admin passes the manual-release authorization gate', async () => {
    currentUser.uid = 'super-admin';
    currentUser.super_admin = true;

    const res = await request(app).post('/api/admin/jobs/missing-job/manual-release').send({});

    expect(res.status).not.toBe(403);
    expect(res.status).toBe(404);
    expect(mockCreateTransfer).not.toHaveBeenCalled();
  });

  it('super_admin passes the refund authorization gate', async () => {
    currentUser.uid = 'super-admin';
    currentUser.super_admin = true;

    const res = await request(app).post('/api/admin/jobs/missing-job/refund').send({});

    expect(res.status).not.toBe(403);
    expect(res.status).toBe(404);
    expect(mockCreateRefund).not.toHaveBeenCalled();
  });
});
