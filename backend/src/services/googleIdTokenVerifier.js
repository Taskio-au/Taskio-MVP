'use strict';

const { OAuth2Client } = require('google-auth-library');

const GOOGLE_ISSUERS = new Set([
  'https://accounts.google.com',
  'accounts.google.com',
]);

let client;

function getOAuth2Client() {
  if (!client) client = new OAuth2Client();
  return client;
}

function audienceMatches(aud, expected) {
  return typeof expected === 'string' && expected.length > 0 && aud === expected;
}

/**
 * Verify a Google-signed OIDC ID token locally via google-auth-library.
 * Checks signature, expiry, audience, and Google issuer.
 */
async function verifyGoogleIdToken(idToken, audience) {
  const ticket = await getOAuth2Client().verifyIdToken({
    idToken,
    audience,
  });
  const payload = ticket.getPayload();
  if (!payload) {
    const err = new Error('empty_id_token_payload');
    err.code = 'internal_identity_invalid';
    throw err;
  }
  if (!GOOGLE_ISSUERS.has(payload.iss)) {
    const err = new Error('invalid_issuer');
    err.code = 'internal_identity_invalid';
    throw err;
  }
  if (!audienceMatches(payload.aud, audience)) {
    const err = new Error('invalid_audience');
    err.code = 'internal_identity_invalid';
    throw err;
  }
  return payload;
}

module.exports = {
  verifyGoogleIdToken,
  GOOGLE_ISSUERS,
};
