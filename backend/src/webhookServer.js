'use strict';

if (process.env.NODE_ENV !== 'test') {
  require('dotenv').config();
}

const { validateWebhookRuntimeEnv } = require('./config/stripeWebhookRuntime');
const { createWebhookApp } = require('./webhookApp');
const { logger } = require('./observability/logger');

function startWebhookServer() {
  validateWebhookRuntimeEnv();

  const app = createWebhookApp();
  const port = Number(process.env.PORT) || 8080;

  const server = app.listen(port, () => {
    logger.info('webhook_server_started', { port });
  });

  function shutdown(signal) {
    logger.warn('webhook_server_shutdown_requested', { signal });
    server.close((error) => {
      if (error) {
        logger.error('webhook_server_shutdown_failed', { signal, error: error.message });
        process.exit(1);
        return;
      }
      logger.info('webhook_server_shutdown_complete', { signal });
      process.exit(0);
    });

    setTimeout(() => {
      logger.error('webhook_server_shutdown_timed_out', { signal });
      process.exit(1);
    }, 10000).unref();
  }

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));

  return server;
}

if (require.main === module) {
  startWebhookServer();
}

module.exports = { startWebhookServer };
