const express = require('express');
const request = require('supertest');

const mockState = {
  collections: new Map(),
  currentUser: {
    uid: 'tradie-1',
    role: 'tradie',
    email: '',
    email_verified: false,
  },
};

function resetState() {
  mockState.collections = new Map();
  mockState.currentUser = {
    uid: 'tradie-1',
    role: 'tradie',
    email: '',
    email_verified: false,
  };
}

function mockGetCollectionStore(name) {
  const key = String(name);
  if (!mockState.collections.has(key)) {
    mockState.collections.set(key, new Map());
  }
  return mockState.collections.get(key);
}

function mockClone(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function seedDoc(collectionName, id, value) {
  mockGetCollectionStore(collectionName).set(id, { id, ...mockClone(value) });
}

function mockMakeQuery(collectionName, filters = []) {
  return {
    where(field, op, value) {
      return mockMakeQuery(collectionName, [...filters, { field, op: op || '==', value }]);
    },
    limit() {
      return this;
    },
    async get() {
      const rows = Array.from(mockGetCollectionStore(collectionName).entries())
        .map(([docId, data]) => ({ docId, row: { ...mockClone(data), id: docId } }))
        .filter(({ row }) =>
          filters.every((filter) => {
            const v = row[filter.field];
            if (filter.op === 'array-contains') {
              return Array.isArray(v) && v.includes(filter.value);
            }
            return v === filter.value;
          })
        )
        .map(({ docId, row }) => ({ id: docId, data: () => mockClone(row) }));
      return { empty: rows.length === 0, docs: rows, size: rows.length };
    },
  };
}

jest.mock('../src/firebaseAdmin', () => ({
  admin: {
    firestore: {
      FieldValue: {
        serverTimestamp: jest.fn(() => '__server_ts__'),
      },
    },
  },
  db: {
    collection: jest.fn((name) => ({
      doc: jest.fn(() => ({
        get: jest.fn(async () => ({ exists: false, data: () => null })),
        update: jest.fn(),
        set: jest.fn(),
      })),
      where: jest.fn((field, op, value) => mockMakeQuery(name, [{ field, op: op || '==', value }])),
    })),
  },
}));

jest.mock('../src/middleware/auth', () => ({
  requireAuth: (req, _res, next) => {
    req.user = mockClone(mockState.currentUser);
    next();
  },
  requireRole: (role) => (req, res, next) => {
    if (req.user?.role !== role) {
      return res.status(403).send({ message: 'Forbidden' });
    }
    return next();
  },
  ensureUserProfile: () => (_req, _res, next) => next(),
}));

jest.mock('../src/utils/firestore', () => ({
  safeToMillis: jest.fn((value) => Number(value?._seconds || value?.seconds || value || 0)),
}));

const tradieRoutes = require('../src/routes/tradie');

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use(tradieRoutes);
  return app;
}

describe('GET /api/tradie/payment-activity', () => {
  let app;

  beforeEach(() => {
    resetState();
    app = buildApp();
  });

  it('returns released jobs for the authenticated expert with amounts and status label', async () => {
    seedDoc('jobs', 'job-a', {
      acceptedTradieUid: 'tradie-1',
      paymentState: 'released',
      title: 'Fix tap',
      taskNumber: 'T-100',
      paymentAmountCents: 20000,
      platformFeePercent: 15,
      platformFeeAmount: 3000,
      providerAmount: 17000,
      paymentCurrency: 'aud',
      transferId: 'tr_abc',
      releasedAt: { _seconds: 1000, _nanoseconds: 0 },
    });
    seedDoc('jobs', 'job-b', {
      acceptedTradieUid: 'tradie-1',
      paymentState: 'in_escrow',
      status: 'IN_PROGRESS',
      title: 'Other',
      paymentAmountCents: 10000,
      platformFeePercent: 15,
    });
    seedDoc('jobs', 'job-other', {
      acceptedTradieUid: 'tradie-2',
      paymentState: 'released',
      paymentAmountCents: 9999,
    });

    const res = await request(app).get('/api/tradie/payment-activity');

    expect(res.status).toBe(200);
    expect(res.body.summary.totalReleasedToStripeCents).toBe(17000);
    expect(res.body.summary.releasedJobCount).toBe(1);
    expect(res.body.summary.totalSecuredInEscrowCents).toBe(8500);
    expect(res.body.released).toHaveLength(1);
    expect(res.body.released[0].jobId).toBe('job-a');
    expect(res.body.released[0].providerAmountCents).toBe(17000);
    expect(res.body.released[0].transferId).toBe('tr_abc');
    expect(res.body.released[0].displayReference).toMatch(/^TSK-/);
    expect(res.body.released[0].statusLabel).toBe('Released to Stripe');
    expect(res.body.released[0].releasedAtMs).toBe(1000000);
    expect(res.body.released[0].displayTaskTitle).toBe('Fix tap');
    expect(res.body.released[0].title).toBe('Fix tap');
    expect(res.body.released[0].taskioFeeCents).toBe(3000);
    expect(res.body.released[0].expertReleasedCents).toBe(17000);
    expect(res.body.released[0].feeBenefitLabel).toBe('Taskio fee');
  });

  it('includes displayTaskTitle upgraded from jobTypeLabel when title looks abbreviated', async () => {
    seedDoc('jobs', 'job-m', {
      acceptedTradieUid: 'tradie-1',
      paymentState: 'released',
      title: 'Mirrors in Docklands',
      jobType: 'mounting_mirrors',
      jobTypeLabel: 'Mirrors',
      locationSuburb: 'Docklands',
      paymentAmountCents: 20000,
      platformFeePercent: 15,
      providerAmount: 17000,
      paymentCurrency: 'aud',
      transferId: 'tr_m',
      releasedAt: { _seconds: 3, _nanoseconds: 0 },
    });

    mockState.currentUser = { uid: 'tradie-1', role: 'tradie' };
    const res = await request(app).get('/api/tradie/payment-activity');

    expect(res.status).toBe(200);
    const row = res.body.released.find((r) => r.jobId === 'job-m');
    expect(row.displayTaskTitle).toBe('Hang mirrors in Docklands');
    expect(row.title).toBe('Hang mirrors in Docklands');
    expect(row.breakdown.title).toBe('Hang mirrors in Docklands');
  });

  it('uses catalogue expertLabel for hanging_picture_frames with title-cased locality', async () => {
    seedDoc('jobs', 'job-pf', {
      acceptedTradieUid: 'tradie-1',
      paymentState: 'released',
      title: 'Picture frames in south yarra',
      jobType: 'hanging_picture_frames',
      jobTypeLabel: 'Picture frames',
      locationSuburb: 'south yarra',
      paymentAmountCents: 15000,
      platformFeePercent: 15,
      providerAmount: 12750,
      paymentCurrency: 'aud',
      transferId: 'tr_pf',
      releasedAt: { _seconds: 5, _nanoseconds: 0 },
    });

    mockState.currentUser = { uid: 'tradie-1', role: 'tradie' };
    const res = await request(app).get('/api/tradie/payment-activity');

    expect(res.status).toBe(200);
    const row = res.body.released.find((r) => r.jobId === 'job-pf');
    expect(row.displayTaskTitle).toBe('Install picture frames in South Yarra');
    expect(row.title).toBe('Install picture frames in South Yarra');
  });

  it('uses catalogue expertLabel for flat-pack furniture assembly vs weak Assembly title', async () => {
    seedDoc('jobs', 'job-fp', {
      acceptedTradieUid: 'tradie-1',
      paymentState: 'released',
      title: 'Assembly in Richmond',
      jobType: 'furniture_assembly_flat_pack',
      jobTypeLabel: 'Flat-pack furniture',
      locationSuburb: 'Richmond',
      paymentAmountCents: 12000,
      platformFeePercent: 15,
      providerAmount: 10200,
      paymentCurrency: 'aud',
      transferId: 'tr_fp',
      releasedAt: { _seconds: 6, _nanoseconds: 0 },
    });

    mockState.currentUser = { uid: 'tradie-1', role: 'tradie' };
    const res = await request(app).get('/api/tradie/payment-activity');

    expect(res.status).toBe(200);
    const row = res.body.released.find((r) => r.jobId === 'job-fp');
    expect(row.displayTaskTitle).toBe('Flat-pack furniture assembly in Richmond');
  });

  it('preserves meaningful client title when it does not follow catalogue locality pattern', async () => {
    seedDoc('jobs', 'job-custom', {
      acceptedTradieUid: 'tradie-1',
      paymentState: 'released',
      title: 'IKEA wardrobe assembly urgent',
      jobType: 'furniture_assembly_flat_pack',
      jobTypeLabel: 'Flat-pack furniture',
      locationSuburb: 'Richmond',
      paymentAmountCents: 18000,
      platformFeePercent: 15,
      providerAmount: 15300,
      paymentCurrency: 'aud',
      transferId: 'tr_cu',
      releasedAt: { _seconds: 7, _nanoseconds: 0 },
    });

    mockState.currentUser = { uid: 'tradie-1', role: 'tradie' };
    const res = await request(app).get('/api/tradie/payment-activity');

    expect(res.status).toBe(200);
    const row = res.body.released.find((r) => r.jobId === 'job-custom');
    expect(row.displayTaskTitle).toBe('IKEA wardrobe assembly urgent');
  });

  it('includes base vs variation expert amounts when job has release breakdown', async () => {
    seedDoc('jobs', 'job-v', {
      acceptedTradieUid: 'tradie-1',
      paymentState: 'released',
      title: 'With var',
      paymentAmountCents: 20000,
      variationGrossReleasedCents: 5000,
      totalGrossReleasedCents: 25000,
      platformFeePercent: 10,
      basePlatformFeeReleasedCents: 2000,
      variationPlatformFeeReleasedCents: 500,
      totalPlatformFeeReleasedCents: 2500,
      baseProviderReleasedCents: 18000,
      variationProviderReleasedCents: 4500,
      totalProviderReleasedCents: 22500,
      providerAmount: 22500,
      transferId: 'tr_b',
      releasedAt: { _seconds: 2, _nanoseconds: 0 },
    });

    mockState.currentUser = { uid: 'tradie-1', role: 'tradie' };
    const res = await request(app).get('/api/tradie/payment-activity');

    expect(res.status).toBe(200);
    expect(res.body.summary.totalReleasedToStripeCents).toBe(22500);
    const row = res.body.released.find((r) => r.jobId === 'job-v');
    expect(row.baseProviderReleasedCents).toBe(18000);
    expect(row.variationProviderReleasedCents).toBe(4500);
    expect(row.includesVariations).toBe(true);
    expect(row.providerAmountCents).toBe(22500);
    expect(row.taskioFeeCents).toBe(2500);
    expect(row.feeBenefitLabel).toBe('Standard launch fee');
    expect(row.breakdown.baseTaskioFeeCents).toBe(2000);
    expect(row.breakdown.variationTaskioFeeCents).toBe(500);
    expect(row.breakdown.baseExpertReleasedCents).toBe(18000);
    expect(row.breakdown.variationExpertReleasedCents).toBe(4500);
  });

  it('exposes founding expert zero Taskio fee and benefit label', async () => {
    seedDoc('jobs', 'job-founding-zero', {
      acceptedTradieUid: 'tradie-1',
      paymentState: 'released',
      title: 'Founding zero fee',
      paymentAmountCents: 20000,
      variationGrossReleasedCents: 5000,
      totalGrossReleasedCents: 25000,
      baseReleaseFeeSource: 'fee_snapshot_v1',
      variationReleaseFeeSource: 'fee_snapshot_v1',
      basePlatformFeeReleasedCents: 0,
      variationPlatformFeeReleasedCents: 0,
      totalPlatformFeeReleasedCents: 0,
      baseProviderReleasedCents: 20000,
      variationProviderReleasedCents: 5000,
      totalProviderReleasedCents: 25000,
      providerAmount: 25000,
      transferId: 'tr_fe0',
      releasedAt: { _seconds: 10, _nanoseconds: 0 },
    });

    mockState.currentUser = { uid: 'tradie-1', role: 'tradie' };
    const res = await request(app).get('/api/tradie/payment-activity');

    expect(res.status).toBe(200);
    const row = res.body.released.find((r) => r.jobId === 'job-founding-zero');
    expect(row.taskioFeeCents).toBe(0);
    expect(row.platformFeeAmountCents).toBe(0);
    expect(row.feeBenefitLabel).toBe('Founding Expert offer applied');
    expect(row.breakdown.baseTaskioFeeCents).toBe(0);
    expect(row.breakdown.variationTaskioFeeCents).toBe(0);
    expect(row.breakdown.taskioPlatformFeeCents).toBe(0);
    expect(row.expertReleasedCents).toBe(25000);
  });

  it('maps Taskio platform fee from totalPlatformFeeReleasedCents when present', async () => {
    seedDoc('jobs', 'job-snap-pay', {
      acceptedTradieUid: 'tradie-1',
      paymentState: 'released',
      title: 'Snapshot fee row',
      paymentAmountCents: 10000,
      platformFeePercent: 15,
      totalPlatformFeeReleasedCents: 1000,
      totalProviderReleasedCents: 9000,
      basePlatformFeeReleasedCents: 1000,
      baseProviderReleasedCents: 9000,
      platformFeeAmount: 1000,
      providerAmount: 9000,
      paymentCurrency: 'aud',
      transferId: 'tr_snap',
      releasedAt: { _seconds: 8, _nanoseconds: 0 },
    });

    mockState.currentUser = { uid: 'tradie-1', role: 'tradie' };
    const res = await request(app).get('/api/tradie/payment-activity');

    expect(res.status).toBe(200);
    const row = res.body.released.find((r) => r.jobId === 'job-snap-pay');
    expect(row.platformFeeAmountCents).toBe(1000);
    expect(row.breakdown.taskioPlatformFeeCents).toBe(1000);
    expect(row.providerAmountCents).toBe(9000);
  });

  it('dispute expert release shape: uses total* breakdown when persisted', async () => {
    seedDoc('jobs', 'job-dispute-rel', {
      acceptedTradieUid: 'tradie-1',
      paymentState: 'released',
      title: 'Dispute resolved release',
      paymentAmountCents: 10000,
      platformFeePercent: 15,
      feeSnapshot: { note: 'ignored by api' },
      releasePlanVersion: 2,
      baseReleaseFeeSource: 'fee_snapshot_v1',
      variationReleaseFeeSource: 'platform_fee_percent',
      baseAmountReleasedCents: 10000,
      basePlatformFeeReleasedCents: 1000,
      baseProviderReleasedCents: 9000,
      variationGrossReleasedCents: 5000,
      variationPlatformFeeReleasedCents: 500,
      variationProviderReleasedCents: 4500,
      totalGrossReleasedCents: 15000,
      totalPlatformFeeReleasedCents: 1500,
      totalProviderReleasedCents: 13500,
      platformFeeAmount: 1500,
      providerAmount: 13500,
      disputeResolution: 'released_expert',
      paymentCurrency: 'aud',
      transferId: 'tr_dispute_base',
      releaseVariationTransferIds: { vx: 'tr_dispute_var' },
      releasedAt: { _seconds: 9, _nanoseconds: 0 },
    });

    mockState.currentUser = { uid: 'tradie-1', role: 'tradie' };
    const res = await request(app).get('/api/tradie/payment-activity');

    expect(res.status).toBe(200);
    const row = res.body.released.find((r) => r.jobId === 'job-dispute-rel');
    expect(row.providerAmountCents).toBe(13500);
    expect(row.platformFeeAmountCents).toBe(1500);
    expect(row.baseProviderReleasedCents).toBe(9000);
    expect(row.variationProviderReleasedCents).toBe(4500);
    expect(row.includesVariations).toBe(true);
    expect(row.breakdown.variationTransferIds).toEqual({ vx: 'tr_dispute_var' });
    expect(row.breakdown.taskioPlatformFeeCents).toBe(1500);
    expect(row.taskioFeeCents).toBe(1500);
    expect(row.feeBenefitLabel).toBe('Standard launch fee');
    expect(row.breakdown.baseTaskioFeeCents).toBe(1000);
    expect(row.breakdown.variationTaskioFeeCents).toBe(500);
    expect(row.breakdown.baseExpertReleasedCents).toBe(9000);
    expect(row.breakdown.variationExpertReleasedCents).toBe(4500);
  });

  it('403 for homeowner', async () => {
    mockState.currentUser = { uid: 'h1', role: 'homeowner' };
    const res = await request(app).get('/api/tradie/payment-activity');
    expect(res.status).toBe(403);
  });
});
