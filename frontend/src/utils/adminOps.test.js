import {
  ATTENTION_NO_OFFER_HOURS,
  ATTENTION_ONE_QUOTE_HOURS,
  formatAgePrecise,
  formatAgeShort,
  getTaskCompletedAtMs,
  healthLabelForTask,
  isDisputeUnreviewed,
  isDisputedTask,
  isStaleOpen,
  needsAttentionNoOffer,
  needsAttentionOneQuote,
  toMillis,
} from './adminOps';

describe('adminOps: timestamp normalization', () => {
  it('normalizes numeric and Date values', () => {
    const date = new Date('2026-01-01T00:00:00.000Z');
    expect(toMillis(1234)).toBe(1234);
    expect(toMillis(date)).toBe(date.getTime());
  });

  it('normalizes Firestore timestamp shapes', () => {
    expect(toMillis({ seconds: 10, nanoseconds: 1 })).toBe(10000);
    expect(toMillis({ _seconds: 20, _nanoseconds: 1 })).toBe(20000);
  });

  it('returns 0 for invalid or missing timestamps', () => {
    expect(toMillis(null)).toBe(0);
    expect(toMillis(undefined)).toBe(0);
    expect(toMillis('not-a-date')).toBe(0);
  });
});

describe('adminOps: dispute helpers', () => {
  it('detects disputed tasks from status, paymentState, or disputeFlag', () => {
    expect(isDisputedTask({ status: 'disputed' })).toBe(true);
    expect(isDisputedTask({ paymentState: 'disputed' })).toBe(true);
    expect(isDisputedTask({ disputeFlag: true })).toBe(true);
    expect(isDisputedTask({ status: 'open', paymentState: 'in_escrow', disputeFlag: false })).toBe(false);
  });

  it('treats disputed tasks without reviewedAt as unreviewed', () => {
    expect(isDisputeUnreviewed({ status: 'disputed' })).toBe(true);
    expect(isDisputeUnreviewed({ status: 'disputed', reviewedAt: { seconds: 1, nanoseconds: 0 } })).toBe(false);
  });
});

describe('adminOps: age thresholds for attention', () => {
  const nowMs = Date.UTC(2026, 0, 10, 12, 0, 0);

  it('flags open tasks with no offers after attention threshold', () => {
    const createdAt = nowMs - (ATTENTION_NO_OFFER_HOURS + 1) * 60 * 60 * 1000;
    expect(needsAttentionNoOffer({ status: 'open', createdAt }, false, nowMs)).toBe(true);
    expect(needsAttentionNoOffer({ status: 'open', createdAt }, true, nowMs)).toBe(false);
  });

  it('flags exactly one quote after 3 hours and not before', () => {
    const early = nowMs - (2 * 60 * 60 * 1000);
    const late = nowMs - (ATTENTION_ONE_QUOTE_HOURS + 1) * 60 * 60 * 1000;
    expect(needsAttentionOneQuote({ status: 'open', createdAt: early }, 1, nowMs)).toBe(false);
    expect(needsAttentionOneQuote({ status: 'open', createdAt: late }, 1, nowMs)).toBe(true);
    expect(needsAttentionOneQuote({ status: 'open', createdAt: late }, 2, nowMs)).toBe(false);
  });

  it('keeps isStaleOpen as the 3h quoting-age helper, not a 24h liquidity rule', () => {
    const createdAt = nowMs - (ATTENTION_ONE_QUOTE_HOURS + 1) * 60 * 60 * 1000;
    expect(isStaleOpen({ status: 'open', createdAt }, nowMs)).toBe(true);
    expect(isStaleOpen({ status: 'assigned', createdAt }, nowMs)).toBe(false);
  });
});

describe('adminOps: completion timestamp fallback order', () => {
  it('prefers releasedAt over other completion-like fields', () => {
    const result = getTaskCompletedAtMs({
      releasedAt: { seconds: 15, nanoseconds: 0 },
      paidAt: { seconds: 12, nanoseconds: 0 },
      completedAt: { seconds: 10, nanoseconds: 0 },
      completedAtMs: 8000,
      updatedAt: { seconds: 6, nanoseconds: 0 },
    });
    expect(result).toBe(15000);
  });

  it('falls back through paidAt/completedAt/completedAtMs/updatedAt', () => {
    expect(getTaskCompletedAtMs({ paidAt: { seconds: 12, nanoseconds: 0 } })).toBe(12000);
    expect(getTaskCompletedAtMs({ completedAt: { seconds: 10, nanoseconds: 0 } })).toBe(10000);
    expect(getTaskCompletedAtMs({ completedAtMs: 9000 })).toBe(9000);
    expect(getTaskCompletedAtMs({ updatedAt: { seconds: 6, nanoseconds: 0 } })).toBe(6000);
  });
});

describe('adminOps: health label priority', () => {
  const nowMs = Date.UTC(2026, 0, 10, 12, 0, 0);
  const oldOpenCreatedAt = nowMs - (ATTENTION_ONE_QUOTE_HOURS + 2) * 60 * 60 * 1000;

  it('prioritizes dispute/unreviewed over all other states', () => {
    const label = healthLabelForTask({
      job: { status: 'open', disputeFlag: true, reviewedAt: null, createdAt: oldOpenCreatedAt },
      hasOffer: false,
      nowMs,
    });
    expect(label).toEqual({ key: 'dispute', label: 'Flagged', tone: 'danger' });
  });

  it('returns needs_attention before stale waiting when no offers', () => {
    const createdAt = nowMs - (ATTENTION_NO_OFFER_HOURS + 1) * 60 * 60 * 1000;
    const label = healthLabelForTask({
      job: { status: 'open', createdAt },
      hasOffer: false,
      nowMs,
    });
    expect(label).toEqual({ key: 'needs_attention', label: 'Needs attention', tone: 'warning' });
  });

  it('returns waiting_too_long only for a single quote after 3 hours', () => {
    const label = healthLabelForTask({
      job: { status: 'open', createdAt: oldOpenCreatedAt },
      hasOffer: true,
      quoteCount: 1,
      nowMs,
    });
    expect(label).toEqual({ key: 'waiting_too_long', label: 'Waiting too long', tone: 'info' });
    expect(healthLabelForTask({
      job: { status: 'open', createdAt: oldOpenCreatedAt },
      hasOffer: true,
      quoteCount: 2,
      nowMs,
    })).toEqual({ key: 'healthy', label: 'Healthy', tone: 'success' });
  });

  it('returns healthy for non-problematic tasks', () => {
    const createdAt = nowMs - (2 * 60 * 60 * 1000);
    const label = healthLabelForTask({
      job: { status: 'assigned', createdAt },
      hasOffer: true,
      nowMs,
    });
    expect(label).toEqual({ key: 'healthy', label: 'Healthy', tone: 'success' });
  });
});

describe('adminOps: age formatting', () => {
  const nowMs = Date.UTC(2026, 0, 10, 12, 0, 0);

  it('formats empty values as em dash', () => {
    expect(formatAgeShort(null, nowMs)).toBe('—');
  });

  it('formats hours for values less than 24h old', () => {
    const sixHoursAgo = nowMs - (6 * 60 * 60 * 1000);
    expect(formatAgeShort(sixHoursAgo, nowMs)).toBe('6h');
  });

  it('formats days for values at least 24h old', () => {
    const threeDaysAgo = nowMs - (72 * 60 * 60 * 1000);
    expect(formatAgeShort(threeDaysAgo, nowMs)).toBe('3d');
  });

  it('formats precise pilot ages with minutes', () => {
    expect(formatAgePrecise(nowMs - (42 * 60 * 1000), nowMs)).toBe('42m');
    expect(formatAgePrecise(nowMs - (78 * 60 * 1000), nowMs)).toBe('1h 18m');
    expect(formatAgePrecise(nowMs - (4 * 60 * 60 * 1000), nowMs)).toBe('4h');
    expect(formatAgePrecise(nowMs - (48 * 60 * 60 * 1000), nowMs)).toBe('2d');
  });
});
