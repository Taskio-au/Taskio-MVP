'use strict';

function assertNoHostedAppCheckDebug(env, context = 'hosted production builds') {
  if (String(env.REACT_APP_APPCHECK_DEBUG_TOKEN || '').trim()
    || String(env.FIREBASE_APPCHECK_DEBUG_TOKEN || '').trim()) {
    const error = new Error(`REACT_APP_APPCHECK_DEBUG_TOKEN is forbidden in ${context}.`);
    error.code = 'TASKIO_APPCHECK_DEBUG_BUILD';
    throw error;
  }
}

function runHostedBuild({ env, loadEnv, compile }) {
  env.NODE_ENV = 'production';
  env.BABEL_ENV = 'production';
  assertNoHostedAppCheckDebug(env);
  loadEnv(); // CRA loads .env.production.local, .env.local, .env.production, .env.
  assertNoHostedAppCheckDebug(env);
  return compile();
}

module.exports = { assertNoHostedAppCheckDebug, runHostedBuild };
