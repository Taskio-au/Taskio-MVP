'use strict';

// Child-process environments for `npm run dev:local`. The API and the browser app both use
// the Auth and Firestore emulators that `firebase emulators:exec` started for a demo- project.

const LOOPBACK_HOST_PORT = /^(localhost|127\.0\.0\.1|\[::1\]):\d{2,5}$/i;
const FRONTEND_PORT = '3000';
const BACKEND_PORT = '8000';
const FRONTEND_ORIGIN = `http://localhost:${FRONTEND_PORT}`;
const API_BASE_URL = `http://localhost:${BACKEND_PORT}`;
const RUN_HINT = 'Start it with `npm run dev:local` from the repository root.';

function readEmulatorEnv(env) {
  const projectId = String(env.GCLOUD_PROJECT || '').trim();
  const authHost = String(env.FIREBASE_AUTH_EMULATOR_HOST || '').trim();
  const firestoreHost = String(env.FIRESTORE_EMULATOR_HOST || '').trim();
  if (!projectId.startsWith('demo-')) {
    throw new Error(`Local development requires a demo- Firebase project. ${RUN_HINT}`);
  }
  if (!LOOPBACK_HOST_PORT.test(authHost)) {
    throw new Error(`FIREBASE_AUTH_EMULATOR_HOST must point at a local emulator. ${RUN_HINT}`);
  }
  if (!LOOPBACK_HOST_PORT.test(firestoreHost)) {
    throw new Error(`FIRESTORE_EMULATOR_HOST must point at a local emulator. ${RUN_HINT}`);
  }
  return { projectId, authHost, firestoreHost };
}

function backendEnv(env) {
  const { projectId, authHost, firestoreHost } = readEmulatorEnv(env);
  return {
    ...env,
    NODE_ENV: 'development',
    PORT: BACKEND_PORT,
    // Present-but-empty values stop backend/.env (dotenv never overrides) from pointing the
    // API at staging, real credentials or Stripe.
    TASKIO_DEPLOYMENT_ENV: '',
    GOOGLE_CLOUD_PROJECT: '',
    GCLOUD_PROJECT: '',
    FIREBASE_PROJECT_ID: '',
    GOOGLE_APPLICATION_CREDENTIALS: '',
    FIREBASE_SERVICE_ACCOUNT_JSON: '',
    STRIPE_ENABLED: 'false',
    STRIPE_SECRET_KEY: '',
    STRIPE_WEBHOOK_SECRET: '',
    FIREBASE_CONFIG: JSON.stringify({ projectId }),
    FIREBASE_AUTH_EMULATOR_HOST: authHost,
    FIRESTORE_EMULATOR_HOST: firestoreHost,
    CORS_ORIGINS: FRONTEND_ORIGIN,
    FRONTEND_URL: FRONTEND_ORIGIN,
  };
}

function frontendEnv(env) {
  const { projectId, authHost, firestoreHost } = readEmulatorEnv(env);
  return {
    ...env,
    PORT: FRONTEND_PORT,
    BROWSER: 'none',
    REACT_APP_API_BASE_URL: API_BASE_URL,
    REACT_APP_FIREBASE_EXPECTED_PROJECT_ID: projectId,
    REACT_APP_FIREBASE_API_KEY: 'demo-api-key',
    REACT_APP_FIREBASE_AUTH_DOMAIN: `${projectId}.firebaseapp.com`,
    REACT_APP_FIREBASE_PROJECT_ID: projectId,
    REACT_APP_FIREBASE_STORAGE_BUCKET: `${projectId}.appspot.com`,
    REACT_APP_FIREBASE_MESSAGING_SENDER_ID: 'demo-sender',
    REACT_APP_FIREBASE_APP_ID: 'demo-app-id',
    REACT_APP_USE_FIREBASE_EMULATORS: 'true',
    REACT_APP_FIREBASE_AUTH_EMULATOR_HOST: authHost,
    REACT_APP_FIRESTORE_EMULATOR_HOST: firestoreHost,
    REACT_APP_APPCHECK_ENABLED: 'false',
    REACT_APP_APPCHECK_DEBUG_TOKEN: '',
    REACT_APP_ANALYTICS_ENABLED: 'false',
    REACT_APP_GA_MEASUREMENT_ID: '',
    REACT_APP_STRIPE_PUBLISHABLE_KEY: '',
    REACT_APP_USE_STORAGE_EMULATOR: 'false',
  };
}

module.exports = { readEmulatorEnv, backendEnv, frontendEnv };
