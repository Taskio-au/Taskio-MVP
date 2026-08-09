import { isChatEnabled, normalizeStatus } from '../constants/jobStatuses';

export function getUserProviderIds(user) {
  return Array.from(
    new Set(
      Array.isArray(user?.providerData)
        ? user.providerData
            .map((provider) => String(provider?.providerId || '').trim())
            .filter(Boolean)
        : []
    )
  );
}

export function getClientFirstName(profile, user) {
  const explicitFirstName = String(profile?.firstName || '').trim();
  if (explicitFirstName) return explicitFirstName;

  const displayName = String(profile?.displayName || profile?.name || user?.displayName || '')
    .trim()
    .replace(/\s+/g, ' ');
  if (!displayName) return '';

  return displayName.split(' ')[0] || '';
}

export function getClientAccountStatus(profile, user) {
  const providerIds = getUserProviderIds(user);
  const phoneVerified = profile?.phoneVerified === true;
  const emailVerified = profile?.emailVerified === true || user?.emailVerified === true;
  const firstName = getClientFirstName(profile, user);
  const googleLinked = providerIds.includes('google.com');
  const passwordLinked = providerIds.includes('password');
  const hasDurableMethod = emailVerified || googleLinked;
  const durableAccountReady = phoneVerified && Boolean(firstName) && hasDurableMethod;

  return {
    firstName,
    phoneVerified,
    emailVerified,
    googleLinked,
    passwordLinked,
    hasDurableMethod,
    durableAccountReady,
  };
}

export function shouldBlockClientChat({ status, durableAccountReady }) {
  if (isChatEnabled(normalizeStatus(status))) {
    return false;
  }

  return durableAccountReady !== true;
}

// Compatibility aliases for pre-refactor imports.
export const getHomeownerFirstName = getClientFirstName;
export const getHomeownerAccountStatus = getClientAccountStatus;
