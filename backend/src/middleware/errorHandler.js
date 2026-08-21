'use strict';

const { loggerForReq } = require('../observability/logger');
const { sendCriticalAlert } = require('../observability/alerts');

function errorHandler(err, req, res, next) {
  // eslint-disable-next-line no-unused-vars
  void next;

  if (err && typeof err.message === 'string' && err.message.startsWith('CORS blocked')) {
    return res.status(403).json({ message: err.message });
  }

  if (err && (err.status === 413 || err.statusCode === 413 || err.type === 'entity.too.large')) {
    return res.status(413).json({ message: 'Payload too large' });
  }

  // Avoid leaking internals; log server-side with request context.
  const reqLogger = loggerForReq(req);
  reqLogger.error('unhandled_error', {
    errorName: err?.name || 'Error',
    message: err?.message || 'Internal error',
    stack: err?.stack || null,
  });

  // Optional alerting webhook for operations.
  sendCriticalAlert({
    title: 'Taskio unhandled backend error',
    message: err?.message || 'Unhandled error',
    requestId: req.requestId,
    path: req.originalUrl,
    error: err?.stack || err?.message,
  }).catch(() => {});

  return res.status(500).json({
    message: 'Internal server error',
    requestId: req.requestId || null,
  });
}

module.exports = { errorHandler };


