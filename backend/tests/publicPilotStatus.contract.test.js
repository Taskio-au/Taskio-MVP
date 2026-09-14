'use strict';

const express = require('express');
const request = require('supertest');

const mockState = {
  collections: new Map(),
};

function resetState() {
  mockState.collections = new Map();
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
        const id = `${String(name)}-${mockGetCollectionStore(name).size + 1}`;
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

const publicPilotStatusRoutes = require('../src/routes/publicPilotStatus');

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use(publicPilotStatusRoutes);
  return app;
}

describe('public pilot status and waitlist', () => {
  let app;

  beforeEach(() => {
    resetState();
    app = buildApp();
  });

  it('returns canPost true for OPEN and no admin metadata', async () => {
    mockGetCollectionStore('system').set('pilotSettings', { id: 'pilotSettings', state: 'OPEN' });
    const res = await request(app).get('/api/pilot-status');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      homeownerPosting: 'OPEN',
      canPost: true,
      waitlistAvailable: false,
    });
    expect(JSON.stringify(res.body)).not.toMatch(/P0[0-9]|blocker|updatedBy|manifest|expert/i);
  });

  it('returns canPost false for CLOSED', async () => {
    mockGetCollectionStore('system').set('pilotSettings', { id: 'pilotSettings', state: 'CLOSED' });
    const res = await request(app).get('/api/pilot-status');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      homeownerPosting: 'CLOSED',
      canPost: false,
      waitlistAvailable: true,
    });
  });

  it('returns canPost false for PAUSED', async () => {
    mockGetCollectionStore('system').set('pilotSettings', { id: 'pilotSettings', state: 'PAUSED' });
    const res = await request(app).get('/api/pilot-status');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      homeownerPosting: 'PAUSED',
      canPost: false,
      waitlistAvailable: true,
    });
  });

  it('fails closed when settings are missing', async () => {
    const res = await request(app).get('/api/pilot-status');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      homeownerPosting: 'CLOSED',
      canPost: false,
      waitlistAvailable: true,
    });
  });

  it('accepts a minimal waitlist email without opening posting', async () => {
    const res = await request(app)
      .post('/api/pilot-waitlist')
      .send({ email: '  Homeowner@Example.com ', suburb: 'Richmond', source: 'landing' });
    expect(res.status).toBe(201);
    expect(res.body).toEqual({ ok: true });
    const rows = Array.from(mockGetCollectionStore('pilotWaitlist').values());
    expect(rows).toHaveLength(1);
    expect(rows[0].email).toBe('homeowner@example.com');
    expect(rows[0].suburb).toBe('Richmond');
    expect(mockGetCollectionStore('system').size).toBe(0);
  });

  it('rejects an invalid waitlist email', async () => {
    const res = await request(app).post('/api/pilot-waitlist').send({ email: 'not-an-email' });
    expect(res.status).toBe(400);
    expect(mockGetCollectionStore('pilotWaitlist').size).toBe(0);
  });
});
