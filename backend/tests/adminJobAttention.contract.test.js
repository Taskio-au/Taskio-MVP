'use strict';

const express = require('express');
const request = require('supertest');

function jobDoc(id, data) {
  return { id, data };
}

const mockJobs = [
  jobDoc('job-open-old', {
    status: 'OPEN',
    primaryCategory: 'Mounting',
    locationSuburb: 'Richmond',
    invitedTradieUids: ['expert-1'],
    createdAt: Date.UTC(2026, 8, 13, 10, 0, 0),
  }),
  jobDoc('job-paid', {
    status: 'PAID',
    primaryCategory: 'Mounting',
    locationSuburb: 'Richmond',
    invitedTradieUids: [],
    createdAt: Date.UTC(2026, 8, 1, 10, 0, 0),
  }),
];

const mockQuotes = [];

const mockExperts = [
  {
    id: 'expert-1',
    data: {
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
    },
  },
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
      if (name === 'jobs') return mockPageQuery(mockJobs);
      if (name === 'users') return mockPageQuery(mockExperts);
      if (name === 'quotes') {
        return {
          where() {
            return {
              async get() {
                return {
                  empty: mockQuotes.length === 0,
                  docs: mockQuotes.map((row) => ({
                    id: row.id,
                    data: () => row.data,
                  })),
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

const jobAttentionRoutes = require('../src/routes/admin/jobAttentionRoutes');
const { buildLaunchReadyIndex } = require('../src/services/jobAttentionService');

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use(jobAttentionRoutes);
  return app;
}

describe('GET /api/admin/job-attention', () => {
  it('rejects non-admin callers', async () => {
    const res = await request(buildApp())
      .get('/api/admin/job-attention')
      .set('x-test-admin', 'false');
    expect(res.status).toBe(403);
  });

  it('returns a bounded attention snapshot without payment secrets', async () => {
    const res = await request(buildApp()).get('/api/admin/job-attention');
    expect(res.status).toBe(200);
    expect(res.body.totals.scanComplete).toBe(true);
    expect(res.body.totals.truncated).toBe(false);
    expect(Array.isArray(res.body.jobs)).toBe(true);
    expect(res.body.jobs.some((row) => row.jobId === 'job-paid')).toBe(false);
    const serialized = JSON.stringify(res.body);
    expect(serialized).not.toMatch(/sk_live_|whsec_|cardNumber|client_secret/);
    expect(res.body.jobs.every((row) => !row.homeownerEmail && !row.paymentIntentId)).toBe(true);
  });
});

describe('buildLaunchReadyIndex', () => {
  it('excludes technically ineligible, paused, and area-less Experts', () => {
    const eligible = mockExperts[0].data;
    const index = buildLaunchReadyIndex([
      { uid: 'ready', data: eligible },
      { uid: 'paused', data: { ...eligible, acceptingJobs: false } },
      { uid: 'unverified', data: { ...eligible, verified: false } },
      { uid: 'no-area', data: { ...eligible, serviceAreas: [] } },
    ]);
    expect(index).toHaveLength(1);
    expect(index[0].serviceAreas.has('Richmond')).toBe(true);
  });
});
