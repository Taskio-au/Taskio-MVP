'use strict';

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
    auth: jest.fn(() => ({
      verifyIdToken: jest.fn(),
    })),
  },
  db: {
    collection: jest.fn((name) => ({
      doc: (id) => mockMakeDocRef(name, id),
    })),
  },
}));

/** @type {string} */
let mockTokenRole = 'tradie';

jest.mock('../src/middleware/auth', () => ({
  requireAuth: (req, _res, next) => {
    req.user = {
      uid: 'tradie-1',
      role: mockTokenRole,
      email: 'tradie@example.com',
    };
    next();
  },
  requireRole: (role) => (req, res, next) => {
    const userRole = req.user?.role;
    if (userRole !== role) {
      return res.status(403).send({
        message: `Forbidden: Requires role ${role}. Please re-login, or ensure your account was created via /api/users/register.`,
      });
    }
    next();
  },
}));

const tradieRoutes = require('../src/routes/tradie');
const { testProgramId } = require('../../shared/feePlans');

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use(tradieRoutes);
  return app;
}

function seedUser(overrides = {}) {
  writeDoc('users', 'tradie-1', {
    role: 'tradie',
    status: 'active',
    verified: false,
    ...overrides,
  });
}

describe('POST /api/tradie/fee-estimate', () => {
  let app;

  beforeEach(() => {
    resetState();
    mockTokenRole = 'tradie';
    app = buildApp();
  });

  it('returns 0% estimate for founding first-three Experts', async () => {
    seedUser({
      foundingExpert: {
        status: 'active',
        programId: testProgramId,
        zeroFeeSlotsUsed: 0,
      },
    });

    const res = await request(app).post('/api/tradie/fee-estimate').send({ grossAmountCents: 15000 });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      grossAmountCents: 15000,
      taskioFeeCents: 0,
      expertReceivesCents: 15000,
      expertFeeBps: 0,
      stage: 'founding_first_three',
      benefitLabel: 'Founding Expert offer',
      estimateOnly: true,
      finalisedWhen: 'client_funds_task',
    });
    expect(res.body.copy?.feeLine).toMatch(/Taskio fee:.*0(?:\.00)?/);
  });

  it('returns 7.5% estimate with correct rounding', async () => {
    seedUser({
      foundingExpert: {
        status: 'active',
        programId: testProgramId,
        zeroFeeSlotsUsed: 3,
        reducedFeeEndsAt: new Date('2099-12-31T00:00:00.000Z'),
      },
    });

    const res = await request(app).post('/api/tradie/fee-estimate').send({ grossAmountCents: 15000 });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      taskioFeeCents: 1125,
      expertReceivesCents: 13875,
      expertFeeBps: 750,
      stage: 'founding_reduced',
      benefitLabel: 'Reduced Founding Expert fee',
    });
  });

  it('returns 10% estimate for standard Experts', async () => {
    seedUser({});
    const res = await request(app).post('/api/tradie/fee-estimate').send({ grossAmountCents: 15000 });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      taskioFeeCents: 1500,
      expertReceivesCents: 13500,
      expertFeeBps: 1000,
      stage: 'standard_launch',
      benefitLabel: 'Standard launch fee',
    });
  });

  it('removed founding uses 10%', async () => {
    seedUser({
      foundingExpert: {
        status: 'removed',
        programId: testProgramId,
        zeroFeeSlotsUsed: 0,
      },
    });
    const res = await request(app).post('/api/tradie/fee-estimate').send({ grossAmountCents: 15000 });

    expect(res.status).toBe(200);
    expect(res.body.expertFeeBps).toBe(1000);
    expect(res.body.taskioFeeCents).toBe(1500);
  });

  it('test_reset founding uses 10%', async () => {
    seedUser({
      foundingExpert: {
        status: 'test_reset',
        programId: testProgramId,
        zeroFeeSlotsUsed: 0,
      },
    });
    const res = await request(app).post('/api/tradie/fee-estimate').send({ grossAmountCents: 15000 });

    expect(res.status).toBe(200);
    expect(res.body.expertFeeBps).toBe(1000);
  });

  it('rejects invalid grossAmountCents', async () => {
    seedUser({});

    for (const gross of ['15000', 0, -1, 10.5, null, {}, undefined]) {
      const res = await request(app).post('/api/tradie/fee-estimate').send({ grossAmountCents: gross });
      expect(res.status).toBe(400);
    }
    const ok = await request(app).post('/api/tradie/fee-estimate').send({ grossAmountCents: 1 });
    expect(ok.status).toBe(200);
  });

  it('rejects missing body grossAmountCents', async () => {
    seedUser({});
    const res = await request(app).post('/api/tradie/fee-estimate').send({});
    expect(res.status).toBe(400);
  });

  it('returns 403 for non-tradie token role when guard applies', async () => {
    mockTokenRole = 'homeowner';
    seedUser({ role: 'homeowner' });

    const res = await request(app).post('/api/tradie/fee-estimate').send({ grossAmountCents: 100 });

    expect(res.status).toBe(403);
  });
});
