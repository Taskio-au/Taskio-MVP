'use strict';
/**
 * Contract tests for POST /api/jobs/:jobId/checkout — abandoned Stripe Checkout retry.
 *
 * Verifies:
 *  - First-time checkout (QUOTED job) → AWAITING_FUNDING transition, new session created.
 *  - Retry after abandoned checkout (job already AWAITING_FUNDING, same quoteId):
 *      - Reuses the existing Stripe session when it is still open/unpaid.
 *      - Creates a fresh session when the existing session is confirmed expired.
 *      - Fails closed when Stripe cannot confirm the stored session state.
 *      - Creates a fresh session when no previous session was saved.
 *  - Already-funded job → 409 (prevents double payment).
 *  - Different quote already accepted → 409.
 *  - Non-homeowner user → 403.
 *  - Job belongs to a different homeowner → 403.
 *  - Webhook remains the authoritative path alongside payment-confirmed recovery.
 */
const express = require('express');
const request = require('supertest');

// ---------------------------------------------------------------------------
// Shared in-memory store
// ---------------------------------------------------------------------------
const mockState = {
  collections: new Map(),
  currentUser: {
    uid: 'homeowner-1',
    role: 'homeowner',
    email: 'client@test.com',
    email_verified: true,
    phone_number: '+61400000000',
  },
};

function resetState() {
  mockState.collections = new Map();
  mockState.currentUser = {
    uid: 'homeowner-1',
    role: 'homeowner',
    email: 'client@test.com',
    email_verified: true,
    phone_number: '+61400000000',
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

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------
const mockRetrieveCheckoutSession = jest.fn();
const mockCreateCheckoutSession = jest.fn();
const mockRetrievePaymentIntent = jest.fn();

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
      doc: jest.fn((id) => {
        const docId = String(id);
        return {
          id: docId,
          get: jest.fn(async () => {
            const existing = mockGetStore(name).get(docId);
            return { exists: !!existing, data: () => mockClone(existing) };
          }),
          update: jest.fn(async (payload) => {
            const existing = mockGetStore(name).get(docId) || {};
            mockGetStore(name).set(docId, { ...existing, ...mockClone(payload) });
          }),
          set: jest.fn(async (payload, options = {}) => {
            const existing = mockGetStore(name).get(docId) || {};
            const next =
              options.merge ? { ...existing, ...mockClone(payload) } : { id: docId, ...mockClone(payload) };
            mockGetStore(name).set(docId, next);
          }),
          collection: jest.fn(() => ({
            orderBy: jest.fn().mockReturnThis(),
            select: jest.fn().mockReturnThis(),
            get: jest.fn(async () => ({ empty: true, docs: [] })),
            doc: jest.fn(() => ({
              set: jest.fn(async () => {}),
            })),
          })),
        };
      }),
      add: jest.fn(async (payload) => {
        const id = `${String(name)}-${mockGetStore(name).size + 1}`;
        mockGetStore(name).set(id, { id, ...mockClone(payload) });
        return { id };
      }),
      where: jest.fn((field, _op, value) => ({
        get: jest.fn(async () => {
          const rows = Array.from(mockGetStore(name).entries())
            .filter(([, data]) => data[field] === value)
            .map(([docId, data]) => ({ id: docId, data: () => mockClone(data) }));
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
        set: (ref, data, opts) => ref.set(data, opts),
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
  ensureUserProfile: () => (_req, _res, next) => next(),
}));

jest.mock('../src/services/stripe', () => ({
  createCheckoutSession: (...args) => mockCreateCheckoutSession(...args),
  retrieveCheckoutSession: (...args) => mockRetrieveCheckoutSession(...args),
  createPaymentIntent: jest.fn(),
  retrievePaymentIntent: (...args) => mockRetrievePaymentIntent(...args),
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

process.env.STRIPE_ENABLED = 'true';
process.env.FRONTEND_URL = 'http://localhost:3000';

const jobsRoutes = require('../src/routes/jobs');

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use(jobsRoutes);
  return app;
}

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------
function seedQuotedJobAndQuote() {
  seedDoc('jobs', 'job-1', {
    homeownerUid: 'homeowner-1',
    status: 'QUOTED',
    paymentState: null,
    paymentStatus: null,
    acceptedQuoteId: null,
    acceptedTradieUid: null,
    paymentCheckoutSessionId: null,
  });
  seedDoc('quotes', 'quote-1', {
    jobId: 'job-1',
    tradieUid: 'tradie-1',
    status: 'submitted',
    amount: 500,
  });
  // Homeowner profile that passes hasCompletedHomeownerAccount check
  seedDoc('users', 'homeowner-1', {
    firstName: 'Jane',
    phoneVerified: true,
    emailVerified: true,
  });
}

function seedAwaitingFundingJob(overrides = {}) {
  seedDoc('jobs', 'job-1', {
    homeownerUid: 'homeowner-1',
    status: 'AWAITING_FUNDING',
    paymentState: 'pending_payment',
    paymentStatus: 'requires_payment_method',
    acceptedQuoteId: 'quote-1',
    acceptedTradieUid: 'tradie-1',
    paymentCheckoutSessionId: 'cs_existing_123',
    ...overrides,
  });
  seedDoc('quotes', 'quote-1', {
    jobId: 'job-1',
    tradieUid: 'tradie-1',
    status: 'accepted',
    amount: 500,
  });
  seedDoc('users', 'homeowner-1', {
    firstName: 'Jane',
    phoneVerified: true,
    emailVerified: true,
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe('POST /api/jobs/:jobId/checkout', () => {
  let app;

  beforeAll(() => {
    app = buildApp();
  });

  beforeEach(() => {
    resetState();
    mockRetrieveCheckoutSession.mockReset();
    mockCreateCheckoutSession.mockReset();
    mockRetrievePaymentIntent.mockReset();
  });

  describe('First-time checkout', () => {
    it('transitions QUOTED job to AWAITING_FUNDING and returns a new session ID', async () => {
      seedQuotedJobAndQuote();
      mockCreateCheckoutSession.mockResolvedValue({ id: 'cs_new_abc', payment_intent: 'pi_new_abc' });

      const res = await request(app)
        .post('/api/jobs/job-1/checkout')
        .send({ quoteId: 'quote-1' })
        .set('Authorization', 'Bearer token');

      expect(res.status).toBe(200);
      expect(res.body.sessionId).toBe('cs_new_abc');
      expect(res.body.reused).toBeFalsy();

      const job = readDoc('jobs', 'job-1');
      expect(job.status).toBe('AWAITING_FUNDING');
      expect(job.acceptedQuoteId).toBe('quote-1');
      expect(job.acceptedTradieUid).toBe('tradie-1');
      expect(job.paymentCheckoutSessionId).toBe('cs_new_abc');
      expect(job.paymentIntentId).toBe('pi_new_abc');
      expect(mockCreateCheckoutSession.mock.calls[0][0].idempotencyKey).toBe(
        'taskio_checkout_job-1_quote-1_g1',
      );
      // paymentState must NOT be in_escrow until webhook fires
      expect(job.paymentState).not.toBe('in_escrow');
    });

    it('sets cancel_url and success_url pointing back to the task', async () => {
      seedQuotedJobAndQuote();
      mockCreateCheckoutSession.mockResolvedValue({ id: 'cs_new_abc' });

      await request(app)
        .post('/api/jobs/job-1/checkout')
        .send({ quoteId: 'quote-1' });

      const callArgs = mockCreateCheckoutSession.mock.calls[0][0];
      expect(callArgs.successUrl).toBe(
        'http://localhost:3000/job/job-1?checkout=success&session_id={CHECKOUT_SESSION_ID}',
      );
      expect(callArgs.cancelUrl).toBe('http://localhost:3000/job/job-1?checkout=cancel');
    });
  });

  describe('Retry after abandoned Stripe Checkout (AWAITING_FUNDING, same quote)', () => {
    it('reuses the existing open Stripe session', async () => {
      seedAwaitingFundingJob();
      mockRetrieveCheckoutSession.mockResolvedValue({ status: 'open', payment_status: 'unpaid' });

      const res = await request(app)
        .post('/api/jobs/job-1/checkout')
        .send({ quoteId: 'quote-1' });

      expect(res.status).toBe(200);
      expect(res.body.sessionId).toBe('cs_existing_123');
      expect(res.body.reused).toBe(true);
      // Should NOT have created a new session
      expect(mockCreateCheckoutSession).not.toHaveBeenCalled();
    });

    it('creates a fresh session when the existing one is expired', async () => {
      seedAwaitingFundingJob();
      mockRetrieveCheckoutSession.mockResolvedValue({ status: 'expired', payment_status: 'unpaid' });
      mockCreateCheckoutSession.mockResolvedValue({ id: 'cs_fresh_456', payment_intent: 'pi_fresh_456' });

      const res = await request(app)
        .post('/api/jobs/job-1/checkout')
        .send({ quoteId: 'quote-1' });

      expect(res.status).toBe(200);
      expect(res.body.sessionId).toBe('cs_fresh_456');
      expect(res.body.reused).toBeFalsy();
      expect(mockCreateCheckoutSession).toHaveBeenCalledTimes(1);
      expect(mockCreateCheckoutSession.mock.calls[0][0].idempotencyKey).toBe(
        'taskio_checkout_job-1_quote-1_g2',
      );
    });

    it('fails closed when retrieveCheckoutSession throws', async () => {
      seedAwaitingFundingJob();
      mockRetrieveCheckoutSession.mockRejectedValue(new Error('stripe_fetch_error'));
      mockCreateCheckoutSession.mockResolvedValue({ id: 'cs_fallback_789' });

      const res = await request(app)
        .post('/api/jobs/job-1/checkout')
        .send({ quoteId: 'quote-1' });

      expect(res.status).toBe(202);
      expect(res.body.pending).toBe(true);
      expect(mockCreateCheckoutSession).not.toHaveBeenCalled();
    });

    it('creates a fresh session when no previous session was saved on the job', async () => {
      seedAwaitingFundingJob({ paymentCheckoutSessionId: null });
      mockCreateCheckoutSession.mockResolvedValue({ id: 'cs_no_prior_111' });

      const res = await request(app)
        .post('/api/jobs/job-1/checkout')
        .send({ quoteId: 'quote-1' });

      expect(res.status).toBe(200);
      expect(res.body.sessionId).toBe('cs_no_prior_111');
      // retrieveCheckoutSession should NOT have been called (no session to retrieve)
      expect(mockRetrieveCheckoutSession).not.toHaveBeenCalled();
    });

    it('does NOT transition job status (stays AWAITING_FUNDING) on retry', async () => {
      seedAwaitingFundingJob();
      mockRetrieveCheckoutSession.mockResolvedValue({ status: 'open', payment_status: 'unpaid' });

      await request(app)
        .post('/api/jobs/job-1/checkout')
        .send({ quoteId: 'quote-1' });

      const job = readDoc('jobs', 'job-1');
      expect(job.status).toBe('AWAITING_FUNDING');
    });

    it('uses one Stripe idempotency family for simultaneous two-tab checkout', async () => {
      seedAwaitingFundingJob({ paymentCheckoutSessionId: null });
      let arrivals = 0;
      let releaseBoth;
      const bothArrived = new Promise((resolve) => { releaseBoth = resolve; });
      mockCreateCheckoutSession.mockImplementation(async () => {
        arrivals += 1;
        if (arrivals === 2) releaseBoth();
        await bothArrived;
        return { id: 'cs_shared', payment_intent: 'pi_shared' };
      });

      const makeRequest = () => request(app)
        .post('/api/jobs/job-1/checkout')
        .send({ quoteId: 'quote-1' });
      const [first, second] = await Promise.all([makeRequest(), makeRequest()]);

      expect(first.status).toBe(200);
      expect(second.status).toBe(200);
      expect(mockCreateCheckoutSession).toHaveBeenCalledTimes(2);
      const keys = mockCreateCheckoutSession.mock.calls.map(([args]) => args.idempotencyKey);
      expect(new Set(keys)).toEqual(new Set(['taskio_checkout_job-1_quote-1_g1']));
    });
  });

  describe('Already funded — prevent double payment', () => {
    it('returns 409 when paymentState is in_escrow', async () => {
      seedAwaitingFundingJob({ paymentState: 'in_escrow', paymentStatus: 'succeeded' });

      const res = await request(app)
        .post('/api/jobs/job-1/checkout')
        .send({ quoteId: 'quote-1' });

      expect(res.status).toBe(409);
      expect(mockCreateCheckoutSession).not.toHaveBeenCalled();
    });

    it('returns 409 when paymentStatus is succeeded', async () => {
      seedAwaitingFundingJob({ paymentStatus: 'succeeded' });

      const res = await request(app)
        .post('/api/jobs/job-1/checkout')
        .send({ quoteId: 'quote-1' });

      expect(res.status).toBe(409);
    });

    it('returns 400/409 when job is already FUNDED (post-webhook)', async () => {
      seedAwaitingFundingJob({ status: 'FUNDED', paymentState: 'in_escrow', paymentStatus: 'succeeded' });

      const res = await request(app)
        .post('/api/jobs/job-1/checkout')
        .send({ quoteId: 'quote-1' });

      // already_funded check fires before status check
      expect([400, 409]).toContain(res.status);
      expect(mockCreateCheckoutSession).not.toHaveBeenCalled();
    });
  });

  describe('Access control', () => {
    it('returns 403 for a tradie (non-homeowner) user', async () => {
      seedQuotedJobAndQuote();
      mockState.currentUser = { uid: 'tradie-1', role: 'tradie', email_verified: true };

      const res = await request(app)
        .post('/api/jobs/job-1/checkout')
        .send({ quoteId: 'quote-1' });

      expect(res.status).toBe(403);
    });

    it('returns 403 when the homeowner does not own the job', async () => {
      seedQuotedJobAndQuote();
      // Override homeownerUid to a different user
      seedDoc('jobs', 'job-1', {
        homeownerUid: 'other-homeowner',
        status: 'QUOTED',
        acceptedQuoteId: null,
        paymentState: null,
      });

      const res = await request(app)
        .post('/api/jobs/job-1/checkout')
        .send({ quoteId: 'quote-1' });

      expect(res.status).toBe(403);
    });
  });

  describe('Quote mismatch / validation', () => {
    it('returns 400 when quoteId is not provided', async () => {
      seedQuotedJobAndQuote();

      const res = await request(app)
        .post('/api/jobs/job-1/checkout')
        .send({});

      expect(res.status).toBe(400);
    });

    it('returns 409 when a different quote is already accepted', async () => {
      seedQuotedJobAndQuote();
      // Job has a different accepted quote
      seedDoc('jobs', 'job-1', {
        homeownerUid: 'homeowner-1',
        status: 'AWAITING_FUNDING',
        acceptedQuoteId: 'quote-other',
        acceptedTradieUid: 'tradie-1',
        paymentState: 'pending_payment',
        paymentCheckoutSessionId: null,
      });

      const res = await request(app)
        .post('/api/jobs/job-1/checkout')
        .send({ quoteId: 'quote-1' });

      expect(res.status).toBe(409);
      expect(mockCreateCheckoutSession).not.toHaveBeenCalled();
    });
  });

  describe('Recovery before minting Checkout', () => {
    it('returns paymentAlreadyConfirmed when stored PaymentIntent already succeeded', async () => {
      seedAwaitingFundingJob({ paymentIntentId: 'pi_done', paymentCheckoutSessionId: 'cs_existing_123' });
      seedDoc('users', 'tradie-1', { displayName: 'Expert' });

      mockRetrievePaymentIntent.mockResolvedValue({
        id: 'pi_done',
        status: 'succeeded',
        amount: 50000,
        currency: 'aud',
        metadata: { jobId: 'job-1' },
      });

      const res = await request(app)
        .post('/api/jobs/job-1/checkout')
        .send({ quoteId: 'quote-1' })
        .set('Authorization', 'Bearer token');

      expect(res.status).toBe(200);
      expect(res.body.paymentAlreadyConfirmed).toBe(true);
      expect(res.body.confirmed).toBe(true);
      expect(mockCreateCheckoutSession).not.toHaveBeenCalled();

      const job = readDoc('jobs', 'job-1');
      expect(job.status).toBe('FUNDED');
      expect(job.paymentState).toBe('in_escrow');
      expect(job.paymentIntentId).toBe('pi_done');
    });

    it('returns paymentAlreadyConfirmed when stored Checkout Session is paid', async () => {
      seedAwaitingFundingJob({ paymentIntentId: null, paymentCheckoutSessionId: 'cs_existing_123' });
      seedDoc('users', 'tradie-1', { displayName: 'Expert' });
      mockRetrieveCheckoutSession.mockResolvedValue({
        id: 'cs_existing_123',
        payment_status: 'paid',
        payment_intent: {
          id: 'pi_from_sess',
          status: 'succeeded',
          amount: 50000,
          currency: 'aud',
          metadata: { jobId: 'job-1' },
        },
      });

      const res = await request(app)
        .post('/api/jobs/job-1/checkout')
        .send({ quoteId: 'quote-1' })
        .set('Authorization', 'Bearer token');

      expect(res.status).toBe(200);
      expect(res.body.paymentAlreadyConfirmed).toBe(true);
      expect(mockCreateCheckoutSession).not.toHaveBeenCalled();

      const job = readDoc('jobs', 'job-1');
      expect(job.status).toBe('FUNDED');
      expect(job.paymentState).toBe('in_escrow');
    });
  });
});

describe('POST /api/jobs/:jobId/payment-confirmed', () => {
  let app;

  beforeAll(() => {
    app = buildApp();
  });

  beforeEach(() => {
    resetState();
    mockRetrieveCheckoutSession.mockReset();
    mockCreateCheckoutSession.mockReset();
    mockRetrievePaymentIntent.mockReset();
  });

  function seedAwaitingFundingForConfirm() {
    seedDoc('jobs', 'job-1', {
      homeownerUid: 'homeowner-1',
      status: 'AWAITING_FUNDING',
      paymentState: 'pending_payment',
      paymentStatus: 'requires_payment_method',
      acceptedQuoteId: 'quote-1',
      acceptedTradieUid: 'tradie-1',
      paymentCheckoutSessionId: null,
      paymentIntentId: null,
    });
    seedDoc('quotes', 'quote-1', {
      jobId: 'job-1',
      tradieUid: 'tradie-1',
      status: 'accepted',
      amount: 500,
    });
    seedDoc('users', 'homeowner-1', {
      firstName: 'Jane',
      phoneVerified: true,
      emailVerified: true,
    });
    seedDoc('users', 'tradie-1', { displayName: 'Expert' });
  }

  it('confirms job when sessionId Stripe session is paid for this task', async () => {
    seedAwaitingFundingForConfirm();
    mockRetrieveCheckoutSession.mockResolvedValue({
      id: 'cs_test_ok',
      payment_status: 'paid',
      metadata: { jobId: 'job-1', quoteId: 'quote-1', homeownerUid: 'homeowner-1' },
      payment_intent: {
        id: 'pi_sess',
        status: 'succeeded',
        amount: 50000,
        currency: 'aud',
        metadata: { jobId: 'job-1' },
      },
    });

    const res = await request(app)
      .post('/api/jobs/job-1/payment-confirmed')
      .send({ sessionId: 'cs_test_ok' })
      .set('Authorization', 'Bearer token');

    expect(res.status).toBe(200);
    expect(res.body.confirmed).toBe(true);
    expect(res.body.recovered).toBe(true);
    expect(res.body.status).toBe('FUNDED');
    expect(res.body.paymentState).toBe('in_escrow');

    const job = readDoc('jobs', 'job-1');
    expect(job.status).toBe('FUNDED');
    expect(job.paymentState).toBe('in_escrow');
  });

  it('is idempotent when job is already funded', async () => {
    seedDoc('jobs', 'job-1', {
      homeownerUid: 'homeowner-1',
      status: 'FUNDED',
      paymentState: 'in_escrow',
      paymentStatus: 'succeeded',
      acceptedQuoteId: 'quote-1',
      acceptedTradieUid: 'tradie-1',
      paymentCheckoutSessionId: 'cs_prior',
      paymentIntentId: 'pi_prior',
      feeSnapshot: { source: 'base_job_funding', version: 1 },
    });
    seedDoc('users', 'homeowner-1', {
      firstName: 'Jane',
      phoneVerified: true,
      emailVerified: true,
    });

    const res = await request(app)
      .post('/api/jobs/job-1/payment-confirmed')
      .send({ sessionId: 'cs_any' })
      .set('Authorization', 'Bearer token');

    expect(res.status).toBe(200);
    expect(res.body.confirmed).toBe(true);
    expect(res.body.recovered).toBe(true);
    expect(mockRetrieveCheckoutSession).not.toHaveBeenCalled();
  });

  it('returns 403 when Checkout session belongs to another task', async () => {
    seedAwaitingFundingForConfirm();
    mockRetrieveCheckoutSession.mockResolvedValue({
      id: 'cs_wrong',
      payment_status: 'paid',
      metadata: { jobId: 'other-job', quoteId: 'q', homeownerUid: 'homeowner-1' },
      payment_intent: { id: 'pi_x', status: 'succeeded', amount: 50000, currency: 'aud' },
    });

    const res = await request(app)
      .post('/api/jobs/job-1/payment-confirmed')
      .send({ sessionId: 'cs_wrong' })
      .set('Authorization', 'Bearer token');

    expect(res.status).toBe(403);
    expect(res.body.code).toBe('session_job_mismatch');
  });
});
