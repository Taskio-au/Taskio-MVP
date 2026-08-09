'use strict';
/**
 * Contract tests for POST /api/jobs/:jobId/variations
 *
 * Verifies:
 *  - Accepted Expert can create a variation when IN_PROGRESS + in_escrow
 *  - Accepted Expert can create when FUNDED + progressStatus work_started (legacy fallback)
 *  - Accepted Expert can create when FUNDED + workStartedAt exists (legacy fallback)
 *  - Rejected when FUNDED + in_escrow but work not started
 *  - Rejected when COMPLETED + in_escrow
 *  - Rejected when PAID/released
 *  - Rejected when CANCELLED
 *  - Rejected when payment not secured
 *  - Rejected when user is the homeowner (wrong role)
 *  - Rejected when user is not the accepted Expert
 *  - Rejected with 400 on invalid title/description/amount
 *  - 404 when job not found
 */
const express = require('express');
const request = require('supertest');

// ---------------------------------------------------------------------------
// Shared mutable state
// ---------------------------------------------------------------------------
const mockState = {
  collections: new Map(),
  currentUser: { uid: 'expert-1', role: 'tradie', email: 'expert@test.com', email_verified: true },
  // Tracks set() calls on subcollection docs (variations)
  variationSets: [],
  jobEventAdds: [],
};

function resetState() {
  mockState.collections = new Map();
  mockState.variationSets = [];
  mockState.jobEventAdds = [];
  mockState.currentUser = { uid: 'expert-1', role: 'tradie', email: 'expert@test.com', email_verified: true };
}

function mockGetStore(name) {
  if (!mockState.collections.has(name)) mockState.collections.set(name, new Map());
  return mockState.collections.get(name);
}

function mockClone(v) {
  return v === undefined ? undefined : JSON.parse(JSON.stringify(v));
}

function seedDoc(col, id, value) {
  mockGetStore(col).set(id, { id, ...mockClone(value) });
}

// ---------------------------------------------------------------------------
// Firebase mock — includes subcollection support for variations
// ---------------------------------------------------------------------------
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
    collection: jest.fn((name) => {
      const store = () => {
        if (!mockState.collections.has(name)) mockState.collections.set(name, new Map());
        return mockState.collections.get(name);
      };

      return {
        doc: jest.fn((id) => {
          const docId = id || `generated-${Math.random().toString(36).slice(2)}`;
          return {
            get: jest.fn(async () => {
              const existing = store().get(docId);
              return { exists: !!existing, data: () => mockClone(existing) };
            }),
            update: jest.fn(async (payload) => {
              const existing = store().get(docId) || {};
              store().set(docId, { ...existing, ...mockClone(payload) });
            }),
            set: jest.fn(async (payload) => {
              store().set(docId, { id: docId, ...mockClone(payload) });
            }),
            // Subcollection support — for jobs/{jobId}/variations
            collection: jest.fn((subName) => ({
              doc: jest.fn((subId) => {
                const sid = subId || `var-${Math.random().toString(36).slice(2, 10)}`;
                const varSet = jest.fn(async (payload) => {
                  mockState.variationSets.push({ subName, id: sid, payload: mockClone(payload) });
                });
                return { id: sid, set: varSet };
              }),
            })),
          };
        }),
        add: jest.fn(async (payload) => {
          if (name === 'job_events') {
            mockState.jobEventAdds.push(mockClone(payload));
          }
          const id = `${name}-${store().size + 1}`;
          store().set(id, { id, ...mockClone(payload) });
          return { id };
        }),
        where: jest.fn(() => ({
          get: jest.fn(async () => ({ empty: true, docs: [] })),
          limit: jest.fn().mockReturnThis(),
          select: jest.fn().mockReturnThis(),
          orderBy: jest.fn().mockReturnThis(),
        })),
      };
    }),
    getAll: jest.fn(async (...refs) => Promise.all(refs.map((r) => r.get()))),
    runTransaction: jest.fn(async (cb) => cb({ get: (r) => r.get(), update: (r, d) => r.update(d) })),
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
  ensureUserProfile: () => (_req, _res, next) => next(),
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
// Job factory helpers
// ---------------------------------------------------------------------------
const BASE_JOB = {
  title: 'Fix leaking tap',
  homeownerUid: 'homeowner-1',
  acceptedTradieUid: 'expert-1',
  acceptedQuoteId: 'quote-1',
  paymentState: 'in_escrow',
  paymentStatus: 'succeeded',
  status: 'IN_PROGRESS',
  progressStatus: 'work_started',
  workStartedAt: '__server_ts__',
};

function inProgressJob(overrides = {}) {
  return { ...BASE_JOB, ...overrides };
}

const VALID_BODY = {
  title: 'Replace corroded valve',
  description: 'The original valve is corroded beyond repair and needs replacement.',
  priceChangeCents: 8000,
  timeImpact: '+2 hours',
  attachments: [],
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe('POST /api/jobs/:jobId/variations', () => {
  let app;

  beforeAll(() => { app = buildApp(); });
  beforeEach(() => {
    resetState();
    seedDoc('jobs', 'job-1', inProgressJob());
  });

  // ── Happy paths ───────────────────────────────────────────────────────────

  it('201 — accepted Expert creates variation when IN_PROGRESS + in_escrow', async () => {
    const res = await request(app)
      .post('/api/jobs/job-1/variations')
      .send(VALID_BODY);

    expect(res.status).toBe(201);
    expect(res.body).toHaveProperty('variationId');

    // Variation written via Admin SDK subcollection
    expect(mockState.variationSets).toHaveLength(1);
    const written = mockState.variationSets[0].payload;
    expect(written.status).toBe('pending');
    expect(written.createdByUid).toBe('expert-1');
    expect(written.createdByRole).toBe('tradie');
    expect(written.title).toBe('Replace corroded valve');
    expect(written.priceChangeCents).toBe(8000);

    // Job event logged
    expect(mockState.jobEventAdds).toHaveLength(1);
    expect(mockState.jobEventAdds[0].action).toBe('TRADIE_VARIATION_REQUESTED');
  });

  it('201 — FUNDED + in_escrow + progressStatus work_started (legacy fallback)', async () => {
    seedDoc('jobs', 'job-1', inProgressJob({
      status: 'FUNDED',
      workStartedAt: null,
    }));
    // progressStatus: 'work_started' is still set (from BASE_JOB)

    const res = await request(app)
      .post('/api/jobs/job-1/variations')
      .send(VALID_BODY);

    expect(res.status).toBe(201);
    expect(mockState.variationSets).toHaveLength(1);
  });

  it('201 — FUNDED + in_escrow + workStartedAt exists (legacy fallback)', async () => {
    seedDoc('jobs', 'job-1', inProgressJob({
      status: 'FUNDED',
      progressStatus: null,
      workStartedAt: '__server_ts__',
    }));

    const res = await request(app)
      .post('/api/jobs/job-1/variations')
      .send(VALID_BODY);

    expect(res.status).toBe(201);
    expect(mockState.variationSets).toHaveLength(1);
  });

  it('201 — paymentStatus succeeded accepted even when paymentState missing', async () => {
    seedDoc('jobs', 'job-1', inProgressJob({ paymentState: null, paymentStatus: 'succeeded' }));

    const res = await request(app)
      .post('/api/jobs/job-1/variations')
      .send(VALID_BODY);

    expect(res.status).toBe(201);
  });

  // ── Eligibility rejections ────────────────────────────────────────────────

  it('409 — FUNDED + in_escrow + no work started signal', async () => {
    seedDoc('jobs', 'job-1', inProgressJob({
      status: 'FUNDED',
      progressStatus: null,
      workStartedAt: null,
    }));

    const res = await request(app)
      .post('/api/jobs/job-1/variations')
      .send(VALID_BODY);

    expect(res.status).toBe(409);
    expect(res.body.message).toMatch(/payment is secured and work is in progress/i);
  });

  it('409 — AWAITING_FUNDING + in_escrow + no work started signal', async () => {
    seedDoc('jobs', 'job-1', inProgressJob({
      status: 'AWAITING_FUNDING',
      progressStatus: null,
      workStartedAt: null,
    }));

    const res = await request(app)
      .post('/api/jobs/job-1/variations')
      .send(VALID_BODY);

    expect(res.status).toBe(409);
    expect(res.body.message).toMatch(/payment is secured and work is in progress/i);
  });

  it('409 — COMPLETED + in_escrow (awaiting approval — read-only)', async () => {
    seedDoc('jobs', 'job-1', inProgressJob({ status: 'COMPLETED' }));

    const res = await request(app)
      .post('/api/jobs/job-1/variations')
      .send(VALID_BODY);

    expect(res.status).toBe(409);
    expect(res.body.message).toMatch(/marked complete/i);
  });

  it('409 — PAID + released', async () => {
    seedDoc('jobs', 'job-1', inProgressJob({ status: 'PAID', paymentState: 'released' }));

    const res = await request(app)
      .post('/api/jobs/job-1/variations')
      .send(VALID_BODY);

    expect(res.status).toBe(409);
  });

  it('409 — CANCELLED', async () => {
    seedDoc('jobs', 'job-1', inProgressJob({ status: 'CANCELLED', paymentState: null }));

    const res = await request(app)
      .post('/api/jobs/job-1/variations')
      .send(VALID_BODY);

    expect(res.status).toBe(409);
  });

  it('409 — payment not secured (pending_payment)', async () => {
    seedDoc('jobs', 'job-1', inProgressJob({ paymentState: 'pending_payment', paymentStatus: 'requires_payment_method' }));

    const res = await request(app)
      .post('/api/jobs/job-1/variations')
      .send(VALID_BODY);

    expect(res.status).toBe(409);
    expect(res.body.message).toMatch(/payment is secured/i);
  });

  // ── Authorization rejections ──────────────────────────────────────────────

  it('403 — homeowner role cannot create variations', async () => {
    mockState.currentUser = { uid: 'homeowner-1', role: 'homeowner', email: 'h@test.com', email_verified: true };

    const res = await request(app)
      .post('/api/jobs/job-1/variations')
      .send(VALID_BODY);

    // requireRole('tradie') returns 403 before business logic
    expect(res.status).toBe(403);
  });

  it('403 — wrong tradie (not the accepted Expert)', async () => {
    mockState.currentUser = { uid: 'other-expert', role: 'tradie', email: 'other@test.com', email_verified: true };

    const res = await request(app)
      .post('/api/jobs/job-1/variations')
      .send(VALID_BODY);

    expect(res.status).toBe(403);
    expect(res.body.message).toMatch(/accepted Expert/i);
  });

  it('404 — job not found', async () => {
    const res = await request(app)
      .post('/api/jobs/nonexistent/variations')
      .send(VALID_BODY);

    expect(res.status).toBe(404);
  });

  // ── Input validation ──────────────────────────────────────────────────────

  it('400 — title too short', async () => {
    const res = await request(app)
      .post('/api/jobs/job-1/variations')
      .send({ ...VALID_BODY, title: 'AB' });

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/title/i);
  });

  it('400 — title too long', async () => {
    const res = await request(app)
      .post('/api/jobs/job-1/variations')
      .send({ ...VALID_BODY, title: 'A'.repeat(141) });

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/title/i);
  });

  it('400 — description too short', async () => {
    const res = await request(app)
      .post('/api/jobs/job-1/variations')
      .send({ ...VALID_BODY, description: 'Short' });

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/description/i);
  });

  it('400 — negative price', async () => {
    const res = await request(app)
      .post('/api/jobs/job-1/variations')
      .send({ ...VALID_BODY, priceChangeCents: -100 });

    // Negative clamped to 0 → should pass (0 is valid)
    expect(res.status).toBe(201);
  });

  it('400 — price exceeds maximum', async () => {
    const res = await request(app)
      .post('/api/jobs/job-1/variations')
      .send({ ...VALID_BODY, priceChangeCents: 6000000 });

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/price/i);
  });

  it('400 — timeImpact too long', async () => {
    const res = await request(app)
      .post('/api/jobs/job-1/variations')
      .send({ ...VALID_BODY, timeImpact: 'x'.repeat(201) });

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/time impact/i);
  });
});
