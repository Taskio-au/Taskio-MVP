'use strict';

jest.mock('../src/firebaseAdmin', () => ({
  admin: {},
  db: {
    collection: jest.fn(),
  },
}));

const { db } = require('../src/firebaseAdmin');
const { BASE_FUNDING_SOURCE } = require('../src/services/jobFeeSnapshotService');
const { STAGE } = require('../src/services/expertFeeProgram');
const { createExpertReleaseStripeTransfers } = require('../src/services/expertJobRelease');

function feeSnap(overrides = {}) {
  return {
    source: BASE_FUNDING_SOURCE,
    version: 1,
    jobId: 'job-snap',
    expertUid: 'tradie-1',
    grossAmountCents: 10000,
    taskioFeeCents: 1000,
    expertNetCents: 9000,
    lockedAt: '2026-01-01T00:00:00.000Z',
    stage: STAGE.STANDARD_LAUNCH,
    expertFeeBps: 1000,
    ...overrides,
  };
}

describe('createExpertReleaseStripeTransfers feeSnapshot base slice', () => {
  let variationsDocs;

  beforeEach(() => {
    variationsDocs = [];
    db.collection.mockImplementation((name) => {
      expect(name).toBe('jobs');
      return {
        doc: () => ({
          collection: (sub) => {
            expect(sub).toBe('variations');
            return {
              get: jest.fn(async () => ({
                docs: variationsDocs.map((d) => ({
                  id: d.id,
                  data: () => d.data,
                })),
              })),
            };
          },
        }),
      };
    });
  });

  const deps = {
    homeownerUid: 'h1',
    tradieUid: 'tradie-1',
    destinationAccountId: 'acct_x',
    currency: 'aud',
    platformFeePercent: 10,
    createTransfer: jest.fn(() => Promise.resolve({ id: 'tr_1' })),
    getSucceededChargeIdForConnectTransfer: jest.fn(() => Promise.resolve({ chargeId: 'ch_1' })),
    idempotencyPrefix: 'taskio_release',
  };

  beforeEach(() => {
    deps.createTransfer.mockClear();
    deps.getSucceededChargeIdForConnectTransfer.mockClear();
  });

  it('uses valid feeSnapshot for base transfer amount (standard launch)', async () => {
    const job = {
      paymentIntentId: 'pi_1',
      paymentAmountCents: 10000,
      acceptedTradieUid: 'tradie-1',
      feeSnapshot: feeSnap(),
    };

    const r = await createExpertReleaseStripeTransfers({
      jobId: 'job-snap',
      job,
      ...deps,
    });

    expect(r.error).toBeUndefined();
    expect(r.plan.baseFeeSource).toBe('fee_snapshot_v1');
    expect(r.plan.baseSlice.providerCents).toBe(9000);
    expect(deps.createTransfer).toHaveBeenCalledWith(
      expect.objectContaining({ amountInCents: 9000, idempotencyKey: 'taskio_release_job-snap' })
    );
  });

  it('falls back to legacy base slice when snapshot jobId mismatches', async () => {
    const job = {
      paymentIntentId: 'pi_1',
      paymentAmountCents: 10000,
      acceptedTradieUid: 'tradie-1',
      feeSnapshot: feeSnap({ jobId: 'wrong-id' }),
    };

    const r = await createExpertReleaseStripeTransfers({
      jobId: 'job-snap',
      job,
      ...deps,
    });

    expect(r.plan.baseFeeSource).toBe('legacy_platform_fee_percent');
    expect(r.plan.baseSlice.providerCents).toBe(9000);
    expect(deps.createTransfer).toHaveBeenCalledWith(expect.objectContaining({ amountInCents: 9000 }));
  });

  it('founding zero-fee snapshot transfers full gross to expert', async () => {
    const job = {
      paymentIntentId: 'pi_1',
      paymentAmountCents: 10000,
      acceptedTradieUid: 'tradie-1',
      feeSnapshot: feeSnap({
        taskioFeeCents: 0,
        expertNetCents: 10000,
        expertFeeBps: 0,
        stage: STAGE.FOUNDING_FIRST_THREE,
      }),
    };

    const r = await createExpertReleaseStripeTransfers({
      jobId: 'job-snap',
      job,
      ...deps,
    });

    expect(r.plan.baseFeeSource).toBe('fee_snapshot_v1');
    expect(r.plan.baseSlice.platformFeeCents).toBe(0);
    expect(deps.createTransfer).toHaveBeenCalledWith(expect.objectContaining({ amountInCents: 10000 }));
  });

  it('reduced-fee snapshot uses 750 cents Taskio fee on 10000 gross', async () => {
    const job = {
      paymentIntentId: 'pi_1',
      paymentAmountCents: 10000,
      acceptedTradieUid: 'tradie-1',
      feeSnapshot: feeSnap({
        taskioFeeCents: 750,
        expertNetCents: 9250,
        expertFeeBps: 750,
        stage: STAGE.FOUNDING_REDUCED,
      }),
    };

    const r = await createExpertReleaseStripeTransfers({
      jobId: 'job-snap',
      job,
      ...deps,
    });

    expect(r.plan.baseFeeSource).toBe('fee_snapshot_v1');
    expect(deps.createTransfer).toHaveBeenCalledWith(expect.objectContaining({ amountInCents: 9250 }));
  });

  it('mixed base snapshot + variation inherits base snapshot expertFeeBps', async () => {
    variationsDocs = [
      {
        id: 'v1',
        data: {
          status: 'approved',
          paymentState: 'in_escrow',
          paymentStatus: 'paid',
          priceChangeCents: 5000,
          paymentIntentId: 'pi_var',
        },
      },
    ];
    deps.getSucceededChargeIdForConnectTransfer.mockImplementation((pi) =>
      Promise.resolve({ chargeId: pi === 'pi_var' ? 'ch_var' : 'ch_base' })
    );
    let tr = 0;
    deps.createTransfer.mockImplementation(() => {
      tr += 1;
      return Promise.resolve({ id: `tr_${tr}` });
    });

    const job = {
      paymentIntentId: 'pi_1',
      paymentAmountCents: 10000,
      acceptedTradieUid: 'tradie-1',
      feeSnapshot: feeSnap(),
    };

    const r = await createExpertReleaseStripeTransfers({
      jobId: 'job-snap',
      job,
      ...deps,
    });

    expect(r.error).toBeUndefined();
    expect(r.plan.totals.totalProviderCents).toBe(9000 + 4500);
    expect(r.plan.totals.totalPlatformFeeCents).toBe(1000 + 500);
    expect(deps.createTransfer).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ amountInCents: 9000, sourceTransaction: 'ch_base' })
    );
    expect(deps.createTransfer).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ amountInCents: 4500, sourceTransaction: 'ch_var' })
    );
  });

  it('uses taskio_admin_resolve_expert idempotency keys when prefix set', async () => {
    const job = {
      paymentIntentId: 'pi_1',
      paymentAmountCents: 10000,
      acceptedTradieUid: 'tradie-1',
      feeSnapshot: feeSnap(),
    };

    await createExpertReleaseStripeTransfers({
      jobId: 'job-snap',
      job,
      ...deps,
      idempotencyPrefix: 'taskio_admin_resolve_expert',
    });

    expect(deps.createTransfer).toHaveBeenCalledWith(
      expect.objectContaining({ idempotencyKey: 'taskio_admin_resolve_expert_job-snap' })
    );
  });
});
