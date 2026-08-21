'use strict';

const express = require('express');
const request = require('supertest');
const { createMemoryFirestore } = require('./helpers/memoryFirestore');

const AUDIENCE = 'https://taskio-api.example.run.app';
const CALLER = 'taskio-stripe-webhook-runtime@example.iam.gserviceaccount.com';

const mockMemory = createMemoryFirestore();
const handlerState = { calls: [], delayMs: 0, fail: null };

jest.mock('../src/firebaseAdmin', () => ({
  admin: mockMemory.admin,
  db: mockMemory.db,
}));

jest.mock('../src/services/stripeEventHandlers', () => ({
  dispatchStripeEventHandlers: jest.fn(async (event) => {
    handlerState.calls.push(event.id);
    if (typeof handlerState.delayMs === 'number' && handlerState.delayMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, handlerState.delayMs));
    }
    if (handlerState.fail) {
      throw new Error(handlerState.fail);
    }
  }),
  handleOperationalStripeEvent: jest.fn(async () => false),
}));

const { createInternalStripeVerifiedEventRouter } = require('../src/routes/internalStripeVerifiedEvent');
const { claimStripeEvent, settleStripeEvent } = require('../src/services/stripeEventClaim');
const { dispatchStripeEventHandlers } = require('../src/services/stripeEventHandlers');

function eventFor(id) {
  return {
    id,
    object: 'event',
    type: 'payout.failed',
    livemode: false,
    data: { object: { id: `obj_${id}`, object: 'payout' } },
  };
}

function buildApp() {
  const app = express();
  app.use(createInternalStripeVerifiedEventRouter({
    verifyIdToken: async () => ({
      iss: 'https://accounts.google.com',
      aud: AUDIENCE,
      email: CALLER,
      email_verified: true,
    }),
  }));
  return app;
}

function post(app, event) {
  return request(app)
    .post('/internal/stripe/verified-event')
    .set('Authorization', 'Bearer test-oidc')
    .set('Content-Type', 'application/json')
    .send(event);
}

describe('internal ingest uses Phase 1 stripe_events claim', () => {
  const original = {};
  const envKeys = [
    'STRIPE_ENABLED',
    'STRIPE_EXPECTED_LIVEMODE',
    'STRIPE_INTERNAL_AUDIENCE',
    'STRIPE_WEBHOOK_CALLER_SERVICE_ACCOUNT',
  ];

  beforeAll(() => {
    envKeys.forEach((key) => {
      original[key] = process.env[key];
    });
  });

  afterAll(() => {
    envKeys.forEach((key) => {
      if (original[key] === undefined) delete process.env[key];
      else process.env[key] = original[key];
    });
  });

  beforeEach(() => {
    mockMemory.reset();
    handlerState.calls = [];
    handlerState.delayMs = 0;
    handlerState.fail = null;
    dispatchStripeEventHandlers.mockClear();
    process.env.STRIPE_ENABLED = 'true';
    process.env.STRIPE_EXPECTED_LIVEMODE = 'false';
    process.env.STRIPE_INTERNAL_AUDIENCE = AUDIENCE;
    process.env.STRIPE_WEBHOOK_CALLER_SERVICE_ACCOUNT = CALLER;
  });

  test('first valid event is processed', async () => {
    const res = await post(buildApp(), eventFor('evt_int_a'));
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ received: true });
    expect(handlerState.calls).toEqual(['evt_int_a']);
    expect(mockMemory.store('stripe_events').get('evt_int_a').processingState).toBe('processed');
  });

  test('duplicate processed event returns 200 without handler replay', async () => {
    const app = buildApp();
    await post(app, eventFor('evt_int_b'));
    handlerState.calls = [];
    const res = await post(app, eventFor('evt_int_b'));
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ received: true, duplicate: true });
    expect(handlerState.calls).toEqual([]);
  });

  test('concurrent same event runs the handler once; other is in-flight 503', async () => {
    const app = buildApp();
    handlerState.delayMs = 40;
    const first = post(app, eventFor('evt_int_c'));
    await new Promise((resolve) => setTimeout(resolve, 10));
    const second = post(app, eventFor('evt_int_c'));
    const results = await Promise.all([first, second]);
    const statuses = results.map((r) => r.status).sort();
    expect(handlerState.calls).toEqual(['evt_int_c']);
    expect(statuses).toEqual([200, 503]);
  });

  test('failed event can be retried per Phase 1 claim rules', async () => {
    const app = buildApp();
    handlerState.fail = 'handler boom';
    const failed = await post(app, eventFor('evt_int_e'));
    expect(failed.status).toBe(500);
    expect(mockMemory.store('stripe_events').get('evt_int_e').processingState).toBe('failed');
    handlerState.fail = null;
    const retry = await post(app, eventFor('evt_int_e'));
    expect(retry.status).toBe(200);
    expect(mockMemory.store('stripe_events').get('evt_int_e').processingState).toBe('processed');
  });

  test('stale claim protection remains intact', async () => {
    const oldClaim = await claimStripeEvent(eventFor('evt_int_f'), {
      nowMs: 1_000,
      leaseMs: 10,
      claimId: 'worker-a',
    });
    expect(oldClaim.claimId).toBe('worker-a');
    const newer = await claimStripeEvent(eventFor('evt_int_f'), {
      nowMs: 1_020,
      leaseMs: 60_000,
      claimId: 'worker-b',
    });
    expect(newer.claimId).toBe('worker-b');
    const stale = await settleStripeEvent({
      eventId: 'evt_int_f',
      claimId: 'worker-a',
      result: 'processed',
    });
    expect(stale.outcome).toBe('stale');
    expect(mockMemory.store('stripe_events').get('evt_int_f').claimId).toBe('worker-b');
    expect(mockMemory.store('stripe_events').get('evt_int_f').processingState).toBe('processing');
  });
});
