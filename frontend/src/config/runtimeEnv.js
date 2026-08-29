// Explicit process.env.KEY reads so webpack inlines only these values.
// Never pass the process.env object: CRA would embed every REACT_APP_* value
// from local .env files into the bundle.

export function firebaseEnvFromProcess() {
  return {
    REACT_APP_FIREBASE_EXPECTED_PROJECT_ID: process.env.REACT_APP_FIREBASE_EXPECTED_PROJECT_ID,
    REACT_APP_FIREBASE_API_KEY: process.env.REACT_APP_FIREBASE_API_KEY,
    REACT_APP_FIREBASE_AUTH_DOMAIN: process.env.REACT_APP_FIREBASE_AUTH_DOMAIN,
    REACT_APP_FIREBASE_PROJECT_ID: process.env.REACT_APP_FIREBASE_PROJECT_ID,
    REACT_APP_FIREBASE_STORAGE_BUCKET: process.env.REACT_APP_FIREBASE_STORAGE_BUCKET,
    REACT_APP_FIREBASE_MESSAGING_SENDER_ID: process.env.REACT_APP_FIREBASE_MESSAGING_SENDER_ID,
    REACT_APP_FIREBASE_APP_ID: process.env.REACT_APP_FIREBASE_APP_ID,
  };
}

export function apiEnvFromProcess() {
  return {
    NODE_ENV: process.env.NODE_ENV,
    REACT_APP_API_BASE_URL: process.env.REACT_APP_API_BASE_URL,
    REACT_APP_E2E_HARNESS_BUILD: process.env.REACT_APP_E2E_HARNESS_BUILD,
    REACT_APP_E2E_AUTH_BYPASS: process.env.REACT_APP_E2E_AUTH_BYPASS,
    REACT_APP_FIREBASE_PROJECT_ID: process.env.REACT_APP_FIREBASE_PROJECT_ID,
  };
}

export function appCheckEnvFromProcess() {
  return {
    NODE_ENV: process.env.NODE_ENV,
    REACT_APP_APPCHECK_ENABLED: process.env.REACT_APP_APPCHECK_ENABLED,
    REACT_APP_APPCHECK_SITE_KEY: process.env.REACT_APP_APPCHECK_SITE_KEY,
    REACT_APP_APPCHECK_DEBUG_TOKEN: process.env.REACT_APP_APPCHECK_DEBUG_TOKEN,
  };
}

export function e2eAuthEnvFromProcess() {
  return {
    NODE_ENV: process.env.NODE_ENV,
    REACT_APP_E2E_AUTH_BYPASS: process.env.REACT_APP_E2E_AUTH_BYPASS,
    REACT_APP_E2E_HARNESS_BUILD: process.env.REACT_APP_E2E_HARNESS_BUILD,
    REACT_APP_FIREBASE_PROJECT_ID: process.env.REACT_APP_FIREBASE_PROJECT_ID,
    REACT_APP_API_BASE_URL: process.env.REACT_APP_API_BASE_URL,
  };
}
