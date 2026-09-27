'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { readEmulatorEnv, backendEnv, frontendEnv } = require('./localDevEnv.cjs');

const EMULATOR_ENV = {
  GCLOUD_PROJECT: 'demo-taskio-local',
  FIREBASE_AUTH_EMULATOR_HOST: '127.0.0.1:9099',
  FIRESTORE_EMULATOR_HOST: '127.0.0.1:8080',
};

const STAGING_SHELL = {
  ...EMULATOR_ENV,
  TASKIO_DEPLOYMENT_ENV: 'staging',
  GOOGLE_CLOUD_PROJECT: 'taskio-v2-staging',
  GOOGLE_APPLICATION_CREDENTIALS: 'C:/synthetic/service-account.json',
  STRIPE_SECRET_KEY: 'synthetic-not-a-key',
  REACT_APP_FIREBASE_EXPECTED_PROJECT_ID: 'taskio-v2-staging',
  REACT_APP_FIREBASE_PROJECT_ID: 'taskio-v2-staging',
};

test('refuses to run outside emulators:exec for a demo- project', () => {
  assert.throws(() => readEmulatorEnv({}), /demo- Firebase project/);
  for (const projectId of ['taskio-v2', 'taskio-v2-staging']) {
    assert.throws(() => readEmulatorEnv({ ...EMULATOR_ENV, GCLOUD_PROJECT: projectId }), /demo- Firebase project/);
  }
  assert.throws(
    () => readEmulatorEnv({ ...EMULATOR_ENV, FIREBASE_AUTH_EMULATOR_HOST: '' }),
    /FIREBASE_AUTH_EMULATOR_HOST/,
  );
  assert.throws(
    () => readEmulatorEnv({ ...EMULATOR_ENV, FIRESTORE_EMULATOR_HOST: 'firestore.googleapis.com:443' }),
    /FIRESTORE_EMULATOR_HOST/,
  );
});

test('backend uses both emulators and cannot fall back to staging, credentials or Stripe', () => {
  const env = backendEnv(STAGING_SHELL);
  assert.equal(env.NODE_ENV, 'development');
  assert.equal(env.FIREBASE_AUTH_EMULATOR_HOST, '127.0.0.1:9099');
  assert.equal(env.FIRESTORE_EMULATOR_HOST, '127.0.0.1:8080');
  assert.deepEqual(JSON.parse(env.FIREBASE_CONFIG), { projectId: 'demo-taskio-local' });
  for (const key of [
    'TASKIO_DEPLOYMENT_ENV', 'GOOGLE_CLOUD_PROJECT', 'GCLOUD_PROJECT', 'FIREBASE_PROJECT_ID',
    'GOOGLE_APPLICATION_CREDENTIALS', 'FIREBASE_SERVICE_ACCOUNT_JSON', 'STRIPE_SECRET_KEY',
  ]) {
    assert.equal(env[key], '', `${key} must be present and empty`);
  }
  assert.equal(env.STRIPE_ENABLED, 'false');
  const serverEntries = Object.entries(env).filter(([key]) => !key.startsWith('REACT_APP_'));
  assert.equal(serverEntries.some(([, value]) => String(value).includes('taskio-v2')), false);
});

test('frontend targets the demo project and the same emulators as the backend', () => {
  const env = frontendEnv(STAGING_SHELL);
  assert.equal(env.REACT_APP_USE_FIREBASE_EMULATORS, 'true');
  assert.equal(env.REACT_APP_FIREBASE_EXPECTED_PROJECT_ID, 'demo-taskio-local');
  assert.equal(env.REACT_APP_FIREBASE_PROJECT_ID, 'demo-taskio-local');
  assert.equal(env.REACT_APP_FIREBASE_AUTH_DOMAIN, 'demo-taskio-local.firebaseapp.com');
  assert.equal(env.REACT_APP_FIREBASE_AUTH_EMULATOR_HOST, backendEnv(STAGING_SHELL).FIREBASE_AUTH_EMULATOR_HOST);
  assert.equal(env.REACT_APP_FIRESTORE_EMULATOR_HOST, backendEnv(STAGING_SHELL).FIRESTORE_EMULATOR_HOST);
  assert.equal(env.REACT_APP_API_BASE_URL, 'http://localhost:8000');
  assert.equal(env.REACT_APP_APPCHECK_DEBUG_TOKEN, '');
  assert.equal(env.REACT_APP_STRIPE_PUBLISHABLE_KEY, '');
  const reactEntries = Object.entries(env).filter(([key]) => key.startsWith('REACT_APP_'));
  assert.equal(reactEntries.some(([, value]) => String(value).includes('taskio-v2')), false);
});
