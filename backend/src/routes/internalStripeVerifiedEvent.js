'use strict';

/**
 * Future A2 second-hop contract (not implemented here):
 *
 * POST {TASKIO_API_CLOUD_RUN_URL}/internal/stripe/verified-event
 * Authorization: Bearer <Google ID token from ADC / runtime SA>
 * Audience: the base private taskio-api Cloud Run URL (not this path)
 * Content-Type: application/json
 * Body: HMAC-verified parsed Stripe Event object
 *
 * Do not use downloaded SA keys, Firebase user tokens, or shared API passwords.
 */

const express = require('express');

const { isStripeEnabled } = require('../config/stripeEnabled');
const { getExpectedStripeLivemode } = require('../config/stripeLivemode');
const { processVerifiedStripeEvent } = require('../services/stripeEventProcessor');
const { createVerifyInternalServiceIdentity } = require('../middleware/verifyInternalServiceIdentity');
const { logger, loggerForReq } = require('../observability/logger');

const INTERNAL_EVENT_JSON_LIMIT = 256 * 1024;

function isStripeEventId(value) {
  return typeof value === 'string' && /^evt_[A-Za-z0-9_]+$/.test(value);
}

function validateForwardedStripeEvent(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return { ok: false };
  }
  if (body.object !== 'event') return { ok: false };
  if (!isStripeEventId(body.id)) return { ok: false };
  if (typeof body.type !== 'string' || body.type.length === 0 || body.type !== body.type.trim()) {
    return { ok: false };
  }
  if (typeof body.livemode !== 'boolean') return { ok: false };
  if (!body.data || typeof body.data !== 'object' || Array.isArray(body.data)) {
    return { ok: false };
  }
  if (!body.data.object || typeof body.data.object !== 'object' || Array.isArray(body.data.object)) {
    return { ok: false };
  }
  return { ok: true };
}

function clientErrorMessage(err) {
  if (err && (err.code === 'stripe_livemode_mismatch' || err.code === 'stripe_livemode_not_configured')) {
    return 'Stripe livemode mismatch';
  }
  return null;
}

function createInternalStripeVerifiedEventRouter(options = {}) {
  const router = express.Router();
  const verifyIdentity = createVerifyInternalServiceIdentity({
    verifyIdToken: options.verifyIdToken,
  });

  router.post(
    '/internal/stripe/verified-event',
    (req, res, next) => {
      if (!isStripeEnabled()) {
        return res.status(404).send({ message: 'Not found' });
      }
      return next();
    },
    express.json({ limit: INTERNAL_EVENT_JSON_LIMIT }),
    verifyIdentity,
    async (req, res) => {
      try {
        if (!validateForwardedStripeEvent(req.body).ok) {
          loggerForReq(req).warn('internal_stripe_ingest_rejected', { reason: 'invalid_event' });
          return res.status(400).json({ message: 'Invalid event' });
        }

        const expectedLivemode = getExpectedStripeLivemode();
        if (expectedLivemode !== true && expectedLivemode !== false) {
          loggerForReq(req).warn('internal_stripe_ingest_rejected', { reason: 'livemode_not_configured' });
          return res.status(400).send({ message: 'Stripe livemode mismatch' });
        }
        if (req.body.livemode !== expectedLivemode) {
          logger.info('internal_stripe_ingest', {
            eventId: req.body.id,
            eventType: req.body.type,
            livemode: req.body.livemode,
            result: 'livemode_mismatch',
            requestId: req.requestId || null,
          });
          return res.status(400).send({ message: 'Stripe livemode mismatch' });
        }

        const result = await processVerifiedStripeEvent(req.body);
        const resultLabel = result.body && result.body.duplicate
          ? 'duplicate'
          : (result.httpStatus === 503 ? 'in_flight' : 'processed');
        logger.info('internal_stripe_ingest', {
          eventId: req.body.id,
          eventType: req.body.type,
          livemode: req.body.livemode,
          result: resultLabel,
          requestId: req.requestId || null,
        });
        return res.status(result.httpStatus).json(result.body);
      } catch (handlerErr) {
        const livemodeMessage = clientErrorMessage(handlerErr);
        if (livemodeMessage) {
          logger.info('internal_stripe_ingest', {
            eventId: req.body && req.body.id ? req.body.id : null,
            eventType: req.body && req.body.type ? req.body.type : null,
            livemode: !!(req.body && req.body.livemode),
            result: handlerErr.code || 'livemode_mismatch',
            requestId: req.requestId || null,
          });
          return res.status(400).send({ message: livemodeMessage });
        }
        loggerForReq(req).error('internal_stripe_ingest_failed', {
          eventId: req.body && req.body.id ? req.body.id : null,
          eventType: req.body && req.body.type ? req.body.type : null,
          livemode: !!(req.body && req.body.livemode),
        });
        const status = handlerErr && handlerErr.httpStatus === 503 ? 503 : 500;
        return res.status(status).json({ message: 'Webhook handler failed' });
      }
    },
  );

  router.use((err, req, res, next) => {
    if (err && (err.status === 413 || err.statusCode === 413 || err.type === 'entity.too.large')) {
      return res.status(413).json({ message: 'Payload too large' });
    }
    if (err instanceof SyntaxError && (err.status === 400 || err.type === 'entity.parse.failed')) {
      return res.status(400).json({ message: 'Invalid JSON' });
    }
    return next(err);
  });

  return router;
}

module.exports = createInternalStripeVerifiedEventRouter();
module.exports.createInternalStripeVerifiedEventRouter = createInternalStripeVerifiedEventRouter;
module.exports.INTERNAL_EVENT_JSON_LIMIT = INTERNAL_EVENT_JSON_LIMIT;
module.exports.validateForwardedStripeEvent = validateForwardedStripeEvent;
