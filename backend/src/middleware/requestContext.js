'use strict';

const crypto = require('crypto');
const { logger } = require('../observability/logger');

function requestContext(req, res, next) {
  const incoming = String(req.headers['x-request-id'] || '').trim();
  const requestId = incoming || crypto.randomUUID();
  req.requestId = requestId;
  res.setHeader('x-request-id', requestId);

  const start = process.hrtime.bigint();

  res.on('finish', () => {
    const elapsedNs = Number(process.hrtime.bigint() - start);
    const durationMs = Math.round((elapsedNs / 1e6) * 100) / 100;

    logger.info('http_request', {
      requestId,
      method: req.method,
      path: req.originalUrl,
      statusCode: res.statusCode,
      durationMs,
      ip: req.ip || null,
      userAgent: req.headers['user-agent'] || null,
      uid: req.user?.uid || null,
    });
  });

  next();
}

module.exports = {
  requestContext,
};
