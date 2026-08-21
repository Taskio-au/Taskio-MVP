'use strict';

const express = require('express');

const { isStripeEnabled } = require('../config/stripeEnabled');
const { getExpectedStripeLivemode } = require('../config/stripeLivemode');
const { isForwardWebhookProcessingMode } = require('../config/stripeWebhookRuntime');
const { constructWebhookEvent } = require('../services/stripe');
const { validateForwardedStripeEvent } = require('../services/stripeEventShape');
const { forwardVerifiedStripeEvent } = require('../services/stripeEventForwarder');
const { logger, loggerForReq } = require('../observability/logger');

const WEBHOOK_RAW_BODY_LIMIT = 256 * 1024;

function livemodeClientMessage(expectedLivemode, eventLivemode) {
  if (expectedLivemode !== true && expectedLivemode !== false) {
    return 'Stripe livemode mismatch';
  }
  if (eventLivemode !== expectedLivemode) {
    return 'Stripe livemode mismatch';
  }
  return null;
}

function createStripeWebhookForwardRouter(options = {}) {
  const router = express.Router();
  const forwardEvent = options.forwardVerifiedStripeEvent || forwardVerifiedStripeEvent;

  router.post(
    '/api/stripe/webhook',
    express.raw({ type: () => true, limit: WEBHOOK_RAW_BODY_LIMIT }),
    async (req, res) => {
      try {
        if (!isStripeEnabled()) {
          return res.status(404).send({ message: 'Not found' });
        }

        if (!isForwardWebhookProcessingMode()) {
          loggerForReq(req).error('stripe_webhook_mode_unsupported');
          return res.status(500).json({ message: 'Webhook handler failed' });
        }

        const sig = req.headers['stripe-signature'];
        if (!sig) {
          loggerForReq(req).warn('stripe_webhook_missing_signature');
          return res.status(400).send({ message: 'Missing Stripe-Signature header' });
        }

        let event;
        try {
          event = constructWebhookEvent(req.body, sig);
        } catch (e) {
          loggerForReq(req).warn('stripe_webhook_invalid_signature', {
            code: e && e.code ? e.code : 'invalid_signature',
          });
          return res.status(400).send({ message: 'Invalid signature' });
        }

        if (!validateForwardedStripeEvent(event).ok) {
          loggerForReq(req).warn('stripe_webhook_invalid_event');
          return res.status(400).send({ message: 'Invalid event' });
        }

        const expectedLivemode = getExpectedStripeLivemode();
        const livemodeMessage = livemodeClientMessage(expectedLivemode, event.livemode);
        if (livemodeMessage) {
          logger.info('stripe_webhook', {
            eventId: event.id || null,
            eventType: event.type || null,
            livemode: !!event.livemode,
            result: expectedLivemode !== true && expectedLivemode !== false
              ? 'livemode_not_configured'
              : 'livemode_mismatch',
            requestId: req.requestId || null,
          });
          return res.status(400).send({ message: livemodeMessage });
        }

        const result = await forwardEvent(event, {
          fetch: options.fetch,
          fetchIdToken: options.fetchIdToken,
          googleAuth: options.googleAuth,
          requestId: req.requestId || null,
        });
        return res.status(result.httpStatus).json(result.body);
      } catch (err) {
        if (err && (err.status === 413 || err.statusCode === 413 || err.type === 'entity.too.large')) {
          return res.status(413).send({ message: 'Payload too large' });
        }
        const status = err && err.httpStatus === 400 ? 400 : (err && err.httpStatus === 503 ? 503 : 500);
        if (status === 400) {
          loggerForReq(req).warn('stripe_webhook_forward_rejected', {
            code: err && err.code ? err.code : 'forward_rejected',
          });
          return res.status(400).send({ message: 'Invalid event' });
        }
        loggerForReq(req).error('stripe_webhook_forward_failed', {
          code: err && err.code ? err.code : 'forward_failed',
        });
        if (status === 503) {
          return res.status(503).json({ message: 'Webhook handler failed' });
        }
        return res.status(500).json({ message: 'Webhook handler failed' });
      }
    },
  );

  return router;
}

module.exports = createStripeWebhookForwardRouter();
module.exports.createStripeWebhookForwardRouter = createStripeWebhookForwardRouter;
module.exports.WEBHOOK_RAW_BODY_LIMIT = WEBHOOK_RAW_BODY_LIMIT;
