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

function assertBaselineHeaders(filename, headers) {
  for (const [key, value] of Object.entries(REQUIRED_HEADERS)) {
    assert.equal(headers[key], value, `${filename} missing ${key}`);
  }
  assert.equal(headers['Content-Security-Policy'], undefined);
  assert.equal(headers['Strict-Transport-Security'].includes('includeSubDomains'), false);
  assert.equal(headers['Strict-Transport-Security'].includes('preload'), false);
}

test('firebase.json declares the conservative Hosting security header baseline without CSP', () => {
  const headers = loadHostingHeaders('firebase.json');
  assertBaselineHeaders('firebase.json', headers);
  assert.equal(headers['Content-Security-Policy-Report-Only'], undefined);
});

test('firebase.staging.hosting.json keeps P07B headers and Report-Only CSP only', () => {
  const headers = loadHostingHeaders('firebase.staging.hosting.json');
  assertBaselineHeaders('firebase.staging.hosting.json', headers);
  const reportOnly = headers['Content-Security-Policy-Report-Only'];
  assert.equal(typeof reportOnly, 'string');
  assert.match(reportOnly, /default-src 'none'/);
  assert.match(reportOnly, /manifest-src 'self'/);
  assert.match(reportOnly, /object-src 'none'/);
  assert.match(reportOnly, /base-uri 'self'/);
  assert.match(reportOnly, /frame-ancestors 'none'/);
  assert.match(reportOnly, /style-src[^;]*'unsafe-inline'/);
  assert.match(reportOnly, /content-firebaseappcheck\.googleapis\.com/);
  assert.match(reportOnly, /firebaseappcheck\.googleapis\.com/);
  assert.match(reportOnly, /taskio-api-staging-d6mdcsrwea-ts\.a\.run\.app/);
  assert.equal(reportOnly.includes('*'), false);
  assert.equal(reportOnly.includes('unsafe-eval'), false);
  assert.equal(reportOnly.includes('js.stripe.com'), false);
});
