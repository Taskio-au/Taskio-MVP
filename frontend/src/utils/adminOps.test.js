import {
  ATTENTION_NO_OFFER_HOURS,
  STALE_OPEN_HOURS,
  formatAgeShort,
  getTaskCompletedAtMs,
  healthLabelForTask,
  isDisputeUnreviewed,
  isDisputedTask,
  isStaleOpen,
  needsAttentionNoOffer,
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

  it('flags stale open tasks after stale threshold', () => {
    const createdAt = nowMs - (STALE_OPEN_HOURS + 2) * 60 * 60 * 1000;
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
  const oldOpenCreatedAt = nowMs - (STALE_OPEN_HOURS + 2) * 60 * 60 * 1000;

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

  it('returns waiting_too_long for stale open tasks with offers', () => {
    const label = healthLabelForTask({
      job: { status: 'open', createdAt: oldOpenCreatedAt },
      hasOffer: true,
      nowMs,
    });
    expect(label).toEqual({ key: 'waiting_too_long', label: 'Waiting too long', tone: 'info' });
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
});
