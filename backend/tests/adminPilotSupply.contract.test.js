'use strict';

const express = require('express');
const request = require('supertest');

function eligibleExpert(overrides = {}) {
  return {
    role: 'tradie',
    status: 'active',
    verified: true,
    emailVerified: true,
    phoneVerified: true,
    businessType: 'individual',
    stripe: { onboardingComplete: true },
    profileCompleted: true,
    displayName: 'Alex Expert',
    bio: 'x'.repeat(20),
    photoURL: 'https://example.com/photo.jpg',
    expertiseApproved: ['mounting_tv'],
    serviceLocation: { suburb: 'Melbourne', state: 'VIC', postcode: '3000' },
    dob: { day: 1, month: 1, year: 1990 },
    acceptingJobs: true,
    serviceAreas: ['Richmond'],
    ...overrides,
  };
}

const mockDocs = [];
for (let i = 0; i < 55; i += 1) {
  mockDocs.push({
    id: `tradie-${String(i).padStart(3, '0')}`,
    data: eligibleExpert({
      acceptingJobs: i < 20,
      serviceAreas: i < 20 ? ['Richmond'] : [],
    }),
  });
}

function mockMakeUserQuery(docs, afterId = null) {
  const chain = {
    _after: afterId,
    _limit: 100,
    where() { return chain; },
    orderBy() { return chain; },
    limit(n) {
      chain._limit = n;
      return chain;
    },
    startAfter(doc) {
      return mockMakeUserQuery(docs, doc.id);
    },
    async get() {
      let start = 0;
      if (chain._after) {
        start = docs.findIndex((row) => row.id === chain._after) + 1;
      }
      const slice = docs.slice(start, start + chain._limit);
      return {
        empty: slice.length === 0,
        docs: slice.map((row) => ({
          id: row.id,
          data: () => row.data,
        })),
      };
    },
  };
  return chain;
}

jest.mock('../src/firebaseAdmin', () => ({
  admin: {
    firestore: {
      FieldPath: { documentId: () => '__name__' },
      FieldValue: { serverTimestamp: jest.fn(() => '__server_ts__') },
    },
  },
  db: {
    collection: jest.fn((name) => {
      if (name !== 'users') {
        return { doc: () => ({ async get() { return { exists: false, data: () => ({}) }; } }) };
      }
      return {
        where() { return mockMakeUserQuery(mockDocs); },
      };
    }),
  },
}));

jest.mock('../src/middleware/auth', () => ({
  requireAuth: (req, _res, next) => {
    req.user = { uid: 'admin-1', admin: req.headers['x-test-admin'] !== 'false' };
    next();
  },
  requireAdmin: (req, res, next) => {
    if (req.user?.admin) return next();
    return res.status(403).send({ message: 'Forbidden: Requires admin privileges' });
  },
}));

const { listAllPilotExperts } = require('../src/services/pilotSupplyService');
const { db } = require('../src/firebaseAdmin');
const pilotSupplyRoutes = require('../src/routes/admin/pilotSupplyRoutes');

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use(pilotSupplyRoutes);
  return app;
}

describe('Admin pilot supply readiness', () => {
  it('pages past the UI limit of 50 when aggregating Experts', async () => {
    const listed = await listAllPilotExperts(db, { pageSize: 20, cap: 250 });
    expect(listed.scanned).toBe(55);
    expect(listed.truncated).toBe(false);
  });

  it('returns supply counts that include Experts beyond the first page', async () => {
    const app = buildApp();
    const res = await request(app).get('/api/admin/pilot-supply');
    expect(res.status).toBe(200);
    expect(res.body.totals.experts).toBe(55);
    expect(res.body.totals.launchReady).toBe(20);
    expect(res.body.totals.technicallyEligible).toBe(55);
    expect(res.body.targets.launchReady).toBe(15);
    expect(res.body.targets.afterActivationFloor).toBe(12);
    expect(res.body.targets.categoryCoverageMinimum).toBe(4);
    expect(res.body.targets.categoryCoverageTarget).toBe(5);
    expect(res.body.totals.truncated).toBe(false);
    expect(res.body.totals.scanComplete).toBe(true);
    const richmond = res.body.geographyCoverage.find((row) => row.area === 'Richmond');
    expect(richmond.launchReadyCount).toBe(20);
    const mounting = res.body.categoryCoverage.find((row) => row.category === 'Mounting');
    expect(mounting.launchReadyCount).toBe(20);
    expect(mounting.minimum).toBe(4);
    expect(mounting.target).toBe(5);
    expect(mounting.status).toBe('HEALTHY');
  });

  it('rejects non-admin callers', async () => {
    const app = buildApp();
    const res = await request(app)
      .get('/api/admin/pilot-supply')
      .set('x-test-admin', 'false');
    expect(res.status).toBe(403);
  });
});
