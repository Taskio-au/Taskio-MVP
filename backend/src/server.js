'use strict';

if (process.env.NODE_ENV !== 'test') {
  require('dotenv').config();
}

const { validateEnv } = require('./config/validateEnv');
const { createApp } = require('./app');
const { logger } = require('./observability/logger');

validateEnv();

const app = createApp();
const port = process.env.PORT || 8000;

const server = app.listen(port, () => {
  logger.info('server_started', { port });
});

function shutdown(signal) {
  logger.warn('server_shutdown_requested', { signal });
  server.close((error) => {
    if (error) {
      logger.error('server_shutdown_failed', { signal, error: error.message });
      process.exit(1);
      return;
    }
    logger.info('server_shutdown_complete', { signal });
    process.exit(0);
  });

  setTimeout(() => {
    logger.error('server_shutdown_timed_out', { signal });
    process.exit(1);
  }, 10000).unref();
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

