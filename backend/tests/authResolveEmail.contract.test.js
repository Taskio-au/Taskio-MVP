'use strict';

const express = require('express');
const request = require('supertest');

const mockState = {
  userRecord: null,
  roleByUid: {},
  error: null,
};

jest.mock('../src/firebaseAdmin', () => {
  const mockGetUserByEmail = jest.fn(async () => {
    if (mockState.error) throw mockState.error;
    return mockState.userRecord;
  });

  const mockDocGet = jest.fn(async (uid) => ({
    exists: Boolean(mockState.roleByUid[uid]),
    data: () => ({ role: mockState.roleByUid[uid] }),
  }));

  return {
    admin: {
      auth: () => ({
        getUserByEmail: mockGetUserByEmail,
      }),
    },
    db: {
      collection: jest.fn(() => ({
        doc: jest.fn((uid) => ({
          get: () => mockDocGet(uid),
        })),
      })),
    },
  };
});

const authRoutes = require('../src/routes/auth');

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use(authRoutes);
  return app;
}

function seedUserRecord(overrides = {}) {
  mockState.userRecord = {
    uid: 'user-1',
    email: 'person@example.com',
    passwordHash: undefined,
    providerData: [],
    customClaims: {},
    ...overrides,
  };
  mockState.error = null;
}

describe('resolve-email auth contracts', () => {
  beforeEach(() => {
    mockState.userRecord = null;
    mockState.roleByUid = {};
    mockState.error = null;
  });

  it('routes password-enabled emails to password', async () => {
    seedUserRecord({ passwordHash: 'hash-value' });

    const response = await request(buildApp())
      .post('/api/auth/resolve-email')
      .send({ email: 'person@example.com' });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ strategy: 'password' });
  });

  it('routes google-only emails to google', async () => {
    seedUserRecord({
      providerData: [{ providerId: 'google.com' }],
    });

    const response = await request(buildApp())
      .post('/api/auth/resolve-email')
      .send({ email: 'person@example.com' });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ strategy: 'google' });
  });

  it('routes email-attached passwordless users to magic link', async () => {
    seedUserRecord({
      providerData: [{ providerId: 'phone' }],
    });

    const response = await request(buildApp())
      .post('/api/auth/resolve-email')
      .send({ email: 'person@example.com' });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ strategy: 'magic_link' });
  });

  it('hides admin accounts from the public resolver', async () => {
    seedUserRecord({
      uid: 'admin-1',
      passwordHash: 'hash-value',
      customClaims: { admin: true },
    });
    mockState.roleByUid = { 'admin-1': 'admin' };

    const response = await request(buildApp())
      .post('/api/auth/resolve-email')
      .send({ email: 'admin@example.com' });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ strategy: 'unknown' });
  });

  it('returns unknown for emails with no matching auth user', async () => {
    mockState.error = Object.assign(new Error('not found'), { code: 'auth/user-not-found' });

    const response = await request(buildApp())
      .post('/api/auth/resolve-email')
      .send({ email: 'missing@example.com' });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ strategy: 'unknown' });
  });
});
