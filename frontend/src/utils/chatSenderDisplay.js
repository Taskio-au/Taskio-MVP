function isLikelyEmail(value) {
  return typeof value === 'string' && /\S+@\S+\.\S+/.test(value);
}

function roleFallbackLabel(role) {
  if (role === 'homeowner') return 'Client';
  if (role === 'tradie') return 'Expert';
  return 'User';
}

function getProfileFriendlyName(profile) {
  const firstName = String(profile?.firstName || '').trim();
  const lastName = String(profile?.lastName || '').trim();
  const joined = [firstName, lastName].filter(Boolean).join(' ').trim();
  if (joined) return joined;

  const displayName = String(profile?.displayName || profile?.name || '').trim().replace(/\s+/g, ' ');
  if (displayName && !isLikelyEmail(displayName)) return displayName;
  return '';
}

export function getPreferredSenderName(user, role, profile) {
  const profileName = getProfileFriendlyName(profile);
  if (profileName) return profileName;
  const displayName = String(user?.displayName || '').trim().replace(/\s+/g, ' ');
  if (displayName) return displayName;
  return roleFallbackLabel(role);
}

export function getRenderedSenderName(message, currentUser, currentRole, senderProfile) {
  const profileName = getProfileFriendlyName(senderProfile);
  const storedName = String(message?.senderName || '').trim();
  const isMine = Boolean(currentUser?.uid) && message?.senderUid === currentUser?.uid;
  if (isMine) {
    return getPreferredSenderName(currentUser, currentRole, senderProfile);
  }
  if (profileName) return profileName;
  if (!storedName || isLikelyEmail(storedName)) {
    return roleFallbackLabel(message?.senderRole);
  }
  return storedName;
}

export function getMessageLayoutType(message, currentUserUid) {
  if (message?.messageType === 'system') return 'system';
  if (currentUserUid && message?.senderUid === currentUserUid) return 'mine';
  return 'other';
}

