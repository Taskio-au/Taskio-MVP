'use strict';

const { createLogger, format, transports } = require('winston');

function redactValue(value) {
  if (value === null || value === undefined) return value;
  if (typeof value === 'string') {
    return value
      .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, '[REDACTED_EMAIL]')
      .replace(/\b(\+?\d{1,3}[\s-]?)?(\(?\d{2,4}\)?[\s-]?)?\d{3,4}[\s-]?\d{3,4}\b/g, '[REDACTED_PHONE]');
  }
  if (Array.isArray(value)) return value.map((v) => redactValue(v));
  if (typeof value === 'object') {
    const out = {};
    for (const [k, v] of Object.entries(value)) {
      const lower = String(k).toLowerCase();
      if ([
        'authorization',
        'password',
        'token',
        'idtoken',
        'accesstoken',
        'refreshtoken',
        'stripe-signature',
        'stripesignature',
        'stripe_webhook_secret',
        'stripewebhooksecret',
        'stripe_secret_key',
        'stripesecretkey',
        'rawbody',
        'payload',
      ].includes(lower)) {
        out[k] = '[REDACTED]';
      } else {
        out[k] = redactValue(v);
      }
    }
    return out;
  }
  return value;
}

const redactionFormat = format((info) => redactValue(info));

const logger = createLogger({
  level: process.env.LOG_LEVEL || (process.env.NODE_ENV === 'production' ? 'info' : 'debug'),
  defaultMeta: {
    service: 'taskio-backend',
    env: process.env.NODE_ENV || 'development',
  },
  format: format.combine(
    redactionFormat(),
    format.timestamp(),
    format.errors({ stack: true }),
    format.json()
  ),
  transports: [new transports.Console()],
});

function loggerForReq(req) {
  return logger.child({
    requestId: req.requestId || null,
    method: req.method,
    path: req.originalUrl,
    uid: req.user?.uid || null,
  });
}

module.exports = {
  logger,
  loggerForReq,
};
