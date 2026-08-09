'use strict';

const { isSupportedMelbournePilotLocation } = require('../../../shared/auLocations');

/**
 * @param {Record<string, unknown>} data Raw Firestore users/{uid} when role is tradie
 */
function serviceLocationCandidatesForPilotCheck(data) {
  const candidates = [];
  const loc =
    data.serviceLocation && typeof data.serviceLocation === 'object'
      ? data.serviceLocation
      : null;

  const suburbMerged = String(
    data.primaryServiceSuburb || (loc?.suburb != null ? loc.suburb : '') || ''
  ).trim();
  const postcodeMerged = String(
    data.primaryServicePostcode || (loc?.postcode != null ? loc.postcode : '') || ''
  ).trim();
  const stateMerged = String(
    data.primaryServiceState || (loc?.state != null ? loc.state : '') || 'VIC'
  ).trim() || 'VIC';

  if (loc?.label && typeof loc.label === 'string' && loc.label.trim()) {
    candidates.push(loc.label.trim());
  }
  if ((suburbMerged || postcodeMerged) || (loc && (loc.suburb || loc.postcode))) {
    candidates.push({
      suburb: suburbMerged || String(loc?.suburb || '').trim(),
      state: stateMerged || 'VIC',
      postcode: postcodeMerged || String(loc?.postcode || '').trim(),
    });
  }

  const seen = new Set();
  const out = [];
  for (const c of candidates) {
    const key = typeof c === 'string' ? `s:${c}` : `o:${JSON.stringify(c)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(c);
  }
  return out;
}

/**
 * Admin Detail panel eligibility (no phone/email requirement).
 *
 * Automatic enrolment uses the same geo / Stripe / expertise / verified gates and additionally
 * requires phone + email verification when `{ autoEnroll: true }` (Firebase Auth may supply email_verified).
 *
 * @param {Record<string, unknown>} data
 * @param {{ autoEnroll?: boolean, firebaseEmailVerified?: boolean }} [options]
 */
function foundingExpertEligibilityPayload(data, options = {}) {
  const autoEnroll = options.autoEnroll === true;
  const firebaseEmailVerified = options.firebaseEmailVerified === true;

  const isExpert = data.role === 'tradie';
  const rawStatus = String(data.status || '').trim();
  const isActive = isExpert && rawStatus === 'active';

  const isPlatformVerified = isExpert && !!data.verified;

  const stripeOk =
    String(data.stripeOnboardingStatus || '').trim().toLowerCase() === 'completed'
    && data.stripePayoutsEnabled === true;
  const isStripePayoutReady = isExpert && stripeOk;

  const pilotCandidates = isExpert ? serviceLocationCandidatesForPilotCheck(data) : [];
  const hasServiceAreaOnFile = isExpert && pilotCandidates.length > 0;
  let isMelbournePilotArea = false;
  if (isExpert && pilotCandidates.length > 0) {
    for (const c of pilotCandidates) {
      if (isSupportedMelbournePilotLocation(c)) {
        isMelbournePilotArea = true;
        break;
      }
    }
  }

  const exp = Array.isArray(data.expertiseApproved) ? data.expertiseApproved : [];
  const hasApprovedExpertise = isExpert && exp.length > 0;

  /** @type {string[]} */
  const reasons = [];
  if (isExpert && !isActive) reasons.push('Expert account is not active.');
  if (isExpert && !isPlatformVerified) reasons.push('Platform verification is incomplete.');
  if (isExpert && !isStripePayoutReady) {
    reasons.push('Stripe payouts not ready.');
  }
  if (isExpert && pilotCandidates.length === 0) {
    reasons.push('No service location on file.');
  } else if (isExpert && !isMelbournePilotArea) {
    reasons.push('Not in Melbourne launch area.');
  }
  if (isExpert && !hasApprovedExpertise) {
    reasons.push('No approved task categories.');
  }

  let eligible =
    isExpert && isActive && isPlatformVerified && isStripePayoutReady
      && isMelbournePilotArea && hasApprovedExpertise;

  /** @type {boolean|undefined} */
  let isPhoneVerified;
  /** @type {boolean|undefined} */
  let isEmailVerified;

  if (autoEnroll) {
    isPhoneVerified = data.phoneVerified === true;
    isEmailVerified = data.emailVerified === true || firebaseEmailVerified;
    if (!isPhoneVerified) reasons.push('Phone verification incomplete.');
    if (!isEmailVerified) reasons.push('Email verification incomplete.');
    eligible = !!(eligible && isPhoneVerified && isEmailVerified);
  }

  /** @type {Record<string, unknown>} */
  const out = {
    isExpert,
    isActive,
    isPlatformVerified,
    isStripePayoutReady,
    hasServiceAreaOnFile,
    isMelbournePilotArea,
    hasApprovedExpertise,
    eligible,
    reasons,
  };

  if (autoEnroll) {
    out.isPhoneVerified = isPhoneVerified;
    out.isEmailVerified = isEmailVerified;
  }

  return out;
}

module.exports = {
  serviceLocationCandidatesForPilotCheck,
  foundingExpertEligibilityPayload,
};
