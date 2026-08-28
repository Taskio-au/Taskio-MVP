'use strict';

const express = require('express');
const request = require('supertest');

const VALID_ABN = '51824753556';
const LEAK_GUID = 'leak-guid-SECRETVALUE-do-not-log';

const state = {
  collections: new Map(),
  userWrites: [],
};

function resetState() {
  state.collections = new Map();
  state.userWrites = [];
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
      if (collectionName === 'users') {
        state.userWrites.push({
          id: docId,
          existed: readDoc(collectionName, docId) !== undefined,
          payload: clone(payload),
        });
      }
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
    },
  },
  db: {
    collection: jest.fn((name) => ({
      doc: (id) => mockMakeDocRef(name, id),
      where() {
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

global.__TASKIO_ABN_TEST_AUTH__ = {
  uid: 'tradie-abn-1',
  role: 'tradie',
  email: 'tradie@example.com',
  email_verified: true,
};

jest.mock('../src/middleware/auth', () => ({
  requireAuth: (req, _res, next) => {
    req.user = { ...global.__TASKIO_ABN_TEST_AUTH__ };
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
  lookupAbnDetails: jest.fn(),
}));

jest.mock('../src/utils/auditLogs', () => ({
  writeUserAuditLog: jest.fn(async () => {}),
}));

const { lookupAbnDetails } = require('../src/services/abnLookup');
const meRoutes = require('../src/routes/me');

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use(meRoutes);
  return app;
}

function seedUser(uid, overrides = {}) {
  writeDoc('users', uid, {
    role: 'tradie',
    status: 'active',
    verified: false,
    privateDetailsLocked: false,
    phoneVerified: true,
    emailVerified: true,
    businessType: 'sole_trader',
    businessName: '',
    abn: VALID_ABN,
    abnVerified: false,
    dob: { day: 1, month: 1, year: 1990 },
    ...overrides,
  });
}

describe('POST /api/me/abn/verify', () => {
  let app;
  let errorSpy;

  beforeEach(() => {
    resetState();
    lookupAbnDetails.mockReset();
    global.__TASKIO_ABN_TEST_AUTH__ = {
      uid: 'tradie-abn-1',
      role: 'tradie',
      email: 'tradie@example.com',
      email_verified: true,
    };
    app = buildApp();
    errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    errorSpy.mockRestore();
  });

  it('allows a tradie to reach validation before ABR lookup', async () => {
    seedUser('tradie-abn-1');

    const res = await request(app)
      .post('/api/me/abn/verify')
      .send({ abn: '123' });

    expect(res.status).toBe(400);
    expect(res.body.message).toBe('ABN is invalid.');
    expect(lookupAbnDetails).not.toHaveBeenCalled();
  });

  it('forbids homeowners from verifying an ABN', async () => {
    global.__TASKIO_ABN_TEST_AUTH__ = {
      uid: 'homeowner-1',
      role: 'homeowner',
      email: 'homeowner@example.com',
      email_verified: true,
    };
    writeDoc('users', 'homeowner-1', { role: 'homeowner', status: 'active' });

    const res = await request(app)
      .post('/api/me/abn/verify')
      .send({ abn: VALID_ABN });

    expect(res.status).toBe(403);
    expect(res.body.message).toMatch(/Requires role tradie/i);
    expect(lookupAbnDetails).not.toHaveBeenCalled();
  });

  it('marks an Active ABN as verified without requiring GST', async () => {
    seedUser('tradie-abn-1');
    lookupAbnDetails.mockResolvedValue({
      abn: VALID_ABN,
      entityName: 'Example Pty Ltd',
      entityTypeName: 'Australian Private Company',
      entityStatus: 'Active',
      gst: '',
    });

    const res = await request(app)
      .post('/api/me/abn/verify')
      .send({ abn: VALID_ABN });

    expect(res.status).toBe(200);
    expect(res.body.message).toBe('ABN verified.');
    expect(res.body.details.entityStatus).toBe('Active');
    expect(readDoc('users', 'tradie-abn-1').abnVerified).toBe(true);
    expect(readDoc('users', 'tradie-abn-1').abnEntityStatus).toBe('Active');
  });

  it('rejects a cancelled ABN and does not mark it verified', async () => {
    seedUser('tradie-cancelled');
    global.__TASKIO_ABN_TEST_AUTH__.uid = 'tradie-cancelled';
    lookupAbnDetails.mockResolvedValue({
      abn: VALID_ABN,
      entityName: 'Former Pty Ltd',
      entityTypeName: 'Australian Private Company',
      entityStatus: 'Cancelled',
      gst: '2000-07-01',
    });

    const res = await request(app)
      .post('/api/me/abn/verify')
      .send({ abn: VALID_ABN });

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/not currently active/i);
    expect(readDoc('users', 'tradie-cancelled').abnVerified).toBe(false);
    expect(readDoc('users', 'tradie-cancelled').abnEntityStatus).toBe('Cancelled');
    expect(readDoc('users', 'tradie-cancelled').abnVerifiedAt).toBeNull();
  });

  it('rejects an inactive ABN and does not mark it verified', async () => {
    seedUser('tradie-inactive');
    global.__TASKIO_ABN_TEST_AUTH__.uid = 'tradie-inactive';
    lookupAbnDetails.mockResolvedValue({
      abn: VALID_ABN,
      entityName: 'Paused Pty Ltd',
      entityTypeName: 'Australian Private Company',
      entityStatus: 'Inactive',
      gst: '',
    });

    const res = await request(app)
      .post('/api/me/abn/verify')
      .send({ abn: VALID_ABN });

    expect(res.status).toBe(400);
    expect(readDoc('users', 'tradie-inactive').abnVerified).toBe(false);
  });

  it('rejects an ABN that ABR does not find', async () => {
    seedUser('tradie-notfound');
    global.__TASKIO_ABN_TEST_AUTH__.uid = 'tradie-notfound';
    const err = new Error('ABN not found on the Australian Business Register.');
    err.code = 'ABN_NOT_FOUND';
    lookupAbnDetails.mockRejectedValue(err);

    const res = await request(app)
      .post('/api/me/abn/verify')
      .send({ abn: VALID_ABN });

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/not found/i);
    expect(readDoc('users', 'tradie-notfound').abnVerified).toBe(false);
  });

  it('fails safely on a malformed ABR response without marking verified', async () => {
    seedUser('tradie-malformed');
    global.__TASKIO_ABN_TEST_AUTH__.uid = 'tradie-malformed';
    const err = new Error('ABN lookup returned an invalid response.');
    err.code = 'ABN_LOOKUP_PARSE_ERROR';
    err.config = {
      url: `https://abr.business.gov.au/json/AbnDetails.aspx?guid=${LEAK_GUID}`,
      params: { guid: LEAK_GUID },
    };
    lookupAbnDetails.mockRejectedValue(err);

    const res = await request(app)
      .post('/api/me/abn/verify')
      .send({ abn: VALID_ABN });

    expect(res.status).toBe(502);
    expect(res.body.message).toMatch(/temporarily unavailable/i);
    expect(readDoc('users', 'tradie-malformed').abnVerified).toBe(false);

    const logged = errorSpy.mock.calls.map((args) => JSON.stringify(args)).join('\n');
    expect(logged).not.toContain(LEAK_GUID);
    expect(logged).not.toMatch(/guid=/i);
  });

  it('returns 429 after the dedicated ABN verify limit without calling ABR', async () => {
    seedUser('tradie-rate-limit');
    global.__TASKIO_ABN_TEST_AUTH__.uid = 'tradie-rate-limit';
    lookupAbnDetails.mockResolvedValue({
      abn: VALID_ABN,
      entityName: 'Example Pty Ltd',
      entityTypeName: 'Australian Private Company',
      entityStatus: 'Active',
      gst: '',
    });

    for (let i = 0; i < 20; i += 1) {
      const ok = await request(app)
        .post('/api/me/abn/verify')
        .send({ abn: VALID_ABN });
      expect(ok.status).toBe(200);
    }

    lookupAbnDetails.mockClear();
    const limited = await request(app)
      .post('/api/me/abn/verify')
      .send({ abn: VALID_ABN });

    expect(limited.status).toBe(429);
    expect(limited.body.message).toMatch(/Too many ABN verification attempts/i);
    expect(lookupAbnDetails).not.toHaveBeenCalled();
  });

  it('rejects ABN verify for a missing profile without creating a user', async () => {
    const res = await request(app)
      .post('/api/me/abn/verify')
      .send({ abn: VALID_ABN });

    expect(res.status).toBe(403);
    expect(res.body.code).toBe('account_not_enrolled');
    expect(readDoc('users', 'tradie-abn-1')).toBeUndefined();
    expect(state.userWrites).toHaveLength(0);
    expect(lookupAbnDetails).not.toHaveBeenCalled();
  });

  it('rejects ABN verify for a malformed profile without writing', async () => {
    writeDoc('users', 'tradie-abn-1', { displayName: 'Stub expert' });

    const res = await request(app)
      .post('/api/me/abn/verify')
      .send({ abn: VALID_ABN });

    expect(res.status).toBe(409);
    expect(res.body.code).toBe('account_state_invalid');
    expect(readDoc('users', 'tradie-abn-1')).toEqual({ displayName: 'Stub expert' });
    expect(state.userWrites).toHaveLength(0);
    expect(lookupAbnDetails).not.toHaveBeenCalled();
  });
});
