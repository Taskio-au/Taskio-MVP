'use strict';

const { testProgramId, foundingExpertCap } = require('../../shared/feePlans');

/** @type {Map<string, Map<string, object>>} */
const mockStores = new Map([
  ['users', new Map()],
  ['admin_config', new Map()],
]);

const mockAdminAuditLogs = [];
const mockUserAuditLogs = [];

let mockAuthEmailVerified = true;
const mockAuthGetUser = jest.fn(async (uid) => ({
  uid: String(uid),
  emailVerified: mockAuthEmailVerified,
}));

function storeFor(collectionName) {
  return mockStores.get(collectionName);
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
  return storeFor(collectionName).get(String(id));
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
  return {
    id,
    async get() {
      const data = readCollectionDoc(collectionName, id);
      return { exists: data !== undefined, data: () => mockClone(data) };
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
      writeCollectionDoc(collectionName, id, mergePayload(existing, payload));
    },
  };
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
      getUser: (...args) => mockAuthGetUser(...args),
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
        set: jest.fn((ref, payload, opts) => ops.push({ ref, payload, opts })),
        commit: jest.fn(async () => {
          for (const op of ops) {
            await op.ref.set(op.payload, op.opts);
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
      after: payload.after != null ? mockClone(payload.after) : null,
    });
  }),
}));

const { counterDocRef } = require('../src/services/foundingExpertEnrollmentService');
const { db, admin } = require('../src/firebaseAdmin');
const {
  maybeAutoEnrollFoundingExpert,
  foundingExpertAutoEnrollEnabled,
} = require('../src/services/foundingExpertAutoEnrollmentService');

function baseEligibleTradie(uid) {
  return {
    role: 'tradie',
    status: 'active',
    verified: true,
    phoneVerified: true,
    emailVerified: true,
    email: `${uid}@example.com`,
    stripeOnboardingStatus: 'completed',
    stripePayoutsEnabled: true,
    serviceLocation: { suburb: 'Docklands', state: 'VIC', postcode: '3008' },
    expertiseApproved: ['mounting_tv'],
  };
}

describe('foundingExpertAutoEnrollmentService.maybeAutoEnrollFoundingExpert', () => {
  let envSnap;

  beforeEach(() => {
    envSnap = { ...process.env };
    mockStores.get('users').clear();
    mockStores.get('admin_config').clear();
    mockAdminAuditLogs.length = 0;
    mockUserAuditLogs.length = 0;
    mockAuthEmailVerified = true;
    process.env.NODE_ENV = 'test';
    delete process.env.FOUNDING_EXPERT_PROGRAM_ID;
    delete process.env.FOUNDING_EXPERT_ALLOW_PRODUCTION_PROGRAM;
    process.env.FOUNDING_EXPERT_AUTO_ENROLL_ENABLED = 'true';
  });

  afterEach(() => {
    process.env = envSnap;
  });

  it('auto-enrolls eligible Docklands Expert with Stripe payouts', async () => {
    writeCollectionDoc('users', 'dx', baseEligibleTradie('dx'));

    const r = await maybeAutoEnrollFoundingExpert({
      db,
      admin,
      expertUid: 'dx',
      trigger: 'test',
      actorUidForApproval: 'system-test',
    });

    expect(r.enrolled).toBe(true);
    const u = readCollectionDoc('users', 'dx');
    expect(u.foundingExpert.status).toBe('active');
    expect(u.foundingExpert.programId).toBe(testProgramId);

    expect(mockUserAuditLogs.some((l) => l.action === 'FOUNDING_EXPERT_AUTO_ENROLL_APPROVED')).toBe(true);
  });

  it('does not enrol outside Melbourne pilot', async () => {
    writeCollectionDoc('users', 'sx', {
      ...baseEligibleTradie('sx'),
      serviceLocation: { suburb: 'Sydney', state: 'NSW', postcode: '2000' },
    });

    const r = await maybeAutoEnrollFoundingExpert({
      db,
      admin,
      expertUid: 'sx',
      trigger: 'test',
      actorUidForApproval: 'sys',
    });
    expect(r.enrolled).toBe(false);
    expect(r.reason).toBe('ineligible');
  });

  it('does not enrol when Stripe payouts not ready', async () => {
    writeCollectionDoc('users', 'np', {
      ...baseEligibleTradie('np'),
      stripePayoutsEnabled: false,
      stripeOnboardingStatus: 'pending',
    });

    const r = await maybeAutoEnrollFoundingExpert({
      db,
      admin,
      expertUid: 'np',
      trigger: 'test',
      actorUidForApproval: 'sys',
    });
    expect(r.enrolled).toBe(false);
    expect(r.reason).toBe('ineligible');
  });

  it('does not enrol without approved task categories', async () => {
    writeCollectionDoc('users', 'ne', {
      ...baseEligibleTradie('ne'),
      expertiseApproved: [],
    });

    const r = await maybeAutoEnrollFoundingExpert({
      db,
      admin,
      expertUid: 'ne',
      trigger: 'test',
      actorUidForApproval: 'sys',
    });
    expect(r.reason).toBe('ineligible');
  });

  it('already active is not double-enrolled', async () => {
    writeCollectionDoc('users', 'aa', {
      ...baseEligibleTradie('aa'),
      foundingExpert: { status: 'active', programId: testProgramId, sequenceNumber: 1 },
    });

    const r = await maybeAutoEnrollFoundingExpert({
      db,
      admin,
      expertUid: 'aa',
      trigger: 'test',
      actorUidForApproval: 'sys',
    });
    expect(r.reason).toBe('already_active');
  });

  it('cap full yields cap_full', async () => {
    const ctr = counterDocRef(db, testProgramId);
    writeCollectionDoc('admin_config', ctr.id, {
      programId: testProgramId,
      activeApprovedCount: foundingExpertCap,
      nextSequenceNumber: 999,
    });
    writeCollectionDoc('users', 'cf', baseEligibleTradie('cf'));

    const r = await maybeAutoEnrollFoundingExpert({
      db,
      admin,
      expertUid: 'cf',
      trigger: 'test',
      actorUidForApproval: 'sys',
    });

    expect(r.enrolled).toBe(false);
    expect(r.reason).toBe('cap_full');
    expect(mockUserAuditLogs.some((l) => l.action === 'FOUNDING_EXPERT_AUTO_ENROLL_CAP_FULL')).toBe(true);
  });

  it('feature flag disabled returns disabled without approving', async () => {
    process.env.FOUNDING_EXPERT_AUTO_ENROLL_ENABLED = 'false';
    writeCollectionDoc('users', 'ff', baseEligibleTradie('ff'));

    const r = await maybeAutoEnrollFoundingExpert({
      db,
      admin,
      expertUid: 'ff',
      trigger: 'test',
      actorUidForApproval: 'sys',
    });
    expect(r.reason).toBe('disabled');
    expect(readCollectionDoc('users', 'ff').foundingExpert).toBeUndefined();
    expect(foundingExpertAutoEnrollEnabled()).toBe(false);
  });

  it('duplicate trigger is safe (second call duplicate path)', async () => {
    writeCollectionDoc('users', 'du', baseEligibleTradie('du'));

    const first = await maybeAutoEnrollFoundingExpert({
      db,
      admin,
      expertUid: 'du',
      trigger: 't1',
      actorUidForApproval: 'sys',
    });
    expect(first.enrolled).toBe(true);

    const second = await maybeAutoEnrollFoundingExpert({
      db,
      admin,
      expertUid: 'du',
      trigger: 't2',
      actorUidForApproval: 'sys',
    });
    expect(second.reason).toBe('already_active');
  });

  it('requires Firebase emailVerified when doc flag false', async () => {
    mockAuthEmailVerified = false;
    writeCollectionDoc('users', 'em', {
      ...baseEligibleTradie('em'),
      emailVerified: false,
    });

    const r = await maybeAutoEnrollFoundingExpert({
      db,
      admin,
      expertUid: 'em',
      trigger: 'test',
      actorUidForApproval: 'sys',
    });
    expect(r.reason).toBe('ineligible');
    mockAuthEmailVerified = true;
  });
});
