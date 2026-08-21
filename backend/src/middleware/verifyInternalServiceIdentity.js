'use strict';

const { loggerForReq } = require('../observability/logger');
const { requireInternalStripeIngestConfig } = require('../config/stripeInternalIngest');
const { verifyGoogleIdToken } = require('../services/googleIdTokenVerifier');

function unauthorized(res) {
  return res.status(401).json({ message: 'Unauthorized' });
}

function forbidden(res) {
  return res.status(403).json({ message: 'Forbidden' });
}

function parseBearerToken(authorizationHeader) {
  if (typeof authorizationHeader !== 'string') return null;
  const match = /^Bearer ([^\s]+)$/.exec(authorizationHeader);
  return match ? match[1] : null;
}

/**
 * Cloud Run service-to-service identity. Do not use Firebase verifyIdToken.
 */
function createVerifyInternalServiceIdentity({ verifyIdToken = verifyGoogleIdToken } = {}) {
  return async function verifyInternalServiceIdentity(req, res, next) {
    let config;
    try {
      config = requireInternalStripeIngestConfig();
    } catch (_e) {
      loggerForReq(req).warn('internal_stripe_ingest_not_configured');
      return res.status(503).json({ message: 'Internal webhook is not configured' });
    }

    const token = parseBearerToken(req.headers.authorization);
    if (!token) {
      loggerForReq(req).warn('internal_stripe_auth_rejected', { reason: 'missing_or_malformed_authorization' });
      return unauthorized(res);
    }

    let payload;
    try {
      payload = await verifyIdToken(token, config.audience);
    } catch (_e) {
      loggerForReq(req).warn('internal_stripe_auth_rejected', { reason: 'invalid_id_token' });
      return unauthorized(res);
    }

    if (!payload || payload.aud !== config.audience) {
      loggerForReq(req).warn('internal_stripe_auth_rejected', { reason: 'audience_mismatch' });
      return forbidden(res);
    }
    if (payload.email !== config.callerEmail) {
      loggerForReq(req).warn('internal_stripe_auth_rejected', { reason: 'caller_mismatch' });
      return forbidden(res);
    }
    if (payload.email_verified !== true) {
      loggerForReq(req).warn('internal_stripe_auth_rejected', { reason: 'email_not_verified' });
      return forbidden(res);
    }

    req.internalService = { email: payload.email };
    loggerForReq(req).info('internal_stripe_auth_accepted');
    return next();
  };
}

module.exports = {
  createVerifyInternalServiceIdentity,
  verifyInternalServiceIdentity: createVerifyInternalServiceIdentity(),
  parseBearerToken,
};
