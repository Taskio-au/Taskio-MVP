const LOOPBACK_HOST_PORT = /^(localhost|127\.0\.0\.1|\[::1\]):(\d{2,5})$/i;

function parseLoopbackHostPort(value, envKey) {
  const match = LOOPBACK_HOST_PORT.exec(String(value || '').trim());
  if (!match) {
    throw new Error(`${envKey} must be a loopback host:port.`);
  }
  return { host: match[1].toLowerCase(), port: Number(match[2]) };
}

// Auth + Firestore emulators for `npm run dev:local`. Refuses anything except a
// development bundle on a demo- project, so staging/production configs cannot connect.
export function resolveFirebaseEmulatorConfig(env = {}, projectId = '') {
  if (env.REACT_APP_USE_FIREBASE_EMULATORS !== 'true') return null;
  if (env.NODE_ENV !== 'development') {
    throw new Error('Firebase emulators are available in local development only.');
  }
  if (!String(projectId || '').startsWith('demo-')) {
    throw new Error('Firebase emulators require a demo- Firebase project ID.');
  }
  const auth = parseLoopbackHostPort(
    env.REACT_APP_FIREBASE_AUTH_EMULATOR_HOST,
    'REACT_APP_FIREBASE_AUTH_EMULATOR_HOST',
  );
  const firestore = parseLoopbackHostPort(
    env.REACT_APP_FIRESTORE_EMULATOR_HOST,
    'REACT_APP_FIRESTORE_EMULATOR_HOST',
  );
  return { authUrl: `http://${auth.host}:${auth.port}`, firestore };
}
