'use strict';

const { defaultPlatformFeePercentFromEnv } = require('../../shared/feePlans');
const { BASE_FUNDING_SOURCE } = require('../src/services/jobFeeSnapshotService');
const { STAGE } = require('../src/services/expertFeeProgram');
const {
  buildVariationPaymentFeeSnapshot,
  deriveVariationReleaseSlice,
} = require('../src/services/variationFeeSnapshotService');
const { buildExpertReleasePlan } = require('../src/services/expertJobRelease');

function baseFundingSnap(jobId, expertUid, overrides = {}) {
  return {
    source: BASE_FUNDING_SOURCE,
    version: 1,
    jobId,
    expertUid,
    grossAmountCents: 10000,
    taskioFeeCents: 0,
    expertNetCents: 10000,
    lockedAt: '2026-01-01T00:00:00.000Z',
    stage: STAGE.FOUNDING_FIRST_THREE,
    expertFeeBps: 0,
    benefitLabel: 'Founding Expert benefit applied',
    programId: 'melbourne_founding_expert_test_2026',
    ...overrides,
  };
}

describe('variationFeeSnapshot inherited rules', () => {
  describe('deriveVariationReleaseSlice', () => {
    it('inherits 0% from base feeSnapshot — gross $1000 Expert gets $1000', () => {
      const job = {
        acceptedTradieUid: 'expert-1',
        feeSnapshot: baseFundingSnap('job-a', 'expert-1'),
      };
      const s = deriveVariationReleaseSlice(job, 'job-a', 'v1', {
        priceChangeCents: 1000,
        paymentIntentId: 'pi_x',
      });
      expect(s.platformFeeCents).toBe(0);
      expect(s.providerCents).toBe(1000);
      expect(s.variationFeeSource).toBe('base_fee_snapshot_inherited');
      expect(s.expertFeeBps).toBe(0);
    });

    it('inherits 7.5% — gross $10000 fee $750 Expert $9250', () => {
      const job = {
        acceptedTradieUid: 'expert-2',
        feeSnapshot: baseFundingSnap('job-b', 'expert-2', {
          stage: STAGE.FOUNDING_REDUCED,
          expertFeeBps: 750,
          taskioFeeCents: 750,
          expertNetCents: 9250,
          grossAmountCents: 10000,
          benefitLabel: 'Reduced',
        }),
      };
      const s = deriveVariationReleaseSlice(job, 'job-b', 'v2', {
        priceChangeCents: 10000,
        paymentIntentId: 'pi_y',
      });
      expect(s.platformFeeCents).toBe(750);
      expect(s.providerCents).toBe(9250);
    });

    it('inherits 10% — variation gross $54 fee $540 Expert $4860', () => {
      const job = {
        acceptedTradieUid: 'expert-3',
        feeSnapshot: baseFundingSnap('job-c', 'expert-3', {
          stage: STAGE.STANDARD_LAUNCH,
          expertFeeBps: 1000,
          taskioFeeCents: 1000,
          expertNetCents: 9000,
          grossAmountCents: 10000,
        }),
      };
      const s = deriveVariationReleaseSlice(job, 'job-c', 'v3', {
        priceChangeCents: 5400,
        paymentIntentId: 'pi_z',
      });
      expect(s.platformFeeCents).toBe(540);
      expect(s.providerCents).toBe(4860);
    });

    it('missing base feeSnapshot falls back to 10%, never inherits env 15%', () => {
      const job = { acceptedTradieUid: 'e' };
      const s = deriveVariationReleaseSlice(job, 'legacy', 'v', {
        priceChangeCents: 5400,
        paymentIntentId: 'pi',
      });
      expect(s.platformFeeCents).toBe(540);
      expect(s.providerCents).toBe(4860);
      expect(s.variationFeeSource).toBe('standard_launch_fallback');
      expect(s.expertFeeBps).toBe(1000);
    });

    it('prefers persisted variation_fee_snapshot_v1 when valid', () => {
      const fs = buildVariationPaymentFeeSnapshot({
        job: { acceptedTradieUid: 'exp', feeSnapshot: baseFundingSnap('j', 'exp', { grossAmountCents: 5000 }) },
        jobId: 'j',
        variationId: 'var1',
        variationGrossCents: 2000,
        now: new Date('2028-06-01T00:00:00.000Z'),
      });
      const s = deriveVariationReleaseSlice(
        {},
        'j',
        'var1',
        { priceChangeCents: 2000, paymentIntentId: 'pi_snap', feeSnapshot: fs },
      );
      expect(s.variationFeeSource).toBe('variation_fee_snapshot_v1');
      expect(fs.taskioFeeCents).toBe(0);
      expect(s.providerCents).toBe(2000);
    });
  });

  describe('buildVariationPaymentFeeSnapshot', () => {
    it('does not mutate foundingExpert / zeroFeeSlotsUsed (snapshot only)', () => {
      const snap = buildVariationPaymentFeeSnapshot({
        job: { acceptedTradieUid: 'x', feeSnapshot: baseFundingSnap('jfee', 'x') },
        jobId: 'jfee',
        variationId: 'v',
        variationGrossCents: 999,
      });
      expect(snap.zeroFeeSlotsUsed).toBeUndefined();
      expect(snap.inheritedFromBaseJobFeeSnapshot).toBe(true);
      expect(snap.taskioFeeCents).toBe(0);
    });
  });

  describe('buildExpertReleasePlan release totals', () => {
    it('case D: base $197 + variation $54 both 10%', () => {
      const job = {
        paymentAmountCents: 19700,
        acceptedTradieUid: 'trad',
        feeSnapshot: {
          ...baseFundingSnap('job-d', 'trad', {
            grossAmountCents: 19700,
            stage: STAGE.STANDARD_LAUNCH,
            expertFeeBps: 1000,
            expertNetCents: 17730,
            taskioFeeCents: 1970,
          }),
        },
      };
      const plan = buildExpertReleasePlan(
        job,
        [{ id: 'vx', data: { priceChangeCents: 5400, paymentIntentId: 'pi_v' } }],
        10,
        {
          releaseJobId: 'job-d',
          baseSliceOverride: { grossCents: 19700, platformFeeCents: 1970, providerCents: 17730 },
          baseFeeSource: 'fee_snapshot_v1',
        },
      );
      expect(plan.variationSlices[0].providerCents).toBe(4860);
      expect(plan.variationSlices[0].platformFeeCents).toBe(540);
      expect(plan.totals.totalProviderCents).toBe(17730 + 4860);
      expect(plan.totals.totalPlatformFeeCents).toBe(1970 + 540);
    });

    it('founding zero base $85 + variation $10 yields full $9500 to provider zero platform fees', () => {
      const job = {
        paymentAmountCents: 8500,
        acceptedTradieUid: 't2',
        feeSnapshot: baseFundingSnap('jf', 't2', {
          grossAmountCents: 8500,
          taskioFeeCents: 0,
          expertNetCents: 8500,
        }),
      };
      const plan = buildExpertReleasePlan(
        job,
        [{ id: 'vz', data: { priceChangeCents: 1000, paymentIntentId: 'pi_vz' } }],
        10,
        {
          releaseJobId: 'jf',
          baseSliceOverride: { grossCents: 8500, platformFeeCents: 0, providerCents: 8500 },
          baseFeeSource: 'fee_snapshot_v1',
        },
      );
      expect(plan.totals.totalProviderCents).toBe(9500);
      expect(plan.totals.totalPlatformFeeCents).toBe(0);
    });
  });

  describe('computeFeeSlice (launch default)', () => {
    const { computeFeeSlice } = require('../src/services/expertJobRelease');
    it('uses 10% when platformFeePercent non-finite', () => {
      const s = computeFeeSlice(1000, Number.NaN);
      expect(s.platformFeeCents).toBe(100);
      expect(s.providerCents).toBe(900);
    });
  });

  describe('defaultPlatformFeePercentFromEnv', () => {
    it('explicit PLATFORM_FEE_PERCENT overrides standard 10%', () => {
      expect(defaultPlatformFeePercentFromEnv({ PLATFORM_FEE_PERCENT: '12.5' })).toBe(12.5);
    });
    it('empty env uses 10%', () => {
      expect(defaultPlatformFeePercentFromEnv({ PLATFORM_FEE_PERCENT: '' })).toBe(10);
      expect(defaultPlatformFeePercentFromEnv({})).toBe(10);
    });
  });
});
