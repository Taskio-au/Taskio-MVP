'use strict';

const { logger } = require('../observability/logger');
const { fetchGoogleIdToken } = require('./googleIdTokenClient');
const {
  FORWARD_TIMEOUT_MS,
  getWebhookForwardDestination,
} = require('../config/stripeWebhookRuntime');

function retryableForwardError(code, cause) {
  const err = new Error('Stripe event forward failed.');
  err.code = code;
  err.httpStatus = 503;
  if (cause) err.cause = cause;
  return err;
}

function isTimeoutError(err) {
  if (!err) return false;
  if (err.name === 'AbortError' || err.name === 'TimeoutError') return true;
  if (err.code === 'ABORT_ERR' || err.code === 'UND_ERR_ABORTED') return true;
  return false;
}

function mapInternalStatusToPublic(internalStatus) {
  if (internalStatus === 200) {
    return { httpStatus: 200, body: { received: true } };
  }
  if (internalStatus === 503) {
    return { httpStatus: 503, body: { message: 'Webhook handler busy' } };
  }
  if (internalStatus === 400) {
    return { httpStatus: 400, body: { message: 'Invalid event' } };
  }
  if (internalStatus === 401 || internalStatus === 403) {
    return { httpStatus: 503, body: { message: 'Webhook handler failed' } };
  }
  if (internalStatus >= 500 && internalStatus <= 599) {
    return { httpStatus: 500, body: { message: 'Webhook handler failed' } };
  }
  return { httpStatus: 503, body: { message: 'Webhook handler failed' } };
}

async function postVerifiedEvent({ ingestUrl, token, event, timeoutMs, fetchImpl, requestId }) {
  const fetchFn = fetchImpl || globalThis.fetch;
  if (typeof fetchFn !== 'function') {
    throw retryableForwardError('stripe_forward_transport_unavailable');
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const headers = {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    };
    if (requestId) headers['X-Request-Id'] = requestId;

    return await fetchFn(ingestUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify(event),
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }
}

/**
 * One internal POST per Stripe delivery. No automatic retry.
 * Destination comes only from server configuration.
 */
async function forwardVerifiedStripeEvent(event, options = {}) {
  const destination = getWebhookForwardDestination();
  if (!destination) {
    logger.warn('stripe_webhook_forward_not_configured');
    throw retryableForwardError('stripe_internal_audience_not_configured');
  }

  const fetchIdToken = options.fetchIdToken || fetchGoogleIdToken;
  let token;
  try {
    token = await fetchIdToken(destination.audience, {
      googleAuth: options.googleAuth,
    });
  } catch (cause) {
    logger.error('stripe_webhook_id_token_failed', {
      eventId: event && event.id ? event.id : null,
      eventType: event && event.type ? event.type : null,
    });
    throw retryableForwardError('google_id_token_unavailable', cause);
  }

  if (typeof token !== 'string' || token.length === 0) {
    logger.error('stripe_webhook_id_token_failed', {
      eventId: event && event.id ? event.id : null,
      eventType: event && event.type ? event.type : null,
    });
    throw retryableForwardError('google_id_token_unavailable');
  }

  const timeoutMs = Number.isFinite(options.timeoutMs) ? options.timeoutMs : FORWARD_TIMEOUT_MS;
  let response;
  try {
    response = await postVerifiedEvent({
      ingestUrl: destination.ingestUrl,
      token,
      event,
      timeoutMs,
      fetchImpl: options.fetch,
      requestId: options.requestId,
    });
  } catch (cause) {
    const code = isTimeoutError(cause) ? 'stripe_forward_timeout' : 'stripe_forward_network_failed';
    logger.error('stripe_webhook_forward_failed', {
      eventId: event && event.id ? event.id : null,
      eventType: event && event.type ? event.type : null,
      reason: code,
    });
    throw retryableForwardError(code, cause);
  }

  const internalStatus = response && Number.isFinite(response.status) ? response.status : 0;
  const mapped = mapInternalStatusToPublic(internalStatus);

  if (internalStatus === 401 || internalStatus === 403) {
    logger.error('stripe_webhook_forward_auth_failed', {
      eventId: event && event.id ? event.id : null,
      eventType: event && event.type ? event.type : null,
      internalStatus,
    });
  } else {
    logger.info('stripe_webhook_forward', {
      eventId: event && event.id ? event.id : null,
      eventType: event && event.type ? event.type : null,
      livemode: !!(event && event.livemode),
      internalStatus,
      publicStatus: mapped.httpStatus,
      requestId: options.requestId || null,
    });
  }

  return mapped;
}

module.exports = {
  forwardVerifiedStripeEvent,
  mapInternalStatusToPublic,
};
