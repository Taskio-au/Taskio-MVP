'use strict';

/**
 * PUT /api/tradie/expertise must persist profileCompleted (same rules as PUT /api/me/profile)
 * so Quote readiness updates after saving task types from the public profile section.
 */

const express = require('express');
const request = require('supertest');

const mockUserStore = new Map();

jest.mock('../src/firebaseAdmin', () => ({
  admin: {
    firestore: {
      FieldValue: {
        serverTimestamp: jest.fn(() => '__server_ts__'),
      },
      Timestamp: {
        now: jest.fn(() => ({ seconds: 100 })),
      },
    },
  },
  db: {
    collection: jest.fn((name) => {
      if (name !== 'users') {
        return { doc: jest.fn(() => ({ get: jest.fn(async () => ({ exists: false })) })) };
      }
      return {
        doc: jest.fn((id) => ({
          id,
          get: jest.fn(async () => {
            const u = mockUserStore.get(String(id));
            return { exists: !!u, data: () => (u ? JSON.parse(JSON.stringify(u)) : null) };
          }),
          set: jest.fn(async (payload, opts) => {
            const uid = String(id);
            const prev = mockUserStore.get(uid) || {};
            const next =
              opts && opts.merge ? { ...prev, ...JSON.parse(JSON.stringify(payload)) } : JSON.parse(JSON.stringify(payload));
            mockUserStore.set(uid, next);
          }),
        })),
      };
    }),
  },
}));

jest.mock('../src/middleware/auth', () => ({
  requireAuth: (req, _res, next) => {
    req.user = { uid: 'tradie-exp', role: 'tradie' };
    next();
  },
  requireRole: (role) => (req, res, next) => {
    if (req.user?.role !== role) return res.status(403).send({ message: 'Forbidden' });
    return next();
  },
  ensureUserProfile: () => (_req, _res, next) => next(),
}));

jest.mock('../src/services/stripe', () => ({}));

const tradieRoutes = require('../src/routes/tradie');

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use(tradieRoutes);
  return app;
}

describe('PUT /api/tradie/expertise sets profileCompleted', () => {
  let app;

  beforeEach(() => {
    mockUserStore.clear();
    mockUserStore.set('tradie-exp', {
      role: 'tradie',
      status: 'active',
      displayName: 'Saeed Zafari',
      bio: 'I am working in this Industry for 10 years. XX',
      photoURL: 'https://storage.example.com/profile.jpg',
      businessType: 'individual',
      expertiseApproved: [],
    });
    app = buildApp();
  });

  it('persists profileCompleted true when public profile fields already satisfy V11', async () => {
    const res = await request(app)
      .put('/api/tradie/expertise')
      .send({ add: ['mounting_tv'], remove: [] });

    expect(res.status).toBe(200);
    expect(res.body.profileCompleted).toBe(true);
    expect(mockUserStore.get('tradie-exp').profileCompleted).toBe(true);
    expect(mockUserStore.get('tradie-exp').expertiseApproved).toContain('mounting_tv');
  });

  it('keeps profileCompleted false when bio too short even after adding expertise', async () => {
    mockUserStore.set('tradie-exp', {
      role: 'tradie',
      status: 'active',
      displayName: 'Short',
      bio: 'too short',
      photoURL: 'https://storage.example.com/profile.jpg',
      businessType: 'individual',
      expertiseApproved: [],
    });

    const res = await request(app)
      .put('/api/tradie/expertise')
      .send({ add: ['mounting_tv'], remove: [] });

    expect(res.status).toBe(200);
    expect(res.body.profileCompleted).toBe(false);
    expect(mockUserStore.get('tradie-exp').profileCompleted).toBe(false);
  });
});
