'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const test = require('node:test');
const assert = require('node:assert/strict');
const {
  STAGING_PROJECT_ID,
  STAGING_API_URL,
  containsProductionProjectId,
  assertStagingBuildEnv,
  stagingBuildChildEnv,
  scanText,
  scanStagingBundle,
  buildHostingDeployPlan,
  buildHostingClonePlan,
} = require('./stagingHostingLib.cjs');

const validEnv = {
  REACT_APP_FIREBASE_EXPECTED_PROJECT_ID: STAGING_PROJECT_ID,
  REACT_APP_FIREBASE_API_KEY: 'staging-api-key',
  REACT_APP_FIREBASE_AUTH_DOMAIN: 'taskio-v2-staging.firebaseapp.com',
  REACT_APP_FIREBASE_PROJECT_ID: STAGING_PROJECT_ID,
  REACT_APP_FIREBASE_STORAGE_BUCKET: 'taskio-v2-staging.firebasestorage.app',
  REACT_APP_FIREBASE_MESSAGING_SENDER_ID: 'staging-sender',
  REACT_APP_FIREBASE_APP_ID: 'staging-app',
  REACT_APP_API_BASE_URL: STAGING_API_URL,
};

test('boundary-aware production project matching does not fire on staging', () => {
  assert.equal(containsProductionProjectId('taskio-v2-staging'), false);
  assert.equal(containsProductionProjectId('https://taskio-v2-staging.firebaseapp.com'), false);
  assert.equal(containsProductionProjectId('taskio-v2'), true);
  assert.equal(containsProductionProjectId('taskio-v2.firebaseapp.com'), true);
});

test('staging build env accepts complete staging inputs and forces bypass off', () => {
  assert.doesNotThrow(() => assertStagingBuildEnv(validEnv));
  const child = stagingBuildChildEnv({
    ...validEnv,
    REACT_APP_STRIPE_PUBLISHABLE_KEY: 'pk_test_example',
    REACT_APP_STORAGE_BUCKET: 'taskio-v2.firebasestorage.app',
  });
  assert.equal(child.REACT_APP_DISABLE_PHONE_RECAPTCHA, 'false');
  assert.equal(child.GENERATE_SOURCEMAP, 'false');
  assert.equal(child.REACT_APP_STORAGE_BUCKET, '');
  assert.equal(child.REACT_APP_FIREBASE_STORAGE_BUCKET, 'taskio-v2-staging.firebasestorage.app');
});

test('staging build env refuses production Firebase fallback values', () => {
  assert.throws(() => assertStagingBuildEnv({
    ...validEnv,
    REACT_APP_FIREBASE_API_KEY: 'AIzaSyAVmOP2j8VIMHWRz9o49JHKqyiszQ5qMOg',
  }), /production Firebase fallback/);
});

test('staging build env refuses production API, live Stripe and testing bypass', () => {
  assert.throws(() => assertStagingBuildEnv({
    ...validEnv,
    REACT_APP_API_BASE_URL: 'https://api.taskio.com.au',
  }), /must use host/);
  assert.throws(() => assertStagingBuildEnv({
    ...validEnv,
    REACT_APP_API_BASE_URL: 'http://localhost:8000',
  }), /HTTPS/);
  assert.throws(() => assertStagingBuildEnv({
    ...validEnv,
    REACT_APP_STRIPE_PUBLISHABLE_KEY: 'pk_live_secret',
  }), /live Stripe/);
  assert.throws(() => assertStagingBuildEnv({
    ...validEnv,
    REACT_APP_DISABLE_PHONE_RECAPTCHA: 'true',
  }), /must not be true/);
  assert.throws(() => assertStagingBuildEnv({
    ...validEnv,
    REACT_APP_FIREBASE_EXPECTED_PROJECT_ID: 'taskio-v2',
  }), /expected project must be/);
});

test('scan fails on production identifiers and bypass assignment, not SDK property names', () => {
  const fixtures = { phone: '', otp: '' };
  assert.deepEqual(scanText('appVerificationDisabledForTesting', fixtures), []);
  assert.deepEqual(scanText('auth.settings.appVerificationDisabledForTesting === true', fixtures), []);
  assert.ok(scanText('auth.settings.appVerificationDisabledForTesting = true', fixtures)[0].includes('testing-bypass'));
  assert.ok(scanText('auth.settings.appVerificationDisabledForTesting=!0', fixtures)[0].includes('testing-bypass'));
  assert.deepEqual(scanText('i.emulatorConfig=c,i.settings.appVerificationDisabledForTesting=!0,Nt(a)', fixtures), []);
  assert.ok(scanText('taskio-v2.firebaseapp.com', fixtures).length);
  assert.equal(scanText('taskio-v2-staging.firebaseapp.com', fixtures).filter((f) => f.includes('production')).length, 0);
  assert.ok(scanText('https://api.taskio.com.au/api/me', fixtures).length);
  assert.deepEqual(scanText('continueUri:"http://localhost"', fixtures), []);
  assert.ok(scanText('https://localhost:8000/api', fixtures).length);
  assert.ok(scanText('pk_live_abc', fixtures).length);
});

test('scan equality-checks fixtures without using generic digit matching', () => {
  const fixtures = { phone: '+61400009999', otp: '424242' };
  assert.deepEqual(scanText('call 131 445 or code 123456', { phone: '', otp: '' }), []);
  assert.ok(scanText('user +61400009999 signed in', fixtures).some((f) => f.includes('phone fixture')));
  assert.ok(scanText('otp 424242', fixtures).some((f) => f.includes('OTP fixture')));
});

test('scanStagingBundle requires staging identifiers and rejects source maps', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'taskio-scan-'));
  fs.writeFileSync(path.join(dir, 'index.html'), '<html>taskio-v2-staging taskio-api-staging-d6mdcsrwea-ts.a.run.app</html>');
  const ok = scanStagingBundle(dir, {});
  assert.equal(ok.ok, true);
  fs.writeFileSync(path.join(dir, 'main.js.map'), '{}');
  assert.throws(() => scanStagingBundle(dir, {}), /source map/);
});

test('deploy wrapper refuses production project, firebase.json and unknown configs', () => {
  assert.throws(() => buildHostingDeployPlan({
    project: 'taskio-v2',
    config: 'firebase.staging.hosting.json',
  }), /Refusing project/);
  assert.throws(() => buildHostingDeployPlan({
    config: 'firebase.staging.hosting.json',
  }), /Missing --project/);
  assert.throws(() => buildHostingDeployPlan({
    project: STAGING_PROJECT_ID,
    config: 'firebase.json',
  }), /firebase.json/);
  assert.throws(() => buildHostingDeployPlan({
    project: STAGING_PROJECT_ID,
    config: 'firebase.maintenance.json',
  }), /Unknown staging Hosting config/);
});

test('deploy wrapper constructs a dry-run firebase command for staging configs', () => {
  const plan = buildHostingDeployPlan({
    project: STAGING_PROJECT_ID,
    config: 'firebase.staging.placeholder.json',
  });
  assert.equal(plan.dryRun, true);
  assert.equal(plan.execute, false);
  assert.equal(plan.args[0], 'deploy');
  assert.equal(plan.args[2], STAGING_PROJECT_ID);
  assert.ok(plan.args.includes('--config'));
  assert.ok(plan.args.at(-1).endsWith('firebase.staging.placeholder.json'));
});

test('clone plan uses site@VERSION_ID and rejects the colon-at form', () => {
  const plan = buildHostingClonePlan({
    project: STAGING_PROJECT_ID,
    versionId: 'abc123def',
  });
  assert.equal(plan.args[1], 'taskio-v2-staging@abc123def');
  assert.equal(plan.args[2], 'taskio-v2-staging:live');
  assert.throws(() => buildHostingClonePlan({
    project: STAGING_PROJECT_ID,
    versionId: '@abc123def',
  }), /bare Hosting version ID/);
  assert.throws(() => buildHostingClonePlan({
    project: STAGING_PROJECT_ID,
    versionId: ':abc123def',
  }), /bare Hosting version ID/);
});
