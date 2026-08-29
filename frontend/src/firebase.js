// src/firebase.js
import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import { connectStorageEmulator, getStorage } from 'firebase/storage';
import { initializeAppCheck, ReCaptchaV3Provider } from 'firebase/app-check';
import { resolveFirebaseConfig } from './config/firebaseConfig';
import { resolveAppCheckConfig } from './config/appCheckConfig';
import { appCheckEnvFromProcess, firebaseEnvFromProcess } from './config/runtimeEnv';

const productionFirebaseFallback =
  process.env.REACT_APP_FIREBASE_EXPECTED_PROJECT_ID === 'taskio-v2-staging'
    ? undefined
    : {
      apiKey: 'AIzaSyAVmOP2j8VIMHWRz9o49JHKqyiszQ5qMOg',
      authDomain: 'taskio-v2.firebaseapp.com',
      projectId: 'taskio-v2',
      // IMPORTANT: this must be the actual Storage bucket name for the project.
      // Some Firebase projects use `<projectId>.firebasestorage.app` instead of `<projectId>.appspot.com`.
      storageBucket: 'taskio-v2.firebasestorage.app',
      messagingSenderId: '848916998874',
      appId: '1:848916998874:web:718d57c9621cb15461d3e3',
    };

const firebaseConfig = resolveFirebaseConfig(firebaseEnvFromProcess(), productionFirebaseFallback);

const app = initializeApp(firebaseConfig);

// Optional App Check (recommended for production).
// Enable with:
// - REACT_APP_APPCHECK_ENABLED=true
// - REACT_APP_APPCHECK_SITE_KEY=<reCAPTCHA v3 site key>
// For local dev you can use a debug token:
// - REACT_APP_APPCHECK_DEBUG_TOKEN=true (or a specific debug token string)
const appCheckConfig = resolveAppCheckConfig(appCheckEnvFromProcess());
try {
  if (appCheckConfig.debugToken) {
    const g = typeof window !== 'undefined' ? window : {};
    g.FIREBASE_APPCHECK_DEBUG_TOKEN =
      appCheckConfig.debugToken === 'true'
        ? true
        : appCheckConfig.debugToken;
  }
  if (appCheckConfig.enabled) {
    initializeAppCheck(app, {
      provider: new ReCaptchaV3Provider(appCheckConfig.siteKey),
      isTokenAutoRefreshEnabled: true,
    });
  }
} catch (e) {
  if (process.env.NODE_ENV === 'production') throw e;
}

export const auth = getAuth(app);

if (typeof window !== 'undefined') {
  Object.defineProperty(window, '__TASKIO_PHONE_RECAPTCHA_TESTING_BYPASS__', {
    configurable: true,
    enumerable: false,
    get: () => auth.settings.appVerificationDisabledForTesting === true,
  });
}

// Optional dev-only escape hatch: disable reCAPTCHA for Phone Auth when running locally.
// Use ONLY with Firebase Auth test phone numbers (Firebase Console → Authentication → Phone).
// Enable by setting in `frontend/.env`:
//   REACT_APP_DISABLE_PHONE_RECAPTCHA=true
// Keep this assignment out of try/catch so production minifiers can drop it.
if (
  process.env.NODE_ENV !== 'production'
  && process.env.REACT_APP_DISABLE_PHONE_RECAPTCHA === 'true'
) {
  auth.settings.appVerificationDisabledForTesting = true;
}

export const db = getFirestore(app);

// Storage:
// IMPORTANT: Always use the default bucket from firebaseConfig (`storageBucket`).
// In the past, bucket overrides caused invalid URLs like `/b/gs%3A%2F%2F...` which fail CORS and stall uploads.
export const storage = getStorage(app);

// Optional Storage emulator support (dev only)
// Set in `frontend/.env`:
//   REACT_APP_USE_STORAGE_EMULATOR=true
//   REACT_APP_STORAGE_EMULATOR_HOST=localhost
//   REACT_APP_STORAGE_EMULATOR_PORT=9199
if (
  process.env.NODE_ENV !== 'production'
  && process.env.REACT_APP_USE_STORAGE_EMULATOR === 'true'
) {
  const host = process.env.REACT_APP_STORAGE_EMULATOR_HOST || 'localhost';
  const port = Number(process.env.REACT_APP_STORAGE_EMULATOR_PORT || 9199);
  connectStorageEmulator(storage, host, port);
}

export const googleProvider = new GoogleAuthProvider();

