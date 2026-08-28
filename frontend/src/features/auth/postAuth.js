import { signOut } from 'firebase/auth';
import { createApiClient } from '../../api/createApiClient';
import { auth } from '../../firebase';
import {
  ENROLMENT_ERROR_CODES,
  upsertUserProfileFromAuth,
} from '../../utils/upsertUserProfileFromAuth';

const api = createApiClient({ forceRefreshToken: true });

const ENROLMENT_MESSAGES = {
  [ENROLMENT_ERROR_CODES.NOT_ENROLLED]: 'This account is not enrolled.',
  [ENROLMENT_ERROR_CODES.STATE_INVALID]: 'This account is in an invalid state and needs support.',
};

function getRouteForRole(role, claims = {}) {
  if (claims?.admin === true || claims?.role === 'admin') return '/admin/dashboard';
  if (role === 'tradie') return '/tradie/dashboard';
  return '/dashboard';
}

function getErrorCode(err) {
  return String(err?.code || err?.response?.data?.code || '').trim();
}

function isEnrolmentCode(code) {
  return code === ENROLMENT_ERROR_CODES.NOT_ENROLLED || code === ENROLMENT_ERROR_CODES.STATE_INVALID;
}

function enrolmentError(code) {
  const err = new Error(ENROLMENT_MESSAGES[code] || ENROLMENT_MESSAGES[ENROLMENT_ERROR_CODES.NOT_ENROLLED]);
  err.code = code;
  return err;
}

async function signOutUnsupportedIdentity() {
  try {
    await signOut(auth);
  } catch (_) {
    // Best-effort. The caller still surfaces the enrolment error.
  }
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

  try {
    const me = await api.get('/api/me');
    const role = String(me?.data?.profile?.role || '').trim();
    return getRouteForRole(role, claims);
  } catch (err) {
    const code = getErrorCode(err);
    if (isEnrolmentCode(code)) {
      throw enrolmentError(code);
    }
    throw err;
  }
}

export async function finalizeAuthenticatedSession(user, { providerName = '', profileOverrides = null } = {}) {
  if (providerName) {
    const upsertResult = await upsertUserProfileFromAuth(user, providerName, profileOverrides || {});
    if (upsertResult?.enrolled === false) {
      await signOutUnsupportedIdentity();
      throw enrolmentError(upsertResult.code || ENROLMENT_ERROR_CODES.NOT_ENROLLED);
    }
  }

  try {
    return await resolvePostAuthDestination(user);
  } catch (err) {
    const code = getErrorCode(err);
    if (isEnrolmentCode(code)) {
      await signOutUnsupportedIdentity();
      throw enrolmentError(code);
    }
    throw err;
  }
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
