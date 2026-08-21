'use strict';

const express = require('express');
const helmet = require('helmet');

const { requestContext } = require('./middleware/requestContext');
const stripeWebhookRoutes = require('./routes/stripeWebhook');
const { loggerForReq } = require('./observability/logger');

const WEBHOOK_RAW_BODY_LIMIT = 256 * 1024;

function isPayloadTooLarge(err) {
  if (!err) return false;
  if (err.status === 413 || err.statusCode === 413) return true;
  if (err.type === 'entity.too.large') return true;
  return false;
}

function createWebhookApp() {
  const app = express();
  app.disable('x-powered-by');
  app.use(requestContext);
  app.use(helmet());
  app.use(stripeWebhookRoutes);

  app.use((req, res) => res.status(404).send({ message: 'Not found' }));

  app.use((err, req, res, next) => {
    void next;
    if (isPayloadTooLarge(err)) {
      return res.status(413).send({ message: 'Payload too large' });
    }
    loggerForReq(req).error('webhook_unhandled_error', {
      errorName: err?.name || 'Error',
    });
    return res.status(500).json({ message: 'Webhook handler failed' });
  });

  return app;
}

module.exports = {
  createWebhookApp,
  WEBHOOK_RAW_BODY_LIMIT,
};
