import { createApiClient } from '../../api/createApiClient';
import { upsertUserProfileFromAuth } from '../../utils/upsertUserProfileFromAuth';

const api = createApiClient({ forceRefreshToken: true });

function getRouteForRole(role, claims = {}) {
  if (claims?.admin === true || claims?.role === 'admin') return '/admin/dashboard';
  if (role === 'tradie') return '/tradie/dashboard';
  return '/dashboard';
}

export async function resolvePostAuthDestination(user) {
  if (!user) throw new Error('Missing authenticated user.');

  let claims = {};
  try {
    const tokenResult = await user.getIdTokenResult(true);
    claims = tokenResult?.claims || {};
  } catch (_) {
    // ignore and fall back to profile
  }

  if (claims?.admin === true) return '/admin/dashboard';
  if (claims?.role === 'tradie') return '/tradie/dashboard';
  if (claims?.role === 'homeowner') return '/dashboard';

  try {
    const me = await api.get('/api/me');
    const role = String(me?.data?.profile?.role || '').trim();
    return getRouteForRole(role, claims);
  } catch (_) {
    return '/dashboard';
  }
}

export async function finalizeAuthenticatedSession(user, { providerName = '', profileOverrides = null } = {}) {
  if (providerName) {
    await upsertUserProfileFromAuth(user, providerName, profileOverrides || {});
  }
  return resolvePostAuthDestination(user);
}

export async function buildExistingMethodMessage(_email, methods = []) {
  const readableMethods = Array.isArray(methods) ? methods : [];
  if (readableMethods.includes('password')) {
    return "We couldn't sign you in with Google. Try your password or another method.";
  }
  if (readableMethods.includes('google.com')) {
    return "We couldn't sign you in. Continue with Google again or try another method.";
  }
  if (readableMethods.length > 0) {
    return "We couldn't sign you in with Google. Try another sign-in method.";
  }
  return "We couldn't sign you in. Please try another method.";
}

