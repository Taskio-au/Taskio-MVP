'use strict';

const {
  calculateFeeCents,
  getFoundingExpertStage,
  calculateExpertFeeSnapshot,
  deriveReducedFeeEndsAt,
  buildExpertFoundingFeeProfile,
  estimateExpertFeeForGross,
  STAGE,
} = require('../src/services/expertFeeProgram');

const {
  testProgramId,
  FOUNDING_EXPERT_ZERO_FEE_TASK_LIMIT,
  STANDARD_LAUNCH_FEE_BPS,
} = require('../../shared/feePlans');

describe('calculateFeeCents', () => {
  it('0% fee returns 0', () => {
    expect(calculateFeeCents(10000, 0)).toBe(0);
  });

  it('$99.99 at 7.5%', () => {
    expect(calculateFeeCents(9999, 750)).toBe(750);
  });

  it('$100.00 at 7.5%', () => {
    expect(calculateFeeCents(10000, 750)).toBe(750);
  });

  it('$100.00 at 10%', () => {
    expect(calculateFeeCents(10000, 1000)).toBe(1000);
  });

  it('$1.00 at 10%', () => {
    expect(calculateFeeCents(100, 1000)).toBe(10);
  });

  it('rejects grossAmountCents 0', () => {
    expect(() => calculateFeeCents(0, 1000)).toThrow(/positive integer/);
  });

  it('rejects negative grossAmountCents', () => {
    expect(() => calculateFeeCents(-100, 1000)).toThrow(/positive integer/);
  });

  it('rejects non-integer cents', () => {
    expect(() => calculateFeeCents(100.5, 1000)).toThrow(/positive integer/);
    expect(() => calculateFeeCents(NaN, 1000)).toThrow(/positive integer/);
  });

  it('rejects invalid feeBps', () => {
    expect(() => calculateFeeCents(100, -1)).toThrow(/basis points/);
    expect(() => calculateFeeCents(100, 10001)).toThrow(/basis points/);
    expect(() => calculateFeeCents(100, 750.5)).toThrow(/basis points/);
    expect(() => calculateFeeCents(100, NaN)).toThrow(/basis points/);
  });
});

describe('getFoundingExpertStage', () => {
  const futureEnd = new Date('2030-06-01T00:00:00.000Z');
  const pastEnd = new Date('2020-01-01T00:00:00.000Z');
  const mid2030 = new Date('2030-03-15T12:00:00.000Z');

  it('non-founding Expert (no foundingExpert) uses standard_launch at 10%', () => {
    const r = getFoundingExpertStage({}, mid2030);
    expect(r.stage).toBe(STAGE.STANDARD_LAUNCH);
    expect(r.expertFeeBps).toBe(STANDARD_LAUNCH_FEE_BPS);
    expect(r.benefitLabel).toBe('Standard launch fee');
  });

  it('inactive founding statuses use standard_launch', () => {
    for (const status of ['inactive', 'removed', 'test_reset', 'pending', '']) {
      const r = getFoundingExpertStage(
        { foundingExpert: { status, zeroFeeSlotsUsed: 0, programId: testProgramId } },
        mid2030
      );
      expect(r.stage).toBe(STAGE.STANDARD_LAUNCH);
      expect(r.expertFeeBps).toBe(1000);
    }
  });

  it('active founding with zeroFeeSlotsUsed 0..limit-1 → founding_first_three at 0%', () => {
    for (let u = 0; u < FOUNDING_EXPERT_ZERO_FEE_TASK_LIMIT; u += 1) {
      const r = getFoundingExpertStage(
        { foundingExpert: { status: 'active', programId: testProgramId, zeroFeeSlotsUsed: u } },
        mid2030
      );
      expect(r.stage).toBe(STAGE.FOUNDING_FIRST_THREE);
      expect(r.expertFeeBps).toBe(0);
      expect(r.benefitLabel).toBe('Founding Expert benefit applied');
    }
  });

  it('active founding after first 3, within reduced period → founding_reduced at 7.5%', () => {
    const r = getFoundingExpertStage(
      {
        foundingExpert: {
          status: 'active',
          programId: testProgramId,
          zeroFeeSlotsUsed: 3,
          reducedFeeStartsAt: new Date('2030-01-01T00:00:00.000Z'),
          reducedFeeEndsAt: futureEnd,
        },
      },
      mid2030
    );
    expect(r.stage).toBe(STAGE.FOUNDING_REDUCED);
    expect(r.expertFeeBps).toBe(750);
    expect(r.benefitLabel).toBe('Reduced Founding Expert fee applied');
    expect(r.effectiveReducedFeeEndsAt).toEqual(futureEnd);
    expect(r.derivedReducedFeeEndsAt).toBe(false);
  });

  it('active founding after reduced period ended → standard_launch', () => {
    const r = getFoundingExpertStage(
      {
        foundingExpert: {
          status: 'active',
          programId: testProgramId,
          zeroFeeSlotsUsed: 5,
          reducedFeeEndsAt: pastEnd,
        },
      },
      mid2030
    );
    expect(r.stage).toBe(STAGE.STANDARD_LAUNCH);
    expect(r.expertFeeBps).toBe(1000);
    expect(r.benefitLabel).toBe('Standard launch fee');
  });

  it('derives reducedFeeEndsAt from reducedFeeStartsAt when ends missing', () => {
    const startsAt = new Date('2030-01-01T00:00:00.000Z');
    const expectedEnd = deriveReducedFeeEndsAt(startsAt);
    const r = getFoundingExpertStage(
      {
        foundingExpert: {
          status: 'active',
          programId: testProgramId,
          zeroFeeSlotsUsed: 3,
          reducedFeeStartsAt: startsAt,
        },
      },
      new Date('2030-02-01T00:00:00.000Z')
    );
    expect(r.stage).toBe(STAGE.FOUNDING_REDUCED);
    expect(r.expertFeeBps).toBe(750);
    expect(r.derivedReducedFeeEndsAt).toBe(true);
    expect(r.effectiveReducedFeeEndsAt.getTime()).toBe(expectedEnd.getTime());
  });

  it('reads Firestore-like Timestamp on reducedFeeEndsAt', () => {
    const r = getFoundingExpertStage(
      {
        foundingExpert: {
          status: 'active',
          programId: testProgramId,
          zeroFeeSlotsUsed: 3,
          reducedFeeEndsAt: { _seconds: Math.floor(futureEnd.getTime() / 1000), _nanoseconds: 0 },
        },
      },
      mid2030
    );
    expect(r.stage).toBe(STAGE.FOUNDING_REDUCED);
    expect(r.expertFeeBps).toBe(750);
  });
});

describe('calculateExpertFeeSnapshot', () => {
  const now = new Date('2030-05-01T10:00:00.000Z');

  it('non-founding profile produces standard_launch snapshot with 10% fee math', () => {
    const snap = calculateExpertFeeSnapshot({
      expertProfile: {},
      grossAmountCents: 20000,
      jobId: 'job-a',
      now,
    });
    expect(snap.programId).toBeNull();
    expect(snap.jobId).toBe('job-a');
    expect(snap.stage).toBe(STAGE.STANDARD_LAUNCH);
    expect(snap.expertFeeBps).toBe(1000);
    expect(snap.grossAmountCents).toBe(20000);
    expect(snap.taskioFeeCents).toBe(2000);
    expect(snap.expertNetCents).toBe(18000);
    expect(snap.benefitLabel).toBe('Standard launch fee');
    expect(snap.calculatedAt).toBe(now.toISOString());
    expect(snap.lockedAt).toBeNull();
  });

  it('founding first three: 0% fee', () => {
    const snap = calculateExpertFeeSnapshot({
      expertProfile: {
        foundingExpert: { status: 'active', programId: testProgramId, zeroFeeSlotsUsed: 1 },
      },
      grossAmountCents: 15000,
      jobId: 'job-b',
      now,
    });
    expect(snap.stage).toBe(STAGE.FOUNDING_FIRST_THREE);
    expect(snap.programId).toBe(testProgramId);
    expect(snap.expertFeeBps).toBe(0);
    expect(snap.taskioFeeCents).toBe(0);
    expect(snap.expertNetCents).toBe(15000);
    expect(snap.benefitLabel).toBe('Founding Expert benefit applied');
  });

  it('founding reduced: 7.5%', () => {
    const snap = calculateExpertFeeSnapshot({
      expertProfile: {
        foundingExpert: {
          status: 'active',
          programId: testProgramId,
          zeroFeeSlotsUsed: 3,
          reducedFeeEndsAt: new Date('2030-12-31T00:00:00.000Z'),
        },
      },
      grossAmountCents: 10000,
      jobId: 'job-c',
      now,
    });
    expect(snap.stage).toBe(STAGE.FOUNDING_REDUCED);
    expect(snap.programId).toBe(testProgramId);
    expect(snap.taskioFeeCents).toBe(750);
    expect(snap.expertNetCents).toBe(9250);
  });

  it('requires jobId', () => {
    expect(() =>
      calculateExpertFeeSnapshot({
        expertProfile: {},
        grossAmountCents: 100,
        jobId: '   ',
        now,
      })
    ).toThrow(/jobId/);
  });
});

describe('deriveReducedFeeEndsAt', () => {
  it('adds configured calendar months to start', () => {
    const start = new Date(Date.UTC(2026, 0, 15));
    const end = deriveReducedFeeEndsAt(start);
    expect(end.toISOString()).toBe(new Date(Date.UTC(2026, 3, 15)).toISOString());
  });
});

describe('buildExpertFoundingFeeProfile', () => {
  const now = new Date('2026-05-01T10:00:00.000Z');

  it('maps expert-facing labels without changing stage rules', () => {
    const p = buildExpertFoundingFeeProfile(
      {
        foundingExpert: {
          status: 'active',
          programId: testProgramId,
          zeroFeeSlotsUsed: 1,
        },
      },
      now
    );
    expect(p.stage).toBe(STAGE.FOUNDING_FIRST_THREE);
    expect(p.expertFeeBps).toBe(0);
    expect(p.benefitLabel).toBe('Founding Expert offer');
    expect(p.estimateOnly).toBe(true);
  });
});

describe('estimateExpertFeeForGross', () => {
  const now2030Early = new Date('2030-02-01T00:00:00.000Z');

  it('0% founding first three', () => {
    const e = estimateExpertFeeForGross({
      grossAmountCents: 15000,
      expertProfile: {
        foundingExpert: { status: 'active', programId: testProgramId, zeroFeeSlotsUsed: 0 },
      },
      now: now2030Early,
    });
    expect(e.taskioFeeCents).toBe(0);
    expect(e.expertReceivesCents).toBe(15000);
    expect(e.expertFeeBps).toBe(0);
    expect(e.finalisedWhen).toBe('client_funds_task');
  });

  it('7.5% with rounding', () => {
    const e = estimateExpertFeeForGross({
      grossAmountCents: 15000,
      expertProfile: {
        foundingExpert: {
          status: 'active',
          programId: testProgramId,
          zeroFeeSlotsUsed: 3,
          reducedFeeEndsAt: new Date('2099-01-01T00:00:00.000Z'),
        },
      },
      now: now2030Early,
    });
    expect(e.taskioFeeCents).toBe(1125);
    expect(e.expertReceivesCents).toBe(13875);
  });

  it('10% standard', () => {
    const e = estimateExpertFeeForGross({ grossAmountCents: 15000, expertProfile: {}, now: now2030Early });
    expect(e.taskioFeeCents).toBe(1500);
    expect(e.expertReceivesCents).toBe(13500);
    expect(e.benefitLabel).toBe('Standard launch fee');
  });

  it('rejects invalid gross', () => {
    expect(() => estimateExpertFeeForGross({ grossAmountCents: 0, expertProfile: {} })).toThrow(/positive integer/);
    expect(() => estimateExpertFeeForGross({ grossAmountCents: 1.2, expertProfile: {} })).toThrow(/positive integer/);
  });
});
