'use strict';

const {
  computeBaseJobFundingFeeSnapshotTx,
  ensureBaseJobFeeSnapshotLocked,
  BASE_FUNDING_SOURCE,
  validateBaseJobFeeSnapshotForRelease,
} = require('../src/services/jobFeeSnapshotService');
const { STAGE, deriveReducedFeeEndsAt } = require('../src/services/expertFeeProgram');

function jobRefMock(jobId = 'job-1') {
  return { id: jobId };
}

function userRefMock(uid = 'expert-1') {
  return { id: uid };
}

function makeDb() {
  return {
    collection() {
      return {
        doc(id) {
          return { id };
        },
      };
    },
  };
}

function makeTx(jobData, userDataByExpertId, jobKey = 'job-1') {
  return {
    get: jest.fn(async (ref) => {
      if (ref.id === jobKey) {
        const payload = { ...jobData };
        return { exists: true, data: () => JSON.parse(JSON.stringify(payload)) };
      }
      if (userDataByExpertId[ref.id]) {
        return {
          exists: true,
          data: () => JSON.parse(JSON.stringify(userDataByExpertId[ref.id])),
        };
      }
      return { exists: false, data: () => null };
    }),
  };
}

describe('jobFeeSnapshotService.computeBaseJobFundingFeeSnapshotTx', () => {
  const admin = {
    firestore: {
      FieldValue: {
        serverTimestamp: jest.fn(() => '__sv__'),
      },
      Timestamp: {
        fromDate: jest.fn((d) => ({ __seconds: Math.floor(d.getTime() / 1000) })),
      },
    },
  };

  const jobId = 'job-1';
  const expertUid = 'expert-1';
  const now = new Date('2031-06-15T12:00:00.000Z');
  const gross = 20000;

  const baseJob = {
    acceptedTradieUid: expertUid,
    paymentState: 'pending_payment',
    paymentStatus: 'requires_payment_method',
    paymentAmountCents: gross,
  };

  const fundingPatch = {
    paymentState: 'in_escrow',
    paymentStatus: 'succeeded',
    paymentAmountCents: gross,
  };

  function expertFounding(overrides) {
    return {
      role: 'tradie',
      foundingExpert: {
        status: 'active',
        programId: 'melbourne_founding_expert_test_2026',
        ...overrides,
      },
    };
  }

  it('A: non-founding Expert → standard_launch snapshot, no slot', async () => {
    const jobData = { ...baseJob };
    const users = { [expertUid]: { role: 'tradie' } };
    const tx = makeTx(jobData, users, jobId);
    const db = makeDb();

    const r = await computeBaseJobFundingFeeSnapshotTx(tx, admin, db, {
      jobRef: jobRefMock(jobId),
      jobData,
      nextJobPatch: fundingPatch,
      grossAmountCents: gross,
      now,
    });

    expect(r.idempotent).toBeUndefined();
    expect(r.feeSnapshot.stage).toBe(STAGE.STANDARD_LAUNCH);
    expect(r.feeSnapshot.expertFeeBps).toBe(1000);
    expect(r.feeSnapshot.taskioFeeCents).toBe(2000);
    expect(r.feeSnapshot.zeroFeeSlotConsumed).toBe(false);
    expect(r.userWrite).toBeNull();
  });

  it('B: founding first slot consumes one zero-fee slot', async () => {
    const jobData = { ...baseJob };
    const users = { [expertUid]: expertFounding({ zeroFeeSlotsUsed: 0 }) };
    const tx = makeTx(jobData, users, jobId);
    const db = makeDb();

    const r = await computeBaseJobFundingFeeSnapshotTx(tx, admin, db, {
      jobRef: jobRefMock(jobId),
      jobData,
      nextJobPatch: fundingPatch,
      grossAmountCents: gross,
      now,
    });

    expect(r.feeSnapshot.stage).toBe(STAGE.FOUNDING_FIRST_THREE);
    expect(r.feeSnapshot.taskioFeeCents).toBe(0);
    expect(r.feeSnapshot.zeroFeeSlotConsumed).toBe(true);
    expect(r.userWrite.mergeData.foundingExpert.zeroFeeSlotsUsed).toBe(1);
  });

  it('C: third zero-fee funding keeps snapshot stage founding_first_three and opens reduced window', async () => {
    const jobData = { ...baseJob };
    const users = { [expertUid]: expertFounding({ zeroFeeSlotsUsed: 2 }) };
    const tx = makeTx(jobData, users, jobId);
    const db = makeDb();

    const r = await computeBaseJobFundingFeeSnapshotTx(tx, admin, db, {
      jobRef: jobRefMock(jobId),
      jobData,
      nextJobPatch: fundingPatch,
      grossAmountCents: gross,
      now,
    });

    expect(r.feeSnapshot.stage).toBe(STAGE.FOUNDING_FIRST_THREE);
    expect(r.userWrite.mergeData.foundingExpert.zeroFeeSlotsUsed).toBe(3);
    expect(r.userWrite.mergeData.foundingExpert.reducedFeeStartsAt).toEqual({
      __seconds: Math.floor(now.getTime() / 1000),
    });
    const expectedEnd = deriveReducedFeeEndsAt(now);
    expect(admin.firestore.Timestamp.fromDate).toHaveBeenCalledWith(expectedEnd);
  });

  it('D: within reduced window → founding_reduced 750, no slot consumed', async () => {
    const futureEnd = new Date('2032-01-01T00:00:00.000Z');
    const jobData = { ...baseJob };
    const users = {
      [expertUid]: expertFounding({
        zeroFeeSlotsUsed: 3,
        reducedFeeStartsAt: new Date('2031-01-01T00:00:00.000Z'),
        reducedFeeEndsAt: futureEnd,
      }),
    };
    const tx = makeTx(jobData, users, jobId);
    const db = makeDb();

    const r = await computeBaseJobFundingFeeSnapshotTx(tx, admin, db, {
      jobRef: jobRefMock(jobId),
      jobData,
      nextJobPatch: fundingPatch,
      grossAmountCents: gross,
      now,
    });

    expect(r.feeSnapshot.stage).toBe(STAGE.FOUNDING_REDUCED);
    expect(r.feeSnapshot.expertFeeBps).toBe(750);
    expect(r.feeSnapshot.zeroFeeSlotConsumed).toBe(false);
    expect(r.userWrite).toBeNull();
  });

  it('E: after reduced window → standard_launch 1000', async () => {
    const jobData = { ...baseJob };
    const users = {
      [expertUid]: expertFounding({
        zeroFeeSlotsUsed: 5,
        reducedFeeEndsAt: new Date('2030-01-01T00:00:00.000Z'),
      }),
    };
    const tx = makeTx(jobData, users, jobId);
    const db = makeDb();

    const r = await computeBaseJobFundingFeeSnapshotTx(tx, admin, db, {
      jobRef: jobRefMock(jobId),
      jobData,
      nextJobPatch: fundingPatch,
      grossAmountCents: gross,
      now,
    });

    expect(r.feeSnapshot.stage).toBe(STAGE.STANDARD_LAUNCH);
    expect(r.feeSnapshot.expertFeeBps).toBe(1000);
    expect(r.userWrite).toBeNull();
  });

  it('F: removed founding Expert → standard_launch, no slot', async () => {
    const jobData = { ...baseJob };
    const users = {
      [expertUid]: expertFounding({ status: 'removed', zeroFeeSlotsUsed: 0 }),
    };
    const tx = makeTx(jobData, users, jobId);
    const db = makeDb();

    const r = await computeBaseJobFundingFeeSnapshotTx(tx, admin, db, {
      jobRef: jobRefMock(jobId),
      jobData,
      nextJobPatch: fundingPatch,
      grossAmountCents: gross,
      now,
    });

    expect(r.feeSnapshot.stage).toBe(STAGE.STANDARD_LAUNCH);
    expect(r.userWrite).toBeNull();
  });

  it('F2: test_reset founding Expert → standard_launch, no slot', async () => {
    const jobData = { ...baseJob };
    const users = {
      [expertUid]: expertFounding({ status: 'test_reset', zeroFeeSlotsUsed: 0 }),
    };
    const tx = makeTx(jobData, users, jobId);
    const db = makeDb();

    const r = await computeBaseJobFundingFeeSnapshotTx(tx, admin, db, {
      jobRef: jobRefMock(jobId),
      jobData,
      nextJobPatch: fundingPatch,
      grossAmountCents: gross,
      now,
    });

    expect(r.feeSnapshot.stage).toBe(STAGE.STANDARD_LAUNCH);
    expect(r.userWrite).toBeNull();
  });

  it('G: idempotent when feeSnapshot already locked', async () => {
    const existing = {
      source: BASE_FUNDING_SOURCE,
      stage: STAGE.FOUNDING_FIRST_THREE,
      expertUid,
    };
    const jobDataG = { ...baseJob, feeSnapshot: existing };
    const users = { [expertUid]: expertFounding({ zeroFeeSlotsUsed: 0 }) };
    const tx = makeTx(jobDataG, users, jobId);
    const db = makeDb();

    const r = await computeBaseJobFundingFeeSnapshotTx(tx, admin, db, {
      jobRef: jobRefMock(jobId),
      jobData: jobDataG,
      nextJobPatch: fundingPatch,
      grossAmountCents: gross,
      now,
    });

    expect(r.idempotent).toBe(true);
    expect(r.feeSnapshot).toEqual(existing);
    expect(r.userWrite).toBeUndefined();
  });

  it('skips when payment not yet in escrow', async () => {
    const jobData = { ...baseJob };
    const users = { [expertUid]: expertFounding({ zeroFeeSlotsUsed: 0 }) };
    const tx = makeTx(jobData, users, jobId);
    const db = makeDb();

    const r = await computeBaseJobFundingFeeSnapshotTx(tx, admin, db, {
      jobRef: jobRefMock(jobId),
      jobData,
      nextJobPatch: { paymentState: 'pending_payment', paymentStatus: 'requires_payment_method' },
      grossAmountCents: gross,
      now,
    });

    expect(r.feeSnapshot).toBeUndefined();
  });

  it('does not overwrite existing reducedFee dates when advancing to 3', async () => {
    const jobData = { ...baseJob };
    const existingStart = { __seconds: 100 };
    const existingEnd = { __seconds: 200 };
    const users = {
      [expertUid]: expertFounding({
        zeroFeeSlotsUsed: 2,
        reducedFeeStartsAt: existingStart,
        reducedFeeEndsAt: existingEnd,
      }),
    };
    const tx = makeTx(jobData, users, jobId);
    const db = makeDb();

    const r = await computeBaseJobFundingFeeSnapshotTx(tx, admin, db, {
      jobRef: jobRefMock(jobId),
      jobData,
      nextJobPatch: fundingPatch,
      grossAmountCents: gross,
      now,
    });

    expect(r.userWrite.mergeData.foundingExpert.zeroFeeSlotsUsed).toBe(3);
    expect(r.userWrite.mergeData.foundingExpert.reducedFeeStartsAt).toEqual(existingStart);
    expect(r.userWrite.mergeData.foundingExpert.reducedFeeEndsAt).toEqual(existingEnd);
  });
});

describe('ensureBaseJobFeeSnapshotLocked', () => {
  const admin = {
    firestore: {
      FieldValue: {
        serverTimestamp: jest.fn(() => '__sv__'),
      },
      Timestamp: {
        fromDate: jest.fn((d) => ({ __sec: d.toISOString() })),
      },
    },
  };

  it('recovery path locks snapshot when job already funded', async () => {
    const expertUid = 'exp-r';
    const jobPayload = {
      acceptedTradieUid: expertUid,
      paymentState: 'in_escrow',
      paymentStatus: 'succeeded',
      paymentAmountCents: 15000,
    };
    const userPayload = {
      foundingExpert: {
        status: 'active',
        programId: 'melbourne_founding_expert_test_2026',
        zeroFeeSlotsUsed: 0,
      },
    };

    let storedJob = { ...jobPayload };
    let storedUser = { ...userPayload };

    const jobRef = { id: 'job-rec' };

    const txApi = {
      async get(ref) {
        if (ref === jobRef) {
          return { exists: true, data: () => JSON.parse(JSON.stringify(storedJob)) };
        }
        if (ref.id === expertUid) {
          return { exists: true, data: () => JSON.parse(JSON.stringify(storedUser)) };
        }
        return { exists: false, data: () => null };
      },
      update(ref, patch) {
        if (ref === jobRef) {
          storedJob = { ...storedJob, ...patch };
          return;
        }
        storedUser = {
          ...storedUser,
          ...patch,
          foundingExpert: { ...storedUser.foundingExpert, ...(patch.foundingExpert || {}) },
        };
      },
      set(_ref, patch, opts) {
        if (opts?.merge) {
          storedUser = {
            ...storedUser,
            ...patch,
            foundingExpert: { ...storedUser.foundingExpert, ...patch.foundingExpert },
          };
        } else {
          storedUser = patch;
        }
      },
    };

    const db = {
      collection(name) {
        return {
          doc(id) {
            return name === 'users' ? { id } : jobRef;
          },
        };
      },
      runTransaction: jest.fn(async (fn) => fn(txApi)),
    };

    await ensureBaseJobFeeSnapshotLocked(db, admin, jobRef, {
      grossAmountCents: 15000,
      now: new Date('2032-02-01T00:00:00.000Z'),
    });

    expect(db.runTransaction).toHaveBeenCalledTimes(1);
    expect(storedJob.feeSnapshot.source).toBe(BASE_FUNDING_SOURCE);
    expect(storedJob.feeSnapshot.stage).toBe(STAGE.FOUNDING_FIRST_THREE);
    expect(storedUser.foundingExpert.zeroFeeSlotsUsed).toBe(1);
  });

  it('second ensure call does not double-consume slot', async () => {
    const expertUid = 'exp-r2';
    const lockedSnap = {
      source: BASE_FUNDING_SOURCE,
      stage: STAGE.FOUNDING_FIRST_THREE,
      zeroFeeSlotConsumed: true,
      grossAmountCents: 10000,
      expertUid,
      lockedAt: '2031-01-01T00:00:00.000Z',
    };
    let storedJob = {
      acceptedTradieUid: expertUid,
      paymentState: 'in_escrow',
      paymentStatus: 'succeeded',
      paymentAmountCents: 10000,
      feeSnapshot: lockedSnap,
    };
    const storedUser = {
      foundingExpert: {
        status: 'active',
        programId: 'melbourne_founding_expert_test_2026',
        zeroFeeSlotsUsed: 1,
      },
    };

    const jobRef = { id: 'job-rec2' };
    const txApi = {
      async get(ref) {
        if (ref === jobRef) return { exists: true, data: () => JSON.parse(JSON.stringify(storedJob)) };
        if (ref.id === expertUid) return { exists: true, data: () => JSON.parse(JSON.stringify(storedUser)) };
        return { exists: false, data: () => null };
      },
      update: jest.fn(),
      set: jest.fn(),
    };

    const db = {
      collection(name) {
        return {
          doc(id) {
            return name === 'users' ? { id } : jobRef;
          },
        };
      },
      runTransaction: jest.fn(async (fn) => fn(txApi)),
    };

    await ensureBaseJobFeeSnapshotLocked(db, admin, jobRef, { now: new Date() });

    expect(txApi.update).not.toHaveBeenCalled();
    expect(txApi.set).not.toHaveBeenCalled();
  });
});

describe('validateBaseJobFeeSnapshotForRelease', () => {
  function snap(overrides = {}) {
    return {
      source: BASE_FUNDING_SOURCE,
      version: 1,
      jobId: 'job-a',
      expertUid: 'exp-a',
      grossAmountCents: 10000,
      taskioFeeCents: 1000,
      expertNetCents: 9000,
      lockedAt: '2026-01-01T00:00:00.000Z',
      stage: STAGE.STANDARD_LAUNCH,
      expertFeeBps: 1000,
      ...overrides,
    };
  }

  it('returns base slice when snapshot is valid', () => {
    const job = {
      acceptedTradieUid: 'exp-a',
      paymentAmountCents: 10000,
      feeSnapshot: snap(),
    };
    const r = validateBaseJobFeeSnapshotForRelease(job, 'job-a');
    expect(r.ok).toBe(true);
    expect(r.feeSource).toBe('fee_snapshot_v1');
    expect(r.baseSlice).toEqual({
      grossCents: 10000,
      platformFeeCents: 1000,
      providerCents: 9000,
    });
  });

  it('accepts founding_first_three zero Taskio fee', () => {
    const job = {
      acceptedTradieUid: 'exp-a',
      paymentAmountCents: 10000,
      feeSnapshot: snap({
        taskioFeeCents: 0,
        expertNetCents: 10000,
        expertFeeBps: 0,
        stage: STAGE.FOUNDING_FIRST_THREE,
      }),
    };
    const r = validateBaseJobFeeSnapshotForRelease(job, 'job-a');
    expect(r.ok).toBe(true);
    expect(r.baseSlice.providerCents).toBe(10000);
    expect(r.baseSlice.platformFeeCents).toBe(0);
  });

  it('accepts reduced fee 750 bps', () => {
    const job = {
      acceptedTradieUid: 'exp-a',
      paymentAmountCents: 10000,
      feeSnapshot: snap({
        taskioFeeCents: 750,
        expertNetCents: 9250,
        expertFeeBps: 750,
        stage: STAGE.FOUNDING_REDUCED,
      }),
    };
    const r = validateBaseJobFeeSnapshotForRelease(job, 'job-a');
    expect(r.ok).toBe(true);
    expect(r.baseSlice.platformFeeCents).toBe(750);
    expect(r.baseSlice.providerCents).toBe(9250);
  });

  it('rejects wrong jobId', () => {
    const job = {
      acceptedTradieUid: 'exp-a',
      paymentAmountCents: 10000,
      feeSnapshot: snap({ jobId: 'other' }),
    };
    const r = validateBaseJobFeeSnapshotForRelease(job, 'job-a');
    expect(r.ok).toBe(false);
    expect(r.reason).toBe('fee_snapshot_job_id_mismatch');
  });

  it('rejects expert uid mismatch', () => {
    const job = {
      acceptedTradieUid: 'exp-b',
      paymentAmountCents: 10000,
      feeSnapshot: snap(),
    };
    const r = validateBaseJobFeeSnapshotForRelease(job, 'job-a');
    expect(r.ok).toBe(false);
    expect(r.reason).toBe('fee_snapshot_expert_uid_mismatch');
  });

  it('rejects fee parts sum mismatch', () => {
    const job = {
      acceptedTradieUid: 'exp-a',
      paymentAmountCents: 10000,
      feeSnapshot: snap({ taskioFeeCents: 500, expertNetCents: 9000 }),
    };
    const r = validateBaseJobFeeSnapshotForRelease(job, 'job-a');
    expect(r.ok).toBe(false);
    expect(r.reason).toBe('fee_snapshot_fee_parts_sum_mismatch');
  });

  it('rejects gross vs payment mismatch', () => {
    const job = {
      acceptedTradieUid: 'exp-a',
      paymentAmountCents: 9999,
      feeSnapshot: snap(),
    };
    const r = validateBaseJobFeeSnapshotForRelease(job, 'job-a');
    expect(r.ok).toBe(false);
    expect(r.reason).toBe('fee_snapshot_gross_payment_mismatch');
  });
});
