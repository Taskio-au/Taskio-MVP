const express = require('express');
const request = require('supertest');

const mockState = {
  collections: new Map(),
  currentUser: {
    uid: 'homeowner-1',
    role: 'homeowner',
    email: '',
    email_verified: false,
    phone_number: '+61400000001',
  },
};

function resetState() {
  mockState.collections = new Map();
  mockState.currentUser = {
    uid: 'homeowner-1',
    role: 'homeowner',
    email: '',
    email_verified: false,
    phone_number: '+61400000001',
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
      })),
    })),
  },
}));

jest.mock('../src/middleware/auth', () => ({
  requireAuth: (req, _res, next) => {
    req.user = mockClone(mockState.currentUser);
    next();
  },
  requireRole: (role) => (req, res, next) => {
    const userRole = req.user?.role;
    if (userRole === role) return next();
    return res.status(403).send({
      message: `Forbidden: Requires role ${role}. Please re-login, or ensure your account was created via /api/users/register.`,
    });
  },
}));

jest.mock('../src/services/abnLookup', () => ({
  ...jest.requireActual('../src/services/abnLookup'),
  lookupAbnDetails: jest.fn(),
}));

jest.mock('../src/utils/auditLogs', () => ({
  writeUserAuditLog: jest.fn(async () => {}),
}));

jest.mock('../src/utils/firestore', () => ({
  safeToMillis: jest.fn(() => 0),
}));

const meRoutes = require('../src/routes/me');

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use(meRoutes);
  return app;
}

describe('homeowner account completion contracts', () => {
  let app;

  beforeEach(() => {
    resetState();
    app = buildApp();
  });

  it('rejects phone-only completion as a durable account method', async () => {
    seedDoc('users', 'homeowner-1', {
      role: 'homeowner',
      phone: '+61400000001',
      phoneVerified: true,
      quoteAccessVerified: true,
      accountCompleted: false,
    });

    const res = await request(app)
      .post('/api/me/homeowner/complete-account')
      .send({ method: 'phone', firstName: 'Saeed' });

    expect(res.status).toBe(400);
    expect(res.body.message).toBe('Please choose a supported completion method.');
  });

  it('requires verified email before completing the homeowner account', async () => {
    seedDoc('users', 'homeowner-1', {
      role: 'homeowner',
      phone: '+61400000001',
      phoneVerified: true,
      email: 'saeed@example.com',
      emailVerified: false,
      quoteAccessVerified: true,
      accountCompleted: false,
    });
    mockState.currentUser.email = 'saeed@example.com';

    const res = await request(app)
      .post('/api/me/homeowner/complete-account')
      .send({ method: 'email', firstName: 'Saeed' });

    expect(res.status).toBe(400);
    expect(res.body.message).toBe('Add a verified email or continue with Google to unlock payment.');
  });

  it('completes the homeowner account when phone and email are verified', async () => {
    seedDoc('users', 'homeowner-1', {
      role: 'homeowner',
      phone: '+61400000001',
      phoneVerified: true,
      email: 'saeed@example.com',
      emailVerified: true,
      quoteAccessVerified: true,
      accountCompleted: false,
    });
    mockState.currentUser.email = 'saeed@example.com';
    mockState.currentUser.email_verified = true;

    const res = await request(app)
      .post('/api/me/homeowner/complete-account')
      .send({ method: 'email', firstName: 'Saeed' });

    expect(res.status).toBe(200);
    expect(res.body.profile.accountCompleted).toBe(true);
  });
});
