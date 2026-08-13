const FIREBASE_ENV_KEYS = {
  apiKey: 'REACT_APP_FIREBASE_API_KEY',
  authDomain: 'REACT_APP_FIREBASE_AUTH_DOMAIN',
  projectId: 'REACT_APP_FIREBASE_PROJECT_ID',
  storageBucket: 'REACT_APP_FIREBASE_STORAGE_BUCKET',
  messagingSenderId: 'REACT_APP_FIREBASE_MESSAGING_SENDER_ID',
  appId: 'REACT_APP_FIREBASE_APP_ID',
};

function validateExpectedProject(config, expectedProjectId) {
  if (!expectedProjectId) {
    return;
  }

  if (config.projectId !== expectedProjectId) {
    throw new Error(
      `Firebase project mismatch: expected ${expectedProjectId}, received ${config.projectId}.`,
    );
  }

  const expectedAuthDomain = `${expectedProjectId}.firebaseapp.com`;
  if (config.authDomain !== expectedAuthDomain) {
    throw new Error(
      `Firebase Auth domain mismatch: expected ${expectedAuthDomain}, received ${config.authDomain}.`,
    );
  }

  const expectedStorageBuckets = [
    `${expectedProjectId}.firebasestorage.app`,
    `${expectedProjectId}.appspot.com`,
  ];
  if (!expectedStorageBuckets.includes(config.storageBucket)) {
    throw new Error(
      `Firebase Storage bucket does not belong to expected project ${expectedProjectId}.`,
    );
  }
}

export function resolveFirebaseConfig(env, fallbackConfig) {
  const configuredEntries = Object.entries(FIREBASE_ENV_KEYS)
    .filter(([, envKey]) => Boolean(env[envKey]));
  const expectedProjectId = env.REACT_APP_FIREBASE_EXPECTED_PROJECT_ID;

  if (configuredEntries.length === 0) {
    validateExpectedProject(fallbackConfig, expectedProjectId);
    return fallbackConfig;
  }

  if (!expectedProjectId) {
    throw new Error(
      'Firebase environment override requires REACT_APP_FIREBASE_EXPECTED_PROJECT_ID.',
    );
  }

  if (configuredEntries.length !== Object.keys(FIREBASE_ENV_KEYS).length) {
    const missingKeys = Object.values(FIREBASE_ENV_KEYS)
      .filter((envKey) => !env[envKey]);

    throw new Error(`Incomplete Firebase configuration. Missing: ${missingKeys.join(', ')}.`);
  }

  const config = Object.fromEntries(
    Object.entries(FIREBASE_ENV_KEYS).map(([configKey, envKey]) => [configKey, env[envKey]]),
  );

  validateExpectedProject(config, expectedProjectId);
  return config;
}
