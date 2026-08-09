'use strict';

const { db } = require('../firebaseAdmin');
const { safeToMillis } = require('../utils/firestore');
const { computeProfileCompleted, computeStripeOnboardingComplete } = require('../utils/v11TradieEligibility');

/**
 * Normalized trust bucket for admin UI chips.
 * @typedef {'VERIFIED'|'PENDING_REVIEW'|'REJECTED'|'INCOMPLETE'|'REQUIRES_ATTENTION'} TrustBucket
 */

/**
 * @param {object} userData - users/{uid} document
 * @returns {TrustBucket}
 */
function computeVerificationBucket(userData) {
  const d = userData || {};
  if (d.verified === true && d.status !== 'disabled') return 'VERIFIED';
  if (d.status === 'disabled') return 'REJECTED';
  if (d.verificationStatus === 'rejected') return 'REJECTED';
  if (d.verificationStatus === 'pending' || d.verificationReviewRequired === true) return 'PENDING_REVIEW';
  const prof = computeProfileCompleted(d);
  const stripe = computeStripeOnboardingComplete(d);
  if (!prof || !stripe || !d.abnVerified) return 'INCOMPLETE';
  return 'REQUIRES_ATTENTION';
}

/**
 * @param {string} expertId
 * @returns {Promise<{
 *   verificationStatus: TrustBucket,
 *   abnStatus: string,
 *   stripeStatus: string,
 *   profileCompleteness: 'complete'|'incomplete',
 *   lastVerifiedAt: number|null,
 *   trustFlags: string[],
 * }>}
 */
async function getExpertTrustSummary(expertId) {
  const id = String(expertId || '').trim();
  if (!id) {
    return {
      verificationStatus: 'INCOMPLETE',
      abnStatus: 'unknown',
      stripeStatus: 'unknown',
      profileCompleteness: 'incomplete',
      lastVerifiedAt: null,
      trustFlags: [],
    };
  }

  const snap = await db.collection('users').doc(id).get();
  if (!snap.exists) {
    return {
      verificationStatus: 'INCOMPLETE',
      abnStatus: 'unknown',
      stripeStatus: 'unknown',
      profileCompleteness: 'incomplete',
      lastVerifiedAt: null,
      trustFlags: ['USER_NOT_FOUND'],
    };
  }

  const u = snap.data() || {};
  if (u.role && u.role !== 'tradie') {
    return {
      verificationStatus: 'INCOMPLETE',
      abnStatus: 'n/a',
      stripeStatus: 'n/a',
      profileCompleteness: 'incomplete',
      lastVerifiedAt: null,
      trustFlags: ['NOT_EXPERT'],
    };
  }

  const verificationStatus = computeVerificationBucket(u);
  const abnOk = u.abnVerified === true;
  const abnStatus = abnOk ? 'verified' : u.abn ? 'unverified' : 'missing';
  const stripeOk = computeStripeOnboardingComplete(u);
  const stripeStatus = String(u.stripeOnboardingStatus || (stripeOk ? 'completed' : 'pending'));
  const profileCompleteness = computeProfileCompleted(u) ? 'complete' : 'incomplete';

  const lastVerifiedAt =
    safeToMillis(u.verifiedAt) ||
    safeToMillis(u.lastVerifiedAt) ||
    safeToMillis(u.updatedAt) ||
    null;

  const trustFlags = [];
  if (!stripeOk) trustFlags.push('STRIPE_INCOMPLETE');
  if (!abnOk && u.businessType && u.businessType !== 'individual') trustFlags.push('ABN_UNVERIFIED');
  if (verificationStatus === 'PENDING_REVIEW') trustFlags.push('VERIFICATION_REVIEW');
  if (u.quoteAccessVerified === false) trustFlags.push('QUOTE_ACCESS');

  return {
    verificationStatus,
    abnStatus,
    stripeStatus,
    profileCompleteness,
    lastVerifiedAt,
    trustFlags,
  };
}

module.exports = { getExpertTrustSummary, computeVerificationBucket };
