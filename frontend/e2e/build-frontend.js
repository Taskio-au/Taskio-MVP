'use strict';

const { spawnSync } = require('child_process');
const path = require('path');

const projectRoot = path.resolve(__dirname, '..');
const safeEnv = {
  ...process.env,
  CI: 'true',
  REACT_APP_E2E_AUTH_BYPASS: 'true',
  REACT_APP_E2E_HARNESS_BUILD: 'true',
  REACT_APP_API_BASE_URL: 'http://127.0.0.1:3800',
  REACT_APP_FIREBASE_EXPECTED_PROJECT_ID: 'demo-taskio-e2e',
  REACT_APP_FIREBASE_API_KEY: 'demo-api-key',
  REACT_APP_FIREBASE_AUTH_DOMAIN: 'demo-taskio-e2e.firebaseapp.com',
  REACT_APP_FIREBASE_PROJECT_ID: 'demo-taskio-e2e',
  REACT_APP_FIREBASE_STORAGE_BUCKET: 'demo-taskio-e2e.appspot.com',
  REACT_APP_FIREBASE_MESSAGING_SENDER_ID: 'demo-sender',
  REACT_APP_FIREBASE_APP_ID: 'demo-app-id',
  REACT_APP_APPCHECK_ENABLED: 'false',
  REACT_APP_APPCHECK_DEBUG_TOKEN: '',
  REACT_APP_ANALYTICS_ENABLED: 'false',
  REACT_APP_GA_MEASUREMENT_ID: '',
  REACT_APP_DISABLE_PHONE_RECAPTCHA: 'false',
  REACT_APP_USE_STORAGE_EMULATOR: 'false',
};

for (const script of ['scripts/syncShared.js', 'node_modules/react-scripts/scripts/build.js']) {
  const result = spawnSync(process.execPath, [path.join(projectRoot, script)], {
    cwd: projectRoot,
    env: safeEnv,
    stdio: 'inherit',
  });
  if (result.status !== 0) process.exit(result.status || 1);
}
