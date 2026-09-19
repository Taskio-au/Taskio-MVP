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

for (const filename of ['firebase.json', 'firebase.staging.hosting.json']) {
  test(`${filename} declares the conservative Hosting security header baseline`, () => {
    const headers = loadHostingHeaders(filename);
    for (const [key, value] of Object.entries(REQUIRED_HEADERS)) {
      assert.equal(headers[key], value, `${filename} missing ${key}`);
    }
    assert.equal(headers['Content-Security-Policy'], undefined);
    assert.equal(headers['Content-Security-Policy-Report-Only'], undefined);
    assert.equal(headers['Strict-Transport-Security'].includes('includeSubDomains'), false);
    assert.equal(headers['Strict-Transport-Security'].includes('preload'), false);
  });
}
