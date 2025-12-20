'use strict';

function errorHandler(err, req, res, next) {
  // eslint-disable-next-line no-unused-vars
  void next;

  if (err && typeof err.message === 'string' && err.message.startsWith('CORS blocked')) {
    return res.status(403).json({ message: err.message });
  }

  // Avoid leaking internals; log server-side.
  // eslint-disable-next-line no-console
  console.error('Unhandled error:', err);
  return res.status(500).json({ message: 'Internal server error' });
}

module.exports = { errorHandler };


