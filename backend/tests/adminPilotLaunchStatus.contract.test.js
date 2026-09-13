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

const mockExperts = [
  { id: 'expert-1', data: eligibleExpert() },
];

function mockPageQuery(docs, afterId = null) {
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
      return mockPageQuery(docs, doc.id);
    },
    async get() {
      let start = 0;
      if (chain._after) start = docs.findIndex((row) => row.id === chain._after) + 1;
      const slice = docs.slice(Math.max(0, start), Math.max(0, start) + chain._limit);
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
    },
  },
  db: {
    collection: jest.fn((name) => {
      if (name === 'users') return mockPageQuery(mockExperts);
      return { doc: () => ({ async get() { return { exists: false, data: () => ({}) }; } }) };
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

const pilotLaunchStatusRoutes = require('../src/routes/admin/pilotLaunchStatusRoutes');

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use(pilotLaunchStatusRoutes);
  return app;
}

describe('GET /api/admin/pilot-launch-readiness', () => {
  it('rejects non-admin callers', async () => {
    const res = await request(buildApp())
      .get('/api/admin/pilot-launch-readiness')
      .set('x-test-admin', 'false');
    expect(res.status).toBe(403);
  });

  it('returns a read-only NOT READY snapshot without secrets or an activate control', async () => {
    const res = await request(buildApp()).get('/api/admin/pilot-launch-readiness');
    expect(res.status).toBe(200);
    expect(res.body.overallStatus).toBe('NOT READY');
    expect(res.body.posting.state).toBe('CLOSED');
    expect(res.body.posting.activateAvailable).toBe(false);
    expect(Array.isArray(res.body.gates)).toBe(true);
    expect(res.body.gates.some((gate) => gate.id === 'P11' && gate.required === false)).toBe(true);
    expect(res.body.blockers.length).toBeGreaterThan(0);
    const serialized = JSON.stringify(res.body);
    expect(serialized).not.toMatch(/sk_live_|whsec_|SMTP_PASS|client_secret/);
  });
});
