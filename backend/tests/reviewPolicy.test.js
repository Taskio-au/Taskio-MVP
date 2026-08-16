'use strict';

jest.mock('../src/utils/firestore', () => ({
  safeToMillis: jest.fn((value) => Number(value || 0)),
}));

const {
  REVIEW_WINDOW_MS,
  buildReviewSubmission,
  isReviewPublished,
  reviewDeadlineMs,
} = require('../src/services/reviewPolicy');

function releasedJob(overrides = {}) {
  return {
    homeownerUid: 'homeowner-1',
    acceptedTradieUid: 'expert-1',
    status: 'PAID',
    paymentState: 'released',
    releasedAt: 1_000_000,
    ...overrides,
  };
}

describe('double-blind review policy', () => {
  it('allows each party one immutable submission within 14 days', () => {
    const job = releasedJob();
    const first = buildReviewSubmission({
      job,
      uid: 'homeowner-1',
      rating: 5,
      text: 'Excellent work',
      nowMs: 1_000_100,
    });
    expect(first.error).toBeUndefined();
    expect(first.doubleBlindComplete).toBe(false);

    const duplicate = buildReviewSubmission({
      job,
      existing: { submissions: first.submissions },
      uid: 'homeowner-1',
      rating: 1,
      text: 'Changed mind',
      nowMs: 1_000_200,
    });
    expect(duplicate.error).toBe('already_exists');

    const second = buildReviewSubmission({
      job,
      existing: { submissions: first.submissions },
      uid: 'expert-1',
      rating: 4,
      text: 'Clear brief',
      nowMs: 1_000_300,
    });
    expect(second.error).toBeUndefined();
    expect(second.doubleBlindComplete).toBe(true);
    expect(second.submissions.homeowner.rating).toBe(5);
  });

  it('publishes when both submit or when the 14-day deadline expires', () => {
    const deadlineMs = reviewDeadlineMs(releasedJob());
    expect(deadlineMs).toBe(1_000_000 + REVIEW_WINDOW_MS);
    expect(isReviewPublished({ visibleAfterMs: deadlineMs, doubleBlindComplete: false }, deadlineMs - 1)).toBe(false);
    expect(isReviewPublished({ visibleAfterMs: deadlineMs, doubleBlindComplete: false }, deadlineMs)).toBe(true);
    expect(isReviewPublished({ visibleAfterMs: deadlineMs, doubleBlindComplete: true }, 1)).toBe(true);
  });

  it('closes submissions after 14 days and rejects non-participants', () => {
    const job = releasedJob();
    expect(buildReviewSubmission({
      job,
      uid: 'homeowner-1',
      rating: 5,
      text: '',
      nowMs: reviewDeadlineMs(job) + 1,
    }).error).toBe('window_closed');
    expect(buildReviewSubmission({
      job,
      uid: 'stranger',
      rating: 5,
      text: '',
      nowMs: 1_000_100,
    }).error).toBe('forbidden');
  });

  it('accepts explicit legacy completed records only when release evidence exists', () => {
    expect(buildReviewSubmission({
      job: releasedJob({ status: 'COMPLETED', transferId: 'tr_legacy' }),
      uid: 'homeowner-1',
      rating: 5,
      text: '',
      nowMs: 1_000_100,
    }).error).toBeUndefined();
    expect(buildReviewSubmission({
      job: releasedJob({ status: 'COMPLETED', releasedAt: null, transferId: null }),
      uid: 'homeowner-1',
      rating: 5,
      text: '',
      nowMs: 1_000_100,
    }).error).toBe('bad_state');
  });
});
