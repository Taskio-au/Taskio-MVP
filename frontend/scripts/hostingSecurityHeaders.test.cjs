'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..', '..');

const REQUIRED_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'X-Frame-Options': 'DENY',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=(), usb=()',
  'Strict-Transport-Security': 'max-age=31536000',
};

function loadHostingHeaders(filename) {
  const config = JSON.parse(readFileSync(path.join(ROOT, filename), 'utf8'));
  const blocks = Array.isArray(config.hosting?.headers) ? config.hosting.headers : [];
  const global = blocks.find((block) => block.source === '**') || { headers: [] };
  return Object.fromEntries((global.headers || []).map((item) => [item.key, item.value]));
}

const PROVEN_STAGING_CSP = "default-src 'none'; base-uri 'self'; object-src 'none'; frame-ancestors 'none'; form-action 'self'; manifest-src 'self'; script-src 'self' https://www.google.com https://www.gstatic.com https://www.recaptcha.net https://www.googletagmanager.com; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' blob: https://www.gstatic.com https://www.google.com https://firebasestorage.googleapis.com https://taskio-v2-staging.firebasestorage.app; connect-src 'self' https://taskio-api-staging-d6mdcsrwea-ts.a.run.app https://identitytoolkit.googleapis.com https://securetoken.googleapis.com https://firestore.googleapis.com https://firebasestorage.googleapis.com https://firebaseinstallations.googleapis.com https://content-firebaseappcheck.googleapis.com https://firebaseappcheck.googleapis.com https://www.googleapis.com https://www.google.com https://www.gstatic.com https://www.recaptcha.net https://www.google-analytics.com https://analytics.google.com https://www.googletagmanager.com https://apis.google.com https://taskio-v2-staging.firebaseapp.com; frame-src https://www.google.com https://www.recaptcha.net https://taskio-v2-staging.firebaseapp.com";

function assertBaselineHeaders(filename, headers) {
  for (const [key, value] of Object.entries(REQUIRED_HEADERS)) {
    assert.equal(headers[key], value, `${filename} missing ${key}`);
  }
  assert.equal(headers['Strict-Transport-Security'].includes('includeSubDomains'), false);
  assert.equal(headers['Strict-Transport-Security'].includes('preload'), false);
}

function assertProvenStagingCsp(policy) {
  assert.equal(typeof policy, 'string');
  assert.equal(policy, PROVEN_STAGING_CSP);
  assert.equal(policy.includes('*'), false);
  assert.equal(policy.includes('unsafe-eval'), false);
  assert.equal(policy.includes('js.stripe.com'), false);
}

test('firebase.json declares the conservative Hosting security header baseline without CSP', () => {
  const headers = loadHostingHeaders('firebase.json');
  assertBaselineHeaders('firebase.json', headers);
  assert.equal(headers['Content-Security-Policy'], undefined);
  assert.equal(headers['Content-Security-Policy-Report-Only'], undefined);
});

test('firebase.staging.hosting.json keeps P07B headers and enforced CSP only', () => {
  const headers = loadHostingHeaders('firebase.staging.hosting.json');
  assertBaselineHeaders('firebase.staging.hosting.json', headers);
  assert.equal(headers['Content-Security-Policy-Report-Only'], undefined);
  assertProvenStagingCsp(headers['Content-Security-Policy']);
});
