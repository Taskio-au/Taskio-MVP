const express = require('express');
const request = require('supertest');

const mockState = {
  collections: new Map(),
  variationDocs: new Map(),
  batchQueue: [],
  currentUser: {
    uid: 'homeowner-1',
    role: 'homeowner',
    email: '',
    email_verified: false,
  },
};

function resetState() {
  mockState.collections = new Map();
  mockState.variationDocs = new Map();
  mockState.batchQueue = [];
  mockState.currentUser = {
    uid: 'homeowner-1',
    role: 'homeowner',
    email: '',
    email_verified: false,
  };
}

function seedVariation(jobId, variationId, value) {
  const key = String(jobId);
  if (!mockState.variationDocs.has(key)) mockState.variationDocs.set(key, []);
  mockState.variationDocs.get(key).push({ id: variationId, ...mockClone(value) });
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
    batch: jest.fn(() => ({
      update: jest.fn((ref, payload) => {
        mockState.batchQueue.push({ ref, payload: mockClone(payload) });
      }),
      commit: jest.fn(async () => {
        const q = mockState.batchQueue.splice(0, mockState.batchQueue.length);
        for (const { ref, payload } of q) {
          if (ref && ref._variationRef) {
            const key = ref._parentJobId;
            const arr = mockState.variationDocs.get(key) || [];
            const idx = arr.findIndex((x) => x.id === ref.id);
            if (idx >= 0) {
              arr[idx] = { ...arr[idx], ...payload };
              mockState.variationDocs.set(key, arr);
            }
            continue;
          }
          const col = ref._collectionName || 'jobs';
          const docId = ref.id;
          const existing = mockGetCollectionStore(col).get(docId) || {};
          mockGetCollectionStore(col).set(docId, { ...existing, ...payload });
        }
      }),
    })),
    collection: jest.fn((name) => ({
      doc: jest.fn((id) => {
        const jobDocId = id;
        const ref = {
          id: jobDocId,
          _collectionName: name,
          get: jest.fn(async () => {
            const existing = mockGetCollectionStore(name).get(jobDocId);
            return { exists: !!existing, data: () => mockClone(existing) };
          }),
          update: jest.fn(async (payload) => {
            const existing = mockGetCollectionStore(name).get(jobDocId) || {};
            mockGetCollectionStore(name).set(jobDocId, { ...existing, ...mockClone(payload) });
          }),
          set: jest.fn(async (payload, options = {}) => {
            const existing = mockGetCollectionStore(name).get(jobDocId) || {};
            const next = options.merge ? { ...existing, ...mockClone(payload) } : mockClone(payload);
            mockGetCollectionStore(name).set(jobDocId, { id: jobDocId, ...next });
          }),
          collection: jest.fn((subName) => {
            if (subName === 'variations' && name === 'jobs') {
              return {
                doc: jest.fn((vid) => ({
                  id: vid,
                  _variationRef: true,
                  _parentJobId: jobDocId,
                  get: jest.fn(async () => ({ exists: false, data: () => null })),
                })),
                orderBy: jest.fn().mockReturnThis(),
                limit: jest.fn().mockReturnThis(),
                select: jest.fn().mockReturnThis(),
                get: jest.fn(async () => {
                  const rows = mockState.variationDocs.get(String(jobDocId)) || [];
                  return {
                    empty: rows.length === 0,
                    docs: rows.map((r) => ({
                      id: r.id,
                      data: () => mockClone(r),
                    })),
                    size: rows.length,
                  };
                }),
              };
            }
            return {
              doc: jest.fn(() => ({
                get: jest.fn(async () => ({ exists: false, data: () => null })),
              })),
              orderBy: jest.fn().mockReturnThis(),
              limit: jest.fn().mockReturnThis(),
              select: jest.fn().mockReturnThis(),
              get: jest.fn(async () => ({ empty: true, docs: [], size: 0 })),
            };
          }),
        };
        return ref;
      }),
      where: jest.fn((field, op, value) => mockMakeQuery(name, [{ field, op: op || '==', value }])),
      add: jest.fn(async (payload) => {
        const newId = `${String(name)}-${mockGetCollectionStore(name).size + 1}`;
        mockGetCollectionStore(name).set(newId, { id: newId, ...mockClone(payload) });
        return { id: newId };
      }),
    })),
    getAll: jest.fn(async (...refs) =>
      Promise.all(refs.map((ref) => ref.get()))
    ),
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
    if (req.user?.role !== role) {
      return res.status(403).send({ message: 'Forbidden' });
    }
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
  safeToMillis: jest.fn((value) => Number(value?._seconds || value?.seconds || value || 0)),
}));

const jobsRoutes = require('../src/routes/jobs');
const tradieRoutes = require('../src/routes/tradie');
const stripeService = require('../src/services/stripe');

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use(jobsRoutes);
  app.use(tradieRoutes);
  return app;
}

describe('quote lifecycle contracts', () => {
  let app;

  beforeEach(() => {
    resetState();
    delete process.env.STRIPE_ENABLED;
    stripeService.createTransfer.mockReset();
    stripeService.getSucceededChargeIdForConnectTransfer.mockReset();
    stripeService.getSucceededChargeIdForConnectTransfer.mockResolvedValue({ chargeId: 'ch_default' });
    app = buildApp();
  });

  it('shows homeowners only active quote versions', async () => {
    seedDoc('users', 'homeowner-1', {
      role: 'homeowner',
      status: 'active',
      quoteAccessVerified: true,
      phoneVerified: true,
    });
    seedDoc('jobs', 'job-1', {
      homeownerUid: 'homeowner-1',
      status: 'QUOTED',
    });
    seedDoc('quotes', 'quote-old', {
      jobId: 'job-1',
      homeownerUid: 'homeowner-1',
      tradieUid: 'tradie-1',
      amount: 120,
      status: 'superseded',
      createdAt: { _seconds: 1 },
    });
    seedDoc('quotes', 'quote-live', {
      jobId: 'job-1',
      homeownerUid: 'homeowner-1',
      tradieUid: 'tradie-1',
      amount: 150,
      status: 'submitted',
      createdAt: { _seconds: 2 },
    });
    seedDoc('quotes', 'quote-withdrawn', {
      jobId: 'job-1',
      homeownerUid: 'homeowner-1',
      tradieUid: 'tradie-2',
      amount: 90,
      status: 'withdrawn',
      createdAt: { _seconds: 3 },
    });

    const res = await request(app).get('/api/jobs/job-1/quotes');

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].id).toBe('quote-live');
    expect(res.body[0].amount).toBe(150);

    // Phase 5: DTO should include safe expert object
    expect(res.body[0].expert).toBeDefined();
    expect(res.body[0].expert.uid).toBe('tradie-1');

    // Phase 5: PII fields must NOT be present at the quote level
    expect(res.body[0].homeownerUid).toBeUndefined();
    expect(res.body[0].flagged).toBeUndefined();
    expect(res.body[0].flagReasons).toBeUndefined();

    // Phase 5: PII fields must NOT be present inside the expert object
    expect(res.body[0].expert.email).toBeUndefined();
    expect(res.body[0].expert.phone).toBeUndefined();
    expect(res.body[0].expert.abn).toBeUndefined();
    expect(res.body[0].expert.dob).toBeUndefined();
    expect(res.body[0].expert.verificationStatus).toBeUndefined();
  });

  it('counts only active quotes on homeowner jobs list', async () => {
    seedDoc('users', 'homeowner-1', {
      role: 'homeowner',
      status: 'active',
      quoteAccessVerified: true,
      phoneVerified: true,
    });
    seedDoc('jobs', 'job-1', {
      homeownerUid: 'homeowner-1',
      status: 'QUOTED',
      createdAt: { _seconds: 10 },
    });
    seedDoc('quotes', 'quote-live', {
      jobId: 'job-1',
      homeownerUid: 'homeowner-1',
      tradieUid: 'tradie-1',
      amount: 200,
      status: 'submitted',
    });
    seedDoc('quotes', 'quote-superseded', {
      jobId: 'job-1',
      homeownerUid: 'homeowner-1',
      tradieUid: 'tradie-1',
      amount: 180,
      status: 'superseded',
    });

    const res = await request(app).get('/api/homeowner/jobs');

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].quoteCount).toBe(1);
  });

  it('allows a task expert to withdraw a submitted quote on quoted jobs and reopens when last quote is removed', async () => {
    mockState.currentUser = {
      uid: 'tradie-1',
      role: 'tradie',
      email: 'expert@example.com',
      email_verified: true,
    };
    seedDoc('jobs', 'job-1', {
      homeownerUid: 'homeowner-1',
      status: 'QUOTED',
    });
    seedDoc('quotes', 'quote-1', {
      jobId: 'job-1',
      homeownerUid: 'homeowner-1',
      tradieUid: 'tradie-1',
      amount: 175,
      status: 'submitted',
    });

    const res = await request(app).post('/api/quotes/quote-1/withdraw');

    expect(res.status).toBe(200);
    expect(res.body.message).toBe('Quote withdrawn.');
    expect(mockGetCollectionStore('quotes').get('quote-1').status).toBe('withdrawn');
    expect(mockGetCollectionStore('jobs').get('job-1').status).toBe('OPEN');
  });

  it('recovers the accepted task expert on job reads when the stored job is missing acceptedTradieUid', async () => {
    seedDoc('users', 'homeowner-1', {
      role: 'homeowner',
      status: 'active',
      quoteAccessVerified: true,
      phoneVerified: true,
    });
    seedDoc('jobs', 'job-1', {
      homeownerUid: 'homeowner-1',
      status: 'FUNDED',
      acceptedQuoteId: 'quote-1',
      paymentState: 'in_escrow',
    });
    seedDoc('quotes', 'quote-1', {
      jobId: 'job-1',
      homeownerUid: 'homeowner-1',
      tradieUid: 'tradie-9',
      amount: 210,
      status: 'accepted',
    });

    const res = await request(app).get('/api/jobs/job-1');

    expect(res.status).toBe(200);
    expect(res.body.acceptedTradieUid).toBe('tradie-9');
    expect(mockGetCollectionStore('jobs').get('job-1').acceptedTradieUid).toBe('tradie-9');
  });

  it('recovers the accepted task expert on tradie job reads when the stored job is missing acceptedTradieUid', async () => {
    mockState.currentUser = {
      uid: 'tradie-9',
      role: 'tradie',
      email: 'expert@example.com',
      email_verified: true,
    };
    seedDoc('jobs', 'job-1', {
      homeownerUid: 'homeowner-1',
      status: 'FUNDED',
      acceptedQuoteId: 'quote-1',
      invitedTradieUids: ['tradie-9'],
      paymentState: 'in_escrow',
    });
    seedDoc('quotes', 'quote-1', {
      jobId: 'job-1',
      homeownerUid: 'homeowner-1',
      tradieUid: 'tradie-9',
      amount: 210,
      status: 'accepted',
    });

    const res = await request(app).get('/api/tradie/jobs/job-1');

    expect(res.status).toBe(200);
    expect(res.body.acceptedTradieUid).toBe('tradie-9');
    expect(res.body.expertNeedsQuoteAction).toBe(false);
    expect(mockGetCollectionStore('jobs').get('job-1').acceptedTradieUid).toBe('tradie-9');
  });

  it('GET /api/tradie/jobs uses the Firestore document id (not a stale id field) and flags new OPEN invites for quoting', async () => {
    mockState.currentUser = {
      uid: 'expert-a',
      role: 'tradie',
      email: 'a@example.com',
      email_verified: true,
    };
    seedDoc('jobs', 'real-job-doc', {
      homeownerUid: 'homeowner-1',
      status: 'OPEN',
      invitedTradieUids: ['expert-a'],
      id: 'stale-wrong-id',
      createdAt: { _seconds: 10, _nanoseconds: 0 },
    });

    const res = await request(app).get('/api/tradie/jobs');

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].id).toBe('real-job-doc');
    expect(res.body[0].expertNeedsQuoteAction).toBe(true);
  });

  it('GET /api/tradie/jobs sets expertNeedsQuoteAction false when this expert already has a submitted quote', async () => {
    mockState.currentUser = {
      uid: 'expert-b',
      role: 'tradie',
      email: 'b@example.com',
      email_verified: true,
    };
    seedDoc('jobs', 'job-q', {
      homeownerUid: 'homeowner-1',
      status: 'QUOTED',
      invitedTradieUids: ['expert-b'],
      createdAt: { _seconds: 5, _nanoseconds: 0 },
    });
    seedDoc('quotes', 'q1', {
      jobId: 'job-q',
      tradieUid: 'expert-b',
      status: 'submitted',
      createdAt: { _seconds: 6, _nanoseconds: 0 },
    });

    const res = await request(app).get('/api/tradie/jobs');

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].expertNeedsQuoteAction).toBe(false);
  });

  it('passes source_transaction and transfer_group to createTransfer on homeowner release', async () => {
    process.env.STRIPE_ENABLED = 'true';
    stripeService.getSucceededChargeIdForConnectTransfer.mockResolvedValueOnce({ chargeId: 'ch_pi_abc' });
    stripeService.createTransfer.mockResolvedValueOnce({ id: 'tr_new' });

    seedDoc('users', 'homeowner-1', {
      role: 'homeowner',
      status: 'active',
      quoteAccessVerified: true,
      phoneVerified: true,
    });
    seedDoc('users', 'tradie-1', {
      role: 'tradie',
      stripeOnboardingStatus: 'completed',
      stripeChargesEnabled: true,
      stripePayoutsEnabled: true,
      stripeAccountId: 'acct_123',
    });
    seedDoc('jobs', 'job-1', {
      homeownerUid: 'homeowner-1',
      status: 'COMPLETED',
      paymentState: 'in_escrow',
      paymentAmountCents: 20000,
      paymentCurrency: 'aud',
      acceptedTradieUid: 'tradie-1',
      paymentIntentId: 'pi_123',
    });

    const res = await request(app).post('/api/jobs/job-1/release');

    expect(res.status).toBe(200);
    expect(stripeService.getSucceededChargeIdForConnectTransfer).toHaveBeenCalledWith('pi_123');
    expect(stripeService.createTransfer).toHaveBeenCalledWith(
      expect.objectContaining({
        sourceTransaction: 'ch_pi_abc',
        transferGroup: 'taskio_job_job-1',
        idempotencyKey: 'taskio_release_job-1',
        amountInCents: 18000,
        destinationAccountId: 'acct_123',
      })
    );
  });

  it('returns 400 when payment intent is missing on release', async () => {
    process.env.STRIPE_ENABLED = 'true';
    stripeService.getSucceededChargeIdForConnectTransfer.mockResolvedValueOnce({
      error: {
        httpStatus: 400,
        message: 'No payment record found for this task. Cannot release payment.',
        code: 'missing_payment_intent',
      },
    });

    seedDoc('users', 'homeowner-1', {
      role: 'homeowner',
      status: 'active',
      quoteAccessVerified: true,
      phoneVerified: true,
    });
    seedDoc('users', 'tradie-1', {
      role: 'tradie',
      stripeOnboardingStatus: 'completed',
      stripeChargesEnabled: true,
      stripePayoutsEnabled: true,
      stripeAccountId: 'acct_123',
    });
    seedDoc('jobs', 'job-miss', {
      homeownerUid: 'homeowner-1',
      status: 'COMPLETED',
      paymentState: 'in_escrow',
      paymentAmountCents: 20000,
      paymentCurrency: 'aud',
      acceptedTradieUid: 'tradie-1',
    });

    const res = await request(app).post('/api/jobs/job-miss/release');

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('missing_payment_intent');
    expect(stripeService.createTransfer).not.toHaveBeenCalled();
  });

  it('returns a clear Stripe balance message when release payment cannot transfer funds', async () => {
    process.env.STRIPE_ENABLED = 'true';
    stripeService.createTransfer.mockRejectedValueOnce({ code: 'balance_insufficient' });

    seedDoc('users', 'homeowner-1', {
      role: 'homeowner',
      status: 'active',
      quoteAccessVerified: true,
      phoneVerified: true,
    });
    seedDoc('users', 'tradie-1', {
      role: 'tradie',
      stripeOnboardingStatus: 'completed',
      stripeChargesEnabled: true,
      stripePayoutsEnabled: true,
      stripeAccountId: 'acct_123',
    });
    seedDoc('jobs', 'job-1', {
      homeownerUid: 'homeowner-1',
      status: 'COMPLETED',
      paymentState: 'in_escrow',
      paymentAmountCents: 20000,
      paymentCurrency: 'aud',
      acceptedTradieUid: 'tradie-1',
      paymentIntentId: 'pi_123',
    });

    const res = await request(app).post('/api/jobs/job-1/release');

    expect(res.status).toBe(409);
    expect(res.body.code).toBe('balance_insufficient');
    expect(res.body.message).toMatch(/platform balance is not available/i);
    expect(res.body.message).toMatch(/if you are testing/i);
  });

  it('homeowner release creates a transfer per paid secured variation', async () => {
    process.env.STRIPE_ENABLED = 'true';
    stripeService.getSucceededChargeIdForConnectTransfer.mockImplementation((pi) => Promise.resolve({
      chargeId: pi === 'pi_var' ? 'ch_var' : 'ch_base',
    }));
    let trCount = 0;
    stripeService.createTransfer.mockImplementation(() => {
      trCount += 1;
      return Promise.resolve({ id: `tr_${trCount}` });
    });

    seedDoc('users', 'homeowner-1', {
      role: 'homeowner',
      status: 'active',
      quoteAccessVerified: true,
      phoneVerified: true,
    });
    seedDoc('users', 'tradie-1', {
      role: 'tradie',
      stripeOnboardingStatus: 'completed',
      stripeChargesEnabled: true,
      stripePayoutsEnabled: true,
      stripeAccountId: 'acct_123',
    });
    seedDoc('jobs', 'job-var', {
      homeownerUid: 'homeowner-1',
      status: 'COMPLETED',
      paymentState: 'in_escrow',
      paymentAmountCents: 20000,
      paymentCurrency: 'aud',
      acceptedTradieUid: 'tradie-1',
      paymentIntentId: 'pi_base',
    });
    seedVariation('job-var', 'v1', {
      status: 'approved',
      paymentState: 'in_escrow',
      paymentStatus: 'paid',
      priceChangeCents: 10000,
      paymentIntentId: 'pi_var',
    });

    const res = await request(app).post('/api/jobs/job-var/release');

    expect(res.status).toBe(200);
    expect(stripeService.createTransfer).toHaveBeenCalledTimes(2);
    expect(res.body.totalProviderAmountCents).toBe(27000);
    expect(res.body.variationTransferIds).toEqual({ v1: 'tr_2' });
    expect(stripeService.createTransfer).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        amountInCents: 9000,
        idempotencyKey: 'taskio_release_var_job-var_v1',
        sourceTransaction: 'ch_var',
      })
    );
  });

  it('homeowner release excludes unpaid variation', async () => {
    process.env.STRIPE_ENABLED = 'true';
    stripeService.getSucceededChargeIdForConnectTransfer.mockResolvedValue({ chargeId: 'ch_only' });
    stripeService.createTransfer.mockResolvedValue({ id: 'tr_1' });

    seedDoc('users', 'homeowner-1', {
      role: 'homeowner',
      status: 'active',
      quoteAccessVerified: true,
      phoneVerified: true,
    });
    seedDoc('users', 'tradie-1', {
      role: 'tradie',
      stripeOnboardingStatus: 'completed',
      stripeChargesEnabled: true,
      stripePayoutsEnabled: true,
      stripeAccountId: 'acct_123',
    });
    seedDoc('jobs', 'job-u', {
      homeownerUid: 'homeowner-1',
      status: 'COMPLETED',
      paymentState: 'in_escrow',
      paymentAmountCents: 20000,
      paymentCurrency: 'aud',
      acceptedTradieUid: 'tradie-1',
      paymentIntentId: 'pi_base',
    });
    seedVariation('job-u', 'v_unpaid', {
      status: 'awaiting_payment',
      paymentState: 'pending_payment',
      paymentStatus: 'unpaid',
      priceChangeCents: 99999,
      paymentIntentId: 'pi_never',
    });

    const res = await request(app).post('/api/jobs/job-u/release');

    expect(res.status).toBe(200);
    expect(stripeService.createTransfer).toHaveBeenCalledTimes(1);
    expect(res.body.totalProviderAmountCents).toBe(18000);
  });

  it('homeowner release excludes variation already released', async () => {
    process.env.STRIPE_ENABLED = 'true';
    stripeService.getSucceededChargeIdForConnectTransfer.mockResolvedValue({ chargeId: 'ch_only' });
    stripeService.createTransfer.mockResolvedValue({ id: 'tr_1' });

    seedDoc('users', 'homeowner-1', {
      role: 'homeowner',
      status: 'active',
      quoteAccessVerified: true,
      phoneVerified: true,
    });
    seedDoc('users', 'tradie-1', {
      role: 'tradie',
      stripeOnboardingStatus: 'completed',
      stripeChargesEnabled: true,
      stripePayoutsEnabled: true,
      stripeAccountId: 'acct_123',
    });
    seedDoc('jobs', 'job-r', {
      homeownerUid: 'homeowner-1',
      status: 'COMPLETED',
      paymentState: 'in_escrow',
      paymentAmountCents: 20000,
      paymentCurrency: 'aud',
      acceptedTradieUid: 'tradie-1',
      paymentIntentId: 'pi_base',
    });
    seedVariation('job-r', 'v_old', {
      releaseStatus: 'released',
      status: 'approved',
      paymentState: 'in_escrow',
      paymentStatus: 'paid',
      priceChangeCents: 5000,
      paymentIntentId: 'pi_old',
    });

    const res = await request(app).post('/api/jobs/job-r/release');

    expect(res.status).toBe(200);
    expect(stripeService.createTransfer).toHaveBeenCalledTimes(1);
  });

  it('homeowner release uses locked feeSnapshot for base transfer when valid', async () => {
    process.env.STRIPE_ENABLED = 'true';
    const { BASE_FUNDING_SOURCE } = require('../src/services/jobFeeSnapshotService');
    const { STAGE } = require('../src/services/expertFeeProgram');
    stripeService.getSucceededChargeIdForConnectTransfer.mockResolvedValueOnce({ chargeId: 'ch_pi_fs' });
    stripeService.createTransfer.mockResolvedValueOnce({ id: 'tr_fs' });

    seedDoc('users', 'homeowner-1', {
      role: 'homeowner',
      status: 'active',
      quoteAccessVerified: true,
      phoneVerified: true,
    });
    seedDoc('users', 'tradie-1', {
      role: 'tradie',
      stripeOnboardingStatus: 'completed',
      stripeChargesEnabled: true,
      stripePayoutsEnabled: true,
      stripeAccountId: 'acct_123',
    });
    seedDoc('jobs', 'job-fs', {
      homeownerUid: 'homeowner-1',
      status: 'COMPLETED',
      paymentState: 'in_escrow',
      paymentAmountCents: 10000,
      paymentCurrency: 'aud',
      acceptedTradieUid: 'tradie-1',
      paymentIntentId: 'pi_fs',
      platformFeePercent: 15,
      feeSnapshot: {
        source: BASE_FUNDING_SOURCE,
        version: 1,
        jobId: 'job-fs',
        expertUid: 'tradie-1',
        grossAmountCents: 10000,
        taskioFeeCents: 1000,
        expertNetCents: 9000,
        lockedAt: '2026-01-01T00:00:00.000Z',
        stage: STAGE.STANDARD_LAUNCH,
        expertFeeBps: 1000,
      },
    });

    const res = await request(app).post('/api/jobs/job-fs/release');

    expect(res.status).toBe(200);
    expect(stripeService.createTransfer).toHaveBeenCalledWith(
      expect.objectContaining({
        amountInCents: 9000,
        transferGroup: 'taskio_job_job-fs',
        idempotencyKey: 'taskio_release_job-fs',
      })
    );
    const job = mockGetCollectionStore('jobs').get('job-fs');
    expect(job.baseProviderReleasedCents).toBe(9000);
    expect(job.basePlatformFeeReleasedCents).toBe(1000);
    expect(job.baseReleaseFeeSource).toBe('fee_snapshot_v1');
    expect(job.releasePlanVersion).toBe(2);
    expect(job.variationReleaseFeeSource).toBe('platform_fee_percent');
  });

  it('homeowner release ignores invalid feeSnapshot and uses legacy platform fee for base', async () => {
    process.env.STRIPE_ENABLED = 'true';
    const { BASE_FUNDING_SOURCE } = require('../src/services/jobFeeSnapshotService');
    const { STAGE } = require('../src/services/expertFeeProgram');
    stripeService.getSucceededChargeIdForConnectTransfer.mockResolvedValueOnce({ chargeId: 'ch_pi_bad' });
    stripeService.createTransfer.mockResolvedValueOnce({ id: 'tr_bad' });

    seedDoc('users', 'homeowner-1', {
      role: 'homeowner',
      status: 'active',
      quoteAccessVerified: true,
      phoneVerified: true,
    });
    seedDoc('users', 'tradie-1', {
      role: 'tradie',
      stripeOnboardingStatus: 'completed',
      stripeChargesEnabled: true,
      stripePayoutsEnabled: true,
      stripeAccountId: 'acct_123',
    });
    seedDoc('jobs', 'job-bad-fs', {
      homeownerUid: 'homeowner-1',
      status: 'COMPLETED',
      paymentState: 'in_escrow',
      paymentAmountCents: 10000,
      paymentCurrency: 'aud',
      acceptedTradieUid: 'tradie-1',
      paymentIntentId: 'pi_bad_fs',
      feeSnapshot: {
        source: BASE_FUNDING_SOURCE,
        version: 1,
        jobId: 'wrong-job-id',
        expertUid: 'tradie-1',
        grossAmountCents: 10000,
        taskioFeeCents: 1000,
        expertNetCents: 9000,
        lockedAt: '2026-01-01T00:00:00.000Z',
        stage: STAGE.STANDARD_LAUNCH,
        expertFeeBps: 1000,
      },
    });

    const res = await request(app).post('/api/jobs/job-bad-fs/release');

    expect(res.status).toBe(200);
    expect(stripeService.createTransfer).toHaveBeenCalledWith(expect.objectContaining({ amountInCents: 9000 }));
    const job = mockGetCollectionStore('jobs').get('job-bad-fs');
    expect(job.baseReleaseFeeSource).toBe('legacy_platform_fee_percent');
  });

  it('homeowner release applies feeSnapshot to base only when a paid variation exists', async () => {
    process.env.STRIPE_ENABLED = 'true';
    const { BASE_FUNDING_SOURCE } = require('../src/services/jobFeeSnapshotService');
    const { STAGE } = require('../src/services/expertFeeProgram');
    stripeService.getSucceededChargeIdForConnectTransfer.mockImplementation((pi) =>
      Promise.resolve({ chargeId: pi === 'pi_var_mix' ? 'ch_var_mix' : 'ch_base_mix' })
    );
    let trMix = 0;
    stripeService.createTransfer.mockImplementation(() => {
      trMix += 1;
      return Promise.resolve({ id: `tr_mix_${trMix}` });
    });

    seedDoc('users', 'homeowner-1', {
      role: 'homeowner',
      status: 'active',
      quoteAccessVerified: true,
      phoneVerified: true,
    });
    seedDoc('users', 'tradie-1', {
      role: 'tradie',
      stripeOnboardingStatus: 'completed',
      stripeChargesEnabled: true,
      stripePayoutsEnabled: true,
      stripeAccountId: 'acct_123',
    });
    seedDoc('jobs', 'job-mix-fs', {
      homeownerUid: 'homeowner-1',
      status: 'COMPLETED',
      paymentState: 'in_escrow',
      paymentAmountCents: 10000,
      paymentCurrency: 'aud',
      acceptedTradieUid: 'tradie-1',
      paymentIntentId: 'pi_base_mix',
      platformFeePercent: 15,
      feeSnapshot: {
        source: BASE_FUNDING_SOURCE,
        version: 1,
        jobId: 'job-mix-fs',
        expertUid: 'tradie-1',
        grossAmountCents: 10000,
        taskioFeeCents: 1000,
        expertNetCents: 9000,
        lockedAt: '2026-01-01T00:00:00.000Z',
        stage: STAGE.STANDARD_LAUNCH,
        expertFeeBps: 1000,
      },
    });
    seedVariation('job-mix-fs', 'v1', {
      status: 'approved',
      paymentState: 'in_escrow',
      paymentStatus: 'paid',
      priceChangeCents: 10000,
      paymentIntentId: 'pi_var_mix',
    });

    const res = await request(app).post('/api/jobs/job-mix-fs/release');

    expect(res.status).toBe(200);
    expect(res.body.totalProviderAmountCents).toBe(18000);
    expect(stripeService.createTransfer).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ amountInCents: 9000, sourceTransaction: 'ch_base_mix' })
    );
    expect(stripeService.createTransfer).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ amountInCents: 9000, sourceTransaction: 'ch_var_mix' })
    );
    const job = mockGetCollectionStore('jobs').get('job-mix-fs');
    expect(job.totalPlatformFeeReleasedCents).toBe(2000);
    expect(job.variationPlatformFeeReleasedCents).toBe(1000);
    expect(job.baseReleaseFeeSource).toBe('fee_snapshot_v1');
  });

  it('lets a complete expert quote when Stripe is globally disabled even if onboarding is incomplete', async () => {
    mockState.currentUser = {
      uid: 'tradie-1',
      role: 'tradie',
      email: 'expert@test.com',
      email_verified: true,
    };
    seedDoc('users', 'tradie-1', {
      role: 'tradie',
      status: 'active',
      verified: true,
      phoneVerified: true,
      abnVerified: true,
      businessType: 'individual',
      displayName: 'Alex Expert',
      profileCompleted: true,
      serviceLocation: { postcode: '3000', suburb: 'Melbourne', state: 'VIC' },
      dob: { day: 1, month: 1, year: 1990 },
      stripeOnboardingStatus: 'pending',
    });
    seedDoc('jobs', 'job-quote-off', {
      homeownerUid: 'homeowner-1',
      status: 'OPEN',
      invitedTradieUids: ['tradie-1'],
    });

    const res = await request(app)
      .post('/api/jobs/job-quote-off/quotes')
      .send({ amount: 250, message: 'Happy to complete this task for you.' });

    expect(res.status).toBe(201);
    expect(res.body.quoteId).toBeTruthy();
  });

  it('still requires Stripe onboarding to quote when Stripe is enabled', async () => {
    process.env.STRIPE_ENABLED = 'true';
    mockState.currentUser = {
      uid: 'tradie-1',
      role: 'tradie',
      email: 'expert@test.com',
      email_verified: true,
    };
    seedDoc('users', 'tradie-1', {
      role: 'tradie',
      status: 'active',
      verified: true,
      phoneVerified: true,
      abnVerified: true,
      businessType: 'individual',
      displayName: 'Alex Expert',
      profileCompleted: true,
      serviceLocation: { postcode: '3000', suburb: 'Melbourne', state: 'VIC' },
      dob: { day: 1, month: 1, year: 1990 },
      stripeOnboardingStatus: 'pending',
    });
    seedDoc('jobs', 'job-quote-on', {
      homeownerUid: 'homeowner-1',
      status: 'OPEN',
      invitedTradieUids: ['tradie-1'],
    });

    const res = await request(app)
      .post('/api/jobs/job-quote-on/quotes')
      .send({ amount: 250, message: 'Happy to complete this task for you.' });

    expect(res.status).toBe(403);
    expect(res.body.reasons).toContain('STRIPE_NOT_COMPLETE');
  });

  it('lets a complete expert quote when the Firebase token has phone_number and Firestore phoneVerified is false', async () => {
    mockState.currentUser = {
      uid: 'tradie-1',
      role: 'tradie',
      email: 'expert@test.com',
      email_verified: true,
      phone_number: '+61400000001',
    };
    seedDoc('users', 'tradie-1', {
      role: 'tradie',
      status: 'active',
      verified: true,
      phoneVerified: false,
      abnVerified: true,
      businessType: 'individual',
      displayName: 'Alex Expert',
      profileCompleted: true,
      serviceLocation: { postcode: '3000', suburb: 'Melbourne', state: 'VIC' },
      dob: { day: 1, month: 1, year: 1990 },
      stripeOnboardingStatus: 'pending',
    });
    seedDoc('jobs', 'job-quote-token-phone', {
      homeownerUid: 'homeowner-1',
      status: 'OPEN',
      invitedTradieUids: ['tradie-1'],
    });

    const res = await request(app)
      .post('/api/jobs/job-quote-token-phone/quotes')
      .send({ amount: 250, message: 'Happy to complete this task for you.' });

    expect(res.status).toBe(201);
    expect(res.body.quoteId).toBeTruthy();
  });

  it('rejects an expert quote when neither Firestore phoneVerified nor token phone_number is present', async () => {
    mockState.currentUser = {
      uid: 'tradie-1',
      role: 'tradie',
      email: 'expert@test.com',
      email_verified: true,
    };
    seedDoc('users', 'tradie-1', {
      role: 'tradie',
      status: 'active',
      verified: true,
      phoneVerified: false,
      phone: '+61400000099',
      abnVerified: true,
      businessType: 'individual',
      displayName: 'Alex Expert',
      profileCompleted: true,
      serviceLocation: { postcode: '3000', suburb: 'Melbourne', state: 'VIC' },
      dob: { day: 1, month: 1, year: 1990 },
      stripeOnboardingStatus: 'pending',
    });
    seedDoc('jobs', 'job-quote-no-phone', {
      homeownerUid: 'homeowner-1',
      status: 'OPEN',
      invitedTradieUids: ['tradie-1'],
    });

    const res = await request(app)
      .post('/api/jobs/job-quote-no-phone/quotes')
      .send({
        amount: 250,
        message: 'Happy to complete this task for you.',
        phone: '+61400000001',
      });

    expect(res.status).toBe(403);
    expect(res.body.reasons).toContain('PHONE_NOT_VERIFIED');
  });

  it('still requires a job invitation even when the expert phone gate is satisfied by the token', async () => {
    mockState.currentUser = {
      uid: 'tradie-1',
      role: 'tradie',
      email: 'expert@test.com',
      email_verified: true,
      phone_number: '+61400000001',
    };
    seedDoc('users', 'tradie-1', {
      role: 'tradie',
      status: 'active',
      verified: true,
      phoneVerified: false,
      abnVerified: true,
      businessType: 'individual',
      displayName: 'Alex Expert',
      profileCompleted: true,
      serviceLocation: { postcode: '3000', suburb: 'Melbourne', state: 'VIC' },
      dob: { day: 1, month: 1, year: 1990 },
      stripeOnboardingStatus: 'pending',
    });
    seedDoc('jobs', 'job-quote-uninvited', {
      homeownerUid: 'homeowner-1',
      status: 'OPEN',
      invitedTradieUids: ['someone-else'],
    });

    const res = await request(app)
      .post('/api/jobs/job-quote-uninvited/quotes')
      .send({ amount: 250, message: 'Happy to complete this task for you.' });

    expect(res.status).toBe(403);
    expect(res.body.message).toBe('Forbidden: You are not invited to quote on this task.');
  });

  it('does not transfer on homeowner release when Stripe is disabled', async () => {
    process.env.STRIPE_ENABLED = 'false';
    process.env.STRIPE_SECRET_KEY = 'sk_test_present_but_disabled';
    seedDoc('users', 'homeowner-1', {
      role: 'homeowner',
      status: 'active',
      quoteAccessVerified: true,
      phoneVerified: true,
    });
    seedDoc('users', 'tradie-1', {
      role: 'tradie',
      stripeOnboardingStatus: 'completed',
      stripeChargesEnabled: true,
      stripePayoutsEnabled: true,
      stripeAccountId: 'acct_123',
    });
    seedDoc('jobs', 'job-rel-off', {
      homeownerUid: 'homeowner-1',
      status: 'COMPLETED',
      paymentState: 'in_escrow',
      paymentAmountCents: 20000,
      paymentCurrency: 'aud',
      acceptedTradieUid: 'tradie-1',
      paymentIntentId: 'pi_123',
    });

    const res = await request(app).post('/api/jobs/job-rel-off/release');

    expect(res.status).toBe(503);
    expect(res.body.code).toBe('stripe_disabled');
    expect(stripeService.createTransfer).not.toHaveBeenCalled();
  });

  it('does not refund on homeowner cancel when Stripe is disabled', async () => {
    process.env.STRIPE_ENABLED = 'false';
    process.env.STRIPE_SECRET_KEY = 'sk_test_present_but_disabled';
    seedDoc('users', 'homeowner-1', {
      role: 'homeowner',
      status: 'active',
      quoteAccessVerified: true,
      phoneVerified: true,
    });
    seedDoc('jobs', 'job-cancel-off', {
      homeownerUid: 'homeowner-1',
      status: 'FUNDED',
      paymentState: 'in_escrow',
      paymentIntentId: 'pi_cancel',
      paymentAmountCents: 20000,
    });

    const res = await request(app).post('/api/jobs/job-cancel-off/cancel');

    expect(res.status).toBe(503);
    expect(res.body.code).toBe('stripe_disabled');
    expect(stripeService.createRefund).not.toHaveBeenCalled();
  });
});
