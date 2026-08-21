'use strict';

const express = require('express');
const request = require('supertest');
const { createMemoryFirestore } = require('./helpers/memoryFirestore');

const AUDIENCE = 'https://taskio-api.example.run.app';
const CALLER = 'taskio-stripe-webhook-runtime@example.iam.gserviceaccount.com';
const TOKEN = 'google-oidc-token-VALUE-must-not-leak';

const mockMemory = createMemoryFirestore();
const mockVerifyIdToken = jest.fn();
const mockFirebaseVerifyIdToken = jest.fn();
const logCalls = [];

jest.mock('../src/firebaseAdmin', () => ({
  admin: {
    ...mockMemory.admin,
    auth: jest.fn(() => ({ verifyIdToken: mockFirebaseVerifyIdToken })),
  },
  db: mockMemory.db,
}));

jest.mock('../src/services/googleIdTokenVerifier', () => ({
  verifyGoogleIdToken: (...args) => mockVerifyIdToken(...args),
}));

jest.mock('../src/services/stripeEventHandlers', () => ({
  dispatchStripeEventHandlers: jest.fn(async () => undefined),
  handleOperationalStripeEvent: jest.fn(async () => false),
}));

jest.mock('../src/observability/logger', () => {
  const record = (level, ...args) => {
    logCalls.push({ level, args });
  };
  const child = {
    info: (...args) => record('info', ...args),
    warn: (...args) => record('warn', ...args),
    error: (...args) => record('error', ...args),
  };
  return {
    logger: child,
    loggerForReq: () => child,
  };
});

const { createInternalStripeVerifiedEventRouter, INTERNAL_EVENT_JSON_LIMIT } = require('../src/routes/internalStripeVerifiedEvent');
const { createWebhookApp } = require('../src/webhookApp');
const { createApp } = require('../src/app');
const { dispatchStripeEventHandlers } = require('../src/services/stripeEventHandlers');

function validEvent(overrides = {}) {
  return {
    id: 'evt_internal_1',
    object: 'event',
    type: 'payout.failed',
    livemode: false,
    data: { object: { id: 'po_1', object: 'payout', status: 'failed' } },
    ...overrides,
  };
}

function validGooglePayload(overrides = {}) {
  return {
    iss: 'https://accounts.google.com',
    aud: AUDIENCE,
    email: CALLER,
    email_verified: true,
    ...overrides,
  };
}

function buildApp() {
  const app = express();
  app.use(createInternalStripeVerifiedEventRouter({ verifyIdToken: mockVerifyIdToken }));
  return app;
}

async function postEvent(app, event, { token = TOKEN, contentType = 'application/json' } = {}) {
  const req = request(app)
    .post('/internal/stripe/verified-event')
    .set('Content-Type', contentType);
  if (token !== null) req.set('Authorization', `Bearer ${token}`);
  return req.send(event);
}

describe('internal Stripe verified-event ingest', () => {
  const original = {};
  const envKeys = [
    'STRIPE_ENABLED',
    'STRIPE_EXPECTED_LIVEMODE',
    'STRIPE_INTERNAL_AUDIENCE',
    'STRIPE_WEBHOOK_CALLER_SERVICE_ACCOUNT',
    'STRIPE_SECRET_KEY',
    'STRIPE_WEBHOOK_SECRET',
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
    mockVerifyIdToken.mockReset();
    mockFirebaseVerifyIdToken.mockReset();
    dispatchStripeEventHandlers.mockClear();
    logCalls.length = 0;
    process.env.STRIPE_ENABLED = 'true';
    process.env.STRIPE_EXPECTED_LIVEMODE = 'false';
    process.env.STRIPE_INTERNAL_AUDIENCE = AUDIENCE;
    process.env.STRIPE_WEBHOOK_CALLER_SERVICE_ACCOUNT = CALLER;
    delete process.env.STRIPE_SECRET_KEY;
    delete process.env.STRIPE_WEBHOOK_SECRET;
    mockVerifyIdToken.mockResolvedValue(validGooglePayload());
  });

  test('STRIPE_ENABLED=false returns 404 without calling verifier or processing', async () => {
    process.env.STRIPE_ENABLED = 'false';
    const res = await postEvent(buildApp(), validEvent());
    expect(res.status).toBe(404);
    expect(res.body.message).toBe('Not found');
    expect(mockVerifyIdToken).not.toHaveBeenCalled();
    expect(dispatchStripeEventHandlers).not.toHaveBeenCalled();
    expect(mockMemory.store('stripe_events').size).toBe(0);
  });

  test('missing Authorization returns 401 and writes nothing', async () => {
    const res = await postEvent(buildApp(), validEvent(), { token: null });
    expect(res.status).toBe(401);
    expect(mockVerifyIdToken).not.toHaveBeenCalled();
    expect(dispatchStripeEventHandlers).not.toHaveBeenCalled();
    expect(mockMemory.store('stripe_events').size).toBe(0);
  });

  test('malformed Authorization is rejected', async () => {
    const res = await request(buildApp())
      .post('/internal/stripe/verified-event')
      .set('Authorization', 'Basic abc')
      .set('Content-Type', 'application/json')
      .send(validEvent());
    expect(res.status).toBe(401);
    expect(mockVerifyIdToken).not.toHaveBeenCalled();
    expect(mockMemory.store('stripe_events').size).toBe(0);
  });

  test('invalid Google ID token is rejected', async () => {
    mockVerifyIdToken.mockRejectedValueOnce(new Error('invalid token'));
    const res = await postEvent(buildApp(), validEvent());
    expect(res.status).toBe(401);
    expect(dispatchStripeEventHandlers).not.toHaveBeenCalled();
    expect(mockMemory.store('stripe_events').size).toBe(0);
  });

  test('valid token with wrong audience is rejected', async () => {
    mockVerifyIdToken.mockResolvedValueOnce(validGooglePayload({ aud: 'https://other.example.run.app' }));
    const res = await postEvent(buildApp(), validEvent());
    expect(res.status).toBe(403);
    expect(dispatchStripeEventHandlers).not.toHaveBeenCalled();
    expect(mockMemory.store('stripe_events').size).toBe(0);
  });

  test('valid token with wrong caller service-account email is rejected', async () => {
    mockVerifyIdToken.mockResolvedValueOnce(validGooglePayload({
      email: 'other@example.iam.gserviceaccount.com',
    }));
    const res = await postEvent(buildApp(), validEvent());
    expect(res.status).toBe(403);
    expect(dispatchStripeEventHandlers).not.toHaveBeenCalled();
    expect(mockMemory.store('stripe_events').size).toBe(0);
  });

  test('expired token is rejected', async () => {
    const expired = new Error('Token used too late');
    expired.message = 'Token used too late, 1234567890 < 1234567800';
    mockVerifyIdToken.mockRejectedValueOnce(expired);
    const res = await postEvent(buildApp(), validEvent());
    expect(res.status).toBe(401);
    expect(dispatchStripeEventHandlers).not.toHaveBeenCalled();
    expect(mockMemory.store('stripe_events').size).toBe(0);
  });

  test('valid expected Google service identity authenticates and processes', async () => {
    const res = await postEvent(buildApp(), validEvent());
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ received: true });
    expect(mockVerifyIdToken).toHaveBeenCalledWith(TOKEN, AUDIENCE);
    expect(mockFirebaseVerifyIdToken).not.toHaveBeenCalled();
    expect(dispatchStripeEventHandlers).toHaveBeenCalledTimes(1);
  });

  test('Firebase user tokens cannot satisfy internal service identity', async () => {
    mockVerifyIdToken.mockRejectedValueOnce(new Error('wrong issuer'));
    const res = await postEvent(buildApp(), validEvent(), { token: 'firebase-user-id-token' });
    expect(res.status).toBe(401);
    expect(mockFirebaseVerifyIdToken).not.toHaveBeenCalled();
    expect(dispatchStripeEventHandlers).not.toHaveBeenCalled();
  });

  test('token value never appears in logs', async () => {
    await postEvent(buildApp(), validEvent());
    mockVerifyIdToken.mockRejectedValueOnce(new Error('invalid'));
    await postEvent(buildApp(), validEvent({ id: 'evt_internal_fail' }));
    const serialized = JSON.stringify(logCalls);
    expect(serialized).not.toContain(TOKEN);
    expect(serialized).not.toMatch(/Bearer /i);
  });

  test('malformed JSON returns 400', async () => {
    const res = await request(buildApp())
      .post('/internal/stripe/verified-event')
      .set('Authorization', `Bearer ${TOKEN}`)
      .set('Content-Type', 'application/json')
      .send('{"object":');
    expect(res.status).toBe(400);
    expect(res.body.message).toBe('Invalid JSON');
    expect(dispatchStripeEventHandlers).not.toHaveBeenCalled();
    expect(mockMemory.store('stripe_events').size).toBe(0);
  });

  test('object != event returns 400', async () => {
    const res = await postEvent(buildApp(), validEvent({ object: 'payment_intent' }));
    expect(res.status).toBe(400);
    expect(mockMemory.store('stripe_events').size).toBe(0);
  });

  test('missing id returns 400', async () => {
    const event = validEvent();
    delete event.id;
    const res = await postEvent(buildApp(), event);
    expect(res.status).toBe(400);
    expect(mockMemory.store('stripe_events').size).toBe(0);
  });

  test('missing type returns 400', async () => {
    const event = validEvent();
    delete event.type;
    const res = await postEvent(buildApp(), event);
    expect(res.status).toBe(400);
    expect(mockMemory.store('stripe_events').size).toBe(0);
  });

  test('non-boolean livemode returns 400', async () => {
    const res = await postEvent(buildApp(), validEvent({ livemode: 'false' }));
    expect(res.status).toBe(400);
    expect(mockMemory.store('stripe_events').size).toBe(0);
  });

  test('missing data.object returns 400', async () => {
    const res = await postEvent(buildApp(), validEvent({ data: {} }));
    expect(res.status).toBe(400);
    expect(mockMemory.store('stripe_events').size).toBe(0);
  });

  test('body above 256kb returns 413', async () => {
    const oversized = validEvent({
      type: `payout.failed${'x'.repeat(INTERNAL_EVENT_JSON_LIMIT)}`,
    });
    const res = await postEvent(buildApp(), oversized);
    expect(res.status).toBe(413);
    expect(res.body.message).toBe('Payload too large');
    expect(dispatchStripeEventHandlers).not.toHaveBeenCalled();
    expect(mockMemory.store('stripe_events').size).toBe(0);
  });

  test('wrong livemode returns 400 without claiming', async () => {
    const res = await postEvent(buildApp(), validEvent({ livemode: true }));
    expect(res.status).toBe(400);
    expect(res.body.message).toBe('Stripe livemode mismatch');
    expect(dispatchStripeEventHandlers).not.toHaveBeenCalled();
    expect(mockMemory.store('stripe_events').size).toBe(0);
  });

  test('unsupported valid event type is authenticated and dispatched once', async () => {
    const res = await postEvent(buildApp(), validEvent({
      id: 'evt_unknown_1',
      type: 'radar.early_fraud_warning.created',
    }));
    expect(res.status).toBe(200);
    expect(dispatchStripeEventHandlers).toHaveBeenCalledTimes(1);
    expect(dispatchStripeEventHandlers.mock.calls[0][0].type).toBe('radar.early_fraud_warning.created');
  });

  test('createWebhookApp does not expose the internal ingest route', async () => {
    const res = await request(createWebhookApp())
      .post('/internal/stripe/verified-event')
      .set('Authorization', `Bearer ${TOKEN}`)
      .set('Content-Type', 'application/json')
      .send(validEvent());
    expect(res.status).toBe(404);
    expect(mockVerifyIdToken).not.toHaveBeenCalled();
    expect(dispatchStripeEventHandlers).not.toHaveBeenCalled();
  });

  test('createApp mounts the internal ingest route', async () => {
    const res = await postEvent(createApp(), validEvent({ id: 'evt_create_app_1' }));
    expect(res.status).toBe(200);
    expect(res.body.received).toBe(true);
    expect(dispatchStripeEventHandlers).toHaveBeenCalledTimes(1);
  });
});
