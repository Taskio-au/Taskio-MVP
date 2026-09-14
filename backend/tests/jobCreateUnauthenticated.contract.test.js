'use strict';

const express = require('express');
const request = require('supertest');

const mockState = {
  collections: new Map(),
  addCounter: 0,
};

function resetState() {
  mockState.collections = new Map();
  mockState.addCounter = 0;
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
      async add(payload) {
        const id = `${String(name)}-${++mockState.addCounter}`;
        mockGetCollectionStore(name).set(id, { id, ...mockClone(payload) });
        return { id };
      },
      doc: jest.fn((id) => ({
        get: jest.fn(async () => {
          const existing = mockGetCollectionStore(name).get(id);
          return { exists: !!existing, data: () => mockClone(existing) };
        }),
      })),
    })),
  },
}));

jest.mock('../src/middleware/auth', () => ({
  requireAuth: (req, res, next) => {
    if (!req.headers.authorization) {
      return res.status(401).send({ message: 'Unauthorized' });
    }
    req.user = {
      uid: 'homeowner-1',
      role: 'homeowner',
      email: 'homeowner@example.com',
      email_verified: true,
    };
    return next();
  },
  requireRole: () => (_req, _res, next) => next(),
}));

jest.mock('../src/services/stripe', () => ({
  createPaymentIntent: jest.fn(),
  retrievePaymentIntent: jest.fn(),
  retrieveCheckoutSession: jest.fn(),
  createTransfer: jest.fn(),
  createRefund: jest.fn(),
}));

const jobsRoutes = require('../src/routes/jobs');

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use(jobsRoutes);
  return app;
}

describe('job create authentication remains authoritative while OPEN', () => {
  beforeEach(() => {
    resetState();
    mockGetCollectionStore('users').set('homeowner-1', {
      id: 'homeowner-1',
      role: 'homeowner',
      status: 'active',
      quoteAccessVerified: true,
    });
    mockGetCollectionStore('system').set('pilotSettings', {
      id: 'pilotSettings',
      state: 'OPEN',
    });
  });

  it('rejects an unauthenticated create even when operational state is OPEN', async () => {
    const res = await request(buildApp()).post('/api/jobs').send({
      jobType: 'mounting_shelves',
      description: 'I need two small floating shelves installed in the living room wall.',
    });
    expect(res.status).toBe(401);
    expect(mockGetCollectionStore('jobs').size).toBe(0);
  });
});
