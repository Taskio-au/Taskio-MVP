'use strict';
/**
 * Contract tests for variation approve/decline/checkout/cancel endpoints and
 * the stripeWebhook handler for paymentType=variation.
 *
 * Endpoints covered:
 *  POST /api/jobs/:jobId/variations/:variationId/decline
 *  POST /api/jobs/:jobId/variations/:variationId/approve
 *  POST /api/jobs/:jobId/variations/:variationId/checkout
 *  POST /api/jobs/:jobId/variations/:variationId/cancel
 *  POST /api/stripe/webhook   (payment_intent.succeeded, paymentType=variation)
 */
const express = require('express');
const request = require('supertest');

// ---------------------------------------------------------------------------
// Shared mutable state
// ---------------------------------------------------------------------------
const mockState = {
  collections: new Map(),
  currentUser: { uid: 'homeowner-1', role: 'homeowner', email: 'client@test.com', email_verified: true },
  jobEventAdds: [],
  stripeSession: null,
};

function resetState() {
  mockState.collections = new Map();
  mockState.jobEventAdds = [];
  mockState.stripeSession = { id: 'cs_test_123', status: 'open', payment_status: 'unpaid' };
  mockState.currentUser = { uid: 'homeowner-1', role: 'homeowner', email: 'client@test.com', email_verified: true };
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
// Firebase mock with subcollection support
// ---------------------------------------------------------------------------
jest.mock('../src/firebaseAdmin', () => ({
  admin: {
    firestore: {
      FieldValue: {
        serverTimestamp: jest.fn(() => '__server_ts__'),
        arrayUnion: jest.fn((...items) => ({ __arrayUnion: items })),
        increment: jest.fn((n) => ({ __increment: n })),
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
          const docId = id || `gen-${Math.random().toString(36).slice(2)}`;
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
            // Subcollection (variations)
            collection: jest.fn((subName) => {
              const subKey = `${name}/${docId}/${subName}`;
              const subStore = () => {
                if (!mockState.collections.has(subKey)) mockState.collections.set(subKey, new Map());
                return mockState.collections.get(subKey);
              };
              return {
                doc: jest.fn((subId) => {
                  const sid = subId || `sub-${Math.random().toString(36).slice(2, 10)}`;
                  return {
                    id: sid,
                    get: jest.fn(async () => {
                      const existing = subStore().get(sid);
                      return { exists: !!existing, data: () => mockClone(existing) };
                    }),
                    update: jest.fn(async (payload) => {
                      const existing = subStore().get(sid) || {};
                      subStore().set(sid, { ...existing, ...mockClone(payload) });
                    }),
                    set: jest.fn(async (payload) => {
                      subStore().set(sid, { id: sid, ...mockClone(payload) });
                    }),
                  };
                }),
              };
            }),
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
    runTransaction: jest.fn(async (cb) => {
      const db = require('../src/firebaseAdmin').db;
      const fakeTx = {
        get: (ref) => ref.get(),
        update: (ref, data) => ref.update(data),
        set: (ref, data) => ref.set(data),
      };
      return cb(fakeTx);
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
  createPaymentIntent: jest.fn(),
  retrievePaymentIntent: jest.fn(),
  retrieveCheckoutSession: jest.fn(async () => mockState.stripeSession),
  createExpressAccount: jest.fn(),
  createAccountLink: jest.fn(),
  retrieveAccount: jest.fn(),
  createTransfer: jest.fn(),
  createRefund: jest.fn(),
  getSucceededChargeIdForConnectTransfer: jest.fn(),
  createCheckoutSession: jest.fn(async () => mockState.stripeSession),
  constructWebhookEvent: jest.fn(),
  getExpectedStripeLivemode: jest.fn(() => null),
}));

jest.mock('../src/utils/firestore', () => ({
  safeToMillis: jest.fn((v) => Number(v?._seconds || v?.seconds || v || 0)),
}));

jest.mock('../src/services/riskAutomationPipeline', () => ({
  evaluateJobRiskById: jest.fn(),
}));

const jobsRoutes = require('../src/routes/jobs');
const webhookRoutes = require('../src/routes/stripeWebhook');

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use(jobsRoutes);
  return app;
}

function buildWebhookApp() {
  const app = express();
  // Webhook needs raw body
  app.use('/api/stripe/webhook', express.raw({ type: 'application/json' }));
  app.use(express.json());
  app.use(webhookRoutes);
  return app;
}

// Active IN_PROGRESS job with payment secured
function seedActiveJob(jobId = 'job-1') {
  seedDoc('jobs', jobId, {
    id: jobId,
    homeownerUid: 'homeowner-1',
    acceptedTradieUid: 'expert-1',
    status: 'IN_PROGRESS',
    paymentState: 'in_escrow',
    paymentStatus: 'succeeded',
  });
}

// Pending variation with price
function seedPendingVariation(jobId, varId, extra = {}) {
  const key = `jobs/${jobId}/variations`;
  if (!mockState.collections.has(key)) mockState.collections.set(key, new Map());
  mockState.collections.get(key).set(varId, {
    id: varId,
    status: 'pending',
    priceChangeCents: 5000,
    title: 'Extra work',
    description: 'Additional scope',
    createdByUid: 'expert-1',
    ...extra,
  });
}

function getVariation(jobId, varId) {
  const key = `jobs/${jobId}/variations`;
  return mockState.collections.get(key)?.get(varId);
}

beforeEach(() => {
  jest.clearAllMocks();
  resetState();
  process.env.STRIPE_ENABLED = 'true';
  process.env.FRONTEND_URL = 'http://localhost:3000';
});

describe('Stripe payment interruption and duplicate-delivery matrix', () => {
  beforeEach(() => {
    resetState();
    process.env.STRIPE_ENABLED = 'true';
  });

  test('duplicate delivery of one variation event is acknowledged without reprocessing', async () => {
    seedDoc('jobs', 'job-dup', {
      homeownerUid: 'homeowner-1',
      acceptedTradieUid: 'expert-1',
      status: 'IN_PROGRESS',
      paymentState: 'in_escrow',
      securedVariationTotalInCents: 0,
    });
    seedPendingVariation('job-dup', 'var-dup', {
      status: 'awaiting_payment',
      paymentState: 'pending_payment',
      priceChangeCents: 5000,
    });
    const evt = {
      id: 'evt_duplicate_delivery',
      type: 'payment_intent.succeeded',
      livemode: false,
      data: {
        object: {
          id: 'pi_dup',
          status: 'succeeded',
          amount: 5000,
          currency: 'aud',
          metadata: {
            paymentType: 'variation',
            jobId: 'job-dup',
            variationId: 'var-dup',
          },
        },
      },
    };
    const { constructWebhookEvent } = require('../src/services/stripe');
    constructWebhookEvent.mockReturnValue(evt);
    const app = buildWebhookApp();
    const send = () => request(app)
      .post('/api/stripe/webhook')
      .set('stripe-signature', 'sig')
      .set('Content-Type', 'application/json')
      .send(Buffer.from(JSON.stringify(evt)));

    const first = await send();
    const second = await send();

    expect(first.status).toBe(200);
    expect(second.body).toEqual({ received: true, duplicate: true });
    expect(getVariation('job-dup', 'var-dup').paymentState).toBe('in_escrow');
    expect(mockState.collections.get('jobs').get('job-dup').securedVariationTotalInCents).toEqual({
      __increment: 5000,
    });
  });

  test('failed card remains unfunded while a delayed success can recover without browser state', async () => {
    seedDoc('jobs', 'job-interrupted', {
      homeownerUid: 'homeowner-1',
      acceptedTradieUid: 'expert-1',
      status: 'AWAITING_FUNDING',
      paymentState: 'pending_payment',
      paymentIntentId: 'pi_interrupted',
    });
    const { constructWebhookEvent } = require('../src/services/stripe');
    const failed = {
      id: 'evt_failed_card',
      type: 'payment_intent.payment_failed',
      livemode: false,
      data: { object: {
        id: 'pi_interrupted',
        status: 'requires_payment_method',
        metadata: { jobId: 'job-interrupted' },
      } },
    };
    constructWebhookEvent.mockReturnValueOnce(failed);
    const failedRes = await request(buildWebhookApp())
      .post('/api/stripe/webhook')
      .set('stripe-signature', 'sig')
      .set('Content-Type', 'application/json')
      .send(Buffer.from(JSON.stringify(failed)));
    expect(failedRes.status).toBe(200);
    expect(mockState.collections.get('jobs').get('job-interrupted')).toMatchObject({
      status: 'AWAITING_FUNDING',
      paymentState: 'payment_failed',
    });

    const succeeded = {
      id: 'evt_delayed_success',
      type: 'payment_intent.succeeded',
      livemode: false,
      data: { object: {
        id: 'pi_interrupted',
        status: 'succeeded',
        amount: 10000,
        currency: 'aud',
        metadata: { jobId: 'job-interrupted' },
      } },
    };
    constructWebhookEvent.mockReturnValueOnce(succeeded);
    const successRes = await request(buildWebhookApp())
      .post('/api/stripe/webhook')
      .set('stripe-signature', 'sig')
      .set('Content-Type', 'application/json')
      .send(Buffer.from(JSON.stringify(succeeded)));
    expect(successRes.status).toBe(200);
    expect(mockState.collections.get('jobs').get('job-interrupted')).toMatchObject({
      status: 'FUNDED',
      paymentState: 'in_escrow',
    });
  });
});

// =============================================================================
// DECLINE
// =============================================================================
describe('POST /api/jobs/:jobId/variations/:variationId/decline', () => {
  test('homeowner can decline a pending variation', async () => {
    seedActiveJob();
    seedPendingVariation('job-1', 'var-1');

    const res = await request(buildApp())
      .post('/api/jobs/job-1/variations/var-1/decline')
      .set('Authorization', 'Bearer fake');

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('declined');

    const v = getVariation('job-1', 'var-1');
    expect(v.status).toBe('declined');
    expect(v.declinedByUid).toBe('homeowner-1');
  });

  test('homeowner can decline an awaiting_payment variation', async () => {
    seedActiveJob();
    seedPendingVariation('job-1', 'var-1', { status: 'awaiting_payment', checkoutSessionId: 'cs_old' });

    const res = await request(buildApp())
      .post('/api/jobs/job-1/variations/var-1/decline')
      .set('Authorization', 'Bearer fake');

    expect(res.status).toBe(200);
    expect(getVariation('job-1', 'var-1').status).toBe('declined');
  });

  test('403 when expert tries to decline', async () => {
    seedActiveJob();
    seedPendingVariation('job-1', 'var-1');
    mockState.currentUser = { uid: 'expert-1', role: 'tradie' };

    const res = await request(buildApp())
      .post('/api/jobs/job-1/variations/var-1/decline')
      .set('Authorization', 'Bearer fake');

    expect(res.status).toBe(403);
  });

  test('409 when variation already approved', async () => {
    seedActiveJob();
    seedPendingVariation('job-1', 'var-1', { status: 'approved' });

    const res = await request(buildApp())
      .post('/api/jobs/job-1/variations/var-1/decline')
      .set('Authorization', 'Bearer fake');

    expect(res.status).toBe(409);
  });

  test('404 when job not found', async () => {
    const res = await request(buildApp())
      .post('/api/jobs/missing/variations/var-1/decline')
      .set('Authorization', 'Bearer fake');

    expect(res.status).toBe(404);
  });

  test('logs CLIENT_VARIATION_DECLINED job event', async () => {
    seedActiveJob();
    seedPendingVariation('job-1', 'var-1');

    await request(buildApp())
      .post('/api/jobs/job-1/variations/var-1/decline')
      .set('Authorization', 'Bearer fake');

    const event = mockState.jobEventAdds.find((e) => e.action === 'CLIENT_VARIATION_DECLINED');
    expect(event).toBeDefined();
    expect(event.metadata.variationId).toBe('var-1');
  });
});

// =============================================================================
// APPROVE
// =============================================================================
describe('POST /api/jobs/:jobId/variations/:variationId/approve', () => {
  test('paid variation returns Stripe sessionId and sets awaiting_payment', async () => {
    seedActiveJob();
    seedPendingVariation('job-1', 'var-1', { priceChangeCents: 5000 });

    const res = await request(buildApp())
      .post('/api/jobs/job-1/variations/var-1/approve')
      .set('Authorization', 'Bearer fake');

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('awaiting_payment');
    expect(res.body.sessionId).toBe('cs_test_123');

    const v = getVariation('job-1', 'var-1');
    expect(v.status).toBe('awaiting_payment');
    expect(v.checkoutSessionId).toBe('cs_test_123');
    expect(v.paymentState).toBe('pending_payment');
    expect(v.approvedByUid).toBe('homeowner-1');
  });

  test('zero-amount variation approved directly without Stripe', async () => {
    seedActiveJob();
    seedPendingVariation('job-1', 'var-1', { priceChangeCents: 0 });

    const res = await request(buildApp())
      .post('/api/jobs/job-1/variations/var-1/approve')
      .set('Authorization', 'Bearer fake');

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('approved');
    expect(res.body.sessionId).toBeUndefined();

    const { createCheckoutSession } = require('../src/services/stripe');
    expect(createCheckoutSession).not.toHaveBeenCalled();

    const v = getVariation('job-1', 'var-1');
    expect(v.status).toBe('approved');
    expect(v.paymentState).toBe('not_required');
  });

  test('ignores client-supplied amount and idempotencyKey', async () => {
    seedActiveJob();
    seedPendingVariation('job-1', 'var-1', { priceChangeCents: 5000 });

    await request(buildApp())
      .post('/api/jobs/job-1/variations/var-1/approve')
      .set('Authorization', 'Bearer fake')
      .send({ amount: 1, amountInCents: 1, idempotencyKey: 'client-chosen-key' });

    const { createCheckoutSession } = require('../src/services/stripe');
    expect(createCheckoutSession.mock.calls[0][0].amountInCents).toBe(5000);
    expect(createCheckoutSession.mock.calls[0][0].idempotencyKey).toBe(
      'taskio_var_checkout_job-1_var-1_g1'
    );
    expect(createCheckoutSession.mock.calls[0][0].idempotencyKey).not.toBe('client-chosen-key');
  });

  test('Stripe metadata includes paymentType=variation', async () => {
    seedActiveJob();
    seedPendingVariation('job-1', 'var-1', { priceChangeCents: 5000 });

    await request(buildApp())
      .post('/api/jobs/job-1/variations/var-1/approve')
      .set('Authorization', 'Bearer fake');

    const { createCheckoutSession } = require('../src/services/stripe');
    const callArgs = createCheckoutSession.mock.calls[0][0];
    expect(callArgs.metadata.type).toBe('variation_payment');
    expect(callArgs.metadata.paymentType).toBe('variation');
    expect(callArgs.metadata.jobId).toBe('job-1');
    expect(callArgs.metadata.variationId).toBe('var-1');
    expect(callArgs.metadata.homeownerUid).toBe('homeowner-1');
    expect(callArgs.idempotencyKey).toBe('taskio_var_checkout_job-1_var-1_g1');
    expect(callArgs.successUrl).toContain('variationPayment=success');
    expect(callArgs.successUrl).toContain('{CHECKOUT_SESSION_ID}');
    expect(callArgs.successUrl).toContain('variationId=var-1');
    expect(callArgs.cancelUrl).toContain('variationPayment=cancelled');
  });

  test('403 when expert tries to approve', async () => {
    seedActiveJob();
    seedPendingVariation('job-1', 'var-1');
    mockState.currentUser = { uid: 'expert-1', role: 'tradie' };

    const res = await request(buildApp())
      .post('/api/jobs/job-1/variations/var-1/approve')
      .set('Authorization', 'Bearer fake');

    expect(res.status).toBe(403);
  });

  test('409 when variation is declined', async () => {
    seedActiveJob();
    seedPendingVariation('job-1', 'var-1', { status: 'declined' });

    const res = await request(buildApp())
      .post('/api/jobs/job-1/variations/var-1/approve')
      .set('Authorization', 'Bearer fake');

    expect(res.status).toBe(409);
    expect(res.body.message).toMatch(/not pending/i);
  });

  test('repeat approve while awaiting_payment reuses the same Stripe idempotency key', async () => {
    seedActiveJob();
    seedPendingVariation('job-1', 'var-1', { priceChangeCents: 5000 });
    const nowSpy = jest.spyOn(Date, 'now').mockReturnValue(111);

    const app = buildApp();
    const first = await request(app)
      .post('/api/jobs/job-1/variations/var-1/approve')
      .set('Authorization', 'Bearer fake');
    nowSpy.mockReturnValue(999999);
    const second = await request(app)
      .post('/api/jobs/job-1/variations/var-1/approve')
      .set('Authorization', 'Bearer fake');
    nowSpy.mockRestore();

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(second.body.reused).toBe(true);
    expect(second.body.sessionId).toBe(first.body.sessionId);

    const { createCheckoutSession } = require('../src/services/stripe');
    expect(createCheckoutSession).toHaveBeenCalledTimes(1);
    expect(createCheckoutSession.mock.calls[0][0].idempotencyKey).toBe(
      'taskio_var_checkout_job-1_var-1_g1'
    );
    expect(createCheckoutSession.mock.calls[0][0].idempotencyKey).not.toMatch(/111|999999/);
  });

  test('concurrent approve requests share one Checkout idempotency key', async () => {
    seedActiveJob();
    seedPendingVariation('job-1', 'var-1', { priceChangeCents: 5000 });
    const { createCheckoutSession } = require('../src/services/stripe');
    createCheckoutSession.mockResolvedValue({ id: 'cs_shared_var', status: 'open', payment_status: 'unpaid' });

    const app = buildApp();
    const makeRequest = () => request(app)
      .post('/api/jobs/job-1/variations/var-1/approve')
      .set('Authorization', 'Bearer fake');
    const [first, second] = await Promise.all([makeRequest(), makeRequest()]);

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    const keys = createCheckoutSession.mock.calls.map(([args]) => args.idempotencyKey);
    expect(keys.length).toBeGreaterThanOrEqual(1);
    expect(new Set(keys)).toEqual(new Set(['taskio_var_checkout_job-1_var-1_g1']));
  });

  test('different variations do not share Checkout idempotency keys', async () => {
    seedActiveJob();
    seedPendingVariation('job-1', 'var-a', { priceChangeCents: 5000 });
    seedPendingVariation('job-1', 'var-b', { priceChangeCents: 7000 });
    const app = buildApp();
    await request(app).post('/api/jobs/job-1/variations/var-a/approve').set('Authorization', 'Bearer fake');
    await request(app).post('/api/jobs/job-1/variations/var-b/approve').set('Authorization', 'Bearer fake');
    const { createCheckoutSession } = require('../src/services/stripe');
    const keys = createCheckoutSession.mock.calls.map(([args]) => args.idempotencyKey);
    expect(keys).toEqual([
      'taskio_var_checkout_job-1_var-a_g1',
      'taskio_var_checkout_job-1_var-b_g1',
    ]);
  });

  test('409 when job is COMPLETED', async () => {
    seedDoc('jobs', 'job-1', {
      homeownerUid: 'homeowner-1', acceptedTradieUid: 'expert-1',
      status: 'COMPLETED', paymentState: 'in_escrow',
    });
    seedPendingVariation('job-1', 'var-1');

    const res = await request(buildApp())
      .post('/api/jobs/job-1/variations/var-1/approve')
      .set('Authorization', 'Bearer fake');

    expect(res.status).toBe(409);
  });

  test('409 when job payment not secured', async () => {
    seedDoc('jobs', 'job-1', {
      homeownerUid: 'homeowner-1', acceptedTradieUid: 'expert-1',
      status: 'IN_PROGRESS', paymentState: 'pending_payment',
    });
    seedPendingVariation('job-1', 'var-1');

    const res = await request(buildApp())
      .post('/api/jobs/job-1/variations/var-1/approve')
      .set('Authorization', 'Bearer fake');

    expect(res.status).toBe(409);
    expect(res.body.message).toMatch(/payment must be secured/i);
  });

  test('503 when Stripe not enabled for paid variation', async () => {
    seedActiveJob();
    seedPendingVariation('job-1', 'var-1', { priceChangeCents: 5000 });
    process.env.STRIPE_ENABLED = 'false';

    const res = await request(buildApp())
      .post('/api/jobs/job-1/variations/var-1/approve')
      .set('Authorization', 'Bearer fake');

    expect(res.status).toBe(503);
    expect(res.body.code).toBe('stripe_disabled');
    expect(require('../src/services/stripe').createCheckoutSession).not.toHaveBeenCalled();
  });

  test('logs CLIENT_VARIATION_APPROVED for zero-amount', async () => {
    seedActiveJob();
    seedPendingVariation('job-1', 'var-1', { priceChangeCents: 0 });

    await request(buildApp())
      .post('/api/jobs/job-1/variations/var-1/approve')
      .set('Authorization', 'Bearer fake');

    const ev = mockState.jobEventAdds.find((e) => e.action === 'CLIENT_VARIATION_APPROVED');
    expect(ev).toBeDefined();
    expect(ev.metadata.amountInCents).toBe(0);
  });

  test('logs CLIENT_VARIATION_AWAITING_PAYMENT for paid variation', async () => {
    seedActiveJob();
    seedPendingVariation('job-1', 'var-1', { priceChangeCents: 5000 });

    await request(buildApp())
      .post('/api/jobs/job-1/variations/var-1/approve')
      .set('Authorization', 'Bearer fake');

    const ev = mockState.jobEventAdds.find((e) => e.action === 'CLIENT_VARIATION_AWAITING_PAYMENT');
    expect(ev).toBeDefined();
    expect(ev.metadata.amountInCents).toBe(5000);
  });
});

// =============================================================================
// CHECKOUT (retry)
// =============================================================================
describe('POST /api/jobs/:jobId/variations/:variationId/checkout', () => {
  test('reuses open checkout session', async () => {
    seedActiveJob();
    seedPendingVariation('job-1', 'var-1', {
      status: 'awaiting_payment',
      priceChangeCents: 5000,
      checkoutSessionId: 'cs_open',
    });
    mockState.stripeSession = { id: 'cs_open', status: 'open', payment_status: 'unpaid' };

    const { retrieveCheckoutSession } = require('../src/services/stripe');
    retrieveCheckoutSession.mockResolvedValueOnce(mockState.stripeSession);

    const res = await request(buildApp())
      .post('/api/jobs/job-1/variations/var-1/checkout')
      .set('Authorization', 'Bearer fake');

    expect(res.status).toBe(200);
    expect(res.body.sessionId).toBe('cs_open');
    expect(res.body.reused).toBe(true);

    const { createCheckoutSession } = require('../src/services/stripe');
    expect(createCheckoutSession).not.toHaveBeenCalled();
  });

  test('creates new session when existing is expired', async () => {
    seedActiveJob();
    seedPendingVariation('job-1', 'var-1', {
      status: 'awaiting_payment',
      priceChangeCents: 5000,
      checkoutSessionId: 'cs_expired',
    });

    const { retrieveCheckoutSession } = require('../src/services/stripe');
    retrieveCheckoutSession.mockResolvedValueOnce({ id: 'cs_expired', status: 'expired', payment_status: 'unpaid' });

    const { createCheckoutSession } = require('../src/services/stripe');
    createCheckoutSession.mockResolvedValueOnce({ id: 'cs_new_456', status: 'open', payment_status: 'unpaid' });

    const res = await request(buildApp())
      .post('/api/jobs/job-1/variations/var-1/checkout')
      .set('Authorization', 'Bearer fake');

    expect(res.status).toBe(200);
    expect(res.body.sessionId).toBe('cs_new_456');
    expect(res.body.reused).toBeUndefined();

    const v = getVariation('job-1', 'var-1');
    expect(v.checkoutSessionId).toBe('cs_new_456');
    expect(createCheckoutSession.mock.calls[0][0].idempotencyKey).toBe(
      'taskio_var_checkout_job-1_var-1_g2'
    );
  });

  test('fails closed when retrieveCheckoutSession throws', async () => {
    seedActiveJob();
    seedPendingVariation('job-1', 'var-1', {
      status: 'awaiting_payment',
      priceChangeCents: 5000,
      checkoutSessionId: 'cs_unknown',
    });
    const { retrieveCheckoutSession, createCheckoutSession } = require('../src/services/stripe');
    retrieveCheckoutSession.mockRejectedValueOnce(new Error('stripe_fetch_error'));

    const res = await request(buildApp())
      .post('/api/jobs/job-1/variations/var-1/checkout')
      .set('Authorization', 'Bearer fake');

    expect(res.status).toBe(202);
    expect(res.body.pending).toBe(true);
    expect(createCheckoutSession).not.toHaveBeenCalled();
  });

  test('409 when variation already approved (fully paid)', async () => {
    seedActiveJob();
    seedPendingVariation('job-1', 'var-1', { status: 'approved', paymentState: 'in_escrow' });

    const res = await request(buildApp())
      .post('/api/jobs/job-1/variations/var-1/checkout')
      .set('Authorization', 'Bearer fake');

    expect(res.status).toBe(409);
    expect(res.body.message).toMatch(/already been paid/i);
  });

  test('409 when variation not awaiting_payment', async () => {
    seedActiveJob();
    seedPendingVariation('job-1', 'var-1', { status: 'pending' });

    const res = await request(buildApp())
      .post('/api/jobs/job-1/variations/var-1/checkout')
      .set('Authorization', 'Bearer fake');

    expect(res.status).toBe(409);
    expect(res.body.message).toMatch(/not awaiting payment/i);
  });

  test('403 when expert tries to retry payment', async () => {
    seedActiveJob();
    seedPendingVariation('job-1', 'var-1', { status: 'awaiting_payment', priceChangeCents: 5000 });
    mockState.currentUser = { uid: 'expert-1', role: 'tradie' };

    const res = await request(buildApp())
      .post('/api/jobs/job-1/variations/var-1/checkout')
      .set('Authorization', 'Bearer fake');

    expect(res.status).toBe(403);
  });

  test('returns stripe_disabled and does not call Stripe when payments are disabled', async () => {
    seedActiveJob();
    seedPendingVariation('job-1', 'var-1', {
      status: 'awaiting_payment',
      priceChangeCents: 5000,
      checkoutSessionId: 'cs_open',
    });
    process.env.STRIPE_ENABLED = 'false';
    process.env.STRIPE_SECRET_KEY = 'sk_test_present_but_disabled';

    const stripe = require('../src/services/stripe');
    const res = await request(buildApp())
      .post('/api/jobs/job-1/variations/var-1/checkout')
      .set('Authorization', 'Bearer fake');

    expect(res.status).toBe(503);
    expect(res.body.code).toBe('stripe_disabled');
    expect(stripe.createCheckoutSession).not.toHaveBeenCalled();
    expect(stripe.retrieveCheckoutSession).not.toHaveBeenCalled();
  });
});

// =============================================================================
// CANCEL (expert cancels their own pending variation)
// =============================================================================
describe('POST /api/jobs/:jobId/variations/:variationId/cancel', () => {
  beforeEach(() => {
    mockState.currentUser = { uid: 'expert-1', role: 'tradie' };
  });

  test('expert can cancel their own pending variation', async () => {
    seedActiveJob();
    seedPendingVariation('job-1', 'var-1', { createdByUid: 'expert-1' });

    const res = await request(buildApp())
      .post('/api/jobs/job-1/variations/var-1/cancel')
      .set('Authorization', 'Bearer fake');

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('cancelled');

    const v = getVariation('job-1', 'var-1');
    expect(v.status).toBe('cancelled');
    expect(v.cancelledByUid).toBe('expert-1');
  });

  test('403 when homeowner tries to cancel', async () => {
    seedActiveJob();
    seedPendingVariation('job-1', 'var-1');
    mockState.currentUser = { uid: 'homeowner-1', role: 'homeowner' };

    const res = await request(buildApp())
      .post('/api/jobs/job-1/variations/var-1/cancel')
      .set('Authorization', 'Bearer fake');

    expect(res.status).toBe(403);
  });

  test('403 when expert did not create the variation', async () => {
    seedActiveJob();
    seedPendingVariation('job-1', 'var-1', { createdByUid: 'expert-other' });

    const res = await request(buildApp())
      .post('/api/jobs/job-1/variations/var-1/cancel')
      .set('Authorization', 'Bearer fake');

    expect(res.status).toBe(403);
    expect(res.body.message).toMatch(/your own/i);
  });

  test('409 when variation is already awaiting_payment (cannot cancel)', async () => {
    seedActiveJob();
    seedPendingVariation('job-1', 'var-1', { status: 'awaiting_payment', createdByUid: 'expert-1' });

    const res = await request(buildApp())
      .post('/api/jobs/job-1/variations/var-1/cancel')
      .set('Authorization', 'Bearer fake');

    expect(res.status).toBe(409);
    expect(res.body.message).toMatch(/only pending/i);
  });

  test('logs TRADIE_VARIATION_CANCELLED event', async () => {
    seedActiveJob();
    seedPendingVariation('job-1', 'var-1', { createdByUid: 'expert-1' });

    await request(buildApp())
      .post('/api/jobs/job-1/variations/var-1/cancel')
      .set('Authorization', 'Bearer fake');

    const ev = mockState.jobEventAdds.find((e) => e.action === 'TRADIE_VARIATION_CANCELLED');
    expect(ev).toBeDefined();
  });
});

// =============================================================================
// CONFIRM CHECKOUT (client sync)
// =============================================================================
describe('POST /api/jobs/:jobId/variations/confirm-checkout-session', () => {
  test('marks variation paid when Stripe session is paid', async () => {
    seedActiveJob();
    seedPendingVariation('job-1', 'var-1', { status: 'awaiting_payment', priceChangeCents: 5000 });

    const { retrieveCheckoutSession } = require('../src/services/stripe');
    retrieveCheckoutSession.mockResolvedValueOnce({
      id: 'cs_sync',
      payment_status: 'paid',
      amount_total: 5000,
      currency: 'aud',
      payment_intent: 'pi_sync',
      metadata: {
        type: 'variation_payment',
        jobId: 'job-1',
        variationId: 'var-1',
      },
    });

    const res = await request(buildApp())
      .post('/api/jobs/job-1/variations/confirm-checkout-session')
      .set('Authorization', 'Bearer fake')
      .send({ sessionId: 'cs_sync' });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('completed');
    const v = getVariation('job-1', 'var-1');
    expect(v.paymentState).toBe('in_escrow');
    expect(v.paymentIntentId).toBe('pi_sync');
  });

  test('returns pending when session not paid yet', async () => {
    seedActiveJob();
    seedPendingVariation('job-1', 'var-1', { status: 'awaiting_payment', priceChangeCents: 5000 });

    const { retrieveCheckoutSession } = require('../src/services/stripe');
    retrieveCheckoutSession.mockResolvedValueOnce({
      id: 'cs_open',
      payment_status: 'unpaid',
      metadata: { type: 'variation_payment', jobId: 'job-1', variationId: 'var-1' },
    });

    const res = await request(buildApp())
      .post('/api/jobs/job-1/variations/confirm-checkout-session')
      .set('Authorization', 'Bearer fake')
      .send({ sessionId: 'cs_open' });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('pending');
  });
});

// =============================================================================
// STRIPE WEBHOOK — paymentType=variation
// =============================================================================
describe('Stripe webhook: payment_intent.succeeded for paymentType=variation', () => {
  function makePaymentIntentEvent(overrides = {}) {
    return {
      id: 'evt_var_1',
      type: 'payment_intent.succeeded',
      livemode: false,
      data: {
        object: {
          id: 'pi_var_1',
          status: 'succeeded',
          amount: 5000,
          currency: 'aud',
          metadata: {
            paymentType: 'variation',
            jobId: 'job-1',
            variationId: 'var-1',
            homeownerUid: 'homeowner-1',
            tradieUid: 'expert-1',
            amountInCents: '5000',
          },
          ...overrides,
        },
      },
    };
  }

  beforeEach(() => {
    // Seed job and awaiting_payment variation
    seedDoc('jobs', 'job-1', {
      homeownerUid: 'homeowner-1', acceptedTradieUid: 'expert-1',
      status: 'IN_PROGRESS', paymentState: 'in_escrow',
      variationTotalInCents: 0, securedVariationTotalInCents: 0,
    });
    const varKey = 'jobs/job-1/variations';
    if (!mockState.collections.has(varKey)) mockState.collections.set(varKey, new Map());
    mockState.collections.get(varKey).set('var-1', {
      id: 'var-1',
      status: 'awaiting_payment',
      priceChangeCents: 5000,
      title: 'Extra work',
      checkoutSessionId: 'cs_test_123',
    });
  });

  test('webhook marks variation approved + in_escrow on payment_intent.succeeded', async () => {
    const { constructWebhookEvent } = require('../src/services/stripe');
    const evt = makePaymentIntentEvent();
    constructWebhookEvent.mockReturnValueOnce(evt);

    // Seed stripe_events to avoid duplicate check
    // (empty by default, so this is a fresh event)

    const app = buildWebhookApp();
    const res = await request(app)
      .post('/api/stripe/webhook')
      .set('stripe-signature', 'sig')
      .set('Content-Type', 'application/json')
      .send(Buffer.from(JSON.stringify(evt)));

    expect(res.status).toBe(200);
    expect(res.body.received).toBe(true);

    const varKey = 'jobs/job-1/variations';
    const v = mockState.collections.get(varKey)?.get('var-1');
    expect(v?.status).toBe('approved');
    expect(v?.paymentState).toBe('in_escrow');
    expect(v?.paymentIntentId).toBe('pi_var_1');
  });

  test('webhook is idempotent — does not re-process already-funded variation', async () => {
    const varKey = 'jobs/job-1/variations';
    // Mark variation as already in_escrow
    mockState.collections.get(varKey).set('var-1', {
      id: 'var-1',
      status: 'approved',
      paymentState: 'in_escrow',
      priceChangeCents: 5000,
      paymentIntentId: 'pi_var_1',
    });
    mockState.collections.get('jobs').set('job-1', {
      ...mockState.collections.get('jobs').get('job-1'),
      variationTotalInCents: 5000,
      securedVariationTotalInCents: 5000,
    });

    const { constructWebhookEvent } = require('../src/services/stripe');
    const evt = makePaymentIntentEvent();
    constructWebhookEvent.mockReturnValueOnce(evt);

    const app = buildWebhookApp();
    const res = await request(app)
      .post('/api/stripe/webhook')
      .set('stripe-signature', 'sig')
      .set('Content-Type', 'application/json')
      .send(Buffer.from(JSON.stringify(evt)));

    expect(res.status).toBe(200);
    // Variation should still be in_escrow but no duplicate update
    const v = mockState.collections.get(varKey)?.get('var-1');
    expect(v?.paymentState).toBe('in_escrow');
    const job = mockState.collections.get('jobs')?.get('job-1');
    expect(job?.securedVariationTotalInCents).toBe(5000);
  });

  test('webhook does not update job-level paymentState for variation payments', async () => {
    const { constructWebhookEvent } = require('../src/services/stripe');
    const evt = makePaymentIntentEvent();
    constructWebhookEvent.mockReturnValueOnce(evt);

    const app = buildWebhookApp();
    await request(app)
      .post('/api/stripe/webhook')
      .set('stripe-signature', 'sig')
      .set('Content-Type', 'application/json')
      .send(Buffer.from(JSON.stringify(evt)));

    // Job paymentState should remain in_escrow and NOT be changed to any other state
    const job = mockState.collections.get('jobs')?.get('job-1');
    expect(job?.paymentState).toBe('in_escrow');
    expect(job?.status).toBe('IN_PROGRESS');
  });

  test('checkout.session.completed with type variation_payment updates variation', async () => {
    const { constructWebhookEvent } = require('../src/services/stripe');
    const evt = {
      id: 'evt_cs_var_1',
      type: 'checkout.session.completed',
      livemode: false,
      data: {
        object: {
          id: 'cs_var_completed',
          mode: 'payment',
          payment_status: 'paid',
          amount_total: 5000,
          currency: 'aud',
          payment_intent: 'pi_from_cs',
          metadata: {
            type: 'variation_payment',
            paymentType: 'variation',
            jobId: 'job-1',
            variationId: 'var-1',
          },
        },
      },
    };
    constructWebhookEvent.mockReturnValueOnce(evt);

    const app = buildWebhookApp();
    const res = await request(app)
      .post('/api/stripe/webhook')
      .set('stripe-signature', 'sig')
      .set('Content-Type', 'application/json')
      .send(Buffer.from(JSON.stringify(evt)));

    expect(res.status).toBe(200);
    const varKey = 'jobs/job-1/variations';
    const v = mockState.collections.get(varKey)?.get('var-1');
    expect(v?.status).toBe('approved');
    expect(v?.paymentState).toBe('in_escrow');
    expect(v?.checkoutSessionId).toBe('cs_var_completed');
    expect(v?.paymentIntentId).toBe('pi_from_cs');
  });

  test('non-variation payment_intent.succeeded is still processed normally', async () => {
    seedDoc('jobs', 'job-2', {
      homeownerUid: 'homeowner-1', acceptedTradieUid: 'expert-1',
      status: 'AWAITING_FUNDING', paymentState: 'pending_payment',
      paymentIntentId: 'pi_job_1',
    });

    const { constructWebhookEvent } = require('../src/services/stripe');
    const evt = {
      id: 'evt_job_1',
      type: 'payment_intent.succeeded',
      livemode: false,
      data: {
        object: {
          id: 'pi_job_1',
          status: 'succeeded',
          amount: 100000,
          currency: 'aud',
          metadata: { jobId: 'job-2' },
        },
      },
    };
    constructWebhookEvent.mockReturnValueOnce(evt);

    const app = buildWebhookApp();
    const res = await request(app)
      .post('/api/stripe/webhook')
      .set('stripe-signature', 'sig')
      .set('Content-Type', 'application/json')
      .send(Buffer.from(JSON.stringify(evt)));

    expect(res.status).toBe(200);
    const job = mockState.collections.get('jobs')?.get('job-2');
    expect(job?.paymentState).toBe('in_escrow');
    expect(job?.status).toBe('FUNDED');
  });

  test('does not process webhooks when Stripe is disabled', async () => {
    process.env.STRIPE_ENABLED = 'false';
    process.env.STRIPE_SECRET_KEY = 'sk_test_present_but_disabled';
    const stripe = require('../src/services/stripe');
    const evt = makePaymentIntentEvent();
    const app = buildWebhookApp();
    const res = await request(app)
      .post('/api/stripe/webhook')
      .set('stripe-signature', 'sig')
      .set('Content-Type', 'application/json')
      .send(Buffer.from(JSON.stringify(evt)));

    expect(res.status).toBe(404);
    expect(stripe.constructWebhookEvent).not.toHaveBeenCalled();
    expect(stripe.retrievePaymentIntent).not.toHaveBeenCalled();
  });
});
