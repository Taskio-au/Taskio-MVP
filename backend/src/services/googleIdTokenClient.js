'use strict';

const { GoogleAuth } = require('google-auth-library');

function readAuthorizationHeader(headers) {
  if (!headers) return '';
  if (typeof headers.get === 'function') {
    return headers.get('Authorization') || headers.get('authorization') || '';
  }
  return headers.Authorization || headers.authorization || '';
}

/**
 * Obtain a Google ID token for the configured Cloud Run audience using ADC /
 * the runtime service identity. Does not accept SA JSON paths from callers.
 */
async function fetchGoogleIdToken(audience, options = {}) {
  if (!audience || typeof audience !== 'string') {
    const err = new Error('Stripe internal audience is not configured.');
    err.code = 'stripe_internal_audience_not_configured';
    err.httpStatus = 503;
    throw err;
  }

  const auth = options.googleAuth || new GoogleAuth();
  let client;
  try {
    client = await auth.getIdTokenClient(audience);
  } catch (cause) {
    const err = new Error('Google ID token was not obtained.');
    err.code = 'google_id_token_unavailable';
    err.httpStatus = 503;
    err.cause = cause;
    throw err;
  }

  let headers;
  try {
    headers = await client.getRequestHeaders(audience);
  } catch (cause) {
    const err = new Error('Google ID token was not obtained.');
    err.code = 'google_id_token_unavailable';
    err.httpStatus = 503;
    err.cause = cause;
    throw err;
  }

  const value = readAuthorizationHeader(headers);
  if (typeof value !== 'string' || !value.startsWith('Bearer ') || value.length <= 7) {
    const err = new Error('Google ID token was not obtained.');
    err.code = 'google_id_token_unavailable';
    err.httpStatus = 503;
    throw err;
  }

  return value.slice('Bearer '.length);
}

module.exports = {
  fetchGoogleIdToken,
};
