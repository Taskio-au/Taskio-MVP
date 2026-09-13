'use strict';

const express = require('express');
const request = require('supertest');

const state = {
  collections: new Map(),
};

function getCollectionStore(name) {
  const key = String(name);
  if (!state.collections.has(key)) state.collections.set(key, new Map());
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
    async update(payload) {
      const existing = readDoc(collectionName, docId);
      if (existing === undefined) {
        const err = new Error('NOT_FOUND');
        err.code = 5;
        throw err;
      }
      writeDoc(collectionName, docId, { ...existing, ...(clone(payload) || {}) });
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
      },
    },
    auth: jest.fn(() => ({
      updateUser: jest.fn(),
    })),
  },
  db: {
    collection: jest.fn((name) => ({
      doc: (id) => mockMakeDocRef(name, id),
      where() {
        return {
          where() { return this; },
          limit() {
            return { async get() { return { empty: true, docs: [] }; } };
          },
        };
      },
    })),
  },
}));

global.__TASKIO_PILOT_ME_AUTH__ = {
  uid: 'tradie-1',
  role: 'tradie',
  email: 'tradie@example.com',
  email_verified: true,
};

jest.mock('../src/middleware/auth', () => ({
  requireAuth: (req, _res, next) => {
    req.user = { ...global.__TASKIO_PILOT_ME_AUTH__ };
    next();
  },
  requireRole: (role) => (req, res, next) => {
    if (req.user?.role === role) return next();
    return res.status(403).send({ message: `Forbidden: Requires role ${role}.` });
  },
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

function seedExpert(overrides = {}) {
  writeDoc('users', 'tradie-1', {
    role: 'tradie',
    status: 'active',
    verified: true,
    privateDetailsLocked: false,
    phoneVerified: true,
    emailVerified: true,
    businessType: 'individual',
    businessName: '',
    displayName: 'Alex Expert',
    bio: 'Experienced indoor handyperson.',
    photoURL: 'https://example.com/photo.jpg',
    expertiseApproved: ['mounting_tv'],
    dob: { day: 1, month: 1, year: 1990 },
    serviceLocation: { suburb: 'Melbourne', state: 'VIC', postcode: '3000' },
    ...overrides,
  });
}

describe('Expert pilot operational profile fields', () => {
  let app;

  beforeEach(() => {
    state.collections = new Map();
    global.__TASKIO_PILOT_ME_AUTH__ = {
      uid: 'tradie-1',
      role: 'tradie',
      email: 'tradie@example.com',
      email_verified: true,
    };
    app = buildApp();
  });

  it('reads missing acceptingJobs/serviceAreas conservatively', async () => {
    seedExpert();
    const res = await request(app).get('/api/me');
    expect(res.status).toBe(200);
    expect(res.body.profile.acceptingJobs).toBe(false);
    expect(res.body.profile.serviceAreas).toEqual([]);
    expect(res.body.eligibility.launchReady).toBe(false);
    expect(res.body.eligibility.launchReasons).toEqual(expect.arrayContaining([
      'NOT_ACCEPTING_JOBS',
      'NO_SERVICE_AREA',
    ]));
  });

  it('saves acceptingJobs true/false and canonical service areas', async () => {
    seedExpert();
    const res = await request(app)
      .put('/api/me/profile')
      .send({ acceptingJobs: true, serviceAreas: ['Richmond', 'Carlton'] });
    expect(res.status).toBe(200);
    expect(readDoc('users', 'tradie-1').acceptingJobs).toBe(true);
    expect(readDoc('users', 'tradie-1').serviceAreas).toEqual(['Richmond', 'Carlton']);
    expect(res.body.eligibility.launchReady).toBe(true);
  });

  it('rejects invalid acceptingJobs type', async () => {
    seedExpert();
    const res = await request(app).put('/api/me/profile').send({ acceptingJobs: 'yes' });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('INVALID_ACCEPTING_JOBS');
  });

  it('rejects unsupported service areas and does not write them', async () => {
    seedExpert({ acceptingJobs: false, serviceAreas: [] });
    const res = await request(app)
      .put('/api/me/profile')
      .send({ serviceAreas: ['Richmond', 'Geelong'] });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('UNSUPPORTED_SERVICE_AREA');
    expect(readDoc('users', 'tradie-1').serviceAreas).toEqual([]);
  });

  it('dedupes service areas on write', async () => {
    seedExpert();
    const res = await request(app)
      .put('/api/me/profile')
      .send({ serviceAreas: ['Richmond', 'richmond'] });
    expect(res.status).toBe(200);
    expect(readDoc('users', 'tradie-1').serviceAreas).toEqual(['Richmond']);
  });

  it('allows empty serviceAreas without becoming launch-ready', async () => {
    seedExpert({ acceptingJobs: true });
    const res = await request(app).put('/api/me/profile').send({ serviceAreas: [] });
    expect(res.status).toBe(200);
    expect(readDoc('users', 'tradie-1').serviceAreas).toEqual([]);
    expect(res.body.eligibility.launchReady).toBe(false);
    expect(res.body.eligibility.launchReasons).toContain('NO_SERVICE_AREA');
  });

  it('does not let a homeowner update Expert operational fields', async () => {
    writeDoc('users', 'home-1', {
      role: 'homeowner',
      status: 'active',
      emailVerified: true,
    });
    global.__TASKIO_PILOT_ME_AUTH__ = {
      uid: 'home-1',
      role: 'homeowner',
      email: 'home@example.com',
      email_verified: true,
    };
    const res = await request(app)
      .put('/api/me/profile')
      .send({ acceptingJobs: true, serviceAreas: ['Richmond'] });
    expect(res.status).toBe(403);
    expect(readDoc('users', 'home-1').acceptingJobs).toBeUndefined();
  });

  it('updates only the authenticated Expert and ignores privilege fields', async () => {
    seedExpert({ verified: true, role: 'tradie', status: 'active' });
    writeDoc('users', 'tradie-2', {
      role: 'tradie',
      status: 'active',
      acceptingJobs: false,
    });
    const res = await request(app)
      .put('/api/me/profile')
      .send({
        acceptingJobs: true,
        serviceAreas: ['Carlton'],
        verified: false,
        role: 'admin',
        status: 'disabled',
        stripe: { onboardingComplete: true },
        launchReady: true,
      });
    expect(res.status).toBe(200);
    const mine = readDoc('users', 'tradie-1');
    expect(mine.acceptingJobs).toBe(true);
    expect(mine.verified).toBe(true);
    expect(mine.role).toBe('tradie');
    expect(mine.status).toBe('active');
    expect(mine.launchReady).toBeUndefined();
    expect(readDoc('users', 'tradie-2').acceptingJobs).toBe(false);
  });
});
