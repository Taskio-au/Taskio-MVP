'use strict';

const {
  REASONS,
  PRIORITY,
  deriveJobAttention,
  countSuitableLaunchReady,
  ZERO_QUOTES_MS,
  ONE_QUOTE_MS,
  FUNDED_STALL_MS,
  COMPLETION_STALL_MS,
} = require('../src/services/jobAttentionDerive');

const nowMs = Date.UTC(2026, 8, 13, 12, 0, 0);

function quotingInput(overrides = {}) {
  return {
    status: 'OPEN',
    paymentState: null,
    createdAtMs: nowMs - (30 * 60 * 1000),
    inviteCount: 3,
    quoteCount: 0,
    suitableLaunchReadyCount: 4,
    suitableSupplyReliable: true,
    ...overrides,
  };
}

describe('deriveJobAttention', () => {
  it('does not flag 0 quotes before 60 minutes', () => {
    const result = deriveJobAttention(quotingInput({
      inviteCount: 5,
      quoteCount: 0,
      createdAtMs: nowMs - (59 * 60 * 1000),
    }), nowMs);
    expect(result).toBeNull();
  });

  it('flags 0 quotes after 60 minutes as HIGH', () => {
    const result = deriveJobAttention(quotingInput({
      inviteCount: 2,
      quoteCount: 0,
      createdAtMs: nowMs - ZERO_QUOTES_MS - 1000,
    }), nowMs);
    expect(result.reasonKey).toBe(REASONS.ZERO_QUOTES_60M);
    expect(result.priority).toBe(PRIORITY.HIGH);
  });

  it('does not flag exactly 1 quote before 3 hours', () => {
    const result = deriveJobAttention(quotingInput({
      inviteCount: 5,
      quoteCount: 1,
      createdAtMs: nowMs - (2 * 60 * 60 * 1000),
    }), nowMs);
    expect(result).toBeNull();
  });

  it('flags exactly 1 quote after 3 hours as MEDIUM', () => {
    const result = deriveJobAttention(quotingInput({
      inviteCount: 5,
      quoteCount: 1,
      createdAtMs: nowMs - ONE_QUOTE_MS - 1000,
    }), nowMs);
    expect(result.reasonKey).toBe(REASONS.ONLY_ONE_QUOTE_3H);
    expect(result.priority).toBe(PRIORITY.MEDIUM);
  });

  it('does not flag invite shortage when 2+ quotes already exist', () => {
    const result = deriveJobAttention(quotingInput({
      inviteCount: 2,
      quoteCount: 2,
      createdAtMs: nowMs - ONE_QUOTE_MS - 1000,
    }), nowMs);
    expect(result).toBeNull();
  });

  it('flags no Experts invited on an active quoting job', () => {
    const result = deriveJobAttention(quotingInput({
      inviteCount: 0,
      quoteCount: 0,
      createdAtMs: nowMs - (10 * 60 * 1000),
    }), nowMs);
    expect(result.reasonKey).toBe(REASONS.NO_EXPERTS_INVITED);
    expect(result.priority).toBe(PRIORITY.HIGH);
  });

  it('excludes completed and released jobs', () => {
    expect(deriveJobAttention(quotingInput({ status: 'PAID', quoteCount: 0, inviteCount: 0 }), nowMs)).toBeNull();
    expect(deriveJobAttention(quotingInput({
      status: 'COMPLETED',
      completedAtMs: nowMs - (60 * 60 * 1000),
    }), nowMs)).toBeNull();
  });

  it('excludes cancelled jobs unless an unresolved payment condition exists', () => {
    expect(deriveJobAttention(quotingInput({ status: 'CANCELLED' }), nowMs)).toBeNull();
    const unpaid = deriveJobAttention(quotingInput({
      status: 'CANCELLED',
      paymentState: 'refund_failed',
    }), nowMs);
    expect(unpaid.reasonKey).toBe(REASONS.PAYMENT_ISSUE);
    expect(unpaid.priority).toBe(PRIORITY.CRITICAL);
  });

  it('surfaces payment/refund/dispute issues as CRITICAL', () => {
    const result = deriveJobAttention(quotingInput({
      status: 'DISPUTED',
      paymentState: 'disputed',
    }), nowMs);
    expect(result.reasonKey).toBe(REASONS.PAYMENT_ISSUE);
    expect(result.priority).toBe(PRIORITY.CRITICAL);
  });

  it('flags no suitable supply only when category + area mapping is reliable', () => {
    const ready = deriveJobAttention(quotingInput({
      suitableSupplyReliable: true,
      suitableLaunchReadyCount: 0,
    }), nowMs);
    expect(ready.reasonKey).toBe(REASONS.NO_SUITABLE_SUPPLY);
    expect(ready.priority).toBe(PRIORITY.CRITICAL);

    const gap = deriveJobAttention(quotingInput({
      suitableSupplyReliable: false,
      suitableLaunchReadyCount: null,
      inviteCount: 5,
      quoteCount: 1,
    }), nowMs);
    expect(gap).toBeNull();
  });

  it('flags funded and completion stalls only from explicit lifecycle timestamps', () => {
    expect(deriveJobAttention({
      status: 'FUNDED',
      fundedAtMs: 0,
      createdAtMs: nowMs - FUNDED_STALL_MS - 1000,
    }, nowMs)).toBeNull();

    const funded = deriveJobAttention({
      status: 'FUNDED',
      fundedAtMs: nowMs - FUNDED_STALL_MS - 1000,
      createdAtMs: nowMs - FUNDED_STALL_MS - 1000,
    }, nowMs);
    expect(funded.reasonKey).toBe(REASONS.FUNDED_JOB_STALLED);

    const completion = deriveJobAttention({
      status: 'COMPLETED',
      completedAtMs: nowMs - COMPLETION_STALL_MS - 1000,
      createdAtMs: nowMs - COMPLETION_STALL_MS - 1000,
    }, nowMs);
    expect(completion.reasonKey).toBe(REASONS.COMPLETION_STALLED);
  });
});

describe('countSuitableLaunchReady', () => {
  const categoryKeyMap = new Map([['Mounting', ['mounting_tv', 'mounting_shelves']]]);
  const pilotAreaSet = new Set(['Richmond', 'Carlton']);
  const index = [
    { approved: new Set(['mounting_tv']), serviceAreas: new Set(['Richmond']) },
    { approved: new Set(['furniture_assembly_flat_pack']), serviceAreas: new Set(['Richmond']) },
    { approved: new Set(['mounting_tv']), serviceAreas: new Set(['Carlton']) },
  ];

  it('matches launch-ready Experts on category keys and service area', () => {
    const result = countSuitableLaunchReady(
      { primaryCategory: 'Mounting', locationSuburb: 'Richmond' },
      index,
      categoryKeyMap,
      pilotAreaSet
    );
    expect(result).toEqual({ reliable: true, count: 1 });
  });

  it('excludes Experts without the job service area', () => {
    const result = countSuitableLaunchReady(
      { primaryCategory: 'Mounting', locationSuburb: 'Richmond' },
      [{ approved: new Set(['mounting_tv']), serviceAreas: new Set(['Carlton']) }],
      categoryKeyMap,
      pilotAreaSet
    );
    expect(result).toEqual({ reliable: true, count: 0 });
  });

  it('does not infer from free-text when category or area is not canonical', () => {
    const result = countSuitableLaunchReady(
      { title: 'TV mounting in Richmond', description: 'Need a TV mounted' },
      index,
      categoryKeyMap,
      pilotAreaSet
    );
    expect(result).toEqual({ reliable: false, count: null });
  });
});
