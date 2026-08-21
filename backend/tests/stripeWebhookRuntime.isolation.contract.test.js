'use strict';

const path = require('path');
const { spawnSync } = require('child_process');
const Stripe = require('stripe');
const request = require('supertest');

const TEST_WEBHOOK_SECRET = 'whsec_test_taskio_isolation';
const AUDIENCE = 'https://taskio-api.example.run.app';

function signedEvent(id = 'evt_iso_1') {
  const event = {
    id,
    object: 'event',
    type: 'payout.failed',
    livemode: false,
    created: Math.floor(Date.now() / 1000),
    data: { object: { id: 'po_iso_1', object: 'payout', status: 'failed' } },
  };
  const payload = JSON.stringify(event);
  const header = Stripe.webhooks.generateTestHeaderString({
    payload,
    secret: TEST_WEBHOOK_SECRET,
  });
  return { payload, header };
}

describe('webhook-only runtime isolation', () => {
  const original = {};
  const envKeys = [
    'STRIPE_ENABLED',
    'STRIPE_WEBHOOK_SECRET',
    'STRIPE_EXPECTED_LIVEMODE',
    'STRIPE_INTERNAL_AUDIENCE',
    'STRIPE_SECRET_KEY',
    'STRIPE_WEBHOOK_PROCESSING_MODE',
  ];

  beforeEach(() => {
    envKeys.forEach((key) => {
      original[key] = process.env[key];
    });
    process.env.STRIPE_ENABLED = 'true';
    process.env.STRIPE_WEBHOOK_SECRET = TEST_WEBHOOK_SECRET;
    process.env.STRIPE_EXPECTED_LIVEMODE = 'false';
    process.env.STRIPE_INTERNAL_AUDIENCE = AUDIENCE;
    delete process.env.STRIPE_SECRET_KEY;
    delete process.env.STRIPE_WEBHOOK_PROCESSING_MODE;
  });

  afterEach(() => {
    envKeys.forEach((key) => {
      if (original[key] === undefined) delete process.env[key];
      else process.env[key] = original[key];
    });
  });

  test('webhookServer import graph excludes Firebase, processors, and private ingest', () => {
    const webhookServerPath = path.join(__dirname, '..', 'src', 'webhookServer.js').replace(/\\/g, '/');
    const script = `
      require(${JSON.stringify(webhookServerPath)});
      const loaded = Object.keys(require.cache).map((p) => p.replace(/\\\\/g, '/'));
      const hits = loaded.filter((p) => (
        p.includes('/firebase-admin/') ||
        p.endsWith('/firebaseAdmin.js') ||
        p.endsWith('/stripeEventProcessor.js') ||
        p.endsWith('/stripeEventHandlers.js') ||
        p.endsWith('/stripeEventClaim.js') ||
        p.endsWith('/internalStripeVerifiedEvent.js') ||
        p.endsWith('/src/server.js') ||
        p.endsWith('/src/app.js')
      ));
      if (hits.length) {
        console.error(hits.join('\\n'));
        process.exit(2);
      }
    `;
    const result = spawnSync(process.execPath, ['-e', script], {
      encoding: 'utf8',
      env: { ...process.env, NODE_ENV: 'test', STRIPE_ENABLED: 'false' },
      cwd: path.join(__dirname, '..'),
    });
    expect(result.status).toBe(0);
    if (result.status !== 0) {
      throw new Error(`${result.stdout}\n${result.stderr}`);
    }
  });

  test('unknown processing mode fails closed without forwarding', async () => {
    process.env.STRIPE_WEBHOOK_PROCESSING_MODE = 'direct';
    const mockForward = jest.fn();
    const { createWebhookApp } = require('../src/webhookApp');
    const app = createWebhookApp({ forwardVerifiedStripeEvent: mockForward });
    const { payload, header } = signedEvent('evt_mode_1');
    const res = await request(app)
      .post('/api/stripe/webhook')
      .set('Stripe-Signature', header)
      .set('Content-Type', 'application/json')
      .send(payload);
    expect(res.status).toBe(500);
    expect(res.body.message).toBe('Webhook handler failed');
    expect(mockForward).not.toHaveBeenCalled();
  });
});
