/**
 * Tradie Quote Eligibility Utilities
 * 
 * Centralized eligibility rules for quote submission.
 * MUST be enforced server-side. Client-side checks are for UX only.
 */

/**
 * Check if a tradie profile is complete enough to quote
 * @param {Object} userDoc - Firestore user document data
 * @returns {Object} { isComplete: boolean, missing: string[], score: number }
 */
function checkProfileComplete(userDoc) {
  if (!userDoc || typeof userDoc !== 'object') {
    return { isComplete: false, missing: ['profile'], score: 0 };
  }

  const missing = [];
  let score = 0;

  // Display name (20 points)
  const hasName = !!(userDoc.displayName || userDoc.name || userDoc.fullName);
  if (hasName) {
    score += 20;
  } else {
    missing.push('displayName');
  }

  // Profile photo (20 points)
  const hasPhoto = !!(userDoc.profilePhotoURL || userDoc.photoURL);
  if (hasPhoto) {
    score += 20;
  } else {
    missing.push('profilePhoto');
  }

  // Bio (20 points, min 20 chars)
  const bio = String(userDoc.bio || '').trim();
  if (bio.length >= 20) {
    score += 20;
  } else {
    missing.push('bio');
  }

  // Phone (20 points)
  const hasPhone = !!(userDoc.phoneNumber || userDoc.phone);
  if (hasPhone) {
    score += 20;
  } else {
    missing.push('phone');
  }

  // ABN (20 points)
  const hasAbn = !!(userDoc.abn);
  if (hasAbn) {
    score += 20;
  } else {
    missing.push('abn');
  }

  const isComplete = missing.length === 0;

  return {
    isComplete,
    missing,
    score // 0-100
  };
}

/**
 * Check if a tradie is eligible to submit a quote
 * @param {Object} authUser - Firebase Auth user object (from decoded token)
 * @param {Object} userDoc - Firestore user document data
 * @returns {Object} { eligible: boolean, reason?: string, missing?: string[], score?: number }
 */
function checkQuoteEligibility(authUser, userDoc) {
  // Must be authenticated
  if (!authUser || !authUser.uid) {
    return { eligible: false, reason: 'not_authenticated' };
  }

  // Must be a tradie
  if (userDoc?.role !== 'tradie') {
    return { eligible: false, reason: 'not_tradie' };
  }

  // Email must be verified
  if (!authUser.email_verified && !userDoc?.emailVerified) {
    return { eligible: false, reason: 'email_not_verified' };
  }

  // Must not be suspended
  if (userDoc?.status === 'suspended') {
    return { eligible: false, reason: 'account_suspended' };
  }

  // Must have canQuote permission
  if (userDoc?.canQuote === false) {
    return { eligible: false, reason: 'quote_permission_revoked' };
  }

  // Profile must be complete
  const profileCheck = checkProfileComplete(userDoc);
  if (!profileCheck.isComplete) {
    return { 
      eligible: false, 
      reason: 'profile_incomplete',
      missing: profileCheck.missing,
      score: profileCheck.score
    };
  }

  return { eligible: true, score: profileCheck.score };
}

/**
 * Detect PII/contact information in text
 * @param {string} text - Text to scan
 * @returns {Object} { hasPII: boolean, patterns: string[] }
 */
function detectPII(text) {
  if (!text || typeof text !== 'string') {
    return { hasPII: false, patterns: [] };
  }

  const patterns = [];

  // Email pattern
  const emailPattern = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
  if (emailPattern.test(text)) {
    patterns.push('email');
  }

  // Phone patterns (AU + international)
  const phonePattern = /\b(\+?61|0)4\d{2}[\s-]?\d{3}[\s-]?\d{3}\b|\b\d[\d\s-]{7,12}\d\b/gi;
  if (phonePattern.test(text)) {
    patterns.push('phone');
  }

  // Off-platform keywords
  const offPlatformKeywords = [
    /\bwhatsapp\b/i,
    /\btelegram\b/i,
    /\bcall\s+me\b/i,
    /\btext\s+me\b/i,
    /\bcash\s+(payment|only|job)\b/i,
    /\bbank\s+transfer\b/i,
    /\bdirect\s+deposit\b/i,
    /\boff\s+the\s+books?\b/i,
  ];

  for (const keyword of offPlatformKeywords) {
    if (keyword.test(text)) {
      patterns.push('off_platform_hint');
      break;
    }
  }

  return {
    hasPII: patterns.length > 0,
    patterns
  };
}

module.exports = {
  checkProfileComplete,
  checkQuoteEligibility,
  detectPII
};










