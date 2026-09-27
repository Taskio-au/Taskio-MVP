'use strict';

const FIREBASE_EMULATOR_ENV_KEYS = [
  'REACT_APP_USE_FIREBASE_EMULATORS',
  'REACT_APP_FIREBASE_AUTH_EMULATOR_HOST',
  'REACT_APP_FIRESTORE_EMULATOR_HOST',
];

function assertNoHostedAppCheckDebug(env, context = 'hosted production builds') {
  if (String(env.REACT_APP_APPCHECK_DEBUG_TOKEN || '').trim()
    || String(env.FIREBASE_APPCHECK_DEBUG_TOKEN || '').trim()) {
    const error = new Error(`REACT_APP_APPCHECK_DEBUG_TOKEN is forbidden in ${context}.`);
    error.code = 'TASKIO_APPCHECK_DEBUG_BUILD';
    throw error;
  }
}

function assertNoHostedFirebaseEmulators(env, context = 'hosted production builds') {
  const configured = FIREBASE_EMULATOR_ENV_KEYS.filter((key) => String(env[key] || '').trim());
  if (configured.length) {
    const error = new Error(`Firebase emulator settings (${configured.join(', ')}) are forbidden in ${context}.`);
    error.code = 'TASKIO_EMULATOR_BUILD';
    throw error;
  }
}

function assertHostedBuildEnv(env) {
  assertNoHostedAppCheckDebug(env);
  assertNoHostedFirebaseEmulators(env);
}

function runHostedBuild({ env, loadEnv, compile }) {
  env.NODE_ENV = 'production';
  env.BABEL_ENV = 'production';
  assertHostedBuildEnv(env);
  loadEnv(); // CRA loads .env.production.local, .env.local, .env.production, .env.
  assertHostedBuildEnv(env);
  return compile();
}

module.exports = { assertNoHostedAppCheckDebug, assertNoHostedFirebaseEmulators, runHostedBuild };
