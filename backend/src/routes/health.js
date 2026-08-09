'use strict';

const express = require('express');
const { db } = require('../firebaseAdmin');
const { getExpectedStripeLivemode } = require('../services/stripe');

const router = express.Router();

async function withTimeout(promise, timeoutMs) {
  let timer = null;
  try {
    return await Promise.race([
      promise,
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error(`timeout_after_${timeoutMs}ms`)), timeoutMs);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function getReadiness() {
  const expectedStripeLivemode = getExpectedStripeLivemode();
  const checks = {
    firestore: { ok: false },
    stripe: {
      ok: process.env.STRIPE_ENABLED !== 'true'
        || (
          Boolean(process.env.STRIPE_SECRET_KEY)
          && Boolean(process.env.STRIPE_WEBHOOK_SECRET)
          && Boolean(process.env.FRONTEND_URL)
          && expectedStripeLivemode !== null
        ),
      enabled: process.env.STRIPE_ENABLED === 'true',
      livemode: expectedStripeLivemode,
    },
    env: {
      ok: (process.env.NODE_ENV || 'development') !== 'production'
        || (
          Boolean(String(process.env.CORS_ORIGINS || '').trim())
          && Boolean(String(process.env.TRUST_PROXY || '').trim())
          && Boolean(String(process.env.ALERT_WEBHOOK_URL || '').trim())
          && Boolean(String(process.env.OTP_SALT || '').trim())
          && String(process.env.TASKIO_SHOW_DEV_OTP || '').toLowerCase() !== 'true'
        ),
    },
  };

  try {
    await withTimeout(db.collection('_health').limit(1).get(), 3000);
    checks.firestore = { ok: true };
  } catch (error) {
    checks.firestore = { ok: false, error: error.message };
  }

  const ok = Object.values(checks).every((check) => check.ok !== false);
  return { ok, checks };
}

function buildBasePayload(req) {
  return {
    service: 'taskio-backend',
    env: process.env.NODE_ENV || 'development',
    uptimeSec: Math.round(process.uptime()),
    timestamp: new Date().toISOString(),
    requestId: req.requestId || null,
  };
}

router.get('/health/live', (req, res) => res.status(200).json({
  ok: true,
  ...buildBasePayload(req),
}));

router.get('/health/ready', async (req, res) => {
  const readiness = await getReadiness();
  return res.status(readiness.ok ? 200 : 503).json({
    ...buildBasePayload(req),
    ...readiness,
  });
});

router.get('/health', async (req, res) => {
  const readiness = await getReadiness();
  return res.status(readiness.ok ? 200 : 503).json({
    ...buildBasePayload(req),
    ...readiness,
  });
});

router.get('/health/metrics', (req, res) => {
  const mem = process.memoryUsage();
  return res.status(200).json({
    process: {
      rss: mem.rss,
      heapTotal: mem.heapTotal,
      heapUsed: mem.heapUsed,
      external: mem.external,
    },
    uptimeSec: Math.round(process.uptime()),
    timestamp: new Date().toISOString(),
    requestId: req.requestId || null,
  });
});

router.get('/', (req, res) => {
  res.send('Taskio Backend is running and connected to Firebase!');
});

module.exports = router;


