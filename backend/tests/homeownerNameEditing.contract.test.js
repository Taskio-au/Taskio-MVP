const express = require('express');
const request = require('supertest');

const mockState = {
  collections: new Map(),
  autoId: 0,
};

const mockAuthState = {
  user: {
    uid: 'homeowner-1',
    role: 'homeowner',
    email: 'homeowner@example.com',
    email_verified: true,
    phone_number: '+61400000000',
  },
};

function mockResetState() {
  mockState.collections = new Map();
  mockState.autoId = 0;
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

function mockReadDoc(collectionName, id) {
  return mockGetCollectionStore(collectionName).get(String(id));
}

function mockWriteDoc(collectionName, id, value) {
  mockGetCollectionStore(collectionName).set(String(id), mockClone(value));
}

function mockListDocs(collectionName) {
  return Array.from(mockGetCollectionStore(collectionName).entries()).map(([id, value]) => ({
    id,
    data: mockClone(value),
  }));
}

function mockMatchesFilter(doc, filter) {
  if (filter.op !== '==') {
    throw new Error(`Unsupported operator in test mock: ${filter.op}`);
  }
  return doc?.[filter.field] === filter.value;
}

function mockBuildQuery(collectionName, filters = [], limitCount = null) {
  return {
    where(field, op, value) {
      return mockBuildQuery(collectionName, [...filters, { field, op, value }], limitCount);
    },
    limit(count) {
      return mockBuildQuery(collectionName, filters, count);
    },
    async get() {
      let docs = mockListDocs(collectionName).filter(({ data }) => filters.every((filter) => mockMatchesFilter(data, filter)));
      if (typeof limitCount === 'number') {
        docs = docs.slice(0, limitCount);
      }
      return {
        empty: docs.length === 0,
        docs: docs.map((doc) => ({
          id: doc.id,
          data: () => mockClone(doc.data),
        })),
      };
    },
  };
}

function mockMakeDocRef(collectionName, id) {
  const docId = String(id);
  return {
    async get() {
      const data = mockReadDoc(collectionName, docId);
      return {
        exists: data !== undefined,
        data: () => mockClone(data),
      };
    },
    async set(payload, options) {
      const existing = mockReadDoc(collectionName, docId);
      const next = options && options.merge
        ? { ...(existing || {}), ...(mockClone(payload) || {}) }
        : (mockClone(payload) || {});
      mockWriteDoc(collectionName, docId, next);
    },
  };
}

jest.mock('../src/firebaseAdmin', () => ({
  admin: {
    firestore: {
      FieldValue: {
        serverTimestamp: jest.fn(() => ({ _seconds: 1711929600 })),
      },
      Timestamp: {
        now: jest.fn(() => ({ seconds: 1711929600, nanoseconds: 0 })),
        fromDate: jest.fn((d) => ({
          _seconds: Math.floor(new Date(d).getTime() / 1000),
          nanoseconds: 0,
          toMillis: () => new Date(d).getTime(),
        })),
      },
    },
    auth: jest.fn(() => ({
      updateUser: jest.fn(),
    })),
  },
  db: {
    collection: jest.fn((name) => ({
      doc: (id) => mockMakeDocRef(name, id),
      add: async (payload) => {
        const id = `${String(name)}-${++mockState.autoId}`;
        mockWriteDoc(name, id, payload);
        return { id };
      },
      where: (field, op, value) => mockBuildQuery(name, [{ field, op, value }], null),
      limit: (count) => mockBuildQuery(name, [], count),
      get: async () => mockBuildQuery(name, [], null).get(),
    })),
  },
}));

jest.mock('../src/middleware/auth', () => ({
  requireAuth: (req, _res, next) => {
    req.user = { ...mockAuthState.user };
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
  lookupAbnDetails: jest.fn(async (abn) => ({
    abn,
    entityName: 'Acme Pty Ltd',
    entityTypeName: 'Company',
    entityStatus: 'Active',
    gst: 'true',
  })),
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

function seedHomeowner(overrides = {}) {
  mockWriteDoc('users', 'homeowner-1', {
    role: 'homeowner',
    status: 'active',
    verified: true,
    phoneVerified: true,
    emailVerified: true,
    firstName: 'Jane',
    lastName: 'Citizen',
    displayName: 'Jane Citizen',
    createdAt: { _seconds: 1711929600 },
    updatedAt: { _seconds: 1711929600 },
    ...overrides,
  });
}

describe('homeowner name editing contracts', () => {
  let app;

  beforeEach(() => {
    mockResetState();
    mockAuthState.user = {
      uid: 'homeowner-1',
      role: 'homeowner',
      email: 'homeowner@example.com',
      email_verified: true,
      phone_number: '+61400000000',
    };
    app = buildApp();
  });

  it('allows a verified homeowner to change first and last name', async () => {
    seedHomeowner();

    const res = await request(app)
      .put('/api/me/profile')
      .send({
        firstName: 'Janet',
        lastName: 'Citizen-Smith',
        displayName: 'Janet Citizen-Smith',
      });

    expect(res.status).toBe(200);
    expect(res.body.profile.firstName).toBe('Janet');
    expect(res.body.profile.lastName).toBe('Citizen-Smith');
    expect(res.body.profile.displayName).toBe('Janet Citizen-Smith');
    expect(typeof res.body.profile.nameChangeBlockedMessage).toBe('string');

    const savedUser = mockReadDoc('users', 'homeowner-1');
    expect(savedUser.firstName).toBe('Janet');
    expect(savedUser.lastName).toBe('Citizen-Smith');
    expect(savedUser.lastNameUpdatedAt).toEqual({ _seconds: 1711929600 });
    expect(savedUser.nameChangeCount).toBe(1);

    const audits = mockListDocs('homeowner_name_change_audit');
    expect(audits).toHaveLength(1);
    expect(audits[0].data).toMatchObject({
      uid: 'homeowner-1',
      oldFirstName: 'Jane',
      oldLastName: 'Citizen',
      newFirstName: 'Janet',
      newLastName: 'Citizen-Smith',
    });
  });

  it('enforces the homeowner name cooldown window', async () => {
    const tenDaysAgoSeconds = Math.floor((Date.now() - (10 * 24 * 60 * 60 * 1000)) / 1000);
    seedHomeowner({
      lastNameUpdatedAt: { _seconds: tenDaysAgoSeconds },
    });

    const res = await request(app)
      .put('/api/me/profile')
      .send({
        firstName: 'Janet',
        lastName: 'Citizen',
        displayName: 'Janet Citizen',
      });

    expect(res.status).toBe(429);
    expect(res.body.code).toBe('HOMEOWNER_NAME_COOLDOWN');
    expect(res.body.message).toMatch(/update your name again after/i);
  });

  it('returns payment history signals on the me payload for homeowners', async () => {
    seedHomeowner();
    mockWriteDoc('jobs', 'job-1', {
      homeownerUid: 'homeowner-1',
      paymentState: 'released',
      fundedAt: { _seconds: 1712016000 },
    });

    const res = await request(app).get('/api/me');

    expect(res.status).toBe(200);
    expect(res.body.profile.hasPaymentHistory).toBe(true);
  });

  it('rejects obviously invalid homeowner names', async () => {
    seedHomeowner();

    const res = await request(app)
      .put('/api/me/profile')
      .send({
        firstName: '@@@',
        lastName: 'Citizen',
        displayName: '@@@ Citizen',
      });

    expect(res.status).toBe(400);
    expect(res.body.message).toBe('First name is invalid.');
  });
});
