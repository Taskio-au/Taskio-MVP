'use strict';

const axios = require('axios');
const { logger } = require('./logger');

async function sendCriticalAlert({ title, message, requestId, path, error }) {
  const webhook = String(process.env.ALERT_WEBHOOK_URL || '').trim();
  if (!webhook) return;

  try {
    await axios.post(
      webhook,
      {
        title: title || 'Taskio critical error',
        message: message || 'Unhandled backend error',
        requestId: requestId || null,
        path: path || null,
        error: error ? String(error).slice(0, 1000) : null,
        at: new Date().toISOString(),
      },
      {
        timeout: 3000,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  } catch (e) {
    logger.warn('alert_webhook_failed', {
      reason: e?.message || 'unknown_error',
    });
  }
}

module.exports = {
  sendCriticalAlert,
};
