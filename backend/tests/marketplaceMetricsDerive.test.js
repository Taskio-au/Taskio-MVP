'use strict';

const {
  FIRST_RESPONSE_TARGET_MS,
  deriveMarketplaceMetrics,
  isAccepted,
  isFunded,
  isCompleted,
  isReleased,
} = require('../src/services/marketplaceMetricsDerive');

const nowMs = Date.UTC(2026, 8, 13, 18, 0, 0);
const hour = 60 * 60 * 1000;
const day = 24 * hour;

function job(overrides = {}) {
  const createdAtMs = Object.prototype.hasOwnProperty.call(overrides, 'createdAtMs')
    ? overrides.createdAtMs
    : nowMs - (2 * day);
  return {
    id: 'job-1',
    status: 'OPEN',
    paymentState: null,
    postingReady: true,
    postingPhotoRequired: false,
    createdAtMs,
    quoteReadyAtMs: createdAtMs,
    fundedAtMs: 0,
    completedAtMs: 0,
    releasedAtMs: 0,
    acceptedQuoteId: '',
    acceptedTradieUid: '',
    invitedTradieUids: ['expert-a'],
    inviteTimestamps: {},
    quotes: [],
    ...overrides,
  };
}

function snapshot(jobs, extras = {}) {
  return deriveMarketplaceMetrics({
    jobs,
    experts: extras.experts || [
      { uid: 'expert-a', displayName: 'Alex Expert', launchReady: true, lastQuoteSubmittedAtMs: 0 },
      { uid: 'expert-b', displayName: 'Blair Expert', launchReady: false, lastQuoteSubmittedAtMs: 0 },
    ],
    range: extras.range || '7d',
    nowMs,
    truncated: extras.truncated === true,
    expertScanTruncated: extras.expertScanTruncated === true,
    scanned: extras.scanned || jobs.length,
    cap: extras.cap || 250,
  });
}

describe('marketplace quote-ready denominator', () => {
  it('counts quote-ready jobs in range and excludes postingReady=false', () => {
    const result = snapshot([
      job({ id: 'ready' }),
      job({ id: 'not-ready', postingReady: false }),
      job({ id: 'old', createdAtMs: nowMs - (20 * day), quoteReadyAtMs: nowMs - (20 * day) }),
    ]);
    expect(result.quoteHealth.quoteReadyJobs).toBe(1);
    expect(result.totals.quoteReadyJobs).toBe(1);
  });

  it('excludes cancelled jobs that were never quote-ready', () => {
    const result = snapshot([
      job({ id: 'cancelled-early', status: 'CANCELLED', postingReady: false }),
      job({ id: 'cancelled-after', status: 'CANCELLED', invitedTradieUids: [] }),
    ]);
    expect(result.quoteHealth.quoteReadyJobs).toBe(1);
    expect(result.funnel.quoteReady).toBe(1);
  });

  it('uses quoteReadyAt, not createdAt, when both exist', () => {
    const result = snapshot([
      job({
        id: 'photo-ready',
        postingPhotoRequired: true,
        createdAtMs: nowMs - (20 * day),
        quoteReadyAtMs: nowMs - (2 * day),
      }),
    ]);
    expect(result.quoteHealth.quoteReadyJobs).toBe(1);
  });
});

describe('quote coverage and status filtering', () => {
  it('computes >=1, >=2, and zero-quote rates with denominators', () => {
    const result = snapshot([
      job({ id: 'zero', invitedTradieUids: ['expert-a'] }),
      job({
        id: 'one',
        quotes: [{ tradieUid: 'expert-a', status: 'submitted', createdAtMs: nowMs - day }],
      }),
      job({
        id: 'two',
        quotes: [
          { tradieUid: 'expert-a', status: 'submitted', createdAtMs: nowMs - day },
          { tradieUid: 'expert-b', status: 'accepted', createdAtMs: nowMs - day + 1000 },
        ],
      }),
    ]);
    expect(result.quoteHealth.oneQuoteJobs).toBe(2);
    expect(result.quoteHealth.twoQuoteJobs).toBe(1);
    expect(result.quoteHealth.zeroQuoteJobs).toBe(1);
    expect(result.quoteHealth.oneQuote).toEqual({ numerator: 2, denominator: 3, rate: 2 / 3 });
    expect(result.quoteHealth.twoQuote).toEqual({ numerator: 1, denominator: 3, rate: 1 / 3 });
    expect(result.quoteHealth.zeroQuote).toEqual({ numerator: 1, denominator: 3, rate: 1 / 3 });
  });

  it('ignores draft, withdrawn, and rejected quotes for coverage', () => {
    const result = snapshot([
      job({
        id: 'hidden',
        quotes: [
          { tradieUid: 'expert-a', status: 'draft', createdAtMs: nowMs - day },
          { tradieUid: 'expert-b', status: 'withdrawn', createdAtMs: nowMs - day },
          { tradieUid: 'expert-a', status: 'rejected', createdAtMs: nowMs - day },
        ],
      }),
    ]);
    expect(result.quoteHealth.oneQuoteJobs).toBe(0);
    expect(result.quoteHealth.zeroQuoteJobs).toBe(1);
  });
});

describe('first-response timing', () => {
  it('uses the median first-response and <=60m rate from jobs with quotes', () => {
    const clock = nowMs - (3 * day);
    const result = snapshot([
      job({
        id: 'fast',
        createdAtMs: clock,
        quoteReadyAtMs: clock,
        quotes: [{ tradieUid: 'expert-a', status: 'submitted', createdAtMs: clock + (20 * 60 * 1000) }],
      }),
      job({
        id: 'mid',
        createdAtMs: clock,
        quoteReadyAtMs: clock,
        quotes: [{ tradieUid: 'expert-a', status: 'submitted', createdAtMs: clock + (40 * 60 * 1000) }],
      }),
      job({
        id: 'slow',
        createdAtMs: clock,
        quoteReadyAtMs: clock,
        quotes: [{ tradieUid: 'expert-a', status: 'submitted', createdAtMs: clock + (90 * 60 * 1000) }],
      }),
      job({ id: 'none', createdAtMs: clock, quoteReadyAtMs: clock }),
    ]);
    expect(result.quoteHealth.medianFirstResponseMinutes).toBe(40);
    expect(result.quoteHealth.timingSampleCount).toBe(3);
    expect(result.quoteHealth.within60Minutes).toEqual({ numerator: 2, denominator: 3, rate: 2 / 3 });
    expect(FIRST_RESPONSE_TARGET_MS).toBe(60 * 60 * 1000);
  });

  it('excludes historically photo-gated jobs with no quoteReadyAt from time metrics', () => {
    const result = snapshot([
      job({
        id: 'legacy-gated',
        postingPhotoRequired: true,
        quoteReadyAtMs: 0,
        createdAtMs: nowMs - day,
        quotes: [{ tradieUid: 'expert-a', status: 'submitted', createdAtMs: nowMs - day + hour }],
      }),
      job({
        id: 'legacy-ready',
        postingPhotoRequired: false,
        quoteReadyAtMs: 0,
        createdAtMs: nowMs - day,
        quotes: [{ tradieUid: 'expert-a', status: 'submitted', createdAtMs: nowMs - day + (15 * 60 * 1000) }],
      }),
    ]);
    expect(result.quoteHealth.quoteReadyJobs).toBe(1);
    expect(result.quoteHealth.medianFirstResponseMinutes).toBe(15);
    expect(result.quoteHealth.timingSampleCount).toBe(1);
  });
});

describe('funnel stage derivation', () => {
  it('follows one quote-ready cohort through later stages', () => {
    const clock = nowMs - (4 * day);
    const result = snapshot([
      job({ id: 'ready-only', createdAtMs: clock, quoteReadyAtMs: clock }),
      job({
        id: 'quoted',
        createdAtMs: clock,
        quoteReadyAtMs: clock,
        quotes: [{ tradieUid: 'expert-a', status: 'submitted', createdAtMs: clock + hour }],
      }),
      job({
        id: 'choice',
        createdAtMs: clock,
        quoteReadyAtMs: clock,
        quotes: [
          { tradieUid: 'expert-a', status: 'submitted', createdAtMs: clock + hour },
          { tradieUid: 'expert-b', status: 'submitted', createdAtMs: clock + hour + 1000 },
        ],
      }),
      job({
        id: 'accepted',
        status: 'ASSIGNED',
        createdAtMs: clock,
        quoteReadyAtMs: clock,
        acceptedTradieUid: 'expert-a',
        quotes: [
          { tradieUid: 'expert-a', status: 'accepted', createdAtMs: clock + hour },
          { tradieUid: 'expert-b', status: 'submitted', createdAtMs: clock + hour + 1000 },
        ],
      }),
      job({
        id: 'funded',
        status: 'FUNDED',
        paymentState: 'in_escrow',
        createdAtMs: clock,
        quoteReadyAtMs: clock,
        fundedAtMs: clock + (2 * hour),
        acceptedTradieUid: 'expert-a',
        quotes: [
          { tradieUid: 'expert-a', status: 'accepted', createdAtMs: clock + hour },
          { tradieUid: 'expert-b', status: 'submitted', createdAtMs: clock + hour + 1000 },
        ],
      }),
      job({
        id: 'done',
        status: 'PAID',
        paymentState: 'released',
        createdAtMs: clock,
        quoteReadyAtMs: clock,
        fundedAtMs: clock + (2 * hour),
        completedAtMs: clock + (3 * hour),
        releasedAtMs: clock + (4 * hour),
        acceptedTradieUid: 'expert-a',
        quotes: [
          { tradieUid: 'expert-a', status: 'accepted', createdAtMs: clock + hour },
          { tradieUid: 'expert-b', status: 'submitted', createdAtMs: clock + hour + 1000 },
        ],
      }),
    ]);
    expect(result.funnel).toEqual(expect.objectContaining({
      quoteReady: 6,
      oneQuote: 5,
      twoQuotes: 4,
      accepted: 3,
      funded: 2,
      completed: 1,
      released: 1,
    }));
    expect(result.funnel.stages[0].fromQuoteReady.rate).toBe(1);
    expect(result.funnel.stages[6].fromQuoteReady).toEqual({ numerator: 1, denominator: 6, rate: 1 / 6 });
  });

  it('does not treat Stripe transferId as payment release', () => {
    expect(isReleased({ status: 'FUNDED', paymentState: 'in_escrow', transferId: 'tr_123', releasedAtMs: 0 })).toBe(false);
    expect(isReleased({ status: 'PAID', paymentState: 'released', releasedAtMs: nowMs })).toBe(true);
    expect(isFunded({ status: 'AWAITING_FUNDING', paymentState: 'pending_payment', fundedAtMs: 0 })).toBe(false);
    expect(isCompleted({ status: 'FUNDED', completedAtMs: 0 })).toBe(false);
    expect(isAccepted({ status: 'QUOTED', acceptedTradieUid: '', quotes: [{ status: 'submitted' }] })).toBe(false);
  });
});

describe('expert responsiveness', () => {
  it('counts one job-level response per Expert and ignores quote revisions', () => {
    const clock = nowMs - (2 * day);
    const result = snapshot([
      job({
        id: 'job-dup',
        createdAtMs: clock,
        quoteReadyAtMs: clock,
        invitedTradieUids: ['expert-a', 'expert-a'],
        quotes: [
          { tradieUid: 'expert-a', status: 'superseded', createdAtMs: clock + hour },
          { tradieUid: 'expert-a', status: 'submitted', createdAtMs: clock + hour + 60000 },
        ],
      }),
      job({
        id: 'job-miss',
        createdAtMs: clock,
        quoteReadyAtMs: clock,
        invitedTradieUids: ['expert-a'],
      }),
    ]);
    const expert = result.experts.find((row) => row.uid === 'expert-a');
    expect(expert.invitations).toBe(2);
    expect(expert.quotedJobs).toBe(1);
    expect(expert.responseNumerator).toBe(1);
    expect(expert.responseDenominator).toBe(2);
    expect(expert.responseRate).toBe(0.5);
  });

  it('omits invitation response time when invitedAt is missing', () => {
    const clock = nowMs - (2 * day);
    const result = snapshot([
      job({
        id: 'no-ts',
        createdAtMs: clock,
        quoteReadyAtMs: clock,
        invitedTradieUids: ['expert-a'],
        inviteTimestamps: {},
        quotes: [{ tradieUid: 'expert-a', status: 'submitted', createdAtMs: clock + hour }],
      }),
    ]);
    const expert = result.experts.find((row) => row.uid === 'expert-a');
    expect(expert.responseTimeAvailable).toBe(false);
    expect(expert.responseTimeMinutes).toBeNull();
    expect(expert.responseTimeBasis).toBeNull();
    expect(result.gaps.invitationTimestamp.available).toBe(false);
    expect(result.gaps.invitationTimestamp.invitationsWithTimestamp).toBe(0);
  });

  it('uses invitedAt → first quote when the timestamp exists', () => {
    const clock = nowMs - (2 * day);
    const invitedAt = clock + (10 * 60 * 1000);
    const result = snapshot([
      job({
        id: 'with-ts',
        createdAtMs: clock,
        quoteReadyAtMs: clock,
        invitedTradieUids: ['expert-a'],
        inviteTimestamps: { 'expert-a': invitedAt },
        quotes: [{ tradieUid: 'expert-a', status: 'submitted', createdAtMs: invitedAt + (25 * 60 * 1000) }],
        acceptedTradieUid: 'expert-a',
        status: 'COMPLETED',
        completedAtMs: clock + (5 * hour),
      }),
    ]);
    const expert = result.experts.find((row) => row.uid === 'expert-a');
    expect(expert.responseTimeAvailable).toBe(true);
    expect(expert.responseTimeMinutes).toBe(25);
    expect(expert.responseTimeBasis).toBe('invitation');
    expect(expert.awarded).toBe(1);
    expect(expert.completed).toBe(1);
    expect(expert.launchReady).toBe(true);
    expect(expert.displayName).toBe('Alex Expert');
  });

  it('counts attributable cancellations only after award', () => {
    const clock = nowMs - (2 * day);
    const result = snapshot([
      job({
        id: 'cancelled-awarded',
        status: 'CANCELLED',
        createdAtMs: clock,
        quoteReadyAtMs: clock,
        acceptedTradieUid: 'expert-a',
        invitedTradieUids: ['expert-a'],
      }),
    ]);
    expect(result.experts[0].cancellations).toBe(1);
    expect(result.experts[0].awarded).toBe(1);
  });
});

describe('truncated scan fail-safe', () => {
  it('marks scanComplete false when the job or Expert scan is truncated', () => {
    const complete = snapshot([job()], { truncated: false });
    expect(complete.scanComplete).toBe(true);
    expect(complete.truncated).toBe(false);
    const jobsTruncated = snapshot([job()], { truncated: true });
    expect(jobsTruncated.scanComplete).toBe(false);
    expect(jobsTruncated.totals.jobScanTruncated).toBe(true);
    const expertsTruncated = snapshot([job()], { expertScanTruncated: true });
    expect(expertsTruncated.scanComplete).toBe(false);
    expect(expertsTruncated.totals.expertScanTruncated).toBe(true);
  });
});
