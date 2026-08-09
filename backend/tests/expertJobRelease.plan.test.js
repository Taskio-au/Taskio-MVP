const {
  shouldIncludeVariationInExpertRelease,
  buildExpertReleasePlan,
  computeFeeSlice,
} = require('../src/services/expertJobRelease');

describe('expertJobRelease plan', () => {
  const job = { paymentAmountCents: 20000 };
  const pct = 10;

  it('buildExpertReleasePlan: base only when no variations', () => {
    const plan = buildExpertReleasePlan(job, [], pct);
    expect(plan.baseSlice.providerCents).toBe(18000);
    expect(plan.totals.totalProviderCents).toBe(18000);
    expect(plan.totals.totalGrossCents).toBe(20000);
    expect(plan.baseFeeSource).toBe('legacy_platform_fee_percent');
    expect(plan.variationFeeSource).toBe('platform_fee_percent');
    expect(plan.releasePlanVersion).toBe(2);
  });

  it('buildExpertReleasePlan: includes one paid variation gross (standard 10)', () => {
    const plan = buildExpertReleasePlan(job, [
      { id: 'v1', data: { priceChangeCents: 10000, paymentIntentId: 'pi_v1' } },
    ], pct, { releaseJobId: 'any-job-id' });
    expect(plan.baseSlice.providerCents).toBe(18000);
    expect(plan.variationSlices[0].providerCents).toBe(9000);
    expect(plan.totals.totalGrossCents).toBe(30000);
    expect(plan.totals.totalProviderCents).toBe(27000);
  });

  it('buildExpertReleasePlan: optional fee snapshot override for base slice only', () => {
    const plan = buildExpertReleasePlan(job, [
      { id: 'v1', data: { priceChangeCents: 10000, paymentIntentId: 'pi_v1' } },
    ], pct, {
      releaseJobId: 'jid',
      baseSliceOverride: { grossCents: 20000, platformFeeCents: 1000, providerCents: 19000 },
      baseFeeSource: 'fee_snapshot_v1',
      releasePlanVersion: 2,
    });
    expect(plan.baseSlice.grossCents).toBe(20000);
    expect(plan.baseSlice.platformFeeCents).toBe(1000);
    expect(plan.baseSlice.providerCents).toBe(19000);
    expect(plan.variationSlices[0].providerCents).toBe(9000);
    expect(plan.totals.totalPlatformFeeCents).toBe(1000 + 1000);
    expect(plan.totals.totalProviderCents).toBe(19000 + 9000);
    expect(plan.baseFeeSource).toBe('fee_snapshot_v1');
  });

  it('shouldIncludeVariationInExpertRelease: paid + in_escrow', () => {
    expect(shouldIncludeVariationInExpertRelease({
      status: 'approved',
      paymentState: 'in_escrow',
      paymentStatus: 'paid',
      priceChangeCents: 5000,
      paymentIntentId: 'pi_x',
    })).toBe(true);
  });

  it('shouldIncludeVariationInExpertRelease: excludes awaiting_payment', () => {
    expect(shouldIncludeVariationInExpertRelease({
      status: 'awaiting_payment',
      paymentState: 'pending_payment',
      paymentStatus: 'unpaid',
      priceChangeCents: 5000,
      paymentIntentId: 'pi_x',
    })).toBe(false);
  });

  it('shouldIncludeVariationInExpertRelease: excludes declined', () => {
    expect(shouldIncludeVariationInExpertRelease({
      status: 'declined',
      paymentState: 'in_escrow',
      paymentStatus: 'paid',
      priceChangeCents: 5000,
      paymentIntentId: 'pi_x',
    })).toBe(false);
  });

  it('shouldIncludeVariationInExpertRelease: excludes already released', () => {
    expect(shouldIncludeVariationInExpertRelease({
      releaseStatus: 'released',
      status: 'approved',
      paymentState: 'in_escrow',
      paymentStatus: 'paid',
      priceChangeCents: 5000,
      paymentIntentId: 'pi_x',
    })).toBe(false);
  });

  it('shouldIncludeVariationInExpertRelease: excludes missing paymentIntentId', () => {
    expect(shouldIncludeVariationInExpertRelease({
      status: 'approved',
      paymentState: 'in_escrow',
      paymentStatus: 'paid',
      priceChangeCents: 5000,
    })).toBe(false);
  });

  it('computeFeeSlice falls back to 10% Taskio fee', () => {
    const s = computeFeeSlice(10000, NaN);
    expect(s.platformFeeCents).toBe(1000);
    expect(s.providerCents).toBe(9000);
  });
});
