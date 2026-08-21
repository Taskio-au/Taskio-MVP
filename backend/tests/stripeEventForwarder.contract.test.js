'use strict';

const Stripe = require('stripe');
const request = require('supertest');

const AUDIENCE = 'https://taskio-api.example.run.app';
const INGEST_URL = `${AUDIENCE}/internal/stripe/verified-event`;
const TOKEN = 'google-oidc-token-VALUE-must-not-leak';
const TEST_WEBHOOK_SECRET = 'whsec_test_taskio_forwarder';
const PRIVATE_LEAK = 'private-ingest-body-must-not-leak';

const logCalls = [];

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

const { createWebhookApp } = require('../src/webhookApp');
const { forwardVerifiedStripeEvent, mapInternalStatusToPublic } = require('../src/services/stripeEventForwarder');

function validEvent(overrides = {}) {
  return {
    id: 'evt_fwd_1',
    object: 'event',
    type: 'payment_intent.succeeded',
    livemode: false,
    created: Math.floor(Date.now() / 1000),
    data: { object: { id: 'pi_fwd_1', object: 'payment_intent', status: 'succeeded' } },
    destination: 'https://attacker.example/steal',
    ...overrides,
  };
}

function signedPayload(event) {
  const payload = JSON.stringify(event);
  const header = Stripe.webhooks.generateTestHeaderString({
    payload,
    secret: TEST_WEBHOOK_SECRET,
  });
  return { payload, header };
}

function serializedLogs() {
  return JSON.stringify(logCalls);
}

describe('Stripe verified-event forwarder', () => {
  const original = {};
  const envKeys = [
    'STRIPE_ENABLED',
    'STRIPE_WEBHOOK_SECRET',
    'STRIPE_EXPECTED_LIVEMODE',
    'STRIPE_INTERNAL_AUDIENCE',
    'STRIPE_SECRET_KEY',
  ];

  beforeEach(() => {
    logCalls.length = 0;
    envKeys.forEach((key) => {
      original[key] = process.env[key];
    });
    process.env.STRIPE_ENABLED = 'true';
    process.env.STRIPE_WEBHOOK_SECRET = TEST_WEBHOOK_SECRET;
    process.env.STRIPE_EXPECTED_LIVEMODE = 'false';
    process.env.STRIPE_INTERNAL_AUDIENCE = AUDIENCE;
    delete process.env.STRIPE_SECRET_KEY;
  });

  afterEach(() => {
    envKeys.forEach((key) => {
      if (original[key] === undefined) delete process.env[key];
      else process.env[key] = original[key];
    });
  });

  test('obtains an ID token for the exact audience and POSTs the event once', async () => {
    const event = validEvent();
    const fetchIdToken = jest.fn(async (audience) => {
      expect(audience).toBe(AUDIENCE);
      return TOKEN;
    });
    const fetchImpl = jest.fn(async (url, init) => {
      expect(url).toBe(INGEST_URL);
      expect(init.method).toBe('POST');
      expect(init.headers.Authorization).toBe(`Bearer ${TOKEN}`);
      expect(init.headers['Content-Type']).toBe('application/json');
      const body = JSON.parse(init.body);
      expect(body.id).toBe(event.id);
      expect(body.type).toBe(event.type);
      expect(body.livemode).toBe(false);
      expect(body.data.object.id).toBe('pi_fwd_1');
      return { status: 200, text: async () => '{"received":true}' };
    });

    const result = await forwardVerifiedStripeEvent(event, {
      fetch: fetchImpl,
      fetchIdToken,
    });

    expect(result).toEqual({ httpStatus: 200, body: { received: true } });
    expect(fetchIdToken).toHaveBeenCalledTimes(1);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(serializedLogs()).not.toContain(TOKEN);
  });

  test('does not send to a client-supplied destination', async () => {
    const fetchIdToken = jest.fn(async () => TOKEN);
    const fetchImpl = jest.fn(async (url) => {
      expect(url).toBe(INGEST_URL);
      expect(url).not.toContain('attacker.example');
      return { status: 200 };
    });
    await forwardVerifiedStripeEvent(validEvent({
      forwardUrl: 'https://attacker.example/steal',
      ingestUrl: 'https://attacker.example/steal',
    }), { fetch: fetchImpl, fetchIdToken });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  test('fails closed when audience is not configured', async () => {
    delete process.env.STRIPE_INTERNAL_AUDIENCE;
    const fetchIdToken = jest.fn();
    const fetchImpl = jest.fn();
    await expect(forwardVerifiedStripeEvent(validEvent(), {
      fetch: fetchImpl,
      fetchIdToken,
    })).rejects.toMatchObject({
      code: 'stripe_internal_audience_not_configured',
      httpStatus: 503,
    });
    expect(fetchIdToken).not.toHaveBeenCalled();
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  test('token fetch failure is retryable and does not log a token', async () => {
    const fetchIdToken = jest.fn(async () => {
      throw new Error(`failed before token ${TOKEN}`);
    });
    const fetchImpl = jest.fn();
    await expect(forwardVerifiedStripeEvent(validEvent(), {
      fetch: fetchImpl,
      fetchIdToken,
    })).rejects.toMatchObject({
      httpStatus: 503,
      code: 'google_id_token_unavailable',
    });
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(serializedLogs()).not.toContain(TOKEN);
  });

  test('internal timeout is retryable and does not retry automatically', async () => {
    const fetchIdToken = jest.fn(async () => TOKEN);
    const fetchImpl = jest.fn(async (_url, init) => new Promise((_, reject) => {
      init.signal.addEventListener('abort', () => {
        const err = new Error('aborted');
        err.name = 'AbortError';
        reject(err);
      });
    }));

    await expect(forwardVerifiedStripeEvent(validEvent(), {
      fetch: fetchImpl,
      fetchIdToken,
      timeoutMs: 20,
    })).rejects.toMatchObject({
      httpStatus: 503,
      code: 'stripe_forward_timeout',
    });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(serializedLogs()).not.toContain(TOKEN);
  });

  test.each([
    [200, 200, { received: true }],
    [503, 503, { message: 'Webhook handler busy' }],
    [500, 500, { message: 'Webhook handler failed' }],
    [401, 503, { message: 'Webhook handler failed' }],
    [403, 503, { message: 'Webhook handler failed' }],
    [400, 400, { message: 'Invalid event' }],
  ])('internal %s maps to public %s without leaking the private body', async (internalStatus, publicStatus, body) => {
    expect(mapInternalStatusToPublic(internalStatus)).toEqual({ httpStatus: publicStatus, body });

    const fetchIdToken = jest.fn(async () => TOKEN);
    const fetchImpl = jest.fn(async () => ({
      status: internalStatus,
      text: async () => PRIVATE_LEAK,
      json: async () => ({ message: PRIVATE_LEAK, details: 'stack' }),
    }));
    const result = await forwardVerifiedStripeEvent(validEvent(), { fetch: fetchImpl, fetchIdToken });
    expect(result.httpStatus).toBe(publicStatus);
    expect(result.body).toEqual(body);
    expect(JSON.stringify(result)).not.toContain(PRIVATE_LEAK);
    expect(serializedLogs()).not.toContain(TOKEN);
    expect(serializedLogs()).not.toContain(PRIVATE_LEAK);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });
});

describe('public webhook HTTP mapping', () => {
  const original = {};
  const envKeys = [
    'STRIPE_ENABLED',
    'STRIPE_WEBHOOK_SECRET',
    'STRIPE_EXPECTED_LIVEMODE',
    'STRIPE_INTERNAL_AUDIENCE',
  ];

  beforeEach(() => {
    logCalls.length = 0;
    envKeys.forEach((key) => {
      original[key] = process.env[key];
    });
    process.env.STRIPE_ENABLED = 'true';
    process.env.STRIPE_WEBHOOK_SECRET = TEST_WEBHOOK_SECRET;
    process.env.STRIPE_EXPECTED_LIVEMODE = 'false';
    process.env.STRIPE_INTERNAL_AUDIENCE = AUDIENCE;
  });

  afterEach(() => {
    envKeys.forEach((key) => {
      if (original[key] === undefined) delete process.env[key];
      else process.env[key] = original[key];
    });
  });

  async function postWithForwarder(forwardImpl) {
    const app = createWebhookApp({ forwardVerifiedStripeEvent: forwardImpl });
    const { payload, header } = signedPayload(validEvent());
    return request(app)
      .post('/api/stripe/webhook')
      .set('Stripe-Signature', header)
      .set('Content-Type', 'application/json')
      .send(payload);
  }

  test('internal 200 -> public 200', async () => {
    const res = await postWithForwarder(async () => ({ httpStatus: 200, body: { received: true } }));
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ received: true });
  });

  test('internal 503 -> public 503', async () => {
    const res = await postWithForwarder(async () => ({
      httpStatus: 503,
      body: { message: 'Webhook handler busy' },
    }));
    expect(res.status).toBe(503);
    expect(res.body.message).toBe('Webhook handler busy');
    expect(res.text).not.toContain(PRIVATE_LEAK);
  });

  test('internal 500 -> public 5xx', async () => {
    const res = await postWithForwarder(async () => ({
      httpStatus: 500,
      body: { message: 'Webhook handler failed' },
    }));
    expect(res.status).toBe(500);
    expect(res.body.message).toBe('Webhook handler failed');
  });

  test('token/network failure -> public 503 without leaking details', async () => {
    const err = new Error(`token ${TOKEN} failed`);
    err.httpStatus = 503;
    err.code = 'google_id_token_unavailable';
    const res = await postWithForwarder(async () => {
      throw err;
    });
    expect(res.status).toBe(503);
    expect(res.body.message).toBe('Webhook handler failed');
    expect(res.text).not.toContain(TOKEN);
    expect(serializedLogs()).not.toContain(TOKEN);
  });

  test('internal 400 -> public 400 fail closed', async () => {
    const res = await postWithForwarder(async () => ({
      httpStatus: 400,
      body: { message: 'Invalid event' },
    }));
    expect(res.status).toBe(400);
    expect(res.body.message).toBe('Invalid event');
  });
});
