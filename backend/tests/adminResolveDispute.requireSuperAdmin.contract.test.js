'use strict';

/**
 * resolve-dispute uses real requireSuperAdmin from middleware (not the permissive mock
 * in adminJobRoutes.contract.test.js).
 */

const express = require('express');
const request = require('supertest');

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

jest.mock('../src/services/stripe', () => ({
  createTransfer: jest.fn(),
  getSucceededChargeIdForConnectTransfer: jest.fn(),
  createRefund: jest.fn(),
  createCheckoutSession: jest.fn(),
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
      req.user = { uid: 'plain-admin', admin: true, role: 'admin', super_admin: false };
      next();
    },
    requireAdmin: (_req, _res, next) => next(),
  };
});

const jobRoutes = require('../src/routes/admin/jobRoutes');

describe('POST /resolve-dispute super admin gate', () => {
  it('returns 403 for non–super-admin users', async () => {
    const app = express();
    app.use(express.json());
    app.use(jobRoutes);

    const res = await request(app)
      .post('/api/admin/jobs/any-job/resolve-dispute')
      .send({ resolution: 'expert' });

    expect(res.status).toBe(403);
    expect(res.body.message).toMatch(/super admin/i);
  });
});
