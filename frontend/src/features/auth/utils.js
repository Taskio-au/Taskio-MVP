import { sendSignInLinkToEmail } from 'firebase/auth';
import { normalizeAuMobileToE164 } from '../../services/phoneVerification';

export const MAGIC_LINK_EMAIL_KEY = 'taskio_magic_link_email';
export const MAGIC_LINK_SENT_AT_KEY = 'taskio_magic_link_sent_at';
export const PUBLIC_AUTH_ERROR = "We couldn't sign you in. Please check your details or try another method.";
export const PUBLIC_AUTH_TEMPORARY_ERROR = "We're having trouble signing you in right now. Please try again in a moment.";

export function normalizeIdentifier(value) {
  return String(value || '').trim();
}

export function isEmailIdentifier(value) {
  return /\S+@\S+\.\S+/.test(String(value || '').trim());
}

export function getIdentifierType(value) {
  const normalized = normalizeIdentifier(value);
  if (!normalized) return { type: 'empty', value: '' };
  if (isEmailIdentifier(normalized)) {
    return { type: 'email', value: normalized.toLowerCase() };
  }
  try {
    return {
      type: 'phone',
      value: normalizeAuMobileToE164(normalized),
    };
  } catch (_) {
    return { type: 'invalid', value: normalized };
  }
}

export function hasPasswordSignInMethod(methods = []) {
  return Array.isArray(methods) && methods.includes('password');
}

export function hasAnySignInMethod(methods = []) {
  return Array.isArray(methods) && methods.length > 0;
}

export function normalizeResolvedEmailStrategy(value) {
  const strategy = String(value || '').trim().toLowerCase();
  if (strategy === 'password') return 'password';
  if (strategy === 'magic_link') return 'magic_link';
  if (strategy === 'google') return 'google';
  if (strategy === 'unknown') return 'unknown';
  if (strategy === 'unavailable') return 'unavailable';
  return 'ambiguous';
}

export async function resolveEmailSignIn(apiClient, email) {
  const normalizedEmail = String(email || '').trim().toLowerCase();
  if (!normalizedEmail) {
    return { strategy: 'ambiguous', source: 'client' };
  }

  try {
    const response = await apiClient.post('/api/auth/resolve-email', { email: normalizedEmail });
    return {
      strategy: normalizeResolvedEmailStrategy(response?.data?.strategy),
      source: 'resolver',
    };
  } catch (error) {
    const status = Number(error?.response?.status || 0);
    return {
      strategy: status >= 500 || status === 0 ? 'unavailable' : 'ambiguous',
      source: 'resolver_error',
    };
  }
}

export function maskEmail(value) {
  const email = String(value || '').trim();
  const parts = email.split('@');
  if (parts.length !== 2) return email;
  const [name, domain] = parts;
  if (!name) return email;
  const visible = name.slice(0, Math.min(2, name.length));
  return `${visible}${'*'.repeat(Math.max(1, name.length - visible.length))}@${domain}`;
}

export function maskPhone(value) {
  const phone = String(value || '').trim();
  if (phone.length < 4) return phone;
  return `${phone.slice(0, 3)} ${'*'.repeat(Math.max(0, phone.length - 7))}${phone.slice(-4)}`;
}

export function storePendingMagicLinkEmail(email) {
  try {
    window.localStorage.setItem(MAGIC_LINK_EMAIL_KEY, String(email || '').trim().toLowerCase());
    window.localStorage.setItem(MAGIC_LINK_SENT_AT_KEY, String(Date.now()));
  } catch (_) {
    // ignore storage failures
  }
}

export function readPendingMagicLinkEmail() {
  try {
    return String(window.localStorage.getItem(MAGIC_LINK_EMAIL_KEY) || '').trim().toLowerCase();
  } catch (_) {
    return '';
  }
}

export function clearPendingMagicLinkEmail() {
  try {
    window.localStorage.removeItem(MAGIC_LINK_EMAIL_KEY);
    window.localStorage.removeItem(MAGIC_LINK_SENT_AT_KEY);
  } catch (_) {
    // ignore storage failures
  }
}

export function buildMagicLinkSettings() {
  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  return {
    url: `${origin}/auth/action`,
    handleCodeInApp: true,
  };
}

export async function sendTaskioMagicLink(auth, email) {
  const normalizedEmail = String(email || '').trim().toLowerCase();
  await sendSignInLinkToEmail(auth, normalizedEmail, buildMagicLinkSettings());
  storePendingMagicLinkEmail(normalizedEmail);
}

