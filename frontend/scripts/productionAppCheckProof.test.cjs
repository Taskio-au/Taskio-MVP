'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..', '..');
const proofRoot = path.join(ROOT, 'maintenance', 'appcheck-proof');
const html = readFileSync(path.join(proofRoot, 'index.html'), 'utf8');
const script = readFileSync(path.join(proofRoot, 'app.js'), 'utf8');
const config = JSON.parse(readFileSync(path.join(ROOT, 'firebase.maintenance.json'), 'utf8'));

test('production proof artifact is manual, scoped, and inert for P05G2', () => {
  assert.match(html, /id="sign-in" type="button" disabled/);
  assert.match(html, /Continue with Google/);
  assert.match(html, /Verify Admin Session/);
  assert.match(html, /Acquire \/ Verify App Check Token/);
  assert.match(html, /id="firestore-proof" type="button" disabled/);
  assert.match(html, /id="storage-proof" type="button" disabled/);
  assert.match(script, /const DATA_PROOF_CONTROLS_ENABLED = false/);
  assert.match(script, /claims\.aud === 'taskio-v2'/);
  assert.match(script, /sign_in_provider/);
  assert.match(script, /claims\.admin === true/);
  assert.match(script, /inMemoryPersistence/);
  assert.match(script, /ReCaptchaEnterpriseProvider/);
  assert.match(script, /isTokenAutoRefreshEnabled: true/);
  assert.match(script, /auth\/popup-blocked/);
  const clickFn = script.slice(
    script.indexOf('function continueWithGoogle'),
    script.indexOf('async function verifyAdminSession'),
  );
  assert.equal(clickFn.includes('await '), false);
  assert.match(clickFn, /signInWithPopup\(auth, googleProvider\)/);
  const startup = script.slice(script.indexOf('resetProofState();\nsetMessage'));
  assert.match(startup, /setPersistence\(auth, inMemoryPersistence\)/);
  assert.doesNotMatch(clickFn, /setPersistence/);
});

test('future data proofs use only the approved exact paths', () => {
  assert.match(script, /'adminDailyChecklist', 'appcheck-proof'/);
  assert.match(script, /profilePhotos\/\$\{operator\.uid\}\/appcheck-proof\.png/);
  assert.doesNotMatch(script, /deleteObject|collection\(|addDoc|setDoc|updateDoc/);
});

test('proof artifact has a path-specific restrictive CSP', () => {
  const block = config.hosting.headers.find((entry) => entry.source === '/appcheck-proof/**');
  assert.ok(block);
  const policy = block.headers.find((header) => header.key === 'Content-Security-Policy')?.value;
  assert.ok(policy);
  assert.match(policy, /script-src [^;]*https:\/\/apis\.google\.com/);
  assert.doesNotMatch(policy, /\*/);
  assert.doesNotMatch(policy, /unsafe-eval/);
  assert.doesNotMatch(policy, /google-analytics|googletagmanager|a\.run\.app/);
  assert.doesNotMatch(policy, /taskio-v2-staging|localhost/);
  assert.doesNotMatch(policy, /accounts\.google\.com/);
  assert.match(policy, /content-firebaseappcheck\.googleapis\.com/);
  assert.match(policy, /taskio-v2\.firebaseapp\.com/);
  const root = config.hosting.headers.find((entry) => entry.source === '**');
  assert.deepEqual(root.headers, [
    { key: 'Cache-Control', value: 'no-store, max-age=0' },
    { key: 'X-Robots-Tag', value: 'noindex, nofollow' },
  ]);
});

test('proof artifact excludes disallowed integrations and bypasses', () => {
  const combined = `${html}\n${script}`;
  assert.doesNotMatch(combined, /REACT_APP_API_BASE_URL|a\.run\.app|google-analytics|googletagmanager|measurementId/);
  assert.doesNotMatch(combined, /FIREBASE_APPCHECK_DEBUG_TOKEN|ReCaptchaV3Provider/);
  assert.doesNotMatch(combined, /localhost|127\.0\.0\.1|taskio-v2-staging/);
  assert.doesNotMatch(combined, /localStorage|sessionStorage/);
});
