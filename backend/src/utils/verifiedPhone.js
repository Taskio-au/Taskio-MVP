'use strict';

/**
 * Phone verification for authenticated product gates.
 * Trust only Firestore phoneVerified or a non-empty Firebase ID-token phone_number.
 * Do not trust users.phone, request bodies, or unverified custom headers.
 *
 * @param {object} [profile]
 * @param {object} [decodedToken]
 * @returns {boolean}
 */
function hasVerifiedPhone(profile, decodedToken) {
  if (profile && profile.phoneVerified === true) return true;
  const tokenPhone = decodedToken && decodedToken.phone_number != null
    ? String(decodedToken.phone_number).trim()
    : '';
  return tokenPhone.length > 0;
}

module.exports = { hasVerifiedPhone };
