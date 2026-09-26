'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { existsSync, readFileSync, readdirSync } = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..', '..');
const proofRoot = path.join(ROOT, 'maintenance', 'appcheck-proof');
const maintenanceRoot = path.join(ROOT, 'maintenance');
const rootHtml = readFileSync(path.join(maintenanceRoot, 'index.html'), 'utf8');
const config = JSON.parse(readFileSync(path.join(ROOT, 'firebase.maintenance.json'), 'utf8'));

test('production App Check proof artifact is absent after P05G6', () => {
  assert.equal(existsSync(proofRoot), false);
  assert.deepEqual(
    readdirSync(maintenanceRoot, { recursive: true })
      .map((entry) => String(entry).replaceAll('\\', '/'))
      .filter((entry) => entry.includes('appcheck-proof')),
    [],
  );
});

test('maintenance Hosting has no proof-specific header or route', () => {
  assert.equal(
    config.hosting.headers.some((entry) => entry.source.includes('appcheck-proof')),
    false,
  );
  assert.equal(
    JSON.stringify(config).includes('appcheck-proof'),
    false,
  );
});

test('maintenance root keeps only the approved global headers', () => {
  assert.equal(config.hosting.headers.length, 1);
  const root = config.hosting.headers.find((entry) => entry.source === '**');
  assert.deepEqual(root.headers, [
    { key: 'Cache-Control', value: 'no-store, max-age=0' },
    { key: 'X-Robots-Tag', value: 'noindex, nofollow' },
  ]);
});

test('maintenance root does not contain the removed proof controls or Firebase runtime', () => {
  assert.doesNotMatch(rootHtml, /Production App Check proof|Continue with Google|Acquire \/ Verify App Check Token/);
  assert.doesNotMatch(rootHtml, /firebasejs|firebaseappcheck|firestore|firebasestorage/);
});
