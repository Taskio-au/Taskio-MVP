/**
 * Public Profile Utilities
 * 
 * Helper functions to extract and work with public user profile data.
 * This ensures we never accidentally expose private information (email, phone, ABN)
 * when displaying user profiles to other users.
 */

/**
 * Extract only public fields from a user document
 * @param {Object} userDoc - Full user document from Firestore
 * @returns {Object} Public profile data safe to display to other users
 */
export function getPublicUserProfile(userDoc) {
  if (!userDoc || typeof userDoc !== 'object') {
    return null;
  }

  return {
    uid: userDoc.uid || null,
    displayName: userDoc.displayName || userDoc.name || 'User',
    profilePhotoURL: userDoc.profilePhotoURL || userDoc.photoURL || null,
    bio: userDoc.bio || null,
    businessName: userDoc.businessName || null,
    role: userDoc.role || 'homeowner',
    isVerified: userDoc.verified || userDoc.isVerified || false,
    // Do NOT include: email, phone, abn, abnLocked, createdAt, or any private fields
  };
}

/**
 * Check if a user profile is complete enough to be publicly displayed
 * @param {Object} publicProfile - Public profile object (from getPublicUserProfile)
 * @returns {boolean} True if profile has minimum required fields
 */
export function isProfileComplete(publicProfile) {
  if (!publicProfile) return false;
  return !!(publicProfile.displayName && publicProfile.role);
}

/**
 * Get user initials for avatar fallback
 * @param {Object} publicProfile - Public profile object
 * @returns {string} Two-letter initials (e.g., "JD")
 */
export function getUserInitials(publicProfile) {
  if (!publicProfile) return 'U';
  
  const name = publicProfile.displayName || '';
  const parts = name.trim().split(/\s+/);
  
  if (parts.length >= 2) {
    return (parts[0][0] + parts[1][0]).toUpperCase();
  }
  
  if (parts.length === 1 && parts[0].length >= 2) {
    return parts[0].slice(0, 2).toUpperCase();
  }
  
  if (parts.length === 1 && parts[0].length === 1) {
    return parts[0].toUpperCase();
  }
  
  return 'U';
}

/**
 * Get display name with fallback
 * @param {Object} publicProfile - Public profile object
 * @returns {string} Display name or fallback
 */
export function getDisplayName(publicProfile) {
  if (!publicProfile) return 'User';
  return publicProfile.displayName || 'User';
}

/**
 * Get verification badge text
 * @param {Object} publicProfile - Public profile object
 * @returns {string|null} Badge text or null if not applicable
 */
export function getVerificationBadge(publicProfile) {
  if (!publicProfile) return null;
  if (publicProfile.role !== 'tradie') return null;
  return publicProfile.isVerified ? 'Verified' : 'Pending';
}










