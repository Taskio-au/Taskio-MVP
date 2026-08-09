'use strict';

/**
 * Unit tests for reviewAggregationService.getExpertRatingAggregate
 */

// In-memory store — MUST be prefixed with "mock" so Jest's module factory can reference it
const mockReviewStore = new Map();

function mockSeedReview(tradieUid, docId, data) {
  const key = `${tradieUid}/${docId}`;
  mockReviewStore.set(key, { id: docId, ...data });
}

function mockGetReviewsForTradie(tradieUid) {
  return Array.from(mockReviewStore.entries())
    .filter(([k]) => k.startsWith(`${tradieUid}/`))
    .map(([, v]) => ({ ...v }));
}

jest.mock('../src/firebaseAdmin', () => ({
  admin: {
    firestore: { FieldValue: { serverTimestamp: jest.fn(() => '__server_ts__') } },
  },
  db: {
    collection: jest.fn((colName) => ({
      doc: jest.fn((docId) => ({
        collection: jest.fn(() => ({
          select: jest.fn().mockReturnThis(),
          get: jest.fn(async () => {
            const rows = mockGetReviewsForTradie(docId);
            const docs = rows.map((r) => ({ id: r.id, data: () => ({ ...r }) }));
            return { empty: docs.length === 0, docs, size: docs.length };
          }),
        })),
      })),
    })),
  },
}));

const { getExpertRatingAggregate } = require('../src/services/reviewAggregationService');

beforeEach(() => {
  mockReviewStore.clear();
});

describe('getExpertRatingAggregate', () => {
  it('returns null averageRating and 0 count when expert has no reviews', async () => {
    const result = await getExpertRatingAggregate('expert-empty');
    expect(result.averageRating).toBeNull();
    expect(result.reviewCount).toBe(0);
  });

  it('returns correct aggregate for a single review', async () => {
    mockSeedReview('expert-1', 'job-1', { rating: 5 });
    const result = await getExpertRatingAggregate('expert-1');
    expect(result.averageRating).toBe(5);
    expect(result.reviewCount).toBe(1);
  });

  it('averages multiple reviews correctly', async () => {
    mockSeedReview('expert-1', 'job-1', { rating: 5 });
    mockSeedReview('expert-1', 'job-2', { rating: 4 });
    mockSeedReview('expert-1', 'job-3', { rating: 3 });
    // (5+4+3)/3 = 4.0
    const result = await getExpertRatingAggregate('expert-1');
    expect(result.reviewCount).toBe(3);
    expect(result.averageRating).toBe(4.0);
  });

  it('rounds to one decimal place', async () => {
    mockSeedReview('expert-1', 'job-1', { rating: 5 });
    mockSeedReview('expert-1', 'job-2', { rating: 4 });
    // (5+4)/2 = 4.5 — exact
    const result = await getExpertRatingAggregate('expert-1');
    expect(result.averageRating).toBe(4.5);
  });

  it('ignores ratings outside 1-5 range', async () => {
    mockSeedReview('expert-1', 'job-1', { rating: 5 });
    mockSeedReview('expert-1', 'job-bad',  { rating: 0 });
    mockSeedReview('expert-1', 'job-bad2', { rating: 6 });
    mockSeedReview('expert-1', 'job-bad3', { rating: null });
    const result = await getExpertRatingAggregate('expert-1');
    expect(result.reviewCount).toBe(1);
    expect(result.averageRating).toBe(5);
  });

  it('returns null and 0 for empty tradieUid', async () => {
    const result = await getExpertRatingAggregate('');
    expect(result.averageRating).toBeNull();
    expect(result.reviewCount).toBe(0);
  });
});
