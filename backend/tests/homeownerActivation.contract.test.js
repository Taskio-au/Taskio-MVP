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
  userSetCalls: [],
};

function resetState() {
  mockState.collections = new Map();
  mockState.userSetCalls = [];
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

function mockMakeDocRef(name, id) {
  return {
    get: jest.fn(async () => {
      const existing = mockGetCollectionStore(name).get(id);
      return { exists: !!existing, data: () => mockClone(existing) };
    }),
    set: jest.fn(async (payload, options = {}) => {
      if (name === 'users') {
        mockState.userSetCalls.push({ payload: mockClone(payload), options: mockClone(options), op: 'set' });
      }
      const existing = mockGetCollectionStore(name).get(id) || {};
      const next = options.merge ? { ...existing, ...mockClone(payload) } : mockClone(payload);
      mockGetCollectionStore(name).set(id, { id, ...next });
    }),
    update: jest.fn(async (payload) => {
      const existing = mockGetCollectionStore(name).get(id);
      if (name === 'users') {
        mockState.userSetCalls.push({ payload: mockClone(payload), op: 'update' });
      }
      if (!existing) {
        const err = new Error('NOT_FOUND: no entity to update');
        err.code = 5;
        throw err;
      }
      mockGetCollectionStore(name).set(id, { ...existing, ...mockClone(payload) });
    }),
  };
}

jest.mock('../src/firebaseAdmin', () => ({
  admin: {
    firestore: {
      FieldValue: {
        serverTimestamp: jest.fn(() => '__server_ts__'),
      },
      Timestamp: {
        now: jest.fn(() => ({ seconds: 0, nanoseconds: 0 })),
        fromDate: jest.fn((d) => ({ seconds: Math.floor(new Date(d).getTime() / 1000), nanoseconds: 0 })),
      },
    },
    auth: jest.fn(() => ({
      updateUser: jest.fn(),
    })),
  },
  db: {
    collection: jest.fn((name) => ({
      doc: jest.fn((id) => mockMakeDocRef(name, id)),
    })),
    runTransaction: jest.fn(async (fn) => {
      const tx = {
        get: (ref) => ref.get(),
        set: (ref, payload, options) => ref.set(payload, options),
        update: (ref, payload) => ref.update(payload),
      };
      return fn(tx);
    }),
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

jest.mock('../src/utils/auditLogs', () => ({
  writeUserAuditLog: jest.fn(async () => {}),
}));

const meRoutes = require('../src/routes/me');

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use(meRoutes);
  return app;
}

describe('homeowner quote-access activation and deletion confirm', () => {
  let app;
  const originalFlag = process.env.TASKIO_PUBLIC_SIGNUP_ENABLED;

  beforeEach(() => {
    resetState();
    process.env.TASKIO_PUBLIC_SIGNUP_ENABLED = 'true';
    app = buildApp();
  });

  afterEach(() => {
    if (originalFlag === undefined) delete process.env.TASKIO_PUBLIC_SIGNUP_ENABLED;
    else process.env.TASKIO_PUBLIC_SIGNUP_ENABLED = originalFlag;
  });

  it('enrols a missing profile as a homeowner when phone is verified and signup is enabled', async () => {
    const res = await request(app)
      .post('/api/me/homeowner/activate-quote-access')
      .send({ firstName: 'Saeed' });

    expect(res.status).toBe(200);
    expect(res.body.profile.quoteAccessVerified).toBe(true);
    const stored = mockGetCollectionStore('users').get('homeowner-1');
    expect(stored).toEqual(expect.objectContaining({
      role: 'homeowner',
      status: 'active',
      quoteAccessVerified: true,
      phone: '+61400000001',
    }));
  });

  it('grants quote access to an existing valid homeowner', async () => {
    seedDoc('users', 'homeowner-1', {
      role: 'homeowner',
      status: 'active',
      quoteAccessVerified: false,
    });

    const res = await request(app)
      .post('/api/me/homeowner/activate-quote-access')
      .send({});

    expect(res.status).toBe(200);
    expect(mockGetCollectionStore('users').get('homeowner-1').quoteAccessVerified).toBe(true);
    expect(mockGetCollectionStore('users').get('homeowner-1').role).toBe('homeowner');
  });

  it('is idempotent for an already quote-verified homeowner and writes nothing', async () => {
    seedDoc('users', 'homeowner-1', {
      role: 'homeowner',
      status: 'active',
      quoteAccessVerified: true,
      phone: '+61400000001',
    });

    const res = await request(app)
      .post('/api/me/homeowner/activate-quote-access')
      .send({ firstName: 'Saeed' });

    expect(res.status).toBe(200);
    expect(res.body.profile.quoteAccessVerified).toBe(true);
    expect(mockState.userSetCalls).toHaveLength(0);
  });

  it('still requires a phone token for an already quote-verified homeowner', async () => {
    mockState.currentUser.phone_number = '';
    seedDoc('users', 'homeowner-1', {
      role: 'homeowner',
      status: 'active',
      quoteAccessVerified: true,
    });

    const res = await request(app)
      .post('/api/me/homeowner/activate-quote-access')
      .send({});

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/Phone verification is required/i);
    expect(mockState.userSetCalls).toHaveLength(0);
  });

  it('returns 409 and writes nothing for a malformed profile', async () => {
    seedDoc('users', 'homeowner-1', { phone: '+61400000001' });

    const res = await request(app)
      .post('/api/me/homeowner/activate-quote-access')
      .send({});

    expect(res.status).toBe(409);
    expect(res.body.code).toBe('account_state_invalid');
    expect(mockState.userSetCalls).toHaveLength(0);
    expect(mockGetCollectionStore('users').get('homeowner-1').role).toBeUndefined();
  });

  it('does not convert a tradie profile', async () => {
    seedDoc('users', 'homeowner-1', {
      role: 'tradie',
      status: 'active',
    });

    const res = await request(app)
      .post('/api/me/homeowner/activate-quote-access')
      .send({});

    expect(res.status).toBe(403);
    expect(mockState.userSetCalls).toHaveLength(0);
    expect(mockGetCollectionStore('users').get('homeowner-1').role).toBe('tradie');
  });

  it('does not enrol or grant quote access when signup is disabled', async () => {
    process.env.TASKIO_PUBLIC_SIGNUP_ENABLED = 'false';

    const missingRes = await request(app)
      .post('/api/me/homeowner/activate-quote-access')
      .send({});
    expect(missingRes.status).toBe(503);
    expect(missingRes.body.code).toBe('signup_disabled');
    expect(mockGetCollectionStore('users').has('homeowner-1')).toBe(false);

    seedDoc('users', 'homeowner-1', {
      role: 'homeowner',
      status: 'active',
      quoteAccessVerified: false,
    });
    const grantRes = await request(app)
      .post('/api/me/homeowner/activate-quote-access')
      .send({});
    expect(grantRes.status).toBe(503);
    expect(grantRes.body.code).toBe('signup_disabled');
    expect(mockGetCollectionStore('users').get('homeowner-1').quoteAccessVerified).toBe(false);
  });

  it('remains idempotent when signup is disabled for an already quote-verified homeowner', async () => {
    process.env.TASKIO_PUBLIC_SIGNUP_ENABLED = 'false';
    seedDoc('users', 'homeowner-1', {
      role: 'homeowner',
      status: 'active',
      quoteAccessVerified: true,
    });

    const res = await request(app)
      .post('/api/me/homeowner/activate-quote-access')
      .send({});

    expect(res.status).toBe(200);
    expect(mockState.userSetCalls).toHaveLength(0);
  });

  it('does not restore quote access for a disabled homeowner', async () => {
    seedDoc('users', 'homeowner-1', {
      role: 'homeowner',
      status: 'disabled',
      quoteAccessVerified: false,
    });

    const res = await request(app)
      .post('/api/me/homeowner/activate-quote-access')
      .send({});

    expect(res.status).toBe(403);
    expect(res.body.code).toBe('account_not_active');
    expect(mockState.userSetCalls).toHaveLength(0);
  });

  it('returns 403 account_not_enrolled for deletion confirm when the profile is missing', async () => {
    seedDoc('deletion_tokens', 'token-hash', {
      uid: 'homeowner-1',
      status: 'issued',
      expiresAt: { toDate: () => new Date(Date.now() + 60_000) },
    });

    const crypto = require('crypto');
    const original = crypto.createHash;
    jest.spyOn(crypto, 'createHash').mockImplementation((alg) => {
      if (alg === 'sha256') {
        return {
          update: () => ({ digest: () => 'token-hash' }),
        };
      }
      return original.call(crypto, alg);
    });

    const res = await request(app).get('/api/me/deletion/confirm?token=any');

    expect(res.status).toBe(403);
    expect(res.body.code).toBe('account_not_enrolled');
    expect(mockGetCollectionStore('deletion_tokens').get('token-hash').status).toBe('issued');
    expect(mockState.userSetCalls).toHaveLength(0);
    crypto.createHash.mockRestore();
  });

  it('returns 409 account_state_invalid for deletion confirm when the profile is malformed', async () => {
    seedDoc('users', 'homeowner-1', { phone: '+61400000001' });
    seedDoc('deletion_tokens', 'token-hash', {
      uid: 'homeowner-1',
      status: 'issued',
      expiresAt: { toDate: () => new Date(Date.now() + 60_000) },
    });

    const crypto = require('crypto');
    jest.spyOn(crypto, 'createHash').mockImplementation(() => ({
      update: () => ({ digest: () => 'token-hash' }),
    }));

    const res = await request(app).get('/api/me/deletion/confirm?token=any');

    expect(res.status).toBe(409);
    expect(res.body.code).toBe('account_state_invalid');
    expect(mockGetCollectionStore('deletion_tokens').get('token-hash').status).toBe('issued');
    expect(mockState.userSetCalls).toHaveLength(0);
    crypto.createHash.mockRestore();
  });

  it('confirms deletion for a valid profile', async () => {
    seedDoc('users', 'homeowner-1', {
      role: 'homeowner',
      status: 'pending_deletion',
    });
    seedDoc('deletion_tokens', 'token-hash', {
      uid: 'homeowner-1',
      status: 'issued',
      expiresAt: { toDate: () => new Date(Date.now() + 60_000) },
    });

    const crypto = require('crypto');
    jest.spyOn(crypto, 'createHash').mockImplementation(() => ({
      update: () => ({ digest: () => 'token-hash' }),
    }));

    const res = await request(app).get('/api/me/deletion/confirm?token=any');

    expect(res.status).toBe(200);
    expect(mockGetCollectionStore('deletion_tokens').get('token-hash').status).toBe('used');
    expect(mockGetCollectionStore('users').get('homeowner-1').deletion).toEqual(
      expect.objectContaining({ confirmStep2At: '__server_ts__' })
    );
    crypto.createHash.mockRestore();
  });
});
