'use strict';

/**
 * Verifies stripe account.updated merges payout fields then triggers founding auto-enrol scheduling.
 */

const express = require('express');
const request = require('supertest');

/** @type {Map<string, Map<string, object>>} */
const mockStores = new Map([
  ['users', new Map()],
  ['stripe_events', new Map()],
]);

function storeFor(collectionName) {
  return mockStores.get(collectionName);
}

function mockClone(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function readCollectionDoc(collectionName, id) {
  return storeFor(collectionName).get(String(id));
}

function writeCollectionDoc(collectionName, id, value) {
  storeFor(collectionName).set(String(id), mockClone(value));
}

function applyFieldValue(existingValue, incomingValue) {
  if (incomingValue && typeof incomingValue === 'object') return mockClone(incomingValue);
  return mockClone(incomingValue);
}

function mergePayload(existing, payload) {
  const next = { ...(existing || {}) };
  for (const [key, value] of Object.entries(payload || {})) {
    next[key] = applyFieldValue(existing ? existing[key] : undefined, value);
  }
  return next;
}

function mockMakeDocRef(collectionName, docId) {
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
      if (existing === undefined) {
        const err = new Error('NOT_FOUND');
        err.code = 5;
        throw err;
      }
      writeCollectionDoc(collectionName, id, mergePayload(existing, payload));
    },
  };
}

jest.mock('../src/firebaseAdmin', () => ({
  admin: {
    auth: jest.fn(() => ({
      getUser: jest.fn(async () => ({ uid: 'webhook-fe', emailVerified: true })),
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
      if (!mockStores.has(name)) mockStores.set(name, new Map());
      return {
        doc: (docId) => mockMakeDocRef(name, docId),
        add: jest.fn(async () => ({ id: 'x' })),
      };
    }),
    runTransaction: async (fn) => {
      const tx = {
        get: (ref) => ref.get(),
        set: (ref, payload, options) => ref.set(payload, options),
        update: (ref, payload) => ref.set(payload, { merge: true }),
      };
      return fn(tx);
    },
  },
}));

jest.mock('../src/services/stripe', () => ({
  constructWebhookEvent: jest.fn(),
  getExpectedStripeLivemode: jest.fn(() => false),
}));

jest.mock('../src/utils/auditLogs', () => ({
  writeUserAuditLog: jest.fn(async () => {}),
}));

jest.mock('../src/services/foundingExpertAutoEnrollmentService', () => {
  const actual = jest.requireActual('../src/services/foundingExpertAutoEnrollmentService');
  return {
    ...actual,
    scheduleMaybeAutoEnrollFoundingExpert: jest.fn().mockResolvedValue(undefined),
  };
});

const webhookRoutes = require('../src/routes/stripeWebhook');
const autoSvc = require('../src/services/foundingExpertAutoEnrollmentService');
const { logger } = require('../src/observability/logger');

function buildWebhookApp() {
  const app = express();
  app.use(webhookRoutes);
  return app;
}

function makeAccountUpdatedEvent(uid) {
  return {
    id: 'evt_fe_acct_1',
    type: 'account.updated',
    livemode: false,
    created: Math.floor(Date.now() / 1000),
    data: {
      object: {
        id: 'acct_test_fe',
        object: 'account',
        charges_enabled: true,
        payouts_enabled: true,
        metadata: { taskioUid: uid },
        requirements: { currently_due: [], eventually_due: [] },
      },
    },
  };
}

describe('Stripe account.updated wires founding auto enrolment', () => {
  beforeEach(() => {
    mockStores.get('users').clear();
    mockStores.get('stripe_events').clear();
    process.env.STRIPE_ENABLED = 'true';
    process.env.STRIPE_EXPECTED_LIVEMODE = 'false';
    process.env.FOUNDING_EXPERT_AUTO_ENROLL_ENABLED = 'true';

    autoSvc.scheduleMaybeAutoEnrollFoundingExpert.mockClear();

    const { constructWebhookEvent } = require('../src/services/stripe');
    constructWebhookEvent.mockReset();
  });

  test('schedules auto-enrol after user stripe fields merged', async () => {
    const uid = 'webhook-fe';
    writeCollectionDoc('users', uid, { role: 'tradie', status: 'active', displayName: 'FE' });

    const evt = makeAccountUpdatedEvent(uid);
    const { constructWebhookEvent } = require('../src/services/stripe');
    constructWebhookEvent.mockReturnValueOnce(evt);

    const app = buildWebhookApp();
    const res = await request(app)
      .post('/api/stripe/webhook')
      .set('stripe-signature', 'sig')
      .set('Content-Type', 'application/json')
      .send(Buffer.from(JSON.stringify(evt)));

    expect(res.status).toBe(200);
    expect(res.body?.duplicate).not.toBe(true);
    expect(res.body?.received).toBe(true);

    expect(autoSvc.scheduleMaybeAutoEnrollFoundingExpert).toHaveBeenCalledWith(
      expect.objectContaining({
        expertUid: uid,
        trigger: 'stripe_webhook_account_updated',
        actorUidForApproval: autoSvc.DEFAULT_AUTO_ACTOR_UID,
      }),
    );

    const u = readCollectionDoc('users', uid);
    expect(u.stripePayoutsEnabled).toBe(true);
    expect(u.stripeOnboardingStatus).toBe('completed');

  });

  test('does not schedule when auto-enrol disabled', async () => {
    process.env.FOUNDING_EXPERT_AUTO_ENROLL_ENABLED = 'false';

    const uid = 'webhook-fe-off';
    writeCollectionDoc('users', uid, { role: 'tradie', status: 'active' });
    const evt = makeAccountUpdatedEvent(uid);
    const { constructWebhookEvent } = require('../src/services/stripe');
    constructWebhookEvent.mockReturnValueOnce(evt);

    const app = buildWebhookApp();
    await request(app)
      .post('/api/stripe/webhook')
      .set('stripe-signature', 'sig')
      .set('Content-Type', 'application/json')
      .send(Buffer.from(JSON.stringify(evt)));

    expect(autoSvc.scheduleMaybeAutoEnrollFoundingExpert).not.toHaveBeenCalled();
  });

  test('acknowledges account.updated for a missing profile without creating a user', async () => {
    const warnSpy = jest.spyOn(logger, 'warn').mockImplementation(() => logger);
    const uid = 'webhook-missing-profile';
    const evt = makeAccountUpdatedEvent(uid);
    const { constructWebhookEvent } = require('../src/services/stripe');
    constructWebhookEvent.mockReturnValueOnce(evt);

    const app = buildWebhookApp();
    const res = await request(app)
      .post('/api/stripe/webhook')
      .set('stripe-signature', 'sig')
      .set('Content-Type', 'application/json')
      .send(Buffer.from(JSON.stringify(evt)));

    expect(res.status).toBe(200);
    expect(readCollectionDoc('users', uid)).toBeUndefined();
    expect(autoSvc.scheduleMaybeAutoEnrollFoundingExpert).not.toHaveBeenCalled();
    expect(warnSpy).toHaveBeenCalledWith(
      'stripe_account_updated_skipped',
      expect.objectContaining({ reason: 'profile_missing' })
    );
    const logged = JSON.stringify(warnSpy.mock.calls);
    expect(logged).not.toMatch(uid);
    expect(logged).not.toMatch(/@/);
    warnSpy.mockRestore();
  });

  test('acknowledges account.updated for a malformed profile without creating or converting it', async () => {
    const warnSpy = jest.spyOn(logger, 'warn').mockImplementation(() => logger);
    const uid = 'webhook-malformed-profile';
    writeCollectionDoc('users', uid, { phone: '+61400000001' });
    const evt = makeAccountUpdatedEvent(uid);
    const { constructWebhookEvent } = require('../src/services/stripe');
    constructWebhookEvent.mockReturnValueOnce(evt);

    const app = buildWebhookApp();
    const res = await request(app)
      .post('/api/stripe/webhook')
      .set('stripe-signature', 'sig')
      .set('Content-Type', 'application/json')
      .send(Buffer.from(JSON.stringify(evt)));

    expect(res.status).toBe(200);
    expect(readCollectionDoc('users', uid)).toEqual({ phone: '+61400000001' });
    expect(autoSvc.scheduleMaybeAutoEnrollFoundingExpert).not.toHaveBeenCalled();
    expect(warnSpy).toHaveBeenCalledWith(
      'stripe_account_updated_skipped',
      expect.objectContaining({ reason: 'profile_malformed' })
    );
    expect(JSON.stringify(warnSpy.mock.calls)).not.toMatch(uid);
    warnSpy.mockRestore();
  });

  test('acknowledges account.updated for a homeowner without writing Stripe fields', async () => {
    const warnSpy = jest.spyOn(logger, 'warn').mockImplementation(() => logger);
    const uid = 'webhook-homeowner-profile';
    writeCollectionDoc('users', uid, { role: 'homeowner', status: 'active' });
    const evt = makeAccountUpdatedEvent(uid);
    const { constructWebhookEvent } = require('../src/services/stripe');
    constructWebhookEvent.mockReturnValueOnce(evt);

    const app = buildWebhookApp();
    const res = await request(app)
      .post('/api/stripe/webhook')
      .set('stripe-signature', 'sig')
      .set('Content-Type', 'application/json')
      .send(Buffer.from(JSON.stringify(evt)));

    expect(res.status).toBe(200);
    expect(readCollectionDoc('users', uid)).toEqual({ role: 'homeowner', status: 'active' });
    expect(autoSvc.scheduleMaybeAutoEnrollFoundingExpert).not.toHaveBeenCalled();
    expect(warnSpy).toHaveBeenCalledWith(
      'stripe_account_updated_skipped',
      expect.objectContaining({ reason: 'profile_not_tradie' })
    );
    warnSpy.mockRestore();
  });

  test('reconciles Stripe fields on a valid inactive tradie without creating a profile', async () => {
    const uid = 'webhook-inactive-tradie';
    writeCollectionDoc('users', uid, { role: 'tradie', status: 'disabled' });
    const evt = makeAccountUpdatedEvent(uid);
    const { constructWebhookEvent } = require('../src/services/stripe');
    constructWebhookEvent.mockReturnValueOnce(evt);

    const app = buildWebhookApp();
    const res = await request(app)
      .post('/api/stripe/webhook')
      .set('stripe-signature', 'sig')
      .set('Content-Type', 'application/json')
      .send(Buffer.from(JSON.stringify(evt)));

    expect(res.status).toBe(200);
    const u = readCollectionDoc('users', uid);
    expect(u.role).toBe('tradie');
    expect(u.status).toBe('disabled');
    expect(u.stripePayoutsEnabled).toBe(true);
    expect(u.stripeOnboardingStatus).toBe('completed');
    expect(autoSvc.scheduleMaybeAutoEnrollFoundingExpert).not.toHaveBeenCalled();
  });
});
