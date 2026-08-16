import { resolveE2EAuthEnabled } from '../config/e2eAuthConfig';

const E2E_AUTH_ENABLED = resolveE2EAuthEnabled(process.env);
const E2E_USER_STORAGE_KEY = 'taskio.e2e.user';

function safeReadRawUser() {
  if (!E2E_AUTH_ENABLED) return null;
  if (typeof window === 'undefined' || !window.localStorage) return null;
  const raw = window.localStorage.getItem(E2E_USER_STORAGE_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch (_e) {
    return null;
  }
}

export function getE2EAuthUser() {
  const raw = safeReadRawUser();
  if (!raw || !raw.uid) return null;

  const claims = raw.claims || (raw.role ? { role: raw.role } : {});
  const token = raw.token || `e2e-token-${raw.uid}`;

  return {
    uid: raw.uid,
    email: raw.email || 'e2e@taskio.test',
    displayName: raw.displayName || 'E2E User',
    async getIdToken() {
      return token;
    },
    async getIdTokenResult() {
      return { claims };
    },
  };
}

export function isE2EAdminUser() {
  const raw = safeReadRawUser();
  if (!raw) return false;
  const claims = raw.claims || {};
  return raw.admin === true || raw.role === 'admin' || claims.admin === true || claims.role === 'admin';
}

export function isE2EAuthEnabled() {
  return E2E_AUTH_ENABLED;
}
