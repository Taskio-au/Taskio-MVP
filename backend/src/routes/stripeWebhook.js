'use strict';

/**
 * Private taskio-api HMAC webhook (compatibility path).
 * HMAC-verify then processVerifiedStripeEvent locally.
 * The public webhook-only runtime must use stripeWebhookForward.js instead.
 */

const express = require('express');

const { isStripeEnabled } = require('../config/stripeEnabled');
const { constructWebhookEvent } = require('../services/stripe');
const { processVerifiedStripeEvent } = require('../services/stripeEventProcessor');
const { dispatchStripeEventHandlers, handleOperationalStripeEvent } = require('../services/stripeEventHandlers');
const { sanitizeEventForStorage } = require('../services/stripeEventClaim');
const { logger, loggerForReq } = require('../observability/logger');

const WEBHOOK_RAW_BODY_LIMIT = 256 * 1024;

const router = express.Router();

function clientErrorMessage(err) {
  if (err && (err.code === 'stripe_livemode_mismatch' || err.code === 'stripe_livemode_not_configured')) {
    return 'Stripe livemode mismatch';
  }
  return null;
}

router.post(
  '/api/stripe/webhook',
  express.raw({ type: () => true, limit: WEBHOOK_RAW_BODY_LIMIT }),
  async (req, res) => {
    try {
      if (!isStripeEnabled()) {
        return res.status(404).send({ message: 'Not found' });
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
        if (e && e.code === 'stripe_webhook_not_configured') {
          loggerForReq(req).warn('stripe_webhook_not_configured');
          return res.status(503).json({ message: 'Webhook handler failed' });
        }
        loggerForReq(req).warn('stripe_webhook_invalid_signature', {
          code: e && e.code ? e.code : 'invalid_signature',
        });
        return res.status(400).send({ message: 'Invalid signature' });
      }

      try {
        const result = await processVerifiedStripeEvent(event);
        return res.status(result.httpStatus).json(result.body);
      } catch (handlerErr) {
        const livemodeMessage = clientErrorMessage(handlerErr);
        if (livemodeMessage) {
          logger.info('stripe_webhook', {
            eventId: event && event.id ? event.id : null,
            eventType: event && event.type ? event.type : null,
            livemode: !!(event && event.livemode),
            result: handlerErr.code || 'livemode_mismatch',
            requestId: req.requestId || null,
          });
          return res.status(400).send({ message: livemodeMessage });
        }
        loggerForReq(req).error('stripe_webhook_handler_failed', {
          eventId: event && event.id ? event.id : null,
          eventType: event && event.type ? event.type : null,
          livemode: !!(event && event.livemode),
        });
        const status = handlerErr && handlerErr.httpStatus === 503 ? 503 : 500;
        return res.status(status).json({ message: 'Webhook handler failed' });
      }
    } catch (err) {
      if (err && (err.status === 413 || err.statusCode === 413 || err.type === 'entity.too.large')) {
        return res.status(413).send({ message: 'Payload too large' });
      }
      loggerForReq(req).error('stripe_webhook_handler_failed');
      return res.status(500).json({ message: 'Webhook handler failed' });
    }
  },
);

module.exports = router;
module.exports.WEBHOOK_RAW_BODY_LIMIT = WEBHOOK_RAW_BODY_LIMIT;
module.exports._test = {
  dispatchStripeEventHandlers,
  handleOperationalStripeEvent,
  sanitizeEventForStorage,
};
