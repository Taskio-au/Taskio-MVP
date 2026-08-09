'use strict';

/**
 * Contract tests for GET /api/tradies/:tradieUid/reviews
 *
 * Key invariant: averageRating and reviewCount must reflect ALL reviews for
 * the expert, not just the limited page returned in `reviews[]`.
 */

const express = require('express');
const request = require('supertest');

// ---------------------------------------------------------------------------
// In-memory subcollection store
// Prefixed with "mock" so Jest's module factory can reference them.
// ---------------------------------------------------------------------------
const mockSubcollectionStore = new Map();

function mockSubcollectionKey(parentCol, parentId, subCol) {
  return `${parentCol}/${parentId}/${subCol}`;
}

function mockGetSubcollection(parentCol, parentId, subCol) {
  const key = mockSubcollectionKey(parentCol, parentId, subCol);
  if (!mockSubcollectionStore.has(key)) mockSubcollectionStore.set(key, new Map());
  return mockSubcollectionStore.get(key);
}

/**
 * Builds a mock query for a subcollection.
 * Tracks whether .select() or .limit() was called so get() returns the correct subset.
 */
function mockMakeSubcollectionQuery(parentCol, parentId, subCol, opts = {}) {
  const { selectedFields = null, applyLimit = null } = opts;

  return {
    orderBy() {
      return mockMakeSubcollectionQuery(parentCol, parentId, subCol, { selectedFields, applyLimit });
    },
    limit(n) {
      return mockMakeSubcollectionQuery(parentCol, parentId, subCol, { selectedFields, applyLimit: n });
    },
    select(...fields) {
      return mockMakeSubcollectionQuery(parentCol, parentId, subCol, { selectedFields: fields, applyLimit: null });
    },
    async get() {
      const store = mockGetSubcollection(parentCol, parentId, subCol);
      let rows = Array.from(store.values());

      if (applyLimit !== null) {
        rows = rows.slice(0, applyLimit);
      }

      const docs = rows.map((row) => {
        let data = { ...row };
        if (selectedFields) {
          const masked = {};
          selectedFields.forEach((f) => { if (f in data) masked[f] = data[f]; });
          data = masked;
        }
        return {
          id: row.id,
          data: () => ({ ...data }),
        };
      });

      return { empty: docs.length === 0, docs, size: docs.length };
    },
  };
}

// ---------------------------------------------------------------------------
// Firestore mock
// ---------------------------------------------------------------------------
jest.mock('../src/firebaseAdmin', () => ({
  admin: {
    firestore: {
      FieldValue: { serverTimestamp: jest.fn(() => '__server_ts__') },
    },
  },
  db: {
    collection: jest.fn((colName) => ({
      doc: jest.fn((docId) => ({
        collection: jest.fn((subCol) =>
          mockMakeSubcollectionQuery(colName, docId, subCol)
        ),
        get: jest.fn(async () => ({ exists: false, data: () => ({}) })),
      })),
    })),
  },
}));

const reviewRoutes = require('../src/routes/reviews');

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use(reviewRoutes);
  return app;
}

// ---------------------------------------------------------------------------
// Seed helpers
// ---------------------------------------------------------------------------
function seedSubcollectionDoc(parentCol, parentId, subCol, docId, data) {
  mockGetSubcollection(parentCol, parentId, subCol).set(docId, { id: docId, ...data });
}

function seedReviews(tradieUid, reviews) {
  reviews.forEach((r, i) => {
    seedSubcollectionDoc('users', tradieUid, 'reviews', r.jobId || `review-${i}`, r);
  });
}

function makeReview(jobId, rating, text = '') {
  return {
    jobId,
    homeownerUid: 'homeowner-secret', // must NOT appear in public response
    tradieUid: 'expert-1',
    rating,
    text,
    createdAt: null,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe('GET /api/tradies/:tradieUid/reviews', () => {
  let app;

  beforeEach(() => {
    mockSubcollectionStore.clear();
    app = buildApp();
  });

  it('returns empty reviews and null aggregates when expert has no reviews', async () => {
    const res = await request(app).get('/api/tradies/expert-1/reviews');

    expect(res.status).toBe(200);
    expect(res.body.reviews).toEqual([]);
    expect(res.body.averageRating).toBeNull();
    expect(res.body.reviewCount).toBe(0);
    expect(res.body.count).toBe(0); // backward-compat alias
  });

  it('returns correct aggregates from a set within limit', async () => {
    seedReviews('expert-1', [
      makeReview('job-1', 5, 'Great work'),
      makeReview('job-2', 4, 'Good'),
      makeReview('job-3', 3, ''),
    ]);

    const res = await request(app).get('/api/tradies/expert-1/reviews?limit=20');

    expect(res.status).toBe(200);
    expect(res.body.reviews).toHaveLength(3);
    expect(res.body.reviewCount).toBe(3);
    expect(res.body.count).toBe(3);
    // (5+4+3)/3 = 4.0
    expect(res.body.averageRating).toBe(4.0);
  });

  it('KEY INVARIANT: reviewCount and averageRating reflect ALL reviews even when total exceeds page limit', async () => {
    // 30 total: 20 × 5-star, 10 × 1-star
    // true average = (20*5 + 10*1) / 30 = 110/30 ≈ 3.7
    const all = [];
    for (let i = 0; i < 20; i++) all.push(makeReview(`job-5star-${i}`, 5));
    for (let i = 0; i < 10; i++) all.push(makeReview(`job-1star-${i}`, 1));
    seedReviews('expert-1', all);

    const res = await request(app).get('/api/tradies/expert-1/reviews?limit=20');

    expect(res.status).toBe(200);

    // Page must be capped at limit
    expect(res.body.reviews.length).toBeLessThanOrEqual(20);

    // Aggregates must reflect all 30
    expect(res.body.reviewCount).toBe(30);
    expect(res.body.count).toBe(30);

    const expected = Math.round(((20 * 5 + 10 * 1) / 30) * 10) / 10; // 3.7
    expect(res.body.averageRating).toBe(expected);
  });

  it('regression guard: average must NOT equal 5.0 when low-rated reviews are outside the page', async () => {
    // If we computed from page-only, all 20 page items are 5-star → average = 5.0 (wrong)
    const all = [];
    for (let i = 0; i < 20; i++) all.push(makeReview(`job-5star-${i}`, 5));
    for (let i = 0; i < 10; i++) all.push(makeReview(`job-1star-${i}`, 1));
    seedReviews('expert-1', all);

    const res = await request(app).get('/api/tradies/expert-1/reviews?limit=20');

    expect(res.status).toBe(200);
    expect(res.body.averageRating).not.toBe(5.0);   // would be 5 if bug were present
    expect(res.body.reviewCount).not.toBe(20);       // would be 20 if bug were present
  });

  it('does NOT expose homeownerUid or tradieUid in the public review list', async () => {
    seedReviews('expert-1', [makeReview('job-1', 5, 'Excellent')]);

    const res = await request(app).get('/api/tradies/expert-1/reviews');

    expect(res.status).toBe(200);
    expect(res.body.reviews).toHaveLength(1);
    const review = res.body.reviews[0];

    expect(review.homeownerUid).toBeUndefined();
    expect(review.tradieUid).toBeUndefined();

    // Safe public fields must be present
    expect(review.id).toBeDefined();
    expect(review.rating).toBe(5);
    expect(review.text).toBe('Excellent');
  });

  it('page is capped at limit even when more reviews exist', async () => {
    const all = [];
    for (let i = 0; i < 25; i++) all.push(makeReview(`job-${i}`, 4));
    seedReviews('expert-1', all);

    const res = await request(app).get('/api/tradies/expert-1/reviews?limit=10');

    expect(res.status).toBe(200);
    expect(res.body.reviews.length).toBeLessThanOrEqual(10);
    expect(res.body.reviewCount).toBe(25); // lifetime count is still 25
  });

  it('rounds averageRating to one decimal place', async () => {
    // (5+4+4+3)/4 = 16/4 = 4.0 (exact — no rounding artefact)
    seedReviews('expert-1', [
      makeReview('job-1', 5),
      makeReview('job-2', 4),
      makeReview('job-3', 4),
      makeReview('job-4', 3),
    ]);

    const res = await request(app).get('/api/tradies/expert-1/reviews?limit=20');

    expect(res.status).toBe(200);
    expect(res.body.averageRating).toBe(4.0);
  });

  it('clamps limit to 50 even if client requests more', async () => {
    const all = [];
    for (let i = 0; i < 60; i++) all.push(makeReview(`job-${i}`, 3));
    seedReviews('expert-1', all);

    const res = await request(app).get('/api/tradies/expert-1/reviews?limit=100');

    expect(res.status).toBe(200);
    expect(res.body.reviews.length).toBeLessThanOrEqual(50);
    expect(res.body.reviewCount).toBe(60); // all 60 counted
  });
});
