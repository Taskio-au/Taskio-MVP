const express = require('express');
const request = require('supertest');

const state = {
  collections: new Map(),
};

function resetState() {
  state.collections = new Map();
}

function getCollectionStore(name) {
  const key = String(name);
  if (!state.collections.has(key)) {
    state.collections.set(key, new Map());
  }
  return state.collections.get(key);
}

function clone(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function readDoc(collectionName, id) {
  return getCollectionStore(collectionName).get(String(id));
}

function writeDoc(collectionName, id, value) {
  getCollectionStore(collectionName).set(String(id), clone(value));
}

function mockMakeDocRef(collectionName, id) {
  const docId = String(id);
  return {
    async get() {
      const data = readDoc(collectionName, docId);
      return {
        exists: data !== undefined,
        data: () => clone(data),
      };
    },
    async set(payload, options) {
      const existing = readDoc(collectionName, docId);
      const next = options && options.merge
        ? { ...(existing || {}), ...(clone(payload) || {}) }
        : (clone(payload) || {});
      writeDoc(collectionName, docId, next);
    },
  };
}

jest.mock('../src/firebaseAdmin', () => ({
  admin: {
    firestore: {
      FieldValue: {
        serverTimestamp: jest.fn(() => '__server_ts__'),
      },
      Timestamp: {
        now: jest.fn(() => ({ seconds: 0, nanoseconds: 0 })),
        fromDate: jest.fn((d) => ({ seconds: Math.floor(new Date(d).getTime() / 1000), nanoseconds: 0 })),
      },
    },
    auth: jest.fn(() => ({
      updateUser: jest.fn(),
    })),
  },
  db: {
    collection: jest.fn((name) => ({
      doc: (id) => mockMakeDocRef(name, id),
      where(field, op, value) {
        return {
          where() {
            return this;
          },
          limit() {
            return {
              async get() {
                return { empty: true, docs: [] };
              },
            };
          },
        };
      },
    })),
  },
}));

global.__TASKIO_ME_TEST_AUTH__ = {
  uid: 'tradie-1',
  role: 'tradie',
  email: 'tradie@example.com',
  email_verified: true,
};

jest.mock('../src/middleware/auth', () => ({
  requireAuth: (req, _res, next) => {
    req.user = { ...global.__TASKIO_ME_TEST_AUTH__ };
    next();
  },
  requireRole: (role) => (req, res, next) => {
    const userRole = req.user?.role;
    if (userRole === role) return next();
    return res.status(403).send({
      message: `Forbidden: Requires role ${role}. Please re-login, or ensure your account was created via /api/users/register.`,
    });
  },
}));

jest.mock('../src/services/abnLookup', () => ({
  ...jest.requireActual('../src/services/abnLookup'),
  lookupAbnDetails: jest.fn(async (abn) => ({
    abn,
    entityName: 'Acme Pty Ltd',
    entityTypeName: 'Company',
    entityStatus: 'Active',
    gst: 'true',
  })),
}));

jest.mock('../src/utils/auditLogs', () => ({
  writeUserAuditLog: jest.fn(async () => {}),
}));

const meRoutes = require('../src/routes/me');

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use(meRoutes);
  return app;
}

function seedUser(overrides = {}) {
  writeDoc('users', 'tradie-1', {
    role: 'tradie',
    status: 'active',
    verified: false,
    privateDetailsLocked: false,
    phoneVerified: true,
    emailVerified: true,
    businessType: 'individual',
    businessName: '',
    dob: { day: 1, month: 1, year: 1990 },
    ...overrides,
  });
}

describe('me profile route contracts', () => {
  let app;

  beforeEach(() => {
    resetState();
    global.__TASKIO_ME_TEST_AUTH__ = {
      uid: 'tradie-1',
      role: 'tradie',
      email: 'tradie@example.com',
      email_verified: true,
    };
    app = buildApp();
  });

  it('blocks DOB changes after private details are locked', async () => {
    seedUser({
      privateDetailsLocked: true,
      dob: { day: 1, month: 1, year: 1990 },
      businessType: 'sole_trader',
      abn: '12345678901',
    });

    const res = await request(app)
      .put('/api/me/profile')
      .send({ dob: { day: 2, month: 2, year: 1990 } });

    expect(res.status).toBe(409);
    expect(res.body.message).toMatch(/Date of birth is locked/i);
  });

  it('rejects future DOB values', async () => {
    seedUser({ privateDetailsLocked: false });
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);

    const res = await request(app)
      .put('/api/me/profile')
      .send({
        dob: {
          day: tomorrow.getDate(),
          month: tomorrow.getMonth() + 1,
          year: tomorrow.getFullYear(),
        },
      });

    expect(res.status).toBe(400);
    expect(res.body.message).toBe('Date of birth cannot be in the future.');
  });

  it('rejects underage DOB values', async () => {
    seedUser({ privateDetailsLocked: false });
    const now = new Date();
    const underageYear = now.getFullYear() - 17;

    const res = await request(app)
      .put('/api/me/profile')
      .send({
        dob: {
          day: now.getDate(),
          month: now.getMonth() + 1,
          year: underageYear,
        },
      });

    expect(res.status).toBe(400);
    expect(res.body.message).toBe('You must be 18 or older to use Taskio as an Expert.');
  });

  it('requires business name for company profile updates', async () => {
    seedUser({ businessType: 'company' });

    const res = await request(app)
      .put('/api/me/profile')
      .send({ businessType: 'company', businessName: '' });

    expect(res.status).toBe(400);
    expect(res.body.message).toBe('Business name is required for companies.');
  });

  it('allows sole trader updates without business name', async () => {
    seedUser({ businessType: 'sole_trader', businessName: '' });

    const res = await request(app)
      .put('/api/me/profile')
      .send({ businessType: 'sole_trader', businessName: '' });

    expect(res.status).toBe(200);
    expect(res.body.message).toBe('Profile updated.');
  });

  it('blocks private-details lock when required ABN is missing', async () => {
    seedUser({
      businessType: 'company',
      businessName: 'Acme Pty Ltd',
      abn: '',
      privateDetailsLocked: false,
    });

    const res = await request(app)
      .put('/api/me/profile')
      .send({ privateDetailsLock: true });

    expect(res.status).toBe(400);
    expect(res.body.message).toBe('Please verify your ABN before confirming your private details.');
  });

  it('allows private-details lock for individual without ABN', async () => {
    seedUser({
      businessType: 'individual',
      businessName: '',
      abn: '',
      privateDetailsLocked: false,
    });

    const res = await request(app)
      .put('/api/me/profile')
      .send({ privateDetailsLock: true });

    expect(res.status).toBe(200);
    expect(res.body.profile.privateDetailsLocked).toBe(true);
  });

  it('blocks private-details lock for individual when business name exists but ABN missing', async () => {
    seedUser({
      businessType: 'individual',
      businessName: 'Acme Services',
      abn: '',
      privateDetailsLocked: false,
    });

    const res = await request(app)
      .put('/api/me/profile')
      .send({ privateDetailsLock: true });

    expect(res.status).toBe(400);
    expect(res.body.message).toBe('Please verify your ABN before confirming your private details.');
  });

  it('blocks private-details lock when required ABN is present but unverified', async () => {
    seedUser({
      businessType: 'sole_trader',
      businessName: '',
      abn: '51824753556',
      abnVerified: false,
      privateDetailsLocked: false,
    });

    const res = await request(app)
      .put('/api/me/profile')
      .send({ privateDetailsLock: true });

    expect(res.status).toBe(400);
    expect(res.body.message).toBe('Please verify your ABN before confirming your private details.');
    expect(readDoc('users', 'tradie-1').abnVerified).not.toBe(true);
    expect(readDoc('users', 'tradie-1').privateDetailsLocked).not.toBe(true);
  });

  it('allows private-details lock when required ABN is verified', async () => {
    seedUser({
      businessType: 'sole_trader',
      businessName: '',
      abn: '51824753556',
      abnVerified: true,
      privateDetailsLocked: false,
    });

    const res = await request(app)
      .put('/api/me/profile')
      .send({ privateDetailsLock: true });

    expect(res.status).toBe(200);
    expect(res.body.profile.privateDetailsLocked).toBe(true);
  });

  it('allows empty ABN on profile update when ABN is not required', async () => {
    seedUser({
      businessType: 'individual',
      businessName: '',
      abn: '',
    });

    const res = await request(app)
      .put('/api/me/profile')
      .send({ abn: '' });

    expect(res.status).toBe(200);
    expect(res.body.message).toBe('Profile updated.');
    expect(readDoc('users', 'tradie-1').abn).toBe('');
    expect(readDoc('users', 'tradie-1').abnVerified).not.toBe(true);
  });

  it('rejects empty ABN on profile update when ABN is required', async () => {
    seedUser({
      businessType: 'sole_trader',
      businessName: '',
      abn: '',
    });

    const res = await request(app)
      .put('/api/me/profile')
      .send({ abn: '' });

    expect(res.status).toBe(400);
    expect(res.body.message).toBe('ABN is required for sole traders and companies.');
  });

  it('does not auto-lock private details on GET when required ABN is unverified', async () => {
    seedUser({
      businessType: 'sole_trader',
      businessName: '',
      abn: '51824753556',
      abnVerified: false,
      privateDetailsLocked: false,
      dob: { day: 1, month: 1, year: 1990 },
    });

    const res = await request(app).get('/api/me');

    expect(res.status).toBe(200);
    expect(res.body.profile.privateDetailsLocked).toBe(false);
    expect(readDoc('users', 'tradie-1').privateDetailsLocked).not.toBe(true);
  });

  it('returns 403 account_not_enrolled when the profile is missing', async () => {
    const res = await request(app).get('/api/me');
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('account_not_enrolled');
    expect(readDoc('users', 'tradie-1')).toBeUndefined();
  });

  it('returns 409 account_state_invalid for a stub profile and does not write', async () => {
    writeDoc('users', 'tradie-1', { phone: '+61400000001' });
    const before = readDoc('users', 'tradie-1');

    const res = await request(app).get('/api/me');

    expect(res.status).toBe(409);
    expect(res.body.code).toBe('account_state_invalid');
    expect(readDoc('users', 'tradie-1')).toEqual(before);
  });
});

const { testProgramId } = require('../../shared/feePlans');

const FOUNDING_FEE_PROFILE_KEYS = [
  'enrolled',
  'status',
  'programId',
  'stage',
  'expertFeeBps',
  'benefitLabel',
  'zeroFeeSlotsUsed',
  'zeroFeeTaskLimit',
  'zeroFeeSlotsRemaining',
  'reducedFeeStartsAtMs',
  'reducedFeeEndsAtMs',
  'standardFeeBpsAfter',
  'badgeLabel',
  'displayCopy',
  'estimateOnly',
];

describe('GET /api/me foundingExpertFeeProfile', () => {
  let app;

  beforeEach(() => {
    resetState();
    global.__TASKIO_ME_TEST_AUTH__ = {
      uid: 'tradie-1',
      role: 'tradie',
      email: 'tradie@example.com',
      email_verified: true,
    };
    app = buildApp();
  });

  it('returns 0% profile for active Founding Expert in first-three', async () => {
    seedUser({
      foundingExpert: {
        status: 'active',
        programId: testProgramId,
        zeroFeeSlotsUsed: 0,
        approvedBy: 'must-not-leak-admin',
      },
    });

    const res = await request(app).get('/api/me');

    expect(res.status).toBe(200);
    const fep = res.body.foundingExpertFeeProfile;
    expect(fep).not.toBeNull();
    expect(fep.stage).toBe('founding_first_three');
    expect(fep.expertFeeBps).toBe(0);
    expect(fep.benefitLabel).toBe('Founding Expert offer');
    expect(fep.displayCopy).toBe('0% Taskio fee on your first 3 funded tasks.');
    expect(fep.badgeLabel).toBe('Founding Expert');
    expect(fep.zeroFeeSlotsRemaining).toBe(3);
    expect(Object.keys(fep).sort()).toEqual([...FOUNDING_FEE_PROFILE_KEYS].sort());
    expect(JSON.stringify(fep)).not.toMatch(/approvedBy|removedBy/);
  });

  it('returns 7.5% profile during reduced period', async () => {
    seedUser({
      foundingExpert: {
        status: 'active',
        programId: testProgramId,
        zeroFeeSlotsUsed: 3,
        reducedFeeEndsAt: new Date('2099-12-31T00:00:00.000Z'),
      },
    });

    const res = await request(app).get('/api/me');

    expect(res.status).toBe(200);
    const fep = res.body.foundingExpertFeeProfile;
    expect(fep.stage).toBe('founding_reduced');
    expect(fep.expertFeeBps).toBe(750);
    expect(fep.benefitLabel).toBe('Reduced Founding Expert fee');
    expect(fep.badgeLabel).toBe('Founding Expert');
    expect(fep.displayCopy).toMatch(/^7\.5% Taskio fee until /);
    expect(JSON.stringify(fep)).not.toMatch(/approvedBy|removedBy/);
  });

  it('removed status returns standard 10%', async () => {
    seedUser({
      foundingExpert: {
        status: 'removed',
        programId: testProgramId,
        zeroFeeSlotsUsed: 0,
        approvedBy: 'admin',
      },
    });

    const res = await request(app).get('/api/me');

    expect(res.status).toBe(200);
    const fep = res.body.foundingExpertFeeProfile;
    expect(fep.stage).toBe('standard_launch');
    expect(fep.expertFeeBps).toBe(1000);
    expect(fep.benefitLabel).toBe('Standard launch fee');
    expect(fep.badgeLabel).toBeNull();
    expect(fep.zeroFeeSlotsUsed).toBeNull();
    expect(fep.zeroFeeSlotsRemaining).toBeNull();
    expect(JSON.stringify(fep)).not.toMatch(/approvedBy|removedBy/);
  });

  it('non-enrolled Expert returns standard profile', async () => {
    seedUser({});

    const res = await request(app).get('/api/me');

    expect(res.status).toBe(200);
    const fep = res.body.foundingExpertFeeProfile;
    expect(fep.stage).toBe('standard_launch');
    expect(fep.expertFeeBps).toBe(1000);
    expect(fep.enrolled).toBe(false);
    expect(fep.status).toBeNull();
    expect(fep.programId).toBeNull();
  });

  it('computes zeroFeeSlotsRemaining correctly', async () => {
    seedUser({
      foundingExpert: {
        status: 'active',
        programId: testProgramId,
        zeroFeeSlotsUsed: 2,
      },
    });

    const res = await request(app).get('/api/me');

    expect(res.status).toBe(200);
    expect(res.body.foundingExpertFeeProfile.zeroFeeSlotsRemaining).toBe(1);
  });

  it('homeowner receives null foundingExpertFeeProfile', async () => {
    global.__TASKIO_ME_TEST_AUTH__ = {
      uid: 'homeowner-1',
      role: 'homeowner',
      email: 'h@example.com',
      email_verified: true,
    };
    writeDoc('users', 'homeowner-1', {
      role: 'homeowner',
      status: 'active',
      email: 'h@example.com',
      emailVerified: true,
      foundingExpert: {
        status: 'active',
        programId: testProgramId,
        zeroFeeSlotsUsed: 0,
      },
    });

    const res = await request(app).get('/api/me');

    expect(res.status).toBe(200);
    expect(res.body.foundingExpertFeeProfile).toBeNull();
  });

  it('test_reset returns standard badge off', async () => {
    seedUser({
      foundingExpert: {
        status: 'test_reset',
        programId: testProgramId,
        zeroFeeSlotsUsed: 0,
      },
    });

    const res = await request(app).get('/api/me');

    expect(res.status).toBe(200);
    const fep = res.body.foundingExpertFeeProfile;
    expect(fep.stage).toBe('standard_launch');
    expect(fep.badgeLabel).toBeNull();
  });
});
