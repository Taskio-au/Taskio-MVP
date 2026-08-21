const express = require('express');
const request = require('supertest');

const mockJobState = {
  jobs: new Map(),
  users: new Map(),
  quotes: new Map(),
  variationsByJob: new Map(),
};

/** @type {Array<{ ref: object, payload: object }>} */
const mockAdminBatchQueue = [];

function resetState() {
  mockJobState.jobs.clear();
  mockJobState.users.clear();
  mockJobState.quotes.clear();
  mockJobState.variationsByJob = new Map();
  mockAdminBatchQueue.length = 0;
}

function seedJobVariation(jobId, variationId, data) {
  const jid = String(jobId);
  const vid = String(variationId);
  if (!mockJobState.variationsByJob.has(jid)) mockJobState.variationsByJob.set(jid, new Map());
  mockJobState.variationsByJob.get(jid).set(vid, clone(data));
}

function clone(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function applyFieldValue(existingValue, incomingValue) {
  if (incomingValue && typeof incomingValue === 'object') {
    if (Object.prototype.hasOwnProperty.call(incomingValue, '__arrayUnion')) {
      const current = Array.isArray(existingValue) ? existingValue : [];
      return Array.from(new Set([...current, incomingValue.__arrayUnion]));
    }
    if (Object.prototype.hasOwnProperty.call(incomingValue, '__arrayRemove')) {
      const current = Array.isArray(existingValue) ? existingValue : [];
      return current.filter((item) => item !== incomingValue.__arrayRemove);
    }
    if (Object.prototype.hasOwnProperty.call(incomingValue, '__increment')) {
      return Number(existingValue || 0) + Number(incomingValue.__increment || 0);
    }
  }
  return clone(incomingValue);
}

function mergePayload(existing, payload) {
  const next = { ...(existing || {}) };
  for (const [key, value] of Object.entries(payload || {})) {
    next[key] = applyFieldValue(existing ? existing[key] : undefined, value);
  }
  return next;
}

function readCollectionDoc(collectionName, id) {
  const store =
    collectionName === 'jobs' ? mockJobState.jobs : collectionName === 'quotes' ? mockJobState.quotes : mockJobState.users;
  return store.get(String(id));
}

function writeCollectionDoc(collectionName, id, value) {
  const store =
    collectionName === 'jobs' ? mockJobState.jobs : collectionName === 'quotes' ? mockJobState.quotes : mockJobState.users;
  store.set(String(id), clone(value));
}

function makeDocRef(collectionName, id) {
  const docId = String(id);
  const base = {
    id: docId,
    async get() {
      const data = readCollectionDoc(collectionName, docId);
      return {
        exists: data !== undefined,
        data: () => clone(data),
      };
    },
    async set(payload, options) {
      const existing = readCollectionDoc(collectionName, docId);
      const next = options && options.merge
        ? mergePayload(existing, payload)
        : (clone(payload) || {});
      writeCollectionDoc(collectionName, docId, next);
    },
    async update(payload) {
      const existing = readCollectionDoc(collectionName, docId);
      if (existing === undefined) throw new Error(`missing doc: ${collectionName}/${docId}`);
      const next = mergePayload(existing, payload);
      writeCollectionDoc(collectionName, docId, next);
    },
  };
  if (collectionName === 'jobs') {
    base.collection = (subName) => {
      if (subName !== 'variations') {
        return {
          doc: () => ({ get: async () => ({ exists: false, data: () => null }) }),
          get: async () => ({ empty: true, docs: [], size: 0 }),
        };
      }
      return {
        doc(vid) {
          const vId = String(vid);
          return {
            id: vId,
            _variationDoc: true,
            _jobId: docId,
            async get() {
              const m = mockJobState.variationsByJob.get(docId);
              const v = m?.get(vId);
              return { exists: v !== undefined, data: () => clone(v) };
            },
            async update(payload) {
              if (!mockJobState.variationsByJob.has(docId)) mockJobState.variationsByJob.set(docId, new Map());
              const m = mockJobState.variationsByJob.get(docId);
              const existing = m.get(vId) || {};
              m.set(vId, mergePayload(existing, payload));
            },
          };
        },
        async get() {
          const m = mockJobState.variationsByJob.get(docId);
          const docs = m
            ? Array.from(m.entries()).map(([vid, data]) => ({
              id: vid,
              data: () => clone(data),
            }))
            : [];
          return { empty: docs.length === 0, docs, size: docs.length };
        },
      };
    };
  }
  return base;
}

/** Used by firebaseAdmin mock `db.getAll` (must be mock-prefixed for Jest factory scope). */
async function mockFirestoreGetAll(...refs) {
  return refs.map((ref) => {
    const docId = String(ref.id);
    const data = readCollectionDoc('users', docId);
    return {
      exists: data !== undefined,
      data: () => clone(data),
    };
  });
}

function mockMakeCollectionRef(collectionName) {
  return {
    doc(id) {
      return makeDocRef(collectionName, id);
    },
    where() {
      return {
        limit() {
          return {
            async get() {
              if (collectionName === 'job_events') {
                return { docs: [] };
              }
              const store = collectionName === 'jobs' ? mockJobState.jobs : mockJobState.users;
              const docs = Array.from(store.entries()).map(([id, data]) => ({
                id,
                data: () => clone(data),
              }));
              return { docs };
            },
          };
        },
        async get() {
          return this.limit(200).get();
        },
      };
    },
    async get() {
      const store = collectionName === 'jobs' ? mockJobState.jobs : mockJobState.users;
      const docs = Array.from(store.entries()).map(([id, data]) => ({
        id,
        data: () => clone(data),
      }));
      return { docs };
    },
  };
}

const mockCreateTransfer = jest.fn();
const mockGetSucceededChargeId = jest.fn();
const mockCreateRefund = jest.fn();
const mockCreateCheckoutSession = jest.fn();
const mockRetrieveCheckoutSession = jest.fn();
const mockLogAdminJobAction = jest.fn();
const mockLogJobEvent = jest.fn();

jest.mock('../src/firebaseAdmin', () => ({
  admin: {
    firestore: {
      FieldValue: {
        serverTimestamp: jest.fn(() => '__server_ts__'),
        arrayUnion: jest.fn((v) => ({ __arrayUnion: v })),
        arrayRemove: jest.fn((v) => ({ __arrayRemove: v })),
        increment: jest.fn((v) => ({ __increment: v })),
      },
    },
  },
  db: {
    collection: jest.fn((name) => mockMakeCollectionRef(name)),
    getAll: jest.fn((...refs) => mockFirestoreGetAll(...refs)),
    batch: jest.fn(() => ({
      update: jest.fn((ref, payload) => {
        mockAdminBatchQueue.push({ ref, payload: JSON.parse(JSON.stringify(payload)) });
      }),
      commit: jest.fn(async () => {
        const q = mockAdminBatchQueue.splice(0, mockAdminBatchQueue.length);
        for (const { ref, payload } of q) {
          if (ref && ref._variationDoc) {
            if (!mockJobState.variationsByJob.has(ref._jobId)) mockJobState.variationsByJob.set(ref._jobId, new Map());
            const m = mockJobState.variationsByJob.get(ref._jobId);
            const existing = m.get(ref.id) || {};
            m.set(ref.id, { ...existing, ...payload });
            continue;
          }
          const jid = String(ref.id);
          const existing = mockJobState.jobs.get(jid);
          if (existing === undefined) throw new Error(`batch update missing job ${jid}`);
          mockJobState.jobs.set(jid, { ...existing, ...payload });
        }
      }),
    })),
    runTransaction: async (fn) => {
      const tx = {
        get: async (ref) => ref.get(),
        update: async (ref, data) => ref.update(data),
      };
      return fn(tx);
    },
  },
}));

jest.mock('../src/middleware/auth', () => ({
  requireAuth: (req, _res, next) => {
    req.user = { uid: 'admin-uid', admin: true, role: 'super_admin', super_admin: true };
    next();
  },
  requireAdmin: (_req, _res, next) => next(),
  requireSuperAdmin: (_req, _res, next) => next(),
}));

jest.mock('../src/services/stripe', () => ({
  createTransfer: (...args) => mockCreateTransfer(...args),
  getSucceededChargeIdForConnectTransfer: (...args) => mockGetSucceededChargeId(...args),
  createRefund: (...args) => mockCreateRefund(...args),
  createCheckoutSession: (...args) => mockCreateCheckoutSession(...args),
  retrieveCheckoutSession: (...args) => mockRetrieveCheckoutSession(...args),
}));

jest.mock('../src/routes/admin/shared/audit', () => ({
  logAdminJobAction: (...args) => mockLogAdminJobAction(...args),
  logJobEvent: (...args) => mockLogJobEvent(...args),
}));

const jobRoutes = require('../src/routes/admin/jobRoutes');

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use(jobRoutes);
  return app;
}

describe('admin job route contracts', () => {
  let app;
  let envSnapshot;

  beforeEach(() => {
    envSnapshot = { ...process.env };
    process.env.STRIPE_ENABLED = 'true';
    process.env.PLATFORM_FEE_PERCENT = '15';
    app = buildApp();
    resetState();
    mockCreateTransfer.mockReset();
    mockGetSucceededChargeId.mockReset();
    mockGetSucceededChargeId.mockResolvedValue({ chargeId: 'ch_test_admin' });
    mockCreateRefund.mockReset();
    mockCreateCheckoutSession.mockReset();
    mockRetrieveCheckoutSession.mockReset();
    mockLogAdminJobAction.mockReset();
    mockLogJobEvent.mockReset();
  });

  afterEach(() => {
    process.env = envSnapshot;
  });

  it('GET /api/admin/ops-summary returns aggregated counts', async () => {
    writeCollectionDoc('jobs', 'j1', { status: 'AWAITING_FUNDING', paymentState: 'payment_failed' });
    writeCollectionDoc('jobs', 'j2', { status: 'REFUND_PENDING', paymentState: 'refund_pending' });
    writeCollectionDoc('jobs', 'j3', {
      status: 'DISPUTED',
      disputedAt: { _seconds: Math.floor(Date.now() / 1000) - 86400 * 2 },
    });
    writeCollectionDoc('jobs', 'j4', { status: 'DISPUTED', disputedAt: { _seconds: Math.floor(Date.now() / 1000) - 3600 } });

    const res = await request(app).get('/api/admin/ops-summary');

    expect(res.status).toBe(200);
    expect(res.body.failedPayments).toBe(1);
    expect(res.body.refundsInProgress).toBe(1);
    expect(res.body.disputesAwaiting).toBe(2);
    expect(res.body.disputesStale24h).toBe(1);
    expect(res.body.riskHighJobs).toBe(0);
    expect(res.body.riskCriticalJobs).toBe(0);
  });

  it('POST /chat/reopen records a bounded audited support override', async () => {
    writeCollectionDoc('jobs', 'job-chat', {
      status: 'PAID',
      paymentState: 'released',
      chatFrozen: true,
    });

    const res = await request(app)
      .post('/api/admin/jobs/job-chat/chat/reopen')
      .send({ reason: 'Support case requires final attachment exchange.', days: 7 });

    expect(res.status).toBe(200);
    const job = readCollectionDoc('jobs', 'job-chat');
    expect(job.chatFrozen).toBe(false);
    expect(job.chatReopenedBy).toBe('admin-uid');
    expect(job.chatReopenedUntilMs).toBeGreaterThan(Date.now());
    expect(mockLogAdminJobAction).toHaveBeenCalledWith(expect.objectContaining({
      jobId: 'job-chat',
      action: 'REOPEN_CHAT',
    }));
    expect(mockLogJobEvent).toHaveBeenCalledWith(expect.objectContaining({
      jobId: 'job-chat',
      action: 'ADMIN_REOPEN_CHAT',
    }));
  });

  it('routes monitoring review and chat freeze through audited admin endpoints', async () => {
    writeCollectionDoc('jobs', 'job-monitoring', {
      status: 'FUNDED', requiresAdminAttention: true, chatFrozen: false,
    });

    const freeze = await request(app)
      .post('/api/admin/jobs/job-monitoring/chat/freeze')
      .send({ frozen: true, reason: 'Off-platform payment request detected' });
    expect(freeze.status).toBe(200);
    expect(readCollectionDoc('jobs', 'job-monitoring').chatFrozen).toBe(true);

    const reviewed = await request(app)
      .post('/api/admin/jobs/job-monitoring/monitoring/review')
      .send({});
    expect(reviewed.status).toBe(200);
    const job = readCollectionDoc('jobs', 'job-monitoring');
    expect(job.requiresAdminAttention).toBe(false);
    expect(job.monitoringReviewedBy).toBe('admin-uid');
    expect(mockLogAdminJobAction).toHaveBeenCalledWith(expect.objectContaining({
      jobId: 'job-monitoring', action: 'CHAT_FROZEN',
    }));
    expect(mockLogAdminJobAction).toHaveBeenCalledWith(expect.objectContaining({
      jobId: 'job-monitoring', action: 'MONITORING_REVIEWED',
    }));
  });

  it('POST /retry-payment recreates checkout when funding failed', async () => {
    writeCollectionDoc('quotes', 'q1', { amount: 100, jobId: 'rj1', tradieUid: 't1' });
    writeCollectionDoc('jobs', 'rj1', {
      status: 'AWAITING_FUNDING',
      paymentState: 'payment_failed',
      acceptedQuoteId: 'q1',
      homeownerUid: 'h1',
      paymentCurrency: 'aud',
    });
    mockRetrieveCheckoutSession.mockResolvedValue({ status: 'expired', payment_status: 'unpaid' });
    mockCreateCheckoutSession.mockResolvedValue({ id: 'cs_test_1', payment_intent: 'pi_new' });

    const res = await request(app).post('/api/admin/jobs/rj1/retry-payment');

    expect(res.status).toBe(200);
    expect(res.body.kind).toBe('checkout');
    expect(res.body.sessionId).toBe('cs_test_1');
    expect(mockCreateCheckoutSession).toHaveBeenCalled();
    expect(mockCreateCheckoutSession.mock.calls[0][0].idempotencyKey).toBe(
      'taskio_checkout_rj1_q1_g1'
    );
    const job = readCollectionDoc('jobs', 'rj1');
    expect(job.paymentCheckoutSessionId).toBe('cs_test_1');
    expect(job.paymentIntentId).toBe('pi_new');
  });

  it('POST /retry-payment retries refund when refund_failed', async () => {
    writeCollectionDoc('jobs', 'rj2', {
      status: 'REFUND_PENDING',
      paymentState: 'refund_failed',
      paymentIntentId: 'pi_zz',
    });
    const nowSpy = jest.spyOn(Date, 'now').mockReturnValue(555555);
    mockCreateRefund.mockResolvedValue({ id: 're_retry', status: 'succeeded' });

    const res = await request(app)
      .post('/api/admin/jobs/rj2/retry-payment')
      .send({ idempotencyKey: 'client-chosen-key' });
    nowSpy.mockRestore();

    expect(res.status).toBe(200);
    expect(res.body.kind).toBe('refund');
    expect(mockCreateRefund).toHaveBeenCalledTimes(1);
    expect(mockCreateRefund.mock.calls[0][0].idempotencyKey).toBe('taskio_refund_rj2_g2');
    expect(mockCreateRefund.mock.calls[0][0].idempotencyKey).not.toMatch(/555555|client-chosen/);
  });

  it('POST /retry-payment concurrent refund retries share one Stripe idempotency key', async () => {
    writeCollectionDoc('jobs', 'rj2c', {
      status: 'REFUND_PENDING',
      paymentState: 'refund_failed',
      paymentIntentId: 'pi_zz',
    });
    let arrivals = 0;
    let releaseBoth;
    const bothArrived = new Promise((resolve) => { releaseBoth = resolve; });
    mockCreateRefund.mockImplementation(async () => {
      arrivals += 1;
      if (arrivals === 2) releaseBoth();
      await bothArrived;
      return { id: 're_retry_shared', status: 'succeeded' };
    });

    const makeRetry = () => request(app).post('/api/admin/jobs/rj2c/retry-payment');
    const [res, res2] = await Promise.all([makeRetry(), makeRetry()]);

    expect(res.status).toBe(200);
    expect(res2.status).toBe(200);
    expect(mockCreateRefund).toHaveBeenCalledTimes(2);
    const keys = mockCreateRefund.mock.calls.map((call) => call[0].idempotencyKey);
    expect(new Set(keys)).toEqual(new Set(['taskio_refund_rj2c_g2']));
  });

  it('POST /retry-payment does not refund twice after a successful retry', async () => {
    writeCollectionDoc('jobs', 'rj2b', {
      status: 'REFUND_PENDING',
      paymentState: 'refund_failed',
      paymentIntentId: 'pi_zz',
    });
    mockCreateRefund.mockResolvedValue({ id: 're_once', status: 'succeeded' });

    const first = await request(app).post('/api/admin/jobs/rj2b/retry-payment');
    const second = await request(app).post('/api/admin/jobs/rj2b/retry-payment');

    expect(first.status).toBe(200);
    expect(second.status).toBe(409);
    expect(mockCreateRefund).toHaveBeenCalledTimes(1);
  });

  it('POST /refund network timeout keeps the attempt open and reuses the same key', async () => {
    writeCollectionDoc('jobs', 'job-to', {
      status: 'in_progress',
      paymentState: 'in_escrow',
      paymentIntentId: 'pi_to',
      disputeFlag: false,
    });
    const timeoutErr = new Error('timeout');
    timeoutErr.code = 'ETIMEDOUT';
    mockCreateRefund.mockRejectedValueOnce(timeoutErr);
    mockCreateRefund.mockResolvedValueOnce({ id: 're_to', status: 'succeeded' });

    const first = await request(app).post('/api/admin/jobs/job-to/refund');
    expect(first.status).toBe(503);
    expect(first.body.code).toBe('refund_status_uncertain');
    const afterTimeout = readCollectionDoc('jobs', 'job-to');
    expect(afterTimeout.refundAttemptOpen).toBe(true);
    expect(afterTimeout.paymentState).toBe('refund_pending');
    expect(afterTimeout.refundId).toBeUndefined();
    expect(afterTimeout.status).toBe('REFUND_PENDING');

    const retry = await request(app).post('/api/admin/jobs/job-to/refund');
    expect(retry.status).toBe(200);
    expect(mockCreateRefund.mock.calls.map((call) => call[0].idempotencyKey)).toEqual([
      'taskio_refund_job-to_g1',
      'taskio_refund_job-to_g1',
    ]);
  });

  it('POST /refund Stripe 500 keeps the same generation', async () => {
    writeCollectionDoc('jobs', 'job-500', {
      status: 'in_progress',
      paymentState: 'in_escrow',
      paymentIntentId: 'pi_500',
      disputeFlag: false,
    });
    mockCreateRefund.mockRejectedValueOnce({
      type: 'StripeAPIError',
      rawType: 'api_error',
      statusCode: 500,
      code: 'internal_error',
      message: 'Stripe is down',
    });
    mockCreateRefund.mockResolvedValueOnce({ id: 're_500', status: 'succeeded' });

    const first = await request(app).post('/api/admin/jobs/job-500/refund');
    expect(first.status).toBe(503);
    expect(readCollectionDoc('jobs', 'job-500').refundAttemptOpen).toBe(true);

    const retry = await request(app).post('/api/admin/jobs/job-500/refund');
    expect(retry.status).toBe(200);
    expect(mockCreateRefund.mock.calls.map((call) => call[0].idempotencyKey)).toEqual([
      'taskio_refund_job-500_g1',
      'taskio_refund_job-500_g1',
    ]);
  });

  it('POST /refund definitive 400 closes the attempt without a webhook and next retry is N+1', async () => {
    writeCollectionDoc('jobs', 'job-400', {
      status: 'in_progress',
      paymentState: 'in_escrow',
      paymentIntentId: 'pi_400',
      disputeFlag: false,
    });
    mockCreateRefund.mockRejectedValueOnce({
      type: 'StripeInvalidRequestError',
      rawType: 'invalid_request_error',
      statusCode: 400,
      code: 'resource_missing',
      message: 'No such payment_intent: pi_400',
    });
    mockCreateRefund.mockResolvedValueOnce({ id: 're_400_next', status: 'succeeded' });

    const first = await request(app).post('/api/admin/jobs/job-400/refund');
    expect(first.status).toBe(400);
    expect(first.body.code).toBe('refund_request_rejected');
    expect(first.body.failureCode).toBe('resource_missing');
    const after = readCollectionDoc('jobs', 'job-400');
    expect(after.refundAttemptOpen).toBe(false);
    expect(after.paymentState).toBe('refund_failed');
    expect(after.status).toBe('REFUND_PENDING');
    expect(after.refundId).toBeUndefined();
    expect(after.refundLastFailureCategory).toBe('invalid_request');
    expect(after.refundLastFailureCode).toBe('resource_missing');

    const retry = await request(app).post('/api/admin/jobs/job-400/retry-payment');
    expect(retry.status).toBe(200);
    expect(retry.body.kind).toBe('refund');
    expect(mockCreateRefund.mock.calls[1][0].idempotencyKey).toBe('taskio_refund_job-400_g2');
  });

  it('POST /retry-payment after a failed Stripe Refund object uses generation N+1', async () => {
    writeCollectionDoc('jobs', 'job-wh', {
      status: 'REFUND_PENDING',
      paymentState: 'refund_failed',
      paymentIntentId: 'pi_wh',
      refundAttempt: 1,
      refundAttemptOpen: false,
      refundLastFailedId: 're_failed',
      refundLastFailureCategory: 'refund_object_failed',
      refundLastFailureCode: 'expired_or_canceled_card',
    });
    mockCreateRefund.mockResolvedValue({ id: 're_wh_next', status: 'succeeded' });

    const res = await request(app).post('/api/admin/jobs/job-wh/retry-payment');
    expect(res.status).toBe(200);
    expect(mockCreateRefund.mock.calls[0][0].idempotencyKey).toBe('taskio_refund_job-wh_g2');
  });

  it('GET /api/admin/jobs enriches homeownerName and expertName via batch user reads', async () => {
    writeCollectionDoc('jobs', 'job-a', {
      status: 'OPEN',
      homeownerUid: 'home-1',
      acceptedTradieUid: 'exp-1',
    });
    writeCollectionDoc('users', 'home-1', { displayName: 'Client Name' });
    writeCollectionDoc('users', 'exp-1', { name: 'Expert Name' });

    const res = await request(app).get('/api/admin/jobs');

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    const row = res.body.find((j) => j.id === 'job-a');
    expect(row).toBeDefined();
    expect(row.homeownerName).toBe('Client Name');
    expect(row.expertName).toBe('Expert Name');
  });

  it('POST /flag-dispute marks task disputed and preserves prior state', async () => {
    writeCollectionDoc('jobs', 'job-1', {
      status: 'assigned',
      paymentState: 'in_escrow',
      disputeFlag: false,
    });

    const res = await request(app)
      .post('/api/admin/jobs/job-1/flag-dispute')
      .send({ reason: '  abusive messages  ' });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ message: 'Task flagged as disputed.' });

    const job = readCollectionDoc('jobs', 'job-1');
    expect(job.status).toBe('DISPUTED');
    expect(job.paymentState).toBe('disputed');
    expect(job.disputeFlag).toBe(true);
    expect(job.preDisputeStatus).toBe('assigned');
    expect(job.preDisputePaymentState).toBe('in_escrow');
    expect(job.disputeReason).toBe('abusive messages');

    expect(mockLogAdminJobAction).toHaveBeenCalledWith(expect.objectContaining({
      jobId: 'job-1',
      action: 'FLAG_DISPUTE',
    }));
    expect(mockLogJobEvent).toHaveBeenCalledWith(expect.objectContaining({
      jobId: 'job-1',
      action: 'ADMIN_FLAG_DISPUTE',
    }));
  });

  it('POST /clear-dispute returns 409 when task is not disputed', async () => {
    writeCollectionDoc('jobs', 'job-2', {
      status: 'assigned',
      paymentState: 'in_escrow',
      disputeFlag: false,
    });

    const res = await request(app).post('/api/admin/jobs/job-2/clear-dispute');

    expect(res.status).toBe(409);
    expect(res.body.message).toBe('Task is not currently disputed.');
  });

  it('POST /clear-dispute restores pre-dispute state', async () => {
    writeCollectionDoc('jobs', 'job-3', {
      status: 'disputed',
      paymentState: 'disputed',
      disputeFlag: true,
      preDisputeStatus: 'awaiting_funding',
      preDisputePaymentState: 'in_escrow',
    });

    const res = await request(app).post('/api/admin/jobs/job-3/clear-dispute');

    expect(res.status).toBe(200);
    expect(res.body.message).toBe('Dispute cleared and task restored.');

    const job = readCollectionDoc('jobs', 'job-3');
    expect(job.status).toBe('awaiting_funding');
    expect(job.paymentState).toBe('in_escrow');
    expect(job.disputeFlag).toBe(false);
    expect(job.disputeReason).toBeNull();

    expect(mockLogAdminJobAction).toHaveBeenCalledWith(expect.objectContaining({
      jobId: 'job-3',
      action: 'CLEAR_DISPUTE',
    }));
    expect(mockLogJobEvent).toHaveBeenCalledWith(expect.objectContaining({
      jobId: 'job-3',
      action: 'ADMIN_CLEAR_DISPUTE',
    }));
  });

  it('POST /manual-release rejects when Stripe is disabled', async () => {
    process.env.STRIPE_ENABLED = 'false';
    writeCollectionDoc('jobs', 'job-4', {
      paymentState: 'in_escrow',
      acceptedTradieUid: 'tradie-1',
      paymentAmountCents: 10000,
      paymentCurrency: 'aud',
    });
    writeCollectionDoc('users', 'tradie-1', {
      role: 'tradie',
      stripeAccountId: 'acct_123',
      stripeOnboardingStatus: 'completed',
      stripeChargesEnabled: true,
      stripePayoutsEnabled: true,
    });

    const res = await request(app).post('/api/admin/jobs/job-4/manual-release');

    expect(res.status).toBe(503);
    expect(res.body.code).toBe('stripe_disabled');
    expect(mockCreateTransfer).not.toHaveBeenCalled();
  });

  it('POST /manual-release releases escrow and returns transfer id', async () => {
    writeCollectionDoc('jobs', 'job-5', {
      status: 'in_progress',
      paymentState: 'in_escrow',
      acceptedTradieUid: 'tradie-1',
      paymentAmountCents: 10000,
      paymentCurrency: 'aud',
      paymentIntentId: 'pi_job5',
      disputeFlag: false,
    });
    writeCollectionDoc('users', 'tradie-1', {
      role: 'tradie',
      stripeAccountId: 'acct_123',
      stripeOnboardingStatus: 'completed',
      stripeChargesEnabled: true,
      stripePayoutsEnabled: true,
    });
    mockCreateTransfer.mockResolvedValue({ id: 'tr_123' });

    const res = await request(app).post('/api/admin/jobs/job-5/manual-release');

    expect(res.status).toBe(200);
    expect(res.body.message).toBe('Payment released (admin override).');
    expect(res.body.transferId).toBe('tr_123');
    expect(res.body.totalProviderAmountCents).toBe(8500);
    expect(res.body.variationTransferIds).toEqual({});

    expect(mockGetSucceededChargeId).toHaveBeenCalledWith('pi_job5');
    expect(mockCreateTransfer).toHaveBeenCalledTimes(1);
    expect(mockCreateTransfer).toHaveBeenCalledWith(
      expect.objectContaining({
        amountInCents: 8500,
        currency: 'aud',
        destinationAccountId: 'acct_123',
        sourceTransaction: 'ch_test_admin',
        transferGroup: 'taskio_job_job-5',
        idempotencyKey: 'taskio_admin_release_job-5',
      })
    );

    const job = readCollectionDoc('jobs', 'job-5');
    expect(job.status).toBe('PAID');
    expect(job.paymentState).toBe('released');
    expect(job.transferId).toBe('tr_123');
    expect(job.platformFeeAmount).toBe(1500);
    expect(job.providerAmount).toBe(8500);
    expect(job.totalProviderReleasedCents).toBe(8500);
  });

  it('POST /manual-release includes paid variation in extra Stripe transfer', async () => {
    writeCollectionDoc('jobs', 'job-var', {
      status: 'in_progress',
      paymentState: 'in_escrow',
      acceptedTradieUid: 'tradie-1',
      paymentAmountCents: 10000,
      paymentCurrency: 'aud',
      paymentIntentId: 'pi_job_var',
      disputeFlag: false,
    });
    seedJobVariation('job-var', 'v1', {
      status: 'approved',
      paymentState: 'in_escrow',
      paymentStatus: 'paid',
      priceChangeCents: 5000,
      paymentIntentId: 'pi_var_v1',
    });
    writeCollectionDoc('users', 'tradie-1', {
      role: 'tradie',
      stripeAccountId: 'acct_123',
      stripeOnboardingStatus: 'completed',
      stripeChargesEnabled: true,
      stripePayoutsEnabled: true,
    });
    mockGetSucceededChargeId.mockImplementation((pi) => Promise.resolve({
      chargeId: pi === 'pi_var_v1' ? 'ch_var' : 'ch_base',
    }));
    let tr = 0;
    mockCreateTransfer.mockImplementation(() => {
      tr += 1;
      return Promise.resolve({ id: `tr_${tr}` });
    });

    const res = await request(app).post('/api/admin/jobs/job-var/manual-release');

    expect(res.status).toBe(200);
    expect(mockCreateTransfer).toHaveBeenCalledTimes(2);
    expect(mockCreateTransfer).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        amountInCents: 8500,
        idempotencyKey: 'taskio_admin_release_job-var',
        sourceTransaction: 'ch_base',
      })
    );
    expect(mockCreateTransfer).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        amountInCents: 4500,
        idempotencyKey: 'taskio_admin_release_var_job-var_v1',
        sourceTransaction: 'ch_var',
      })
    );

    const job = readCollectionDoc('jobs', 'job-var');
    expect(job.providerAmount).toBe(13000);
    expect(job.variationProviderReleasedCents).toBe(4500);
    expect(job.releaseVariationTransferIds).toEqual({ v1: 'tr_2' });

    const v = mockJobState.variationsByJob.get('job-var').get('v1');
    expect(v.releaseStatus).toBe('released');
    expect(v.transferId).toBe('tr_2');
  });

  it('POST /manual-release uses valid feeSnapshot for base transfer amount', async () => {
    const { BASE_FUNDING_SOURCE } = require('../src/services/jobFeeSnapshotService');
    const { STAGE } = require('../src/services/expertFeeProgram');
    writeCollectionDoc('jobs', 'job-admin-fs', {
      status: 'in_progress',
      paymentState: 'in_escrow',
      acceptedTradieUid: 'tradie-1',
      paymentAmountCents: 10000,
      paymentCurrency: 'aud',
      paymentIntentId: 'pi_admin_fs',
      disputeFlag: false,
      platformFeePercent: 15,
      feeSnapshot: {
        source: BASE_FUNDING_SOURCE,
        version: 1,
        jobId: 'job-admin-fs',
        expertUid: 'tradie-1',
        grossAmountCents: 10000,
        taskioFeeCents: 1000,
        expertNetCents: 9000,
        lockedAt: '2026-01-01T00:00:00.000Z',
        stage: STAGE.STANDARD_LAUNCH,
        expertFeeBps: 1000,
      },
    });
    writeCollectionDoc('users', 'tradie-1', {
      role: 'tradie',
      stripeAccountId: 'acct_123',
      stripeOnboardingStatus: 'completed',
      stripeChargesEnabled: true,
      stripePayoutsEnabled: true,
    });
    mockCreateTransfer.mockResolvedValue({ id: 'tr_admin_fs' });

    const res = await request(app).post('/api/admin/jobs/job-admin-fs/manual-release');

    expect(res.status).toBe(200);
    expect(mockCreateTransfer).toHaveBeenCalledTimes(1);
    expect(mockCreateTransfer).toHaveBeenCalledWith(
      expect.objectContaining({
        amountInCents: 9000,
        idempotencyKey: 'taskio_admin_release_job-admin-fs',
      })
    );
    const job = readCollectionDoc('jobs', 'job-admin-fs');
    expect(job.baseReleaseFeeSource).toBe('fee_snapshot_v1');
    expect(job.totalProviderReleasedCents).toBe(9000);
    expect(job.baseProviderReleasedCents).toBe(9000);
  });

  it('POST /manual-release falls back to legacy base fee when feeSnapshot is inconsistent', async () => {
    const { BASE_FUNDING_SOURCE } = require('../src/services/jobFeeSnapshotService');
    const { STAGE } = require('../src/services/expertFeeProgram');
    writeCollectionDoc('jobs', 'job-admin-bad', {
      status: 'in_progress',
      paymentState: 'in_escrow',
      acceptedTradieUid: 'tradie-1',
      paymentAmountCents: 10000,
      paymentCurrency: 'aud',
      paymentIntentId: 'pi_admin_bad',
      disputeFlag: false,
      feeSnapshot: {
        source: BASE_FUNDING_SOURCE,
        version: 1,
        jobId: 'job-admin-bad',
        expertUid: 'tradie-1',
        grossAmountCents: 10000,
        taskioFeeCents: 500,
        expertNetCents: 9000,
        lockedAt: '2026-01-01T00:00:00.000Z',
        stage: STAGE.STANDARD_LAUNCH,
        expertFeeBps: 1000,
      },
    });
    writeCollectionDoc('users', 'tradie-1', {
      role: 'tradie',
      stripeAccountId: 'acct_123',
      stripeOnboardingStatus: 'completed',
      stripeChargesEnabled: true,
      stripePayoutsEnabled: true,
    });
    mockCreateTransfer.mockResolvedValue({ id: 'tr_admin_bad' });

    const res = await request(app).post('/api/admin/jobs/job-admin-bad/manual-release');

    expect(res.status).toBe(200);
    expect(mockCreateTransfer).toHaveBeenCalledWith(expect.objectContaining({ amountInCents: 8500 }));
    const job = readCollectionDoc('jobs', 'job-admin-bad');
    expect(job.baseReleaseFeeSource).toBe('legacy_platform_fee_percent');
  });

  describe('POST /api/admin/jobs/:jobId/resolve-dispute', () => {
    const { BASE_FUNDING_SOURCE } = require('../src/services/jobFeeSnapshotService');
    const { STAGE } = require('../src/services/expertFeeProgram');

    function seedDisputedJob(jobId, overrides = {}) {
      writeCollectionDoc('jobs', jobId, {
        status: 'DISPUTED',
        paymentState: 'disputed',
        disputeFlag: true,
        acceptedTradieUid: 'tradie-1',
        paymentAmountCents: 10000,
        paymentCurrency: 'aud',
        paymentIntentId: 'pi_disp_base',
        homeownerUid: 'h1',
        disputedAt: { _seconds: 100 },
        clientDisputeReason: 'test reason',
        ...overrides,
      });
      writeCollectionDoc('users', 'tradie-1', {
        role: 'tradie',
        stripeAccountId: 'acct_123',
        stripeOnboardingStatus: 'completed',
        stripeChargesEnabled: true,
        stripePayoutsEnabled: true,
      });
    }

    it('resolution expert: valid feeSnapshot, base-only release + breakdown', async () => {
      seedDisputedJob('job-rd-fs', {
        feeSnapshot: {
          source: BASE_FUNDING_SOURCE,
          version: 1,
          jobId: 'job-rd-fs',
          expertUid: 'tradie-1',
          grossAmountCents: 10000,
          taskioFeeCents: 1000,
          expertNetCents: 9000,
          lockedAt: '2026-01-01T00:00:00.000Z',
          stage: STAGE.STANDARD_LAUNCH,
          expertFeeBps: 1000,
        },
      });
      mockCreateTransfer.mockResolvedValue({ id: 'tr_rd_fs' });

      const res = await request(app)
        .post('/api/admin/jobs/job-rd-fs/resolve-dispute')
        .send({ resolution: 'expert' });

      expect(res.status).toBe(200);
      expect(mockCreateTransfer).toHaveBeenCalledTimes(1);
      expect(mockCreateTransfer).toHaveBeenCalledWith(
        expect.objectContaining({
          amountInCents: 9000,
          idempotencyKey: 'taskio_admin_resolve_expert_job-rd-fs',
        })
      );
      const job = readCollectionDoc('jobs', 'job-rd-fs');
      expect(job.status).toBe('PAID');
      expect(job.paymentState).toBe('released');
      expect(job.disputeFlag).toBe(false);
      expect(job.disputeResolution).toBe('released_expert');
      expect(job.disputeResolvedBy).toBe('admin-uid');
      expect(job.baseReleaseFeeSource).toBe('fee_snapshot_v1');
      expect(job.baseProviderReleasedCents).toBe(9000);
      expect(job.basePlatformFeeReleasedCents).toBe(1000);
      expect(job.totalProviderReleasedCents).toBe(9000);
      expect(job.clientDisputeReason).toBe('test reason');
      expect(mockLogAdminJobAction).toHaveBeenCalledWith(
        expect.objectContaining({
          jobId: 'job-rd-fs',
          action: 'RESOLVE_DISPUTE_EXPERT',
          metadata: expect.objectContaining({
            transferId: 'tr_rd_fs',
            baseReleaseFeeSource: 'fee_snapshot_v1',
            variationReleaseFeeSource: 'platform_fee_percent',
            totalProviderReleasedCents: 9000,
          }),
        })
      );
    });

    it('resolution expert: no feeSnapshot uses legacy base + breakdown fields', async () => {
      seedDisputedJob('job-rd-leg');
      mockCreateTransfer.mockResolvedValue({ id: 'tr_rd_leg' });

      const res = await request(app)
        .post('/api/admin/jobs/job-rd-leg/resolve-dispute')
        .send({ resolution: 'expert' });

      expect(res.status).toBe(200);
      expect(mockCreateTransfer).toHaveBeenCalledWith(expect.objectContaining({ amountInCents: 8500 }));
      const job = readCollectionDoc('jobs', 'job-rd-leg');
      expect(job.baseReleaseFeeSource).toBe('legacy_platform_fee_percent');
      expect(job.baseProviderReleasedCents).toBe(8500);
      expect(job.releasePlanVersion).toBe(2);
    });

    it('resolution expert: invalid feeSnapshot falls back to legacy base slice', async () => {
      seedDisputedJob('job-rd-badfs', {
        feeSnapshot: {
          source: BASE_FUNDING_SOURCE,
          version: 1,
          jobId: 'job-rd-badfs',
          expertUid: 'tradie-1',
          grossAmountCents: 10000,
          taskioFeeCents: 400,
          expertNetCents: 9000,
          lockedAt: '2026-01-01T00:00:00.000Z',
          stage: STAGE.STANDARD_LAUNCH,
          expertFeeBps: 1000,
        },
      });
      mockCreateTransfer.mockResolvedValue({ id: 'tr_rd_bad' });

      const res = await request(app)
        .post('/api/admin/jobs/job-rd-badfs/resolve-dispute')
        .send({ resolution: 'expert' });

      expect(res.status).toBe(200);
      expect(mockCreateTransfer).toHaveBeenCalledWith(expect.objectContaining({ amountInCents: 8500 }));
      expect(readCollectionDoc('jobs', 'job-rd-badfs').baseReleaseFeeSource).toBe('legacy_platform_fee_percent');
    });

    it('resolution expert: paid variation gets second transfer and persisted totals', async () => {
      seedDisputedJob('job-rd-var', {
        feeSnapshot: {
          source: BASE_FUNDING_SOURCE,
          version: 1,
          jobId: 'job-rd-var',
          expertUid: 'tradie-1',
          grossAmountCents: 10000,
          taskioFeeCents: 1000,
          expertNetCents: 9000,
          lockedAt: '2026-01-01T00:00:00.000Z',
          stage: STAGE.STANDARD_LAUNCH,
          expertFeeBps: 1000,
        },
      });
      seedJobVariation('job-rd-var', 'vx', {
        status: 'approved',
        paymentState: 'in_escrow',
        paymentStatus: 'paid',
        priceChangeCents: 5000,
        paymentIntentId: 'pi_disp_var',
      });
      mockGetSucceededChargeId.mockImplementation((pi) =>
        Promise.resolve({ chargeId: pi === 'pi_disp_var' ? 'ch_var_rd' : 'ch_base_rd' })
      );
      let tr = 0;
      mockCreateTransfer.mockImplementation(() => {
        tr += 1;
        return Promise.resolve({ id: `tr_rd_${tr}` });
      });

      const res = await request(app)
        .post('/api/admin/jobs/job-rd-var/resolve-dispute')
        .send({ resolution: 'expert' });

      expect(res.status).toBe(200);
      expect(mockCreateTransfer).toHaveBeenCalledTimes(2);
      expect(mockCreateTransfer).toHaveBeenNthCalledWith(
        1,
        expect.objectContaining({
          amountInCents: 9000,
          idempotencyKey: 'taskio_admin_resolve_expert_job-rd-var',
        })
      );
      expect(mockCreateTransfer).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({
          amountInCents: 4500,
          idempotencyKey: 'taskio_admin_resolve_expert_var_job-rd-var_vx',
        })
      );
      const job = readCollectionDoc('jobs', 'job-rd-var');
      expect(job.totalProviderReleasedCents).toBe(13500);
      expect(job.totalPlatformFeeReleasedCents).toBe(1500);
      expect(job.variationProviderReleasedCents).toBe(4500);

      const v = mockJobState.variationsByJob.get('job-rd-var').get('vx');
      expect(v.releaseStatus).toBe('released');
      expect(v.transferId).toBe('tr_rd_2');
    });

    it('resolution expert: idempotent when already released', async () => {
      writeCollectionDoc('jobs', 'job-rd-done', {
        status: 'DISPUTED',
        paymentState: 'released',
        transferId: 'tr_prior',
        acceptedTradieUid: 'tradie-1',
        paymentAmountCents: 10000,
      });

      const res = await request(app)
        .post('/api/admin/jobs/job-rd-done/resolve-dispute')
        .send({ resolution: 'expert' });

      expect(res.status).toBe(200);
      expect(res.body.transferId).toBe('tr_prior');
      expect(mockCreateTransfer).not.toHaveBeenCalled();
    });

    it('resolution expert: 409 when transferId exists but paymentState not released', async () => {
      seedDisputedJob('job-rd-weird', { transferId: 'tr_stuck' });

      const res = await request(app)
        .post('/api/admin/jobs/job-rd-weird/resolve-dispute')
        .send({ resolution: 'expert' });

      expect(res.status).toBe(409);
      expect(res.body.code).toBe('release_transfer_state_mismatch');
      expect(mockCreateTransfer).not.toHaveBeenCalled();
    });

    it('resolution refund: unchanged dispute refund flow', async () => {
      writeCollectionDoc('jobs', 'job-rd-refund', {
        status: 'DISPUTED',
        paymentState: 'disputed',
        disputeFlag: true,
        paymentIntentId: 'pi_rd_ref',
      });
      mockCreateRefund.mockResolvedValue({ id: 're_rd_1', status: 'succeeded' });

      const res = await request(app)
        .post('/api/admin/jobs/job-rd-refund/resolve-dispute')
        .send({ resolution: 'refund' });

      expect(res.status).toBe(200);
      expect(res.body.refundId).toBe('re_rd_1');
      expect(mockCreateRefund).toHaveBeenCalledWith(expect.objectContaining({
        paymentIntentId: 'pi_rd_ref',
        amountInCents: null,
        reason: 'requested_by_customer',
        idempotencyKey: 'taskio_refund_job-rd-refund_g1',
        metadata: expect.objectContaining({ type: 'job_refund', jobId: 'job-rd-refund' }),
      }));
      expect(mockCreateTransfer).not.toHaveBeenCalled();
      expect(readCollectionDoc('jobs', 'job-rd-refund').disputeResolution).toBe('refunded');
    });
  });

  it('POST /refund returns 400 when paymentIntentId is missing', async () => {
    writeCollectionDoc('jobs', 'job-6', {
      status: 'in_progress',
      paymentState: 'in_escrow',
      disputeFlag: false,
    });

    const res = await request(app).post('/api/admin/jobs/job-6/refund');

    expect(res.status).toBe(400);
    expect(res.body.message).toBe('No payment intent found for this task.');
  });

  it('POST /refund returns 400 when already refunded', async () => {
    writeCollectionDoc('jobs', 'job-refunded', {
      status: 'REFUNDED',
      paymentState: 'refunded',
      paymentIntentId: 'pi_x',
    });

    const res = await request(app).post('/api/admin/jobs/job-refunded/refund');

    expect(res.status).toBe(400);
    expect(res.body.message).toBe('Already refunded.');
    expect(mockCreateRefund).not.toHaveBeenCalled();
  });

  it('POST /refund resumes an in-progress refund with the same Stripe key', async () => {
    writeCollectionDoc('jobs', 'job-pending', {
      status: 'REFUND_PENDING',
      paymentState: 'refund_pending',
      paymentIntentId: 'pi_y',
      refundAttempt: 1,
      refundAttemptOpen: true,
    });
    mockCreateRefund.mockResolvedValue({ id: 're_resume', status: 'succeeded' });

    const res = await request(app).post('/api/admin/jobs/job-pending/refund');

    expect(res.status).toBe(200);
    expect(mockCreateRefund).toHaveBeenCalledWith(expect.objectContaining({
      paymentIntentId: 'pi_y',
      idempotencyKey: 'taskio_refund_job-pending_g1',
    }));
  });

  it('POST /refund refunds and transitions non-disputed tasks to refunded', async () => {
    writeCollectionDoc('jobs', 'job-7', {
      status: 'in_progress',
      paymentState: 'in_escrow',
      paymentIntentId: 'pi_123',
      disputeFlag: false,
    });
    mockCreateRefund.mockResolvedValue({ id: 're_123', status: 'succeeded' });

    const res = await request(app)
      .post('/api/admin/jobs/job-7/refund')
      .send({ idempotencyKey: 'client-chosen-key' });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      message: 'Refund initiated.',
      refundId: 're_123',
      variationRefundIds: {},
    });
    expect(mockCreateRefund).toHaveBeenCalledWith(expect.objectContaining({
      paymentIntentId: 'pi_123',
      amountInCents: null,
      reason: 'requested_by_customer',
      idempotencyKey: 'taskio_refund_job-7_g1',
      metadata: expect.objectContaining({ type: 'job_refund', jobId: 'job-7' }),
    }));
    expect(mockCreateRefund.mock.calls[0][0].idempotencyKey).not.toBe('client-chosen-key');

    const job = readCollectionDoc('jobs', 'job-7');
    expect(job.status).toBe('REFUNDED');
    expect(job.paymentState).toBe('refunded');
    expect(job.refundId).toBe('re_123');
  });

  it('POST /refund concurrent requests share one Stripe idempotency key', async () => {
    writeCollectionDoc('jobs', 'job-7c', {
      status: 'in_progress',
      paymentState: 'in_escrow',
      paymentIntentId: 'pi_123',
      disputeFlag: false,
    });
    let arrivals = 0;
    let releaseBoth;
    const bothArrived = new Promise((resolve) => { releaseBoth = resolve; });
    mockCreateRefund.mockImplementation(async () => {
      arrivals += 1;
      if (arrivals === 2) releaseBoth();
      await bothArrived;
      return { id: 're_shared', status: 'succeeded' };
    });

    const makeRefund = () => request(app).post('/api/admin/jobs/job-7c/refund');
    const [first, second] = await Promise.all([makeRefund(), makeRefund()]);

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    const keys = mockCreateRefund.mock.calls.map((call) => call[0].idempotencyKey);
    expect(new Set(keys)).toEqual(new Set(['taskio_refund_job-7c_g1']));
  });

  it('POST /refund keeps disputed tasks in disputed state', async () => {
    writeCollectionDoc('jobs', 'job-8', {
      status: 'disputed',
      paymentState: 'disputed',
      paymentIntentId: 'pi_456',
      disputeFlag: true,
    });
    mockCreateRefund.mockResolvedValue({ id: 're_456', status: 'succeeded' });

    const res = await request(app).post('/api/admin/jobs/job-8/refund');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      message: 'Refund initiated.',
      refundId: 're_456',
      variationRefundIds: {},
    });

    const job = readCollectionDoc('jobs', 'job-8');
    expect(job.status).toBe('DISPUTED');
    expect(job.paymentState).toBe('refunded');
    expect(job.disputeResolution).toBe('refunded');
  });

  it('POST /refund refunds a funded variation with the base payment', async () => {
    writeCollectionDoc('jobs', 'job-var-1', {
      status: 'in_progress',
      paymentState: 'in_escrow',
      paymentIntentId: 'pi_base',
      paymentAmountCents: 20000,
    });
    seedJobVariation('job-var-1', 'var-a', {
      status: 'approved',
      paymentState: 'in_escrow',
      paymentStatus: 'paid',
      priceChangeCents: 5000,
      paymentIntentId: 'pi_var_a',
    });
    mockCreateRefund.mockImplementation(async ({ paymentIntentId }) => ({ id: `re_${paymentIntentId}`, status: 'succeeded' }));

    const res = await request(app).post('/api/admin/jobs/job-var-1/refund');

    expect(res.status).toBe(200);
    expect(res.body.refundId).toBe('re_pi_base');
    expect(res.body.variationRefundIds).toEqual({ 'var-a': 're_pi_var_a' });
    const keys = mockCreateRefund.mock.calls.map((call) => call[0].idempotencyKey);
    expect(keys).toEqual([
      'taskio_refund_job-var-1_g1',
      'taskio_admin_refund_var_job-var-1_var-a_g1',
    ]);
    expect(readCollectionDoc('jobs', 'job-var-1').paymentState).toBe('refunded');
    expect(mockJobState.variationsByJob.get('job-var-1').get('var-a').paymentState).toBe('refunded');
    expect(mockJobState.variationsByJob.get('job-var-1').get('var-a').refundId).toBe('re_pi_var_a');
  });

  it('POST /refund refunds multiple funded variations', async () => {
    writeCollectionDoc('jobs', 'job-var-m', {
      status: 'in_progress',
      paymentState: 'in_escrow',
      paymentIntentId: 'pi_base_m',
    });
    seedJobVariation('job-var-m', 'var-a', {
      status: 'approved',
      paymentState: 'in_escrow',
      paymentStatus: 'paid',
      priceChangeCents: 4000,
      paymentIntentId: 'pi_a',
    });
    seedJobVariation('job-var-m', 'var-b', {
      status: 'approved',
      paymentState: 'in_escrow',
      paymentStatus: 'paid',
      amountPaidCents: 2500,
      paymentIntentId: 'pi_b',
    });
    mockCreateRefund.mockImplementation(async ({ paymentIntentId }) => ({ id: `re_${paymentIntentId}`, status: 'succeeded' }));

    const res = await request(app).post('/api/admin/jobs/job-var-m/refund');
    expect(res.status).toBe(200);
    expect(res.body.variationRefundIds).toEqual({ 'var-a': 're_pi_a', 'var-b': 're_pi_b' });
    expect(mockCreateRefund).toHaveBeenCalledTimes(3);
  });

  it('POST /refund skips unpaid and declined variations', async () => {
    writeCollectionDoc('jobs', 'job-var-skip', {
      status: 'in_progress',
      paymentState: 'in_escrow',
      paymentIntentId: 'pi_skip',
    });
    seedJobVariation('job-var-skip', 'var-unpaid', {
      status: 'awaiting_payment',
      paymentState: 'pending_payment',
      priceChangeCents: 5000,
    });
    seedJobVariation('job-var-skip', 'var-declined', {
      status: 'declined',
      priceChangeCents: 5000,
      paymentIntentId: 'pi_declined',
    });
    mockCreateRefund.mockResolvedValue({ id: 're_skip', status: 'succeeded' });

    const res = await request(app).post('/api/admin/jobs/job-var-skip/refund');
    expect(res.status).toBe(200);
    expect(mockCreateRefund).toHaveBeenCalledTimes(1);
    expect(mockCreateRefund.mock.calls[0][0].paymentIntentId).toBe('pi_skip');
    expect(res.body.variationRefundIds).toEqual({});
  });

  it('POST /refund does not refund an already-refunded variation again', async () => {
    writeCollectionDoc('jobs', 'job-var-done', {
      status: 'in_progress',
      paymentState: 'in_escrow',
      paymentIntentId: 'pi_done',
    });
    seedJobVariation('job-var-done', 'var-done', {
      status: 'approved',
      paymentState: 'refunded',
      paymentStatus: 'paid',
      priceChangeCents: 5000,
      paymentIntentId: 'pi_done_var',
      refundId: 're_existing',
      refundStatus: 'succeeded',
    });
    mockCreateRefund.mockResolvedValue({ id: 're_base_done', status: 'succeeded' });

    const res = await request(app).post('/api/admin/jobs/job-var-done/refund');
    expect(res.status).toBe(200);
    expect(mockCreateRefund).toHaveBeenCalledTimes(1);
    expect(res.body.variationRefundIds).toEqual({ 'var-done': 're_existing' });
  });

  it('POST /refund concurrent requests do not duplicate variation refunds', async () => {
    writeCollectionDoc('jobs', 'job-var-c', {
      status: 'in_progress',
      paymentState: 'in_escrow',
      paymentIntentId: 'pi_c',
    });
    seedJobVariation('job-var-c', 'var-c', {
      status: 'approved',
      paymentState: 'in_escrow',
      paymentStatus: 'paid',
      priceChangeCents: 3000,
      paymentIntentId: 'pi_c_var',
    });
    let arrivals = 0;
    let releaseBoth;
    const bothArrived = new Promise((resolve) => { releaseBoth = resolve; });
    mockCreateRefund.mockImplementation(async ({ paymentIntentId }) => {
      arrivals += 1;
      if (arrivals === 2) releaseBoth();
      await bothArrived;
      return { id: `re_${paymentIntentId}`, status: 'succeeded' };
    });

    const makeRefund = () => request(app).post('/api/admin/jobs/job-var-c/refund');
    const [first, second] = await Promise.all([makeRefund(), makeRefund()]);
    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    const varKeys = mockCreateRefund.mock.calls
      .map((call) => call[0].idempotencyKey)
      .filter((key) => String(key).includes('_var_'));
    expect(new Set(varKeys)).toEqual(new Set(['taskio_admin_refund_var_job-var-c_var-c_g1']));
  });

  it('POST /refund retries an ambiguous variation failure with the same key', async () => {
    writeCollectionDoc('jobs', 'job-var-amb', {
      status: 'in_progress',
      paymentState: 'in_escrow',
      paymentIntentId: 'pi_amb',
    });
    seedJobVariation('job-var-amb', 'var-amb', {
      status: 'approved',
      paymentState: 'in_escrow',
      paymentStatus: 'paid',
      priceChangeCents: 3000,
      paymentIntentId: 'pi_amb_var',
    });
    mockCreateRefund.mockImplementation(async ({ paymentIntentId }) => {
      if (paymentIntentId === 'pi_amb_var' && mockCreateRefund.mock.calls.filter((c) => c[0].paymentIntentId === 'pi_amb_var').length === 1) {
        const err = new Error('timeout');
        err.code = 'ETIMEDOUT';
        throw err;
      }
      return { id: `re_${paymentIntentId}`, status: 'succeeded' };
    });

    const first = await request(app).post('/api/admin/jobs/job-var-amb/refund');
    expect(first.status).toBe(503);
    expect(readCollectionDoc('jobs', 'job-var-amb').paymentState).not.toBe('refunded');
    expect(readCollectionDoc('jobs', 'job-var-amb').refundId).toBe('re_pi_amb');

    const retry = await request(app).post('/api/admin/jobs/job-var-amb/refund');
    expect(retry.status).toBe(200);
    const varKeys = mockCreateRefund.mock.calls
      .filter((c) => c[0].paymentIntentId === 'pi_amb_var')
      .map((c) => c[0].idempotencyKey);
    expect(varKeys).toEqual([
      'taskio_admin_refund_var_job-var-amb_var-amb_g1',
      'taskio_admin_refund_var_job-var-amb_var-amb_g1',
    ]);
    expect(mockCreateRefund.mock.calls.filter((c) => c[0].paymentIntentId === 'pi_amb').length).toBe(1);
  });

  it('POST /refund persists a definitive variation failure without marking the job REFUNDED', async () => {
    writeCollectionDoc('jobs', 'job-var-def', {
      status: 'in_progress',
      paymentState: 'in_escrow',
      paymentIntentId: 'pi_def',
    });
    seedJobVariation('job-var-def', 'var-def', {
      status: 'approved',
      paymentState: 'in_escrow',
      paymentStatus: 'paid',
      priceChangeCents: 3000,
      paymentIntentId: 'pi_def_var',
    });
    mockCreateRefund.mockImplementation(async ({ paymentIntentId }) => {
      if (paymentIntentId === 'pi_def_var') {
        return Promise.reject({
          type: 'StripeInvalidRequestError',
          rawType: 'invalid_request_error',
          statusCode: 400,
          code: 'resource_missing',
        });
      }
      return { id: `re_${paymentIntentId}`, status: 'succeeded' };
    });

    const res = await request(app).post('/api/admin/jobs/job-var-def/refund');
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('refund_request_rejected');
    expect(res.body.requiresAdminAttention).toBe(true);
    const job = readCollectionDoc('jobs', 'job-var-def');
    expect(job.status).not.toBe('REFUNDED');
    expect(job.paymentState).toBe('refund_failed');
    expect(job.refundId).toBe('re_pi_def');
    expect(job.requiresAdminAttention).toBe(true);
    expect(mockJobState.variationsByJob.get('job-var-def').get('var-def').paymentState).toBe('refund_failed');
  });

  it('POST /resolve-dispute refund also refunds funded variations', async () => {
    writeCollectionDoc('jobs', 'job-rd-var', {
      status: 'DISPUTED',
      paymentState: 'disputed',
      disputeFlag: true,
      paymentIntentId: 'pi_rd_var',
    });
    seedJobVariation('job-rd-var', 'vx', {
      status: 'approved',
      paymentState: 'in_escrow',
      paymentStatus: 'paid',
      priceChangeCents: 8000,
      paymentIntentId: 'pi_rd_vx',
    });
    mockCreateRefund.mockImplementation(async ({ paymentIntentId }) => ({ id: `re_${paymentIntentId}`, status: 'succeeded' }));

    const res = await request(app)
      .post('/api/admin/jobs/job-rd-var/resolve-dispute')
      .send({ resolution: 'refund' });

    expect(res.status).toBe(200);
    expect(res.body.variationRefundIds).toEqual({ vx: 're_pi_rd_vx' });
    expect(readCollectionDoc('jobs', 'job-rd-var').status).toBe('DISPUTED');
    expect(readCollectionDoc('jobs', 'job-rd-var').paymentState).toBe('refunded');
  });

  it('POST /refund fails closed when base funds were already released', async () => {
    writeCollectionDoc('jobs', 'job-rel', {
      status: 'PAID',
      paymentState: 'released',
      paymentIntentId: 'pi_rel',
      transferId: 'tr_rel',
    });
    mockCreateRefund.mockResolvedValue({ id: 're_should_not' });

    const res = await request(app).post('/api/admin/jobs/job-rel/refund');
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('funds_already_released');
    expect(res.body.requiresAdminAttention).toBe(true);
    expect(mockCreateRefund).not.toHaveBeenCalled();
    expect(readCollectionDoc('jobs', 'job-rel').requiresAdminAttention).toBe(true);
    expect(readCollectionDoc('jobs', 'job-rel').paymentState).toBe('released');
  });

  it('POST /refund fails closed when a funded variation was already released', async () => {
    writeCollectionDoc('jobs', 'job-vrel', {
      status: 'in_progress',
      paymentState: 'in_escrow',
      paymentIntentId: 'pi_vrel',
    });
    seedJobVariation('job-vrel', 'var-rel', {
      status: 'approved',
      paymentState: 'in_escrow',
      paymentStatus: 'paid',
      priceChangeCents: 5000,
      paymentIntentId: 'pi_vrel_var',
      releaseStatus: 'released',
      transferId: 'tr_v',
    });

    const res = await request(app).post('/api/admin/jobs/job-vrel/refund');
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('funds_already_released');
    expect(mockCreateRefund).not.toHaveBeenCalled();
  });

  it('POST /refund does not finalise when base succeeded and a variation is pending', async () => {
    writeCollectionDoc('jobs', 'job-pend-var', {
      status: 'in_progress',
      paymentState: 'in_escrow',
      paymentIntentId: 'pi_pend_var',
    });
    seedJobVariation('job-pend-var', 'var-p', {
      status: 'approved',
      paymentState: 'in_escrow',
      paymentStatus: 'paid',
      priceChangeCents: 3000,
      paymentIntentId: 'pi_pend_var_v',
    });
    mockCreateRefund.mockImplementation(async ({ paymentIntentId }) => ({
      id: `re_${paymentIntentId}`,
      status: paymentIntentId === 'pi_pend_var' ? 'succeeded' : 'pending',
    }));

    const res = await request(app).post('/api/admin/jobs/job-pend-var/refund');
    expect(res.status).toBe(200);
    const job = readCollectionDoc('jobs', 'job-pend-var');
    expect(job.status).toBe('REFUND_PENDING');
    expect(job.paymentState).toBe('refund_pending');
    expect(job.refundId).toBe('re_pi_pend_var');
    expect(job.baseRefundConfirmed).toBe(true);
    expect(mockJobState.variationsByJob.get('job-pend-var').get('var-p').refundId).toBe('re_pi_pend_var_v');
    expect(mockJobState.variationsByJob.get('job-pend-var').get('var-p').paymentState).toBe('refund_pending');
    expect(mockJobState.variationsByJob.get('job-pend-var').get('var-p').refundStatus).toBe('pending');
  });

  it('POST /refund does not finalise when base is pending and a variation succeeded', async () => {
    writeCollectionDoc('jobs', 'job-pend-base', {
      status: 'in_progress',
      paymentState: 'in_escrow',
      paymentIntentId: 'pi_pend_base',
    });
    seedJobVariation('job-pend-base', 'var-ok', {
      status: 'approved',
      paymentState: 'in_escrow',
      paymentStatus: 'paid',
      priceChangeCents: 3000,
      paymentIntentId: 'pi_pend_base_v',
    });
    mockCreateRefund.mockImplementation(async ({ paymentIntentId }) => ({
      id: `re_${paymentIntentId}`,
      status: paymentIntentId === 'pi_pend_base' ? 'pending' : 'succeeded',
    }));

    const res = await request(app).post('/api/admin/jobs/job-pend-base/refund');
    expect(res.status).toBe(200);
    const job = readCollectionDoc('jobs', 'job-pend-base');
    expect(job.status).toBe('REFUND_PENDING');
    expect(job.paymentState).toBe('refund_pending');
    expect(job.refundStatus).toBe('pending');
    expect(job.baseRefundConfirmed).not.toBe(true);
    expect(mockJobState.variationsByJob.get('job-pend-base').get('var-ok').paymentState).toBe('refunded');
  });

  it('POST /refund does not treat refundId with pending status as completion', async () => {
    writeCollectionDoc('jobs', 'job-id-only', {
      status: 'REFUND_PENDING',
      paymentState: 'refund_pending',
      paymentIntentId: 'pi_id_only',
      refundId: 're_id_only',
      refundStatus: 'pending',
    });

    const res = await request(app).post('/api/admin/jobs/job-id-only/refund');
    expect(res.status).toBe(200);
    expect(mockCreateRefund).not.toHaveBeenCalled();
    const job = readCollectionDoc('jobs', 'job-id-only');
    expect(job.status).toBe('REFUND_PENDING');
    expect(job.paymentState).toBe('refund_pending');
  });

  it('POST /refund treats a Stripe Refund object with status failed as item failure', async () => {
    writeCollectionDoc('jobs', 'job-obj-fail', {
      status: 'in_progress',
      paymentState: 'in_escrow',
      paymentIntentId: 'pi_obj_fail',
    });
    mockCreateRefund.mockResolvedValue({ id: 're_obj_fail', status: 'failed' });

    const res = await request(app).post('/api/admin/jobs/job-obj-fail/refund');
    expect(res.status).toBe(400);
    expect(res.body.requiresAdminAttention).toBe(true);
    const job = readCollectionDoc('jobs', 'job-obj-fail');
    expect(job.status).not.toBe('REFUNDED');
    expect(job.paymentState).toBe('refund_failed');
    expect(job.requiresAdminAttention).toBe(true);
    expect(job.refundId).toBe('re_obj_fail');
  });

  it('POST /resolve-dispute refund stays DISPUTED while a variation is still pending', async () => {
    writeCollectionDoc('jobs', 'job-rd-pend', {
      status: 'DISPUTED',
      paymentState: 'disputed',
      disputeFlag: true,
      paymentIntentId: 'pi_rd_pend',
    });
    seedJobVariation('job-rd-pend', 'vx', {
      status: 'approved',
      paymentState: 'in_escrow',
      paymentStatus: 'paid',
      priceChangeCents: 8000,
      paymentIntentId: 'pi_rd_pend_v',
    });
    mockCreateRefund.mockImplementation(async ({ paymentIntentId }) => ({
      id: `re_${paymentIntentId}`,
      status: paymentIntentId === 'pi_rd_pend' ? 'succeeded' : 'pending',
    }));

    const res = await request(app)
      .post('/api/admin/jobs/job-rd-pend/resolve-dispute')
      .send({ resolution: 'refund' });

    expect(res.status).toBe(200);
    const job = readCollectionDoc('jobs', 'job-rd-pend');
    expect(job.status).toBe('DISPUTED');
    expect(job.paymentState).toBe('refund_pending');
    expect(job.disputeResolution).not.toBe('refunded');
  });

  it('DELETE /assign/:tradieId keeps open status canonical when the last invite is removed', async () => {
    writeCollectionDoc('jobs', 'job-10', {
      status: 'ASSIGNED',
      invitedTradieUids: ['tradie-1'],
    });

    const res = await request(app).delete('/api/admin/jobs/job-10/assign/tradie-1');

    expect(res.status).toBe(200);
    expect(res.body.message).toContain('Successfully removed expert tradie-1');

    const job = readCollectionDoc('jobs', 'job-10');
    expect(job.invitedTradieUids).toEqual([]);
    expect(job.status).toBe('OPEN');
  });

  it('PUT /status accepts canonical admin status values when transition is valid', async () => {
    writeCollectionDoc('jobs', 'job-11', {
      status: 'OPEN',
    });

    const res = await request(app)
      .put('/api/admin/jobs/job-11/status')
      .send({ status: 'QUOTED' });

    expect(res.status).toBe(200);

    const job = readCollectionDoc('jobs', 'job-11');
    expect(job.status).toBe('QUOTED');
    expect(job.updatedByAdminId).toBe('admin-uid');
  });

  it('runs dispute -> clear -> manual release as a critical lifecycle path', async () => {
    writeCollectionDoc('jobs', 'job-9', {
      status: 'in_progress',
      paymentState: 'in_escrow',
      disputeFlag: false,
      acceptedTradieUid: 'tradie-9',
      paymentAmountCents: 25000,
      paymentCurrency: 'aud',
      paymentIntentId: 'pi_999',
    });
    writeCollectionDoc('users', 'tradie-9', {
      role: 'tradie',
      stripeAccountId: 'acct_999',
      stripeOnboardingStatus: 'completed',
      stripeChargesEnabled: true,
      stripePayoutsEnabled: true,
    });
    mockCreateTransfer.mockResolvedValue({ id: 'tr_999' });

    const disputed = await request(app)
      .post('/api/admin/jobs/job-9/flag-dispute')
      .send({ reason: 'scope disagreement' });
    expect(disputed.status).toBe(200);

    const cleared = await request(app).post('/api/admin/jobs/job-9/clear-dispute');
    expect(cleared.status).toBe(200);

    const released = await request(app).post('/api/admin/jobs/job-9/manual-release');
    expect(released.status).toBe(200);
    expect(released.body.transferId).toBe('tr_999');

    const releasedAgain = await request(app).post('/api/admin/jobs/job-9/manual-release');
    expect(releasedAgain.status).toBe(200);
    expect(releasedAgain.body.message).toBe('Payment already released.');
    expect(releasedAgain.body.transferId).toBe('tr_999');

    expect(mockCreateTransfer).toHaveBeenCalledTimes(1);

    const job = readCollectionDoc('jobs', 'job-9');
    expect(job.status).toBe('PAID');
    expect(job.paymentState).toBe('released');
    expect(job.disputeFlag).toBe(false);
    expect(job.transferId).toBe('tr_999');
  });

  describe('GET /api/admin/jobs/:jobId paymentFeeSummary', () => {
    it('released founding 0%: zero Taskio fee, full expert amount, founding label, slot consumed', async () => {
      writeCollectionDoc('jobs', 'pfs-found0', {
        status: 'PAID',
        paymentState: 'released',
        acceptedTradieUid: 'ex-found',
        paymentAmountCents: 100000,
        paymentIntentId: 'pi_found0',
        transferId: 'tr_found0',
        totalGrossReleasedCents: 100000,
        totalPlatformFeeReleasedCents: 0,
        totalProviderReleasedCents: 100000,
        baseAmountReleasedCents: 100000,
        basePlatformFeeReleasedCents: 0,
        baseProviderReleasedCents: 100000,
        variationGrossReleasedCents: 0,
        variationPlatformFeeReleasedCents: 0,
        variationProviderReleasedCents: 0,
        baseReleaseFeeSource: 'fee_snapshot_v1',
        feeSnapshot: {
          source: 'base_job_funding',
          version: 1,
          jobId: 'pfs-found0',
          expertUid: 'ex-found',
          lockedAt: '2026-01-01T12:00:00.000Z',
          stage: 'founding_first_three',
          expertFeeBps: 0,
          grossAmountCents: 100000,
          taskioFeeCents: 0,
          expertNetCents: 100000,
          zeroFeeSlotConsumed: true,
          benefitLabel: 'Founding Expert benefit applied',
        },
      });

      const res = await request(app).get('/api/admin/jobs/pfs-found0');
      expect(res.status).toBe(200);
      const s = res.body.paymentFeeSummary;
      expect(s).toBeDefined();
      expect(s.taskioFeeCents).toBe(0);
      expect(s.expertReleasedCents).toBe(100000);
      expect(s.clientPaidCents).toBe(100000);
      expect(s.feeBenefitLabel).toBe('Founding Expert offer applied');
      expect(s.zeroFeeSlotConsumed).toBe(true);
      expect(s.legacyOrMissingSnapshot).toBe(false);
    });

    it('released standard 10%: computes Taskio fee and expert net', async () => {
      writeCollectionDoc('jobs', 'pfs-std10', {
        status: 'PAID',
        paymentState: 'released',
        paymentAmountCents: 100000,
        paymentIntentId: 'pi_std',
        transferId: 'tr_std',
        totalGrossReleasedCents: 100000,
        totalPlatformFeeReleasedCents: 10000,
        totalProviderReleasedCents: 90000,
        baseAmountReleasedCents: 100000,
        basePlatformFeeReleasedCents: 10000,
        baseProviderReleasedCents: 90000,
        variationGrossReleasedCents: 0,
        baseReleaseFeeSource: 'fee_snapshot_v1',
        feeSnapshot: {
          source: 'base_job_funding',
          version: 1,
          jobId: 'pfs-std10',
          expertUid: 'ex-x',
          lockedAt: '2026-01-02T12:00:00.000Z',
          stage: 'standard_launch',
          expertFeeBps: 1000,
          benefitLabel: 'Standard launch fee',
        },
      });

      const res = await request(app).get('/api/admin/jobs/pfs-std10');
      expect(res.status).toBe(200);
      const s = res.body.paymentFeeSummary;
      expect(s.taskioFeeCents).toBe(10000);
      expect(s.expertReleasedCents).toBe(90000);
      expect(s.clientPaidCents).toBe(100000);
      expect(s.feeBenefitLabel).toBe('Standard launch fee');
      expect(s.legacyOrMissingSnapshot).toBe(false);
    });

    it('released base + variation splits and totals reconcile', async () => {
      writeCollectionDoc('jobs', 'pfs-mix', {
        status: 'PAID',
        paymentState: 'released',
        paymentAmountCents: 100000,
        paymentIntentId: 'pi_mix',
        transferId: 'tr_mix',
        releaseVariationTransferIds: { va: 'tr_va' },
        totalGrossReleasedCents: 150000,
        totalPlatformFeeReleasedCents: 15000,
        totalProviderReleasedCents: 135000,
        baseAmountReleasedCents: 100000,
        basePlatformFeeReleasedCents: 10000,
        baseProviderReleasedCents: 90000,
        variationGrossReleasedCents: 50000,
        variationPlatformFeeReleasedCents: 5000,
        variationProviderReleasedCents: 45000,
        baseReleaseFeeSource: 'fee_snapshot_v1',
        variationReleaseFeeSource: 'variation_fee_snapshot_v1',
        feeSnapshot: { stage: 'standard_launch', expertFeeBps: 1000 },
      });

      const res = await request(app).get('/api/admin/jobs/pfs-mix');
      expect(res.status).toBe(200);
      const s = res.body.paymentFeeSummary;
      expect(s.clientPaidCents).toBe(150000);
      expect(s.baseClientPaidCents).toBe(100000);
      expect(s.variationClientPaidCents).toBe(50000);
      expect(s.taskioFeeCents).toBe(15000);
      expect(s.baseTaskioFeeCents).toBe(10000);
      expect(s.variationTaskioFeeCents).toBe(5000);
      expect(s.expertReleasedCents).toBe(135000);
      expect(s.baseExpertReleasedCents).toBe(90000);
      expect(s.variationExpertReleasedCents).toBe(45000);
      expect(s.variationTransferIds).toEqual({ va: 'tr_va' });
    });

    it('legacy released job without modern totals remains available with warning', async () => {
      writeCollectionDoc('jobs', 'pfs-leg', {
        status: 'PAID',
        paymentState: 'released',
        paymentAmountCents: 8800,
        platformFeeAmount: 800,
        providerAmount: 8000,
        paymentIntentId: 'pi_leg',
      });

      const res = await request(app).get('/api/admin/jobs/pfs-leg');
      expect(res.status).toBe(200);
      const s = res.body.paymentFeeSummary;
      expect(s.available).toBe(true);
      expect(s.legacyOrMissingSnapshot).toBe(true);
      expect(typeof s.warning).toBe('string');
      expect(s.warning.length).toBeGreaterThan(0);
    });

    it('funded secured with feeSnapshot and paid variation rollup', async () => {
      writeCollectionDoc('jobs', 'pfs-fund-var', {
        status: 'FUNDED',
        acceptedTradieUid: 'tradie-fe',
        paymentState: 'in_escrow',
        paymentStatus: 'succeeded',
        paymentAmountCents: 100000,
        platformFeePercent: 10,
        paymentIntentId: 'pi_main',
        feeSnapshot: {
          source: 'base_job_funding',
          version: 1,
          jobId: 'pfs-fund-var',
          expertUid: 'tradie-fe',
          lockedAt: '2026-01-01T12:00:00.000Z',
          stage: 'standard_launch',
          expertFeeBps: 1000,
          grossAmountCents: 100000,
          taskioFeeCents: 10000,
          expertNetCents: 90000,
          benefitLabel: 'Standard launch fee',
        },
      });
      seedJobVariation('pfs-fund-var', 'var-one', {
        status: 'approved',
        paymentState: 'in_escrow',
        paymentStatus: 'paid',
        priceChangeCents: 40000,
        paymentIntentId: 'pi_var_f',
      });

      const res = await request(app).get('/api/admin/jobs/pfs-fund-var');
      expect(res.status).toBe(200);
      const s = res.body.paymentFeeSummary;
      expect(s.available).toBe(true);
      expect(s.releasedToStripe).toBe(false);
      expect(s.legacyOrMissingSnapshot).toBe(false);
      expect(s.clientPaidCents).toBe(140000);
      expect(s.variationClientPaidCents).toBe(40000);
      expect(s.taskioFeeCents).toBe(14000);
      expect(s.expertReleasedCents).toBe(126000);
    });
  });

  it('POST /refund returns stripe_disabled and does not call Stripe when disabled', async () => {
    process.env.STRIPE_ENABLED = 'false';
    process.env.STRIPE_SECRET_KEY = 'sk_test_present_but_disabled';
    writeCollectionDoc('jobs', 'job-refund-off', {
      status: 'FUNDED',
      paymentState: 'in_escrow',
      paymentIntentId: 'pi_off',
      paymentAmountCents: 10000,
    });

    const res = await request(app).post('/api/admin/jobs/job-refund-off/refund');

    expect(res.status).toBe(503);
    expect(res.body.code).toBe('stripe_disabled');
    expect(mockCreateRefund).not.toHaveBeenCalled();
  });

  it('POST /retry-payment returns stripe_disabled and does not call Stripe when disabled', async () => {
    process.env.STRIPE_ENABLED = 'false';
    process.env.STRIPE_SECRET_KEY = 'sk_test_present_but_disabled';
    writeCollectionDoc('quotes', 'q-off', { amount: 100, jobId: 'rj-off', tradieUid: 't1' });
    writeCollectionDoc('jobs', 'rj-off', {
      status: 'AWAITING_FUNDING',
      paymentState: 'payment_failed',
      acceptedQuoteId: 'q-off',
      homeownerUid: 'h1',
      paymentCurrency: 'aud',
    });

    const res = await request(app).post('/api/admin/jobs/rj-off/retry-payment');

    expect(res.status).toBe(503);
    expect(res.body.code).toBe('stripe_disabled');
    expect(mockCreateCheckoutSession).not.toHaveBeenCalled();
    expect(mockRetrieveCheckoutSession).not.toHaveBeenCalled();
    expect(mockCreateRefund).not.toHaveBeenCalled();
  });
});
