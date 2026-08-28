'use strict';

/**
 * Contract tests for GET /api/jobs/:jobId/quotes — Phase 5 expert enrichment.
 *
 * Verifies:
 * - Each quote contains a safe `expert` object with only allow-listed fields
 * - PII fields never appear at the quote level or inside `expert`
 * - Rating aggregates are derived from the reviews subcollection
 * - Edge cases: missing user doc, bio with PII, businessName gating, verified flag
 */

const express = require('express');
const request = require('supertest');

// ---------------------------------------------------------------------------
// In-memory state
// ---------------------------------------------------------------------------
const mockCollections = new Map();
const mockSubcollections = new Map();

function mockGetStore(name) {
  if (!mockCollections.has(name)) mockCollections.set(name, new Map());
  return mockCollections.get(name);
}

function mockSubKey(parentCol, parentId, subCol) {
  return `${parentCol}/${parentId}/${subCol}`;
}

function mockGetSubStore(parentCol, parentId, subCol) {
  const key = mockSubKey(parentCol, parentId, subCol);
  if (!mockSubcollections.has(key)) mockSubcollections.set(key, new Map());
  return mockSubcollections.get(key);
}

function mockClone(v) {
  return v === undefined ? undefined : JSON.parse(JSON.stringify(v));
}

function seedDoc(col, id, data) {
  mockGetStore(col).set(id, { id, ...mockClone(data) });
}

function seedSubDoc(parentCol, parentId, subCol, docId, data) {
  mockGetSubStore(parentCol, parentId, subCol).set(docId, { id: docId, ...mockClone(data) });
}

function seedReview(tradieUid, jobId, rating) {
  seedSubDoc('users', tradieUid, 'reviews', jobId, { jobId, rating });
}

const mockCurrentUser = {
  uid: 'homeowner-1',
  role: 'homeowner',
  email: '',
  email_verified: false,
};

// ---------------------------------------------------------------------------
// Firestore mock — supports top-level docs, where queries, subcollections, getAll
// ---------------------------------------------------------------------------
jest.mock('../src/firebaseAdmin', () => ({
  admin: {
    firestore: { FieldValue: { serverTimestamp: jest.fn(() => '__ts__') } },
  },
  db: {
    collection: jest.fn((colName) => {
      function makeDocRef(docId) {
        return {
          get: jest.fn(async () => {
            const existing = mockGetStore(colName).get(docId);
            return { exists: !!existing, data: () => mockClone(existing || {}) };
          }),
          update: jest.fn(async () => {}),
          set: jest.fn(async () => {}),
          collection: jest.fn((subCol) => {
            const subStore = mockGetSubStore(colName, docId, subCol);
            return {
              orderBy: jest.fn().mockReturnThis(),
              limit: jest.fn().mockReturnThis(),
              select: jest.fn().mockReturnThis(),
              get: jest.fn(async () => {
                const rows = Array.from(subStore.values()).map((r) => ({
                  id: r.id,
                  data: () => mockClone(r),
                }));
                return { empty: rows.length === 0, docs: rows, size: rows.length };
              }),
            };
          }),
        };
      }

      return {
        doc: jest.fn((id) => makeDocRef(id)),
        where: jest.fn((field, _op, value) => ({
          get: jest.fn(async () => {
            const rows = Array.from(mockGetStore(colName).entries())
              .map(([id, data]) => ({ id, ...mockClone(data) }))
              .filter((row) => row[field] === value)
              .map((row) => ({ id: row.id, data: () => mockClone(row) }));
            return { empty: rows.length === 0, docs: rows, size: rows.length };
          }),
        })),
        add: jest.fn(async (payload) => {
          const id = `${colName}-${mockGetStore(colName).size + 1}`;
          mockGetStore(colName).set(id, { id, ...mockClone(payload) });
          return { id };
        }),
      };
    }),
    // Batch user doc fetch used by the quotes enrichment
    getAll: jest.fn(async (...refs) => Promise.all(refs.map((r) => r.get()))),
    runTransaction: jest.fn(async (cb) =>
      cb({
        get: (ref) => ref.get(),
        set: (ref, data, opts) => ref.set(data, opts),
        update: (ref, data) => ref.update(data),
      })
    ),
  },
}));

jest.mock('../src/middleware/auth', () => ({
  requireAuth: (req, _res, next) => {
    req.user = { ...mockCurrentUser };
    next();
  },
  requireRole: (role) => (req, res, next) => {
    if (req.user?.role !== role) return res.status(403).send({ message: 'Forbidden' });
    return next();
  },
}));

jest.mock('../src/services/stripe', () => ({
  createPaymentIntent: jest.fn(),
  retrievePaymentIntent: jest.fn(),
  retrieveCheckoutSession: jest.fn(),
  createExpressAccount: jest.fn(),
  createAccountLink: jest.fn(),
  retrieveAccount: jest.fn(),
  createTransfer: jest.fn(),
  createRefund: jest.fn(),
  getSucceededChargeIdForConnectTransfer: jest.fn(),
}));

jest.mock('../src/utils/firestore', () => ({
  safeToMillis: jest.fn((v) => Number(v?._seconds || v?.seconds || v || 0)),
}));

const jobsRoutes = require('../src/routes/jobs');

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use(jobsRoutes);
  return app;
}

// ---------------------------------------------------------------------------
// Shared setup
// ---------------------------------------------------------------------------
function seedBaseJob() {
  seedDoc('users', 'homeowner-1', {
    role: 'homeowner',
    status: 'active',
    quoteAccessVerified: true,
    phoneVerified: true,
  });
  seedDoc('jobs', 'job-1', { homeownerUid: 'homeowner-1', status: 'QUOTED' });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe('GET /api/jobs/:jobId/quotes — Phase 5 expert enrichment', () => {
  let app;

  beforeEach(() => {
    mockCollections.clear();
    mockSubcollections.clear();
    app = buildApp();
  });

  it('two quotes from different experts each receive their own expert object', async () => {
    seedBaseJob();
    seedDoc('users', 'expert-a', { firstName: 'Alice', lastName: 'Smith', verified: true });
    seedDoc('users', 'expert-b', { firstName: 'Bob', lastName: 'Jones', verified: false });
    seedDoc('quotes', 'q-a', { jobId: 'job-1', tradieUid: 'expert-a', amount: 100, status: 'submitted' });
    seedDoc('quotes', 'q-b', { jobId: 'job-1', tradieUid: 'expert-b', amount: 200, status: 'submitted' });

    const res = await request(app).get('/api/jobs/job-1/quotes');

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(2);

    const expertA = res.body.find((q) => q.tradieUid === 'expert-a')?.expert;
    const expertB = res.body.find((q) => q.tradieUid === 'expert-b')?.expert;

    expect(expertA).toBeDefined();
    expect(expertA.firstName).toBe('Alice');
    expect(expertA.lastInitial).toBe('S.');
    expect(expertA.verified).toBe(true);

    expect(expertB).toBeDefined();
    expect(expertB.firstName).toBe('Bob');
    expect(expertB.lastInitial).toBe('J.');
    expect(expertB.verified).toBe(false);
  });

  it('rating and reviewsCount come from the reviews subcollection aggregate', async () => {
    seedBaseJob();
    seedDoc('users', 'expert-1', { firstName: 'Dana', lastName: 'Lee' });
    seedReview('expert-1', 'job-r1', 5);
    seedReview('expert-1', 'job-r2', 4);
    seedReview('expert-1', 'job-r3', 3);
    // avg = (5+4+3)/3 = 4.0
    seedDoc('quotes', 'q-1', { jobId: 'job-1', tradieUid: 'expert-1', amount: 150, status: 'submitted' });

    const res = await request(app).get('/api/jobs/job-1/quotes');

    expect(res.status).toBe(200);
    const expert = res.body[0].expert;
    expect(expert.rating).toBe(4.0);
    expect(expert.reviewsCount).toBe(3);
  });

  it('expert has null rating and 0 reviewsCount when no reviews exist', async () => {
    seedBaseJob();
    seedDoc('users', 'expert-1', { firstName: 'Eve', lastName: 'Taylor' });
    seedDoc('quotes', 'q-1', { jobId: 'job-1', tradieUid: 'expert-1', amount: 120, status: 'submitted' });

    const res = await request(app).get('/api/jobs/job-1/quotes');

    expect(res.status).toBe(200);
    expect(res.body[0].expert.rating).toBeNull();
    expect(res.body[0].expert.reviewsCount).toBe(0);
  });

  it('does NOT expose PII fields at quote level or inside expert', async () => {
    seedBaseJob();
    seedDoc('users', 'expert-1', {
      firstName: 'Sam',
      lastName: 'Hill',
      email: 'sam@example.com',
      phone: '0400000000',
      abn: '12345678901',
      dob: { day: 1, month: 1, year: 1990 },
      verificationStatus: 'pending',
      legalName: 'Samuel Hill',
      photoURL: 'https://storage.example.test/token-bearing-profile-photo',
      verified: false,
    });
    seedDoc('quotes', 'q-1', {
      jobId: 'job-1',
      tradieUid: 'expert-1',
      homeownerUid: 'homeowner-1',
      amount: 130,
      status: 'submitted',
      flagged: true,
      flagReasons: ['phone'],
    });

    const res = await request(app).get('/api/jobs/job-1/quotes');

    expect(res.status).toBe(200);
    const q = res.body[0];

    // Quote-level PII must be absent
    expect(q.homeownerUid).toBeUndefined();
    expect(q.flagged).toBeUndefined();
    expect(q.flagReasons).toBeUndefined();

    // Expert-level PII must be absent
    const e = q.expert;
    expect(e.email).toBeUndefined();
    expect(e.phone).toBeUndefined();
    expect(e.abn).toBeUndefined();
    expect(e.dob).toBeUndefined();
    expect(e.verificationStatus).toBeUndefined();
    expect(e.legalName).toBeUndefined();
    expect(e.lastName).toBeUndefined();
    expect(e.displayName).toBeUndefined();
    expect(e.photoURL).toBeUndefined();
    expect(e.profilePhotoURL).toBeUndefined();
    expect(e.profilePhotoAvailable).toBe(true);
  });

  it('verified is true only when users.verified === true', async () => {
    seedBaseJob();
    seedDoc('users', 'expert-pend', { firstName: 'Pend', lastName: 'Ing', verificationStatus: 'pending', verified: false });
    seedDoc('users', 'expert-ok',   { firstName: 'Full', lastName: 'Veri', verified: true });
    seedDoc('quotes', 'q-pend', { jobId: 'job-1', tradieUid: 'expert-pend', amount: 100, status: 'submitted' });
    seedDoc('quotes', 'q-ok',   { jobId: 'job-1', tradieUid: 'expert-ok',   amount: 200, status: 'submitted' });

    const res = await request(app).get('/api/jobs/job-1/quotes');

    expect(res.status).toBe(200);
    const pendExpert = res.body.find((q) => q.tradieUid === 'expert-pend')?.expert;
    const okExpert   = res.body.find((q) => q.tradieUid === 'expert-ok')?.expert;

    expect(pendExpert.verified).toBe(false);
    expect(okExpert.verified).toBe(true);
  });

  it('bio with a phone number is dropped; clean bio passes through (capped at 200 chars)', async () => {
    seedBaseJob();
    const longBio = 'A'.repeat(300);
    seedDoc('users', 'expert-bio', { firstName: 'Bio', lastName: 'Test', bio: longBio });
    seedDoc('users', 'expert-pii', { firstName: 'PII', lastName: 'Test', bio: 'Call me on 0412 345 678 anytime' });
    seedDoc('quotes', 'q-bio', { jobId: 'job-1', tradieUid: 'expert-bio', amount: 100, status: 'submitted' });
    seedDoc('quotes', 'q-pii', { jobId: 'job-1', tradieUid: 'expert-pii', amount: 110, status: 'submitted' });

    const res = await request(app).get('/api/jobs/job-1/quotes');

    expect(res.status).toBe(200);
    const bioQuote = res.body.find((q) => q.tradieUid === 'expert-bio');
    const piiQuote = res.body.find((q) => q.tradieUid === 'expert-pii');

    expect(bioQuote.expert.bio.length).toBeLessThanOrEqual(200);
    expect(piiQuote.expert.bio).toBe('');
  });

  it('businessName is exposed for a business account; empty for individual', async () => {
    seedBaseJob();
    seedDoc('users', 'expert-biz', {
      firstName: 'Biz', lastName: 'Person',
      businessName: 'Handy Co Pty Ltd', businessType: 'company',
    });
    seedDoc('users', 'expert-ind', {
      firstName: 'Indie', lastName: 'Person',
      businessName: 'Indie Trades', businessType: 'individual',
    });
    seedDoc('quotes', 'q-biz', { jobId: 'job-1', tradieUid: 'expert-biz', amount: 100, status: 'submitted' });
    seedDoc('quotes', 'q-ind', { jobId: 'job-1', tradieUid: 'expert-ind', amount: 110, status: 'submitted' });

    const res = await request(app).get('/api/jobs/job-1/quotes');

    expect(res.status).toBe(200);
    const bizExpert = res.body.find((q) => q.tradieUid === 'expert-biz')?.expert;
    const indExpert = res.body.find((q) => q.tradieUid === 'expert-ind')?.expert;

    expect(bizExpert.businessName).toBe('Handy Co Pty Ltd');
    expect(indExpert.businessName).toBe('');
  });

  it('missing user doc falls back to safe defaults with no crash', async () => {
    seedBaseJob();
    // Intentionally do NOT seed a user doc for 'expert-ghost'
    seedDoc('quotes', 'q-ghost', {
      jobId: 'job-1', tradieUid: 'expert-ghost', amount: 80, status: 'submitted',
    });

    const res = await request(app).get('/api/jobs/job-1/quotes');

    expect(res.status).toBe(200);
    const e = res.body[0].expert;
    expect(e).toBeDefined();
    expect(e.firstName).toBe('');
    expect(e.verified).toBe(false);
    expect(e.rating).toBeNull();
    expect(e.reviewsCount).toBe(0);
  });

  it('quote-level DTO no longer contains homeownerUid, flagged, or flagReasons', async () => {
    seedBaseJob();
    seedDoc('users', 'expert-1', { firstName: 'Clean', lastName: 'Test' });
    seedDoc('quotes', 'q-1', {
      jobId: 'job-1',
      tradieUid: 'expert-1',
      homeownerUid: 'homeowner-1',
      amount: 150,
      status: 'submitted',
      flagged: false,
      flagReasons: [],
      revisedFromQuoteId: 'q-old',
      revisionRequestedId: 'rev-1',
    });

    const res = await request(app).get('/api/jobs/job-1/quotes');

    expect(res.status).toBe(200);
    const q = res.body[0];

    // These internal fields must be stripped from the response
    expect(q.homeownerUid).toBeUndefined();
    expect(q.flagged).toBeUndefined();
    expect(q.flagReasons).toBeUndefined();
    expect(q.revisedFromQuoteId).toBeUndefined();
    expect(q.revisionRequestedId).toBeUndefined();

    // Core fields must still be present
    expect(q.id).toBe('q-1');
    expect(q.amount).toBe(150);
    expect(q.message).toBeDefined();
    expect(q.status).toBe('submitted');
    expect(q.tradieUid).toBe('expert-1');
  });
});
