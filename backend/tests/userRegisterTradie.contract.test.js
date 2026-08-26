'use strict';

const express = require('express');
const request = require('supertest');

const mockState = {
  createdUsers: [],
  claims: [],
  storedUsers: new Map(),
  authUsers: new Map(),
};

function resetMockState() {
  mockState.createdUsers = [];
  mockState.claims = [];
  mockState.storedUsers = new Map();
  mockState.authUsers = new Map();
}

jest.mock('../src/middleware/auth', () => ({
  requireAuth: (req, res, next) => {
    if (!req.headers.authorization) {
      return res.status(401).send({ message: 'Unauthorized: No token provided' });
    }
    req.user = {
      uid: 'google-tradie-1',
      email: 'google.expert@example.com',
    };
    return next();
  },
}));

jest.mock('../src/firebaseAdmin', () => ({
  admin: {
    auth: jest.fn(() => ({
      createUser: jest.fn(async (payload) => {
        if (payload.email === 'duplicate@example.com') {
          const error = new Error('Email already exists');
          error.code = 'auth/email-already-exists';
          throw error;
        }
        if (payload.email === 'unsafe-error@example.com') {
          const error = new Error('Firebase internal tenant and credential details');
          error.code = 'auth/internal-error';
          throw error;
        }
        mockState.createdUsers.push(payload);
        return {
          uid: 'tradie-1',
          email: payload.email,
        };
      }),
      setCustomUserClaims: jest.fn(async (uid, claims) => {
        mockState.claims.push({ uid, claims });
      }),
      getUser: jest.fn(async (uid) => ({
        uid,
        email: mockState.authUsers.get(uid)?.email || 'google.expert@example.com',
        customClaims: mockState.authUsers.get(uid)?.customClaims || {},
      })),
    })),
    firestore: {
      FieldValue: {
        serverTimestamp: jest.fn(() => '__server_ts__'),
      },
      Timestamp: {
        now: jest.fn(() => ({ seconds: 0, nanoseconds: 0 })),
      },
    },
  },
  db: {
    collection: jest.fn(() => ({
      doc: jest.fn((uid) => ({
        get: jest.fn(async () => ({
          exists: mockState.storedUsers.has(uid),
          data: () => mockState.storedUsers.get(uid),
        })),
        set: jest.fn(async (payload) => {
          const previous = mockState.storedUsers.get(uid) || {};
          mockState.storedUsers.set(uid, { ...previous, ...payload });
        }),
      })),
    })),
  },
}));

const userRoutes = require('../src/routes/users');

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use(userRoutes);
  return app;
}

describe('tradie registration contracts', () => {
  beforeEach(() => {
    resetMockState();
    mockState.authUsers.set('google-tradie-1', {
      email: 'google.expert@example.com',
      customClaims: {},
    });
  });

  it('stores structured tradie signup defaults for readiness', async () => {
    const response = await request(buildApp())
      .post('/api/users/register')
      .send({
        role: 'tradie',
        firstName: 'Jane',
        lastName: 'Expert',
        email: 'jane@example.com',
        password: 'hunter22',
        serviceLocation: {
          label: 'Richmond VIC 3121',
          suburb: 'Richmond',
          state: 'VIC',
          postcode: '3121',
          country: 'AU',
        },
        primaryServiceSuburb: 'Richmond',
        primaryServicePostcode: '3121',
        expertise: ['mounting_shelves'],
      });

    expect(response.status).toBe(201);
    expect(mockState.claims).toEqual([{ uid: 'tradie-1', claims: { role: 'tradie' } }]);
    expect(mockState.storedUsers.get('tradie-1')).toEqual(expect.objectContaining({
      role: 'tradie',
      primaryServiceSuburb: 'Richmond',
      primaryServicePostcode: '3121',
      phone: '',
      phoneVerified: false,
      profileCompleted: false,
      expertiseApproved: ['mounting_shelves'],
      serviceLocation: {
        label: 'Richmond VIC 3121',
        suburb: 'Richmond',
        state: 'VIC',
        postcode: '3121',
        country: 'AU',
      },
    }));
  });

  it('rejects tradie signup without expertise', async () => {
    const response = await request(buildApp())
      .post('/api/users/register')
      .send({
        role: 'tradie',
        firstName: 'Jane',
        lastName: 'Expert',
        email: 'jane@example.com',
        password: 'hunter22',
        serviceLocation: {
          label: 'Richmond VIC 3121',
          suburb: 'Richmond',
          state: 'VIC',
          postcode: '3121',
          country: 'AU',
        },
        primaryServiceSuburb: 'Richmond',
        primaryServicePostcode: '3121',
        expertise: [],
      });

    expect(response.status).toBe(400);
    expect(response.body.message).toBe('Select at least one type of job.');
    expect(mockState.createdUsers).toHaveLength(0);
  });

  it('rejects tradie signup without required names', async () => {
    const response = await request(buildApp())
      .post('/api/users/register')
      .send({
        role: 'tradie',
        firstName: '',
        lastName: '',
        email: 'jane@example.com',
        password: 'hunter22',
        serviceLocation: {
          label: 'Richmond VIC 3121',
          suburb: 'Richmond',
          state: 'VIC',
          postcode: '3121',
          country: 'AU',
        },
        primaryServiceSuburb: 'Richmond',
        primaryServicePostcode: '3121',
        expertise: ['mounting_shelves'],
      });

    expect(response.status).toBe(400);
    expect(response.body.message).toMatch(/first name is required/i);
    expect(mockState.createdUsers).toHaveLength(0);
  });

  it('rejects duplicate email registration for a second account', async () => {
    const response = await request(buildApp())
      .post('/api/users/register')
      .send({
        role: 'tradie',
        firstName: 'Jane',
        lastName: 'Expert',
        email: 'duplicate@example.com',
        password: 'hunter22',
        serviceLocation: {
          label: 'Richmond VIC 3121',
          suburb: 'Richmond',
          state: 'VIC',
          postcode: '3121',
          country: 'AU',
        },
        primaryServiceSuburb: 'Richmond',
        primaryServicePostcode: '3121',
        expertise: ['mounting_shelves'],
      });

    expect(response.status).toBe(400);
    expect(response.body.code).toBe('auth/email-already-exists');
    expect(response.body.message).toMatch(/already registered/i);
  });

  it('does not expose Firebase internals in registration errors', async () => {
    const response = await request(buildApp())
      .post('/api/users/register')
      .set('x-request-id', 'registration-test-request')
      .send({
        role: 'tradie',
        firstName: 'Safe',
        lastName: 'Error',
        email: 'unsafe-error@example.com',
        password: 'hunter22',
        serviceLocation: {
          label: 'Richmond VIC 3121',
          suburb: 'Richmond',
          state: 'VIC',
          postcode: '3121',
          country: 'AU',
        },
        primaryServiceSuburb: 'Richmond',
        primaryServicePostcode: '3121',
        expertise: ['mounting_shelves'],
      });

    expect(response.status).toBe(400);
    expect(response.body.message).toBe('We could not create the account with those details.');
    expect(JSON.stringify(response.body)).not.toMatch(/tenant|credential|Firebase internal/i);
  });

  it('rejects homeowner registration and directs the caller to the posting flow', async () => {
    const response = await request(buildApp())
      .post('/api/users/register')
      .send({
        role: 'homeowner',
        firstName: 'Stage',
        lastName: 'Homeowner',
        email: 'homeowner@example.com',
        password: 'hunter22',
      });

    expect(response.status).toBe(400);
    expect(response.body.message).toBe('Expert accounts only. To create a homeowner account, post a task.');
  });

  it('creates no Auth user, claim or profile when homeowner registration is rejected', async () => {
    await request(buildApp())
      .post('/api/users/register')
      .send({
        role: 'homeowner',
        firstName: 'Stage',
        lastName: 'Homeowner',
        email: 'homeowner@example.com',
        password: 'hunter22',
      });

    expect(mockState.createdUsers).toHaveLength(0);
    expect(mockState.claims).toHaveLength(0);
    expect(mockState.storedUsers.size).toBe(0);
  });

  it('never grants homeowner quote access through the public register route', async () => {
    const response = await request(buildApp())
      .post('/api/users/register')
      .send({
        role: 'homeowner',
        firstName: 'Stage',
        lastName: 'Homeowner',
        email: 'quote-access@example.com',
        password: 'hunter22',
        quoteAccessVerified: true,
      });

    expect(response.status).toBe(400);
    expect(
      [...mockState.storedUsers.values()].some((profile) => profile?.quoteAccessVerified === true)
    ).toBe(false);
  });

  it('rejects a missing or unsupported account type without creating anything', async () => {
    for (const role of [undefined, '', 'admin', 'client']) {
      resetMockState();
      const response = await request(buildApp())
        .post('/api/users/register')
        .send({
          role,
          firstName: 'Stage',
          lastName: 'Unknown',
          email: 'unknown-role@example.com',
          password: 'hunter22',
        });

      expect(response.status).toBe(400);
      expect(response.body.message).toBe('Please choose a valid account type.');
      expect(mockState.createdUsers).toHaveLength(0);
      expect(mockState.storedUsers.size).toBe(0);
    }
  });

  it('completes Google expert signup for an authenticated account', async () => {
    const response = await request(buildApp())
      .post('/api/users/register/expert-google')
      .set('Authorization', 'Bearer test-token')
      .send({
        firstName: 'Jane',
        lastName: 'Expert',
        serviceLocation: {
          label: 'Richmond VIC 3121',
          suburb: 'Richmond',
          state: 'VIC',
          postcode: '3121',
          country: 'AU',
        },
        primaryServiceSuburb: 'Richmond',
        primaryServicePostcode: '3121',
        expertise: ['mounting_shelves'],
      });

    expect(response.status).toBe(200);
    expect(mockState.claims).toContainEqual({ uid: 'google-tradie-1', claims: { role: 'tradie' } });
    expect(mockState.storedUsers.get('google-tradie-1')).toEqual(expect.objectContaining({
      role: 'tradie',
      email: 'google.expert@example.com',
      firstName: 'Jane',
      lastName: 'Expert',
      primaryServiceSuburb: 'Richmond',
      primaryServicePostcode: '3121',
      expertiseApproved: ['mounting_shelves'],
    }));
  });

  it('rejects Google expert signup when the signed-in account already has another role', async () => {
    mockState.storedUsers.set('google-tradie-1', {
      role: 'homeowner',
      email: 'google.expert@example.com',
    });

    const response = await request(buildApp())
      .post('/api/users/register/expert-google')
      .set('Authorization', 'Bearer test-token')
      .send({
        firstName: 'Jane',
        lastName: 'Expert',
        serviceLocation: {
          label: 'Richmond VIC 3121',
          suburb: 'Richmond',
          state: 'VIC',
          postcode: '3121',
          country: 'AU',
        },
        primaryServiceSuburb: 'Richmond',
        primaryServicePostcode: '3121',
        expertise: ['mounting_shelves'],
      });

    expect(response.status).toBe(409);
    expect(response.body.message).toMatch(/different Taskio role/i);
  });

  describe('public signup kill switch on enrollment routes', () => {
    const originalNodeEnv = process.env.NODE_ENV;
    const originalFlag = process.env.TASKIO_PUBLIC_SIGNUP_ENABLED;

    afterEach(() => {
      process.env.NODE_ENV = originalNodeEnv;
      if (originalFlag === undefined) {
        delete process.env.TASKIO_PUBLIC_SIGNUP_ENABLED;
      } else {
        process.env.TASKIO_PUBLIC_SIGNUP_ENABLED = originalFlag;
      }
    });

    const tradiePayload = {
      role: 'tradie',
      firstName: 'Jane',
      lastName: 'Expert',
      email: 'jane@example.com',
      password: 'hunter22',
      serviceLocation: {
        label: 'Richmond VIC 3121',
        suburb: 'Richmond',
        state: 'VIC',
        postcode: '3121',
        country: 'AU',
      },
      primaryServiceSuburb: 'Richmond',
      primaryServicePostcode: '3121',
      expertise: ['mounting_shelves'],
    };

    it('blocks POST /api/users/register in production when the flag is missing and does not create Auth users', async () => {
      process.env.NODE_ENV = 'production';
      delete process.env.TASKIO_PUBLIC_SIGNUP_ENABLED;

      const response = await request(buildApp()).post('/api/users/register').send(tradiePayload);

      expect(response.status).toBe(503);
      expect(response.body.code).toBe('signup_disabled');
      expect(mockState.createdUsers).toHaveLength(0);
      expect(mockState.claims).toHaveLength(0);
      expect(mockState.storedUsers.size).toBe(0);
    });

    it('blocks POST /api/users/register in production when the flag is false', async () => {
      process.env.NODE_ENV = 'production';
      process.env.TASKIO_PUBLIC_SIGNUP_ENABLED = 'false';

      const response = await request(buildApp()).post('/api/users/register').send(tradiePayload);

      expect(response.status).toBe(503);
      expect(mockState.createdUsers).toHaveLength(0);
    });

    it('blocks POST /api/users/register in production when the flag is malformed', async () => {
      process.env.NODE_ENV = 'production';
      process.env.TASKIO_PUBLIC_SIGNUP_ENABLED = 'yes';

      const response = await request(buildApp()).post('/api/users/register').send(tradiePayload);

      expect(response.status).toBe(503);
      expect(mockState.createdUsers).toHaveLength(0);
    });

    it('allows POST /api/users/register in production when the flag is true', async () => {
      process.env.NODE_ENV = 'production';
      process.env.TASKIO_PUBLIC_SIGNUP_ENABLED = 'true';

      const response = await request(buildApp()).post('/api/users/register').send(tradiePayload);

      expect(response.status).toBe(201);
      expect(mockState.createdUsers).toHaveLength(1);
    });

    it('blocks Google expert enrollment when signup is disabled before claims or profile writes', async () => {
      process.env.NODE_ENV = 'production';
      process.env.TASKIO_PUBLIC_SIGNUP_ENABLED = 'false';

      const response = await request(buildApp())
        .post('/api/users/register/expert-google')
        .set('Authorization', 'Bearer test-token')
        .send({
          firstName: 'Jane',
          lastName: 'Expert',
          serviceLocation: tradiePayload.serviceLocation,
          primaryServiceSuburb: 'Richmond',
          primaryServicePostcode: '3121',
          expertise: ['mounting_shelves'],
        });

      expect(response.status).toBe(503);
      expect(response.body.code).toBe('signup_disabled');
      expect(mockState.claims).toHaveLength(0);
      expect(mockState.storedUsers.size).toBe(0);
    });
  });
});
