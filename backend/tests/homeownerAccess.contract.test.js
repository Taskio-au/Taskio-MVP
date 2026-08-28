const express = require('express');
const request = require('supertest');

const mockState = {
  collections: new Map(),
  currentUser: {
    uid: 'homeowner-1',
    role: 'homeowner',
    email: '',
    email_verified: false,
  },
};

function resetState() {
  mockState.collections = new Map();
  mockState.currentUser = {
    uid: 'homeowner-1',
    role: 'homeowner',
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
      add: jest.fn(async (payload) => {
        const id = `${String(name)}-${mockGetCollectionStore(name).size + 1}`;
        mockGetCollectionStore(name).set(id, { id, ...mockClone(payload) });
        return { id };
      }),
      doc: jest.fn((id) => ({
        get: jest.fn(async () => {
          const existing = mockGetCollectionStore(name).get(id);
          return { exists: !!existing, data: () => mockClone(existing) };
        }),
        set: jest.fn(async (payload, options = {}) => {
          const existing = mockGetCollectionStore(name).get(id) || {};
          const next = options.merge ? { ...existing, ...mockClone(payload) } : mockClone(payload);
          mockGetCollectionStore(name).set(id, { id, ...next });
        }),
        update: jest.fn(async (payload) => {
          const existing = mockGetCollectionStore(name).get(id) || {};
          mockGetCollectionStore(name).set(id, { ...existing, ...mockClone(payload) });
        }),
        // subcollection support for getExpertRatingAggregate
        collection: jest.fn(() => ({
          orderBy: jest.fn().mockReturnThis(),
          limit: jest.fn().mockReturnThis(),
          select: jest.fn().mockReturnThis(),
          get: jest.fn(async () => ({ empty: true, docs: [], size: 0 })),
        })),
      })),
      where: jest.fn((field, _op, value) => ({
        get: jest.fn(async () => {
          const rows = Array.from(mockGetCollectionStore(name).entries())
            .map(([id, data]) => ({ id, ...mockClone(data) }))
            .filter((row) => row[field] === value)
            .map((row) => ({ id: row.id, data: () => mockClone(row) }));
          return { empty: rows.length === 0, docs: rows, size: rows.length };
        }),
        limit: jest.fn(() => ({
          get: jest.fn(async () => ({ empty: true, docs: [], size: 0 })),
        })),
      })),
    })),
    getAll: jest.fn(async (...refs) =>
      Promise.all(refs.map((ref) => ref.get()))
    ),
    runTransaction: jest.fn(),
  },
}));

jest.mock('../src/middleware/auth', () => ({
  requireAuth: (req, _res, next) => {
    req.user = mockClone(mockState.currentUser);
    next();
  },
  requireRole: () => (_req, _res, next) => next(),
  ensureUserProfile: () => (_req, _res, next) => next(),
}));

jest.mock('../src/services/stripe', () => ({
  createPaymentIntent: jest.fn(),
  retrievePaymentIntent: jest.fn(),
  retrieveCheckoutSession: jest.fn(),
  createTransfer: jest.fn(),
  createRefund: jest.fn(),
}));

jest.mock('../src/utils/firestore', () => ({
  safeToMillis: jest.fn(() => 0),
}));

const jobsRoutes = require('../src/routes/jobs');

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use(jobsRoutes);
  return app;
}

describe('homeowner quote access and account completion gates', () => {
  let app;

  beforeEach(() => {
    resetState();
    app = buildApp();
  });

  it('allows quotes for a lightweight phone-first homeowner with quote access', async () => {
    seedDoc('users', 'homeowner-1', {
      role: 'homeowner',
      status: 'active',
      quoteAccessVerified: true,
      accountCompleted: false,
      phoneVerified: true,
    });
    seedDoc('jobs', 'job-1', {
      homeownerUid: 'homeowner-1',
      status: 'QUOTED',
    });
    seedDoc('quotes', 'quote-1', {
      jobId: 'job-1',
      homeownerUid: 'homeowner-1',
      tradieUid: 'tradie-1',
      amount: 180,
      status: 'submitted',
    });

    const res = await request(app).get('/api/jobs/job-1/quotes');

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].id).toBe('quote-1');

    // Phase 5: response includes safe expert object; PII absent from quote level
    expect(res.body[0].expert).toBeDefined();
    expect(res.body[0].expert.uid).toBe('tradie-1');
    expect(res.body[0].homeownerUid).toBeUndefined();
    expect(res.body[0].flagged).toBeUndefined();
  });

  it('blocks quotes for legacy email-verified homeowners without quoteAccessVerified', async () => {
    mockState.currentUser.email = 'legacy@example.com';
    mockState.currentUser.email_verified = true;
    seedDoc('users', 'homeowner-1', {
      role: 'homeowner',
      status: 'active',
      email: 'legacy@example.com',
      emailVerified: true,
    });
    seedDoc('jobs', 'job-1', {
      homeownerUid: 'homeowner-1',
      status: 'QUOTED',
    });
    seedDoc('quotes', 'quote-1', {
      jobId: 'job-1',
      homeownerUid: 'homeowner-1',
      tradieUid: 'tradie-1',
      amount: 140,
      status: 'submitted',
    });

    const res = await request(app).get('/api/jobs/job-1/quotes');

    expect(res.status).toBe(403);
    expect(res.body.code).toBe('quote_access_required');
    expect(res.body.message).toBe('Please verify your phone to view quotes.');
  });

  it('blocks checkout until the homeowner completes account setup', async () => {
    seedDoc('users', 'homeowner-1', {
      role: 'homeowner',
      status: 'active',
      quoteAccessVerified: true,
      accountCompleted: false,
      phoneVerified: true,
    });

    const res = await request(app)
      .post('/api/jobs/job-1/checkout')
      .send({ quoteId: 'quote-1' });

    expect(res.status).toBe(403);
    expect(res.body.code).toBe('account_completion_required');
    expect(res.body.message).toBe('Add a verified email or continue with Google to unlock payment.');
  });
});
