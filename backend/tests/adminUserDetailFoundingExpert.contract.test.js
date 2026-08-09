'use strict';

const express = require('express');
const request = require('supertest');

const { productionProgramId, testProgramId, foundingExpertCap } = require('../../shared/feePlans');

/** @type {Map<string, object>} uid -> Firestore-shaped user profile */
global.__adminUserDetailTestUsers = global.__adminUserDetailTestUsers || new Map();

jest.mock('../src/utils/auditLogs', () => ({
  writeUserAuditLog: jest.fn(),
}));

jest.mock('../src/middleware/auth', () => ({
  requireAuth: (req, _res, next) => {
    req.user = { uid: 'admin-detail-tester', admin: req.headers['x-test-admin'] !== 'false' };
    next();
  },
  requireAdmin: (req, res, next) => {
    if (req.user?.admin) return next();
    return res.status(403).send({ message: 'Forbidden: Requires admin privileges' });
  },
}));

jest.mock('../src/firebaseAdmin', () => ({
  admin: {
    auth: () => ({
      getUser: jest.fn(async () => {
        const err = new Error('auth/user-not-found');
        err.code = 'auth/user-not-found';
        throw err;
      }),
    }),
    firestore: {
      FieldValue: {
        serverTimestamp: jest.fn(() => '__server_ts__'),
      },
    },
  },
  db: {
    collection: jest.fn((name) => {
      if (name === 'admin_audit_logs') {
        return { add: jest.fn(async () => ({})) };
      }
      if (name === 'users') {
        return {
          doc(id) {
            const uid = String(id);
            return {
              async get() {
                const raw = global.__adminUserDetailTestUsers.get(uid);
                return {
                  exists: !!raw,
                  data: () => (raw ? JSON.parse(JSON.stringify(raw)) : {}),
                };
              },
            };
          },
        };
      }
      return { doc: () => ({ async get() { return { exists: false, data: () => ({}) }; } }) };
    }),
  },
}));

const userRoutes = require('../src/routes/admin/userRoutes');

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use(userRoutes);
  return app;
}

describe('GET /api/admin/users/:uid — Founding Expert fields', () => {
  let app;

  beforeEach(() => {
    global.__adminUserDetailTestUsers = new Map();
    app = buildApp();
    process.env.NODE_ENV = 'test';
    delete process.env.FOUNDING_EXPERT_PROGRAM_ID;
    delete process.env.FOUNDING_EXPERT_ALLOW_PRODUCTION_PROGRAM;
  });

  it('returns foundingExpert null and fee preview for Expert without founding map', async () => {
    global.__adminUserDetailTestUsers.set('ex-nofe', {
      role: 'tradie',
      status: 'active',
      verified: true,
      email: 'x@example.com',
      displayName: 'No FE',
      stripeOnboardingStatus: 'completed',
      stripePayoutsEnabled: true,
      serviceLocation: { suburb: 'Docklands', state: 'VIC', postcode: '3008' },
      expertiseApproved: ['handyman_jobs'],
    });

    const res = await request(app).get('/api/admin/users/ex-nofe').set('x-test-admin', 'true');
    expect(res.status).toBe(200);
    expect(res.body.foundingExpert).toBeNull();
    expect(res.body.foundingExpertFeePreview).toMatchObject({
      stage: 'standard_launch',
    });
    expect(res.body.foundingExpertEligibility).toEqual(
      expect.objectContaining({
        isExpert: true,
        isActive: true,
        isPlatformVerified: true,
        isStripePayoutReady: true,
        isMelbournePilotArea: true,
        hasServiceAreaOnFile: true,
        hasApprovedExpertise: true,
        eligible: true,
        reasons: [],
      })
    );
    expect(res.body.foundingExpertProgramMeta).toMatchObject({
      cap: foundingExpertCap,
      activeProgramId: testProgramId,
      zeroFeeTaskLimit: 3,
      reducedFeeBps: 750,
      standardFeeBpsAfter: 1000,
      testResetAllowed: true,
    });
  });

  it('eligible false when expert is outside Melbourne pilot area', async () => {
    global.__adminUserDetailTestUsers.set('ex-nope', {
      role: 'tradie',
      status: 'active',
      verified: true,
      stripeOnboardingStatus: 'completed',
      stripePayoutsEnabled: true,
      serviceLocation: { suburb: 'Sydney', state: 'NSW', postcode: '2000' },
      expertiseApproved: ['x'],
    });
    const res = await request(app).get('/api/admin/users/ex-nope').set('x-test-admin', 'true');
    expect(res.status).toBe(200);
    expect(res.body.foundingExpertEligibility.eligible).toBe(false);
    expect(res.body.foundingExpertEligibility.reasons.some((s) => /Melbourne launch area/i.test(s))).toBe(true);
  });

  it('returns sanitized active foundingExpert and first-three stage preview', async () => {
    global.__adminUserDetailTestUsers.set('ex-fe', {
      role: 'tradie',
      status: 'active',
      verified: true,
      email: 'fe@example.com',
      stripeOnboardingStatus: 'completed',
      stripePayoutsEnabled: true,
      serviceLocation: { suburb: 'Melbourne', state: 'VIC', postcode: '3000' },
      expertiseApproved: ['x'],
      foundingExpert: {
        status: 'active',
        programId: testProgramId,
        sequenceNumber: 4,
        city: 'Melbourne',
        zeroFeeTaskLimit: 3,
        zeroFeeSlotsUsed: 0,
        reducedFeeBps: 750,
        standardFeeBpsAfter: 1000,
        approvedBy: 'should-not-leak',
        approvedAt: { _seconds: 1700000000, _nanoseconds: 0 },
      },
    });

    const res = await request(app).get('/api/admin/users/ex-fe').set('x-test-admin', 'true');
    expect(res.status).toBe(200);
    expect(res.body.foundingExpert).toEqual(
      expect.objectContaining({
        status: 'active',
        programId: testProgramId,
        sequenceNumber: 4,
        zeroFeeSlotsUsed: 0,
        zeroFeeTaskLimit: 3,
        approvedAtMs: 1700000000000,
      })
    );
    expect(res.body.foundingExpert).not.toHaveProperty('approvedBy');
    expect(res.body.foundingExpert).not.toHaveProperty('removedBy');
    expect(res.body.foundingExpertFeePreview).toMatchObject({
      stage: 'founding_first_three',
      expertFeeBps: 0,
    });
    expect(res.body.foundingExpertEligibility).toMatchObject({
      eligible: true,
      isMelbournePilotArea: true,
    });
  });

  it('does not attach founding fields for homeowners', async () => {
    global.__adminUserDetailTestUsers.set('ho-1', {
      role: 'homeowner',
      status: 'active',
      email: 'h@example.com',
    });

    const res = await request(app).get('/api/admin/users/ho-1').set('x-test-admin', 'true');
    expect(res.status).toBe(200);
    expect(res.body).not.toHaveProperty('foundingExpert');
    expect(res.body).not.toHaveProperty('foundingExpertFeePreview');
    expect(res.body).not.toHaveProperty('foundingExpertProgramMeta');
    expect(res.body).not.toHaveProperty('foundingExpertEligibility');
  });

  it('does not expose internal profile arrays from user doc', async () => {
    global.__adminUserDetailTestUsers.set('ex-audit', {
      role: 'tradie',
      status: 'active',
      verified: true,
      stripeOnboardingStatus: 'completed',
      stripePayoutsEnabled: true,
      serviceLocation: { suburb: 'Carlton', state: 'VIC', postcode: '3053' },
      expertiseApproved: ['y'],
      expertiseChangeLog: [{ x: 1 }, { y: 2 }],
      adminCommsLog: [{ copiedAt: { _seconds: 1, _nanoseconds: 0 } }],
      foundingExpert: {
        status: 'active',
        programId: productionProgramId,
        sequenceNumber: 1,
        zeroFeeTaskLimit: 3,
        zeroFeeSlotsUsed: 3,
        reducedFeeStartsAt: { _seconds: 2000000000, _nanoseconds: 0 },
        reducedFeeEndsAt: { _seconds: 2100000000, _nanoseconds: 0 },
      },
    });

    const res = await request(app).get('/api/admin/users/ex-audit').set('x-test-admin', 'true');
    expect(res.status).toBe(200);
    expect(res.body).not.toHaveProperty('expertiseChangeLog');
    expect(res.body).not.toHaveProperty('adminCommsLog');
    expect(res.body.foundingExpertFeePreview).toMatchObject({
      stage: expect.any(String),
    });
  });
});
