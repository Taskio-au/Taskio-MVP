/**
 * V11 Tradie Eligibility (server-side source of truth)
 *
 * Eligibility to quote for tradies:
 * - user.role === "tradie"
 * - user.status === "active"
 * - user.verified === true (admin verified)
 * - user.phoneVerified === true
 * - user.abnVerified === true
 * - user.stripe.onboardingComplete === true (mapped from existing Stripe fields)
 * - user.profileCompleted === true (stored or derived)
 * - auth email_verified === true (recommended; appears in the dashboard checklist)
 *
 * Frontend should treat these as UX hints only; backend enforces.
 */

function normalizeStatus(s) {
  const v = String(s || '').toLowerCase();
  if (!v) return 'active';
  if (v === 'disabled' || v === 'suspended') return 'disabled';
  if (v === 'pending_deletion') return 'pending_deletion';
  if (v === 'deleted') return 'deleted';
  return v;
}

function hasMinText(value, minLen) {
  return typeof value === 'string' && value.trim().length >= minLen;
}

function parseDob(userDoc) {
  const dob = userDoc?.dob;
  if (!dob || typeof dob !== 'object') return null;
  const day = Number(dob.day);
  const month = Number(dob.month);
  const year = Number(dob.year);
  if (!Number.isFinite(day) || !Number.isFinite(month) || !Number.isFinite(year)) return null;
  if (year < 1900 || year > 2100) return null;
  if (month < 1 || month > 12) return null;
  if (day < 1 || day > 31) return null;
  const d = new Date(Date.UTC(year, month - 1, day));
  // Validate real date (e.g. 31/02 invalid)
  if (d.getUTCFullYear() !== year || (d.getUTCMonth() + 1) !== month || d.getUTCDate() !== day) return null;
  return { day, month, year, date: d };
}

function computeAgeYears(dobObj, now = new Date()) {
  if (!dobObj?.date) return null;
  const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  let age = today.getUTCFullYear() - dobObj.year;
  const m = today.getUTCMonth() + 1;
  const d = today.getUTCDate();
  if (m < dobObj.month || (m === dobObj.month && d < dobObj.day)) age -= 1;
  return age;
}

function hasValidServiceLocation(userDoc) {
  const loc = userDoc?.serviceLocation;
  if (!loc || typeof loc !== 'object') return false;
  const postcode = String(loc.postcode || '').trim();
  const suburb = String(loc.suburb || '').trim();
  const state = String(loc.state || '').trim();
  if (!/^[0-9]{4}$/.test(postcode)) return false;
  if (!suburb || suburb.length < 2) return false;
  if (!state || state.length < 2 || state.length > 4) return false;
  return true;
}

function hasValidBusinessType(userDoc) {
  const bt = normalizeBusinessType(userDoc?.businessType);
  return bt === 'individual' || bt === 'sole_trader' || bt === 'company';
}

function normalizeBusinessType(input) {
  const v = String(input || '').trim().toLowerCase();
  if (v === 'individual') return 'individual';
  if (v === 'sole_trader' || v === 'sole trader') return 'sole_trader';
  if (v === 'company' || v === 'business') return 'company';
  return '';
}

function requiresBusinessName(businessType) {
  return normalizeBusinessType(businessType) === 'company';
}

function requiresAbn(businessType, businessName) {
  const bt = normalizeBusinessType(businessType);
  const bn = String(businessName || '').trim();
  if (bn.length >= 2) return true;
  return bt === 'sole_trader' || bt === 'company';
}

function isAbnRequirementSatisfied(userDoc) {
  if (!requiresAbn(userDoc?.businessType, userDoc?.businessName)) return true;
  return userDoc?.abnVerified === true;
}

/**
 * @param {object} userDoc - Firestore user document (or merged candidate)
 * @param {object} [decodedToken] - Firebase ID token payload (optional); `name` fills identity when doc names are empty
 */
function computeProfileCompleted(userDoc, decodedToken) {
  // Phase 1: identity display + businessName + bio + expertiseApproved + photoURL
  const dn = String(userDoc?.displayName || userDoc?.name || userDoc?.fullName || '').trim();
  const fn = String(userDoc?.firstName || '').trim();
  const ln = String(userDoc?.lastName || '').trim();
  const joined = `${fn} ${ln}`.trim();
  const fromAuth = decodedToken ? String(decodedToken.name || '').trim() : '';
  const displayNameOk = dn.length >= 2 || joined.length >= 2 || fromAuth.length >= 2;
  const bt = normalizeBusinessType(userDoc?.businessType);
  const businessNameRequired = requiresBusinessName(bt);
  const businessNameOk = !businessNameRequired || hasMinText(userDoc?.businessName, 2);
  const bioOk = hasMinText(userDoc?.bio, 20);
  const photoOk = hasMinText(userDoc?.photoURL || userDoc?.profilePhotoURL, 10);
  const expertise = userDoc?.expertiseApproved;
  const expertiseOk = Array.isArray(expertise) ? expertise.length > 0 : false;
  return displayNameOk && businessNameOk && bioOk && photoOk && expertiseOk;
}

function computeStripeOnboardingComplete(userDoc) {
  // Map legacy fields into the V11 stripe.onboardingComplete concept.
  // Existing fields: stripeOnboardingStatus ('completed'), stripeChargesEnabled, stripePayoutsEnabled.
  if (userDoc?.stripe?.onboardingComplete === true) return true;
  if (userDoc?.stripeOnboardingStatus === 'completed') return true;
  if (userDoc?.stripeChargesEnabled === true && userDoc?.stripePayoutsEnabled === true) return true;
  return false;
}

function computeChecklist({ decodedToken, userDoc }) {
  const emailVerified = decodedToken?.email_verified === true;
  const phoneVerified = userDoc?.phoneVerified === true;
  const businessType = normalizeBusinessType(userDoc?.businessType);
  const abnRequired = requiresAbn(businessType, userDoc?.businessName);
  const abnPresent = abnRequired ? hasMinText(userDoc?.abn, 5) : true;
  const abnVerified = abnRequired ? (userDoc?.abnVerified === true) : true;
  const verified = userDoc?.verified === true;
  const stripeOk = computeStripeOnboardingComplete(userDoc);
  const profileCompleted =
    userDoc?.profileCompleted === true || computeProfileCompleted(userDoc, decodedToken);
  const serviceLocationPresent = hasValidServiceLocation(userDoc);
  const dobObj = parseDob(userDoc);
  const dobPresent = !!dobObj;
  const ageYears = dobObj ? computeAgeYears(dobObj) : null;
  const is18PlusConfirmed = dobPresent && Number.isFinite(ageYears) && ageYears >= 18;
  const businessTypeSet = hasValidBusinessType(userDoc);

  return {
    emailVerified,
    phoneVerified,
    businessType,
    abnRequired,
    abnPresent,
    abnVerified,
    verified,
    stripeOnboardingComplete: stripeOk,
    profileCompleted,
    serviceLocationPresent,
    dobPresent,
    is18PlusConfirmed,
    businessTypeSet,
  };
}

function computeEligibility({ decodedToken, userDoc }) {
  const reasons = [];

  const role = userDoc?.role;
  const status = normalizeStatus(userDoc?.status);

  if (role !== 'tradie') reasons.push('NOT_TRADIE');
  if (status !== 'active') reasons.push('STATUS_NOT_ACTIVE');

  const checklist = computeChecklist({ decodedToken, userDoc });

  if (!checklist.emailVerified) reasons.push('EMAIL_NOT_VERIFIED');
  if (!checklist.verified) reasons.push('UNVERIFIED');
  if (!checklist.phoneVerified) reasons.push('PHONE_NOT_VERIFIED');
  if (checklist.abnRequired && !checklist.abnPresent) reasons.push('ABN_MISSING');
  if (checklist.abnRequired && !checklist.abnVerified) reasons.push('ABN_NOT_VERIFIED');
  if (!checklist.stripeOnboardingComplete) reasons.push('STRIPE_NOT_COMPLETE');
  if (!checklist.profileCompleted) reasons.push('PROFILE_INCOMPLETE');
  if (!checklist.serviceLocationPresent) reasons.push('SERVICE_LOCATION_MISSING');
  if (!checklist.businessTypeSet) reasons.push('BUSINESS_TYPE_MISSING');
  if (!checklist.dobPresent) reasons.push('DOB_MISSING');
  else if (!checklist.is18PlusConfirmed) reasons.push('UNDERAGE');

  const eligible = reasons.length === 0;

  return {
    eligible,
    reasons,
    checklist,
    derived: {
      status,
      stripeOnboardingComplete: checklist.stripeOnboardingComplete,
      profileCompleted: checklist.profileCompleted,
      is18PlusConfirmed: checklist.is18PlusConfirmed,
    },
  };
}

module.exports = {
  computeEligibility,
  computeProfileCompleted,
  computeStripeOnboardingComplete,
  computeChecklist,
  normalizeBusinessType,
  requiresAbn,
  requiresBusinessName,
  isAbnRequirementSatisfied,
};






