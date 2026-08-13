import { resolveFirebaseConfig } from './firebaseConfig';

const productionConfig = {
  apiKey: 'production-api-key',
  authDomain: 'taskio-v2.firebaseapp.com',
  projectId: 'taskio-v2',
  storageBucket: 'taskio-v2.firebasestorage.app',
  messagingSenderId: 'production-sender-id',
  appId: 'production-app-id',
};

const stagingEnv = {
  REACT_APP_FIREBASE_EXPECTED_PROJECT_ID: 'taskio-v2-staging',
  REACT_APP_FIREBASE_API_KEY: 'staging-api-key',
  REACT_APP_FIREBASE_AUTH_DOMAIN: 'taskio-v2-staging.firebaseapp.com',
  REACT_APP_FIREBASE_PROJECT_ID: 'taskio-v2-staging',
  REACT_APP_FIREBASE_STORAGE_BUCKET: 'taskio-v2-staging.firebasestorage.app',
  REACT_APP_FIREBASE_MESSAGING_SENDER_ID: 'staging-sender-id',
  REACT_APP_FIREBASE_APP_ID: 'staging-app-id',
};

test('uses the existing production configuration when no environment override is present', () => {
  expect(resolveFirebaseConfig({}, productionConfig)).toBe(productionConfig);
});

test('uses a complete staging environment configuration', () => {
  expect(resolveFirebaseConfig(stagingEnv, productionConfig)).toEqual({
    apiKey: 'staging-api-key',
    authDomain: 'taskio-v2-staging.firebaseapp.com',
    projectId: 'taskio-v2-staging',
    storageBucket: 'taskio-v2-staging.firebasestorage.app',
    messagingSenderId: 'staging-sender-id',
    appId: 'staging-app-id',
  });
});

test('rejects an environment override without an expected project ID', () => {
  const { REACT_APP_FIREBASE_EXPECTED_PROJECT_ID, ...unboundStagingEnv } = stagingEnv;

  expect(() => resolveFirebaseConfig(unboundStagingEnv, productionConfig)).toThrow(
    'Firebase environment override requires REACT_APP_FIREBASE_EXPECTED_PROJECT_ID.',
  );
});

test('rejects a partial Firebase environment configuration', () => {
  expect(() => resolveFirebaseConfig({
    REACT_APP_FIREBASE_PROJECT_ID: 'taskio-v2-staging',
  }, productionConfig)).toThrow('Incomplete Firebase configuration');
});

test('rejects falling back to production when a staging build is expected', () => {
  expect(() => resolveFirebaseConfig({
    REACT_APP_FIREBASE_EXPECTED_PROJECT_ID: 'taskio-v2-staging',
  }, productionConfig)).toThrow(
    'Firebase project mismatch: expected taskio-v2-staging, received taskio-v2.',
  );
});

test('rejects a Firebase project that does not match the expected environment', () => {
  expect(() => resolveFirebaseConfig({
    ...stagingEnv,
    REACT_APP_FIREBASE_PROJECT_ID: 'taskio-v2',
  }, productionConfig)).toThrow(
    'Firebase project mismatch: expected taskio-v2-staging, received taskio-v2.',
  );
});

test('rejects a Firebase Auth domain from another environment', () => {
  expect(() => resolveFirebaseConfig({
    ...stagingEnv,
    REACT_APP_FIREBASE_AUTH_DOMAIN: 'taskio-v2.firebaseapp.com',
  }, productionConfig)).toThrow(
    'Firebase Auth domain mismatch: expected taskio-v2-staging.firebaseapp.com, received taskio-v2.firebaseapp.com.',
  );
});

test('rejects a Firebase Storage bucket from another environment', () => {
  expect(() => resolveFirebaseConfig({
    ...stagingEnv,
    REACT_APP_FIREBASE_STORAGE_BUCKET: 'taskio-v2.firebasestorage.app',
  }, productionConfig)).toThrow(
    'Firebase Storage bucket does not belong to expected project taskio-v2-staging.',
  );
});
