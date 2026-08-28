'use strict';
/**
 * Contract tests for POST /api/jobs/:id/progress-status
 *
 * Verifies that when an Expert marks 'work_started':
 *  - job.status transitions from FUNDED → IN_PROGRESS
 *  - workStartedAt is set
 *  - paymentState remains 'in_escrow'
 *  - FUNDED → IN_PROGRESS is a valid transition (allowed by VALID_TRANSITIONS)
 *  - Unauthorized users (homeowners, wrong expert) cannot mark work started
 *  - Other progress statuses (needs_more_info, ready_for_review) do NOT change job.status
 */
const express = require('express');
const request = require('supertest');

const mockState = {
  collections: new Map(),
  currentUser: {
    uid: 'tradie-1',
    role: 'tradie',
    email: 'expert@test.com',
    email_verified: true,
  },
};

function resetState() {
  mockState.collections = new Map();
  mockState.currentUser = {
    uid: 'tradie-1',
    role: 'tradie',
    email: 'expert@test.com',
    email_verified: true,
  };
}

function mockGetStore(name) {
  const key = String(name);
  if (!mockState.collections.has(key)) mockState.collections.set(key, new Map());
  return mockState.collections.get(key);
}

function mockClone(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function seedDoc(collectionName, id, value) {
  mockGetStore(collectionName).set(id, { id, ...mockClone(value) });
}

function readDoc(collectionName, id) {
  return mockClone(mockGetStore(collectionName).get(id));
}

jest.mock('../src/firebaseAdmin', () => ({
  admin: {
    firestore: {
      FieldValue: {
        serverTimestamp: jest.fn(() => '__server_ts__'),
        arrayUnion: jest.fn((...items) => ({ __arrayUnion: items })),
      },
    },
  },
  db: {
    collection: jest.fn((name) => ({
      doc: jest.fn((id) => ({
        get: jest.fn(async () => {
          const existing = mockGetStore(name).get(id);
          return { exists: !!existing, data: () => mockClone(existing) };
        }),
        update: jest.fn(async (payload) => {
          const existing = mockGetStore(name).get(id) || {};
          mockGetStore(name).set(id, { ...existing, ...mockClone(payload) });
        }),
        set: jest.fn(async (payload, options = {}) => {
          const existing = mockGetStore(name).get(id) || {};
          const next = options.merge ? { ...existing, ...mockClone(payload) } : mockClone(payload);
          mockGetStore(name).set(id, { id, ...next });
        }),
        collection: jest.fn(() => ({
          orderBy: jest.fn().mockReturnThis(),
          select: jest.fn().mockReturnThis(),
          get: jest.fn(async () => ({ empty: true, docs: [] })),
          doc: jest.fn(() => ({
            set: jest.fn(async () => {}),
          })),
        })),
      })),
      add: jest.fn(async (payload) => {
        const id = `${String(name)}-${mockGetStore(name).size + 1}`;
        mockGetStore(name).set(id, { id, ...mockClone(payload) });
        return { id };
      }),
      where: jest.fn((field, _op, value) => ({
        get: jest.fn(async () => {
          const rows = Array.from(mockGetStore(name).entries())
            .filter(([, data]) => data[field] === value)
            .map(([id, data]) => ({ id, data: () => mockClone(data) }));
          return { empty: rows.length === 0, docs: rows };
        }),
        orderBy: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
      })),
    })),
    getAll: jest.fn(async (...refs) => Promise.all(refs.map((ref) => ref.get()))),
    runTransaction: jest.fn(async (callback) => {
      const tx = {
        get: (ref) => ref.get(),
        update: (ref, data) => ref.update(data),
      };
      return callback(tx);
    }),
  },
}));

jest.mock('../src/middleware/auth', () => ({
  requireAuth: (req, _res, next) => {
    req.user = mockClone(mockState.currentUser);
    next();
  },
  requireRole: (role) => (req, res, next) => {
    if (req.user?.role !== role) return res.status(403).send({ message: 'Forbidden' });
    return next();
  },
}));

jest.mock('../src/services/stripe', () => ({
  createPaymentIntent: jest.fn(),
  retrievePaymentIntent: jest.fn(),
  retrieveCheckoutSession: jest.fn(),
  createExpressAccount: jest.fn(),
  createAccountLink: jest.fn(),
  retrieveAccount: jest.fn(),
  createTransfer: jest.fn(),
  createRefund: jest.fn(),
  getSucceededChargeIdForConnectTransfer: jest.fn(),
}));

jest.mock('../src/utils/firestore', () => ({
  safeToMillis: jest.fn((v) => Number(v?._seconds || v?.seconds || v || 0)),
}));

const jobsRoutes = require('../src/routes/jobs');

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use(jobsRoutes);
  return app;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function fundedJob(overrides = {}) {
  return {
    title: 'Fix leaking tap',
    status: 'FUNDED',
    paymentState: 'in_escrow',
    homeownerUid: 'homeowner-1',
    acceptedTradieUid: 'tradie-1',
    acceptedQuoteId: 'quote-1',
    chatFrozen: false,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe('POST /api/jobs/:id/progress-status — work_started', () => {
  beforeEach(() => {
    resetState();
    jest.clearAllMocks();
  });

  test('transitions FUNDED → IN_PROGRESS and sets workStartedAt', async () => {
    seedDoc('jobs', 'job-1', fundedJob());
    const res = await request(buildApp())
      .post('/api/jobs/job-1/progress-status')
      .send({ progressStatus: 'work_started' });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ progressStatus: 'work_started', unchanged: false });

    const saved = readDoc('jobs', 'job-1');
    expect(saved.status).toBe('IN_PROGRESS');
    expect(saved.progressStatus).toBe('work_started');
    expect(saved.workStartedAt).toBe('__server_ts__');
  });

  test('paymentState remains in_escrow after work_started', async () => {
    seedDoc('jobs', 'job-2', fundedJob());
    await request(buildApp())
      .post('/api/jobs/job-2/progress-status')
      .send({ progressStatus: 'work_started' });

    const saved = readDoc('jobs', 'job-2');
    expect(saved.paymentState).toBe('in_escrow');
  });

  test('returns unchanged:true if progressStatus is already work_started', async () => {
    seedDoc('jobs', 'job-3', fundedJob({ progressStatus: 'work_started', status: 'IN_PROGRESS' }));
    const res = await request(buildApp())
      .post('/api/jobs/job-3/progress-status')
      .send({ progressStatus: 'work_started' });

    expect(res.status).toBe(200);
    expect(res.body.unchanged).toBe(true);
  });

  test('does NOT re-transition if job is already IN_PROGRESS (e.g. re-click)', async () => {
    seedDoc('jobs', 'job-4', fundedJob({ status: 'IN_PROGRESS', progressStatus: 'needs_more_info' }));
    const res = await request(buildApp())
      .post('/api/jobs/job-4/progress-status')
      .send({ progressStatus: 'work_started' });

    // Should succeed (marking work_started on IN_PROGRESS is idempotent-ish)
    expect(res.status).toBe(200);
    const saved = readDoc('jobs', 'job-4');
    expect(saved.progressStatus).toBe('work_started');
    // Status should NOT change (already IN_PROGRESS; no FUNDED→IN_PROGRESS transition needed)
    expect(saved.status).toBe('IN_PROGRESS');
  });

  test('returns 403 if user is homeowner, not tradie', async () => {
    seedDoc('jobs', 'job-5', fundedJob());
    mockState.currentUser.role = 'homeowner';
    const res = await request(buildApp())
      .post('/api/jobs/job-5/progress-status')
      .send({ progressStatus: 'work_started' });

    expect(res.status).toBe(403);
    const saved = readDoc('jobs', 'job-5');
    expect(saved.status).toBe('FUNDED'); // unchanged
  });

  test('returns 403 if tradie is not the assigned expert', async () => {
    seedDoc('jobs', 'job-6', fundedJob({ acceptedTradieUid: 'other-tradie' }));
    const res = await request(buildApp())
      .post('/api/jobs/job-6/progress-status')
      .send({ progressStatus: 'work_started' });

    expect(res.status).toBe(403);
    const saved = readDoc('jobs', 'job-6');
    expect(saved.status).toBe('FUNDED'); // unchanged
  });

  test('returns 409 if job is cancelled', async () => {
    seedDoc('jobs', 'job-7', fundedJob({ status: 'CANCELLED' }));
    const res = await request(buildApp())
      .post('/api/jobs/job-7/progress-status')
      .send({ progressStatus: 'work_started' });

    expect(res.status).toBe(409);
  });

  test('returns 409 if chatFrozen is true', async () => {
    seedDoc('jobs', 'job-8', fundedJob({ chatFrozen: true }));
    const res = await request(buildApp())
      .post('/api/jobs/job-8/progress-status')
      .send({ progressStatus: 'work_started' });

    expect(res.status).toBe(409);
  });

  test('returns 404 if job does not exist', async () => {
    const res = await request(buildApp())
      .post('/api/jobs/nonexistent/progress-status')
      .send({ progressStatus: 'work_started' });

    expect(res.status).toBe(404);
  });

  test('returns 400 for an invalid progressStatus value', async () => {
    seedDoc('jobs', 'job-9', fundedJob());
    const res = await request(buildApp())
      .post('/api/jobs/job-9/progress-status')
      .send({ progressStatus: 'does_not_exist' });

    expect(res.status).toBe(400);
  });
});

// ---------------------------------------------------------------------------
// Other progress statuses (needs_more_info, ready_for_review) must NOT
// change job.status
// ---------------------------------------------------------------------------
describe('POST /api/jobs/:id/progress-status — non-work_started values', () => {
  beforeEach(() => {
    resetState();
    jest.clearAllMocks();
  });

  test.each(['needs_more_info', 'ready_for_review'])(
    '%s does not change job.status from FUNDED',
    async (ps) => {
      seedDoc('jobs', `job-${ps}`, fundedJob());
      const res = await request(buildApp())
        .post(`/api/jobs/job-${ps}/progress-status`)
        .send({ progressStatus: ps });

      expect(res.status).toBe(200);
      const saved = readDoc('jobs', `job-${ps}`);
      // Status should remain FUNDED (no transition for these values)
      expect(saved.status).toBe('FUNDED');
      expect(saved.progressStatus).toBe(ps);
    }
  );
});
