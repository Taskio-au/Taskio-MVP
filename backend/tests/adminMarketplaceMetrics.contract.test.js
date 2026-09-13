'use strict';

const express = require('express');
const request = require('supertest');

function jobDoc(id, data) {
  return { id, data };
}

const nowMs = Date.now();
const twoDaysAgo = nowMs - (2 * 24 * 60 * 60 * 1000);

const mockJobs = [
  jobDoc('job-ready', {
    status: 'OPEN',
    postingReady: true,
    invitedTradieUids: ['expert-1'],
    createdAt: twoDaysAgo,
    quoteReadyAt: twoDaysAgo,
  }),
  jobDoc('job-not-ready', {
    status: 'OPEN',
    postingReady: false,
    invitedTradieUids: [],
    createdAt: twoDaysAgo,
  }),
];

const mockQuotes = [
  {
    id: 'q-1',
    data: {
      jobId: 'job-ready',
      tradieUid: 'expert-1',
      status: 'submitted',
      createdAt: twoDaysAgo + (30 * 60 * 1000),
    },
  },
];

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
      firstName: 'Alex',
      lastName: 'Expert',
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

const marketplaceMetricsRoutes = require('../src/routes/admin/marketplaceMetricsRoutes');

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use(marketplaceMetricsRoutes);
  return app;
}

describe('GET /api/admin/marketplace-metrics', () => {
  it('rejects non-admin callers', async () => {
    const res = await request(buildApp())
      .get('/api/admin/marketplace-metrics')
      .set('x-test-admin', 'false');
    expect(res.status).toBe(403);
  });

  it('returns quote-health, funnel, and Expert rows without payment secrets', async () => {
    const res = await request(buildApp()).get('/api/admin/marketplace-metrics?range=7d');
    expect(res.status).toBe(200);
    expect(res.body.range).toBe('7d');
    expect(res.body.scanComplete).toBe(true);
    expect(res.body.quoteHealth.quoteReadyJobs).toBe(1);
    expect(res.body.quoteHealth.oneQuoteJobs).toBe(1);
    expect(res.body.funnel.oneQuote).toBe(1);
    expect(res.body.experts[0].uid).toBe('expert-1');
    expect(res.body.experts[0].displayName).toBe('Alex Expert');
    const serialized = JSON.stringify(res.body);
    expect(serialized).not.toMatch(/sk_live_|whsec_|cardNumber|client_secret/);
    expect(res.body.experts.every((row) => !row.email && !row.phone)).toBe(true);
  });
});
