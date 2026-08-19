// Utility functions for Task Expert profile validation and compliance

/**
 * Compute age from YYYY-MM-DD date string
 * @param {string} dobInput - Date in YYYY-MM-DD format
 * @returns {number | null} - Age in years, or null if invalid
 */
export function computeAge(dobInput) {
  if (!dobInput || typeof dobInput !== 'string') return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dobInput);
  if (!match) return null;
  
  const year = parseInt(match[1], 10);
  const month = parseInt(match[2], 10);
  const day = parseInt(match[3], 10);
  
  if (year < 1900 || year > new Date().getFullYear()) return null;
  if (month < 1 || month > 12) return null;
  if (day < 1 || day > 31) return null;
  
  const dob = new Date(year, month - 1, day);
  if (dob.getFullYear() !== year || dob.getMonth() !== month - 1 || dob.getDate() !== day) {
    return null; // Invalid date (e.g. Feb 31)
  }
  
  const today = new Date();
  let age = today.getFullYear() - dob.getFullYear();
  const monthDiff = today.getMonth() - dob.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < dob.getDate())) {
    age--;
  }
  
  return age;
}

/**
 * Validate DOB input for compliance
 * @param {string} dobInput - Date in YYYY-MM-DD format
 * @returns {{ valid: boolean, error: string | null, age: number | null, isAdult: boolean }}
 */
export function validateDob(dobInput) {
  if (!dobInput) {
    return { valid: false, error: null, age: null, isAdult: false };
  }
  
  const age = computeAge(dobInput);
  
  if (age === null) {
    return { valid: false, error: 'Please enter a valid date of birth.', age: null, isAdult: false };
  }
  
  // Check for future date
  const [year, month, day] = dobInput.split('-').map(Number);
  const inputDate = new Date(year, month - 1, day);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  
  if (inputDate > today) {
    return { valid: false, error: 'Date of birth cannot be in the future.', age: null, isAdult: false };
  }
  
  const isAdult = age >= 18;
  
  return { valid: true, error: null, age, isAdult };
}

/**
 * Check if user has verified identity (for field locking)
 * @param {object} profile - User profile object from Firestore
 * @returns {boolean}
 */
export function hasVerifiedIdentity(profile) {
  if (!profile) return false;
  
  return (
    profile.privateDetailsLocked === true ||
    profile.abnVerified === true ||
    profile.verified === true ||
    profile.stripe?.onboardingComplete === true ||
    profile.stripeOnboardingStatus === 'completed'
  );
}

/**
 * Check if ABN is required based on business type
 * @param {string} businessType - 'individual' | 'sole_trader' | 'company'
 * @returns {boolean}
 */
export function requiresAbn(businessType, businessName) {
  const bt = String(businessType || '').trim();
  const bn = String(businessName || '').trim();
  // If a user provides a business name, we require ABN (common AU compliance expectation).
  if (bn.length >= 2) return true;
  return bt === 'sole_trader' || bt === 'company';
}

export function isAbnRequirementSatisfied(profile) {
  if (!requiresAbn(profile?.businessType, profile?.businessName)) return true;
  return profile?.abnVerified === true;
}

/**
 * Check if Business Name is required based on business type
 * @param {string} businessType - 'individual' | 'sole_trader' | 'company'
 * @returns {boolean}
 */
export function requiresBusinessName(businessType) {
  return businessType === 'company';
}

/**
 * Get today's date in YYYY-MM-DD format (for input[type=date] max attribute)
 * @returns {string}
 */
export function getTodayDate() {
  const today = new Date();
  const year = today.getFullYear();
  const month = String(today.getMonth() + 1).padStart(2, '0');
  const day = String(today.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Compute readiness checklist for Task Expert
 * @param {object} profile - User profile
 * @param {string} draftDob - DOB input value
 * @param {object} draftServiceLocation - Service location object
 * @param {string} draftBusinessType - Business type value
 * @param {string} draftBusinessName - Business name input value
 * @param {string} draftAbn - ABN input value
 * @returns {object} Checklist with boolean flags
 */
export function computeReadiness(
  profile,
  draftDob,
  draftServiceLocation,
  draftBusinessType,
  draftBusinessName,
  draftAbn
) {
  const dobValidation = validateDob(draftDob);
  const needsAbn = requiresAbn(draftBusinessType, draftBusinessName || profile?.businessName);
  const abnText = String(draftAbn || profile?.abn || '').trim();
  const normalizedState = String(draftServiceLocation?.state || '').trim();
  const normalizedSuburb = String(draftServiceLocation?.suburb || '').trim();
  const normalizedPostcode = String(draftServiceLocation?.postcode || '').trim();

  const abnPresent = needsAbn ? abnText.length > 0 : true;
  const abnVerified = needsAbn ? profile?.abnVerified === true : true;
  const privateDetailsConfirmed = profile?.privateDetailsLocked === true;

  return {
    emailVerified: profile?.emailVerified === true,
    phoneVerified: profile?.phoneVerified === true,
    serviceLocationSet: /^[0-9]{4}$/.test(normalizedPostcode) && normalizedSuburb.length >= 2 && normalizedState.length >= 2,
    dob18Plus: dobValidation.valid && dobValidation.isAdult,
    businessTypeSet: !!draftBusinessType,
    abnRequired: needsAbn,
    abnPresent,
    abnVerified,
    stripeReady: profile?.stripe?.onboardingComplete === true || profile?.stripeOnboardingStatus === 'completed',
    profileCompleted:
      profile?.profileCompleted === true || profile?.isProfileComplete === true,
    privateDetailsConfirmed,
  };
}

/**
 * Check if user is ready to quote (all requirements met)
 * @param {object} readiness - Output from computeReadiness
 * @returns {boolean}
 */
export function canQuote(readiness) {
  return (
    readiness.emailVerified &&
    readiness.phoneVerified &&
    readiness.serviceLocationSet &&
    readiness.dob18Plus &&
    readiness.businessTypeSet &&
    readiness.abnPresent &&
    readiness.abnVerified &&
    readiness.stripeReady &&
    readiness.profileCompleted
  );
}
