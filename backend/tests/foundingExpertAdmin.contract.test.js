'use strict';

const express = require('express');
const request = require('supertest');

const {
  testProgramId,
  productionProgramId,
  foundingExpertCap,
} = require('../../shared/feePlans');
const { counterDocRef } = require('../src/services/foundingExpertEnrollmentService');

/** @type {Map<string, Map<string, object>>} */
const mockStores = new Map([
  ['users', new Map()],
  ['admin_config', new Map()],
]);

/** @type {unknown[]} */
const mockAdminAuditLogs = [];
/** @type {unknown[]} */
const mockUserAuditLogs = [];

function storeFor(collectionName) {
  const m = mockStores.get(collectionName);
  if (!m) throw new Error(`unknown collection mock: ${collectionName}`);
  return m;
}

function mockClone(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function applyFieldValue(existingValue, incomingValue) {
  if (incomingValue && typeof incomingValue === 'object') {
    if (Object.prototype.hasOwnProperty.call(incomingValue, '__arrayUnion')) {
      const current = Array.isArray(existingValue) ? existingValue : [];
      return Array.from(new Set([...current, incomingValue.__arrayUnion]));
    }
    if (Object.prototype.hasOwnProperty.call(incomingValue, '__arrayRemove')) {
      const current = Array.isArray(existingValue) ? existingValue : [];
      return current.filter((item) => item !== incomingValue.__arrayRemove);
    }
    if (Object.prototype.hasOwnProperty.call(incomingValue, '__increment')) {
      return Number(existingValue || 0) + Number(incomingValue.__increment || 0);
    }
  }
  return mockClone(incomingValue);
}

function mergePayload(existing, payload) {
  const next = { ...(existing || {}) };
  for (const [key, value] of Object.entries(payload || {})) {
    next[key] = applyFieldValue(existing ? existing[key] : undefined, value);
  }
  return next;
}

function readCollectionDoc(collectionName, id) {
  const sid = String(id);
  return storeFor(collectionName).get(sid);
}

function writeCollectionDoc(collectionName, id, value) {
  storeFor(collectionName).set(String(id), mockClone(value));
}

function findUsersByFoundingProgram(programId) {
  const out = [];
  for (const [uid, data] of storeFor('users').entries()) {
    if (data?.foundingExpert?.programId === programId) out.push({ id: uid, data: () => mockClone(data) });
  }
  return out;
}

function makeDocRef(collectionName, docId) {
  const id = String(docId);
  const base = {
    id,
    async get() {
      const data = readCollectionDoc(collectionName, id);
      return {
        exists: data !== undefined,
        data: () => mockClone(data),
      };
    },
    async set(payload, options) {
      const existing = readCollectionDoc(collectionName, id);
      const next =
        options && options.merge ? mergePayload(existing, payload) : mockClone(payload) || {};
      writeCollectionDoc(collectionName, id, next);
    },
    async update(payload) {
      const existing = readCollectionDoc(collectionName, id);
      if (existing === undefined) throw new Error(`missing doc: ${collectionName}/${id}`);
      const next = mergePayload(existing, payload);
      writeCollectionDoc(collectionName, id, next);
    },
  };
  return base;
}

function mockMakeCollectionRef(collectionName) {
  return {
    doc(docId) {
      return makeDocRef(collectionName, docId);
    },
    where(field, op, value) {
      return {
        async get() {
          if (collectionName === 'users' && field === 'foundingExpert.programId' && op === '==') {
            const docs = findUsersByFoundingProgram(value).map((d) => ({
              id: d.id,
              ref: makeDocRef('users', d.id),
              data: d.data,
            }));
            return { docs };
          }
          return { docs: [] };
        },
      };
    },
  };
}

jest.mock('../src/firebaseAdmin', () => ({
  admin: {
    auth: jest.fn(() => ({
      getUser: jest.fn(async () => ({ uid: 'mock', emailVerified: true })),
    })),
    firestore: {
      FieldValue: {
        serverTimestamp: jest.fn(() => '__server_ts__'),
        increment: jest.fn((v) => ({ __increment: v })),
      },
    },
  },
  db: {
    collection: jest.fn((name) => {
      if (name === 'admin_audit_logs') {
        return {
          add: jest.fn(async (payload) => {
            mockAdminAuditLogs.push(mockClone(payload));
            return { id: 'audit-mock' };
          }),
        };
      }
      return mockMakeCollectionRef(name);
    }),
    runTransaction: async (fn) => {
      const tx = {
        get: async (ref) => ref.get(),
        set: async (ref, payload, options) => ref.set(payload, options),
        update: async (ref, data) => ref.update(data),
      };
      return fn(tx);
    },
    batch: jest.fn(() => {
      const ops = [];
      return {
        set: jest.fn((ref, payload, opts) => {
          ops.push({ ref, payload, opts, op: 'set' });
        }),
        update: jest.fn((ref, payload) => {
          ops.push({ ref, payload, op: 'update' });
        }),
        commit: jest.fn(async () => {
          for (const op of ops) {
            if (op.op === 'update') {
              await op.ref.update(op.payload);
            } else {
              await op.ref.set(op.payload, op.opts);
            }
          }
        }),
      };
    }),
  },
}));

jest.mock('../src/utils/auditLogs', () => ({
  writeUserAuditLog: jest.fn(async (payload) => {
    mockUserAuditLogs.push({
      uid: payload.uid,
      actorUid: payload.actorUid,
      action: payload.action,
      before: payload.before != null ? mockClone(payload.before) : null,
      after: payload.after != null ? mockClone(payload.after) : null,
    });
  }),
}));

jest.mock('../src/services/foundingExpertAutoEnrollmentService', () => {
  const actual = jest.requireActual('../src/services/foundingExpertAutoEnrollmentService');
  return {
    ...actual,
    scheduleMaybeAutoEnrollFoundingExpert: jest.fn().mockResolvedValue(undefined),
  };
});

jest.mock('../src/middleware/auth', () => ({
  requireAuth: (req, _res, next) => {
    const adminHeader = req.headers['x-test-admin'];
    req.user = {
      uid: 'admin-caller-uid',
      admin: adminHeader !== 'false',
    };
    next();
  },
  requireAdmin: (req, res, next) => {
    if (req.user?.admin === true) return next();
    return res.status(403).send({ message: 'Forbidden: Requires admin privileges' });
  },
}));

const userRoutes = require('../src/routes/admin/userRoutes');
const { writeUserAuditLog } = require('../src/utils/auditLogs');
const foundingExpertAutoSvc = require('../src/services/foundingExpertAutoEnrollmentService');

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use(userRoutes);
  return app;
}

function seedTradie(uid, overrides = {}) {
  writeCollectionDoc('users', uid, {
    role: 'tradie',
    status: 'active',
    email: `${uid}@example.com`,
    ...overrides,
  });
}

const mockDbForCounter = {
  collection: (name) => mockMakeCollectionRef(name),
};

describe('admin founding expert enrolment', () => {
  let app;
  let envSnapshot;

  beforeEach(() => {
    envSnapshot = { ...process.env };
    delete process.env.FOUNDING_EXPERT_PROGRAM_ID;
    delete process.env.FOUNDING_EXPERT_ALLOW_PRODUCTION_PROGRAM;
    process.env.NODE_ENV = 'test';

    mockStores.get('users').clear();
    mockStores.get('admin_config').clear();
    mockAdminAuditLogs.length = 0;
    mockUserAuditLogs.length = 0;
    writeUserAuditLog.mockClear();
    foundingExpertAutoSvc.scheduleMaybeAutoEnrollFoundingExpert.mockClear();

    app = buildApp();
  });

  afterEach(() => {
    process.env = envSnapshot;
  });

  const counterIdForTestProgram = () => counterDocRef(mockDbForCounter, testProgramId).id;

  it('approve: admin can approve a valid Expert', async () => {
    seedTradie('expert-a');

    const res = await request(app).post('/api/admin/experts/expert-a/founding-expert/approve').set('x-test-admin', 'true');

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.duplicate).toBe(false);
    expect(res.body.foundingExpert.programId).toBe(testProgramId);
    expect(res.body.foundingExpert.status).toBe('active');
    expect(res.body.foundingExpert.sequenceNumber).toBe(1);
    expect(res.body.foundingExpert.zeroFeeSlotsUsed).toBe(0);
    expect(res.body.foundingExpert.reducedFeeStartsAt).toBeNull();
    expect(res.body.foundingExpert.reducedFeeEndsAt).toBeNull();
    expect(mockAdminAuditLogs.some((l) => l.action === 'FOUNDING_EXPERT_APPROVE')).toBe(true);
    expect(writeUserAuditLog).toHaveBeenCalled();
  });

  it('approve: programId defaults to testProgramId when env var missing', async () => {
    seedTradie('expert-b');
    const res = await request(app).post('/api/admin/experts/expert-b/founding-expert/approve').set('x-test-admin', 'true');
    expect(res.status).toBe(200);
    expect(res.body.foundingExpert.programId).toBe(testProgramId);
  });

  it('approve: non-admin cannot approve', async () => {
    seedTradie('expert-c');
    const res = await request(app).post('/api/admin/experts/expert-c/founding-expert/approve').set('x-test-admin', 'false');
    expect(res.status).toBe(403);
  });

  it('approve: cannot approve homeowner', async () => {
    writeCollectionDoc('users', 'home-d', { role: 'homeowner', status: 'active' });
    const res = await request(app).post('/api/admin/experts/home-d/founding-expert/approve').set('x-test-admin', 'true');
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('NOT_TRADIE');
  });

  it('approve: cannot approve missing user', async () => {
    const res = await request(app).post('/api/admin/experts/nope/founding-expert/approve').set('x-test-admin', 'true');
    expect(res.status).toBe(404);
  });

  it('approve: duplicate approval returns existing without bumping sequence counter', async () => {
    seedTradie('expert-dup');

    const first = await request(app).post('/api/admin/experts/expert-dup/founding-expert/approve').set('x-test-admin', 'true');
    expect(first.status).toBe(200);
    const seq = first.body.foundingExpert.sequenceNumber;

    const second = await request(app).post('/api/admin/experts/expert-dup/founding-expert/approve').set('x-test-admin', 'true');
    expect(second.status).toBe(200);
    expect(second.body.duplicate).toBe(true);
    expect(second.body.foundingExpert.sequenceNumber).toBe(seq);

    const counterDocId = counterIdForTestProgram();
    const c = readCollectionDoc('admin_config', counterDocId);
    expect(c.activeApprovedCount).toBe(1);
    expect(c.nextSequenceNumber).toBe(2);
  });

  it('approve: enforces cap of 50 active Experts', async () => {
    const counterDocId = counterIdForTestProgram();
    writeCollectionDoc('admin_config', counterDocId, {
      programId: testProgramId,
      city: 'Melbourne',
      cap: foundingExpertCap,
      activeApprovedCount: foundingExpertCap,
      nextSequenceNumber: 999,
      createdAt: '__server_ts__',
      updatedAt: '__server_ts__',
    });

    seedTradie('expert-cap');
    const res = await request(app).post('/api/admin/experts/expert-cap/founding-expert/approve').set('x-test-admin', 'true');
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('CAP_FULL');
  });

  it('remove: admin removes active founding expert and decrements activeApprovedCount', async () => {
    seedTradie('expert-rm');

    await request(app).post('/api/admin/experts/expert-rm/founding-expert/approve').set('x-test-admin', 'true');
    const counterBefore = readCollectionDoc('admin_config', counterIdForTestProgram());

    const res = await request(app).post('/api/admin/experts/expert-rm/founding-expert/remove').set('x-test-admin', 'true');
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.foundingExpert.status).toBe('removed');
    expect(res.body.foundingExpert.sequenceNumber).toBe(1);
    expect(res.body.foundingExpert.approvedAt).toBeDefined();

    const counterAfter = readCollectionDoc('admin_config', counterIdForTestProgram());
    expect(counterAfter.activeApprovedCount).toBe(counterBefore.activeApprovedCount - 1);
    expect(counterAfter.nextSequenceNumber).toBe(counterBefore.nextSequenceNumber);
  });

  it('remove: next approval gets new sequence number (no reuse)', async () => {
    seedTradie('e1');
    seedTradie('e2');
    await request(app).post('/api/admin/experts/e1/founding-expert/approve').set('x-test-admin', 'true');
    await request(app).post('/api/admin/experts/e1/founding-expert/remove').set('x-test-admin', 'true');
    const seqRemoved = readCollectionDoc('users', 'e1').foundingExpert.sequenceNumber;

    await request(app).post('/api/admin/experts/e2/founding-expert/approve').set('x-test-admin', 'true');
    const seqNew = readCollectionDoc('users', 'e2').foundingExpert.sequenceNumber;
    expect(seqNew).toBe(2);
    expect(seqNew).not.toBe(seqRemoved);
  });

  it('remove: duplicate remove is idempotent', async () => {
    seedTradie('expert-idem');
    await request(app).post('/api/admin/experts/expert-idem/founding-expert/approve').set('x-test-admin', 'true');
    const first = await request(app).post('/api/admin/experts/expert-idem/founding-expert/remove').set('x-test-admin', 'true');
    expect(first.status).toBe(200);
    const second = await request(app).post('/api/admin/experts/expert-idem/founding-expert/remove').set('x-test-admin', 'true');
    expect(second.status).toBe(200);
    expect(second.body.alreadyRemoved).toBe(true);
  });

  it('remove: non-admin cannot remove', async () => {
    seedTradie('expert-noad');
    await request(app).post('/api/admin/experts/expert-noad/founding-expert/approve').set('x-test-admin', 'true');
    const res = await request(app).post('/api/admin/experts/expert-noad/founding-expert/remove').set('x-test-admin', 'false');
    expect(res.status).toBe(403);
  });

  it('reset-test: marks test program users test_reset and resets counter', async () => {
    process.env.NODE_ENV = 'test';
    seedTradie('expert-z', {
      foundingExpert: {
        status: 'removed',
        programId: testProgramId,
        sequenceNumber: 3,
      },
    });

    const res = await request(app).post('/api/admin/founding-expert-program/reset-test').set('x-test-admin', 'true');
    expect(res.status).toBe(200);
    expect(res.body.usersUpdated).toBe(1);

    const u = readCollectionDoc('users', 'expert-z');
    expect(u.foundingExpert.status).toBe('test_reset');
    expect(u.foundingExpert.sequenceNumber).toBe(3);

    const c = readCollectionDoc('admin_config', counterIdForTestProgram());
    expect(c.activeApprovedCount).toBe(0);
    expect(c.nextSequenceNumber).toBe(1);
  });

  it('reset-test: does not affect production-program users', async () => {
    process.env.NODE_ENV = 'test';
    seedTradie('prod-exp', {
      foundingExpert: {
        status: 'active',
        programId: productionProgramId,
        sequenceNumber: 1,
      },
    });

    const res = await request(app).post('/api/admin/founding-expert-program/reset-test').set('x-test-admin', 'true');
    expect(res.status).toBe(200);

    const u = readCollectionDoc('users', 'prod-exp');
    expect(u.foundingExpert.status).toBe('active');
    expect(u.foundingExpert.programId).toBe(productionProgramId);
  });

  it('reset-test: forbidden when production NODE_ENV and test mode off', async () => {
    process.env.NODE_ENV = 'production';
    delete process.env.FOUNDING_EXPERT_TEST_MODE;

    const res = await request(app).post('/api/admin/founding-expert-program/reset-test').set('x-test-admin', 'true');
    expect(res.status).toBe(403);
  });

  it('reset-test: allowed in production when FOUNDING_EXPERT_TEST_MODE=true', async () => {
    process.env.NODE_ENV = 'production';
    process.env.FOUNDING_EXPERT_TEST_MODE = 'true';

    const res = await request(app).post('/api/admin/founding-expert-program/reset-test').set('x-test-admin', 'true');
    expect(res.status).toBe(200);
  });

  it('admin verify schedules founding auto enrolment when enabled', async () => {
    process.env.FOUNDING_EXPERT_AUTO_ENROLL_ENABLED = 'true';
    seedTradie('verify-fe');
    const res = await request(app).put('/api/admin/users/verify-fe/verify').set('x-test-admin', 'true');
    expect(res.status).toBe(200);
    expect(foundingExpertAutoSvc.scheduleMaybeAutoEnrollFoundingExpert).toHaveBeenCalledWith(
      expect.objectContaining({
        expertUid: 'verify-fe',
        trigger: 'admin_verify_user',
        actorUidForApproval: 'admin-caller-uid',
      }),
    );
  });

  it('admin verify skips scheduling when founding auto enrolment disabled', async () => {
    process.env.FOUNDING_EXPERT_AUTO_ENROLL_ENABLED = 'false';
    seedTradie('verify-fe-off');
    const res = await request(app).put('/api/admin/users/verify-fe-off/verify').set('x-test-admin', 'true');
    expect(res.status).toBe(200);
    expect(foundingExpertAutoSvc.scheduleMaybeAutoEnrollFoundingExpert).not.toHaveBeenCalled();
  });

  it('returns 404 and creates no profile when admin verify targets an unknown UID', async () => {
    const before = storeFor('users').size;
    const res = await request(app).put('/api/admin/users/unknown-verify/verify').set('x-test-admin', 'true');
    expect(res.status).toBe(404);
    expect(res.body.message).toBe('User not found.');
    expect(readCollectionDoc('users', 'unknown-verify')).toBeUndefined();
    expect(storeFor('users').size).toBe(before);
  });

  it('returns 404 and creates no profile when admin ops targets an unknown UID', async () => {
    const before = storeFor('users').size;
    const res = await request(app)
      .put('/api/admin/users/unknown-ops/ops')
      .set('x-test-admin', 'true')
      .send({ adminNote: 'do not create' });
    expect(res.status).toBe(404);
    expect(res.body.message).toBe('User not found.');
    expect(readCollectionDoc('users', 'unknown-ops')).toBeUndefined();
    expect(storeFor('users').size).toBe(before);
  });

  it('updates ops fields on an existing profile without creating a stub', async () => {
    seedTradie('ops-existing', { bio: 'keep me' });
    const res = await request(app)
      .put('/api/admin/users/ops-existing/ops')
      .set('x-test-admin', 'true')
      .send({ adminNote: 'reviewed' });
    expect(res.status).toBe(200);
    const stored = readCollectionDoc('users', 'ops-existing');
    expect(stored.role).toBe('tradie');
    expect(stored.bio).toBe('keep me');
    expect(stored.adminNoteText).toBe('reviewed');
    expect(storeFor('users').has('ops-existing')).toBe(true);
  });

  it('verifies an existing tradie without creating another profile', async () => {
    seedTradie('verify-existing', { verified: false, audit: { enrolledAt: 'keep' } });
    const res = await request(app).put('/api/admin/users/verify-existing/verify').set('x-test-admin', 'true');
    expect(res.status).toBe(200);
    const stored = readCollectionDoc('users', 'verify-existing');
    expect(stored.verified).toBe(true);
    expect(stored.audit.enrolledAt).toBe('keep');
    expect(stored.role).toBe('tradie');
  });
});

describe('getActiveFoundingExpertProgramId (isolateModules)', () => {
  const envKeys = ['FOUNDING_EXPERT_PROGRAM_ID', 'FOUNDING_EXPERT_ALLOW_PRODUCTION_PROGRAM'];

  afterEach(() => {
    envKeys.forEach((k) => delete process.env[k]);
  });

  it('uses production id only when allow flag set', () => {
    jest.isolateModules(() => {
      process.env.FOUNDING_EXPERT_PROGRAM_ID = productionProgramId;
      delete process.env.FOUNDING_EXPERT_ALLOW_PRODUCTION_PROGRAM;
      const fp = require('../../shared/feePlans');
      expect(fp.getActiveFoundingExpertProgramId()).toBe(fp.testProgramId);
    });
    jest.isolateModules(() => {
      process.env.FOUNDING_EXPERT_PROGRAM_ID = productionProgramId;
      process.env.FOUNDING_EXPERT_ALLOW_PRODUCTION_PROGRAM = 'true';
      const fp = require('../../shared/feePlans');
      expect(fp.getActiveFoundingExpertProgramId()).toBe(fp.productionProgramId);
    });
  });
});
