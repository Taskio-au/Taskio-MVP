/**
 * Pure helper functions for the admin Dashboard.
 * Extracted to reduce maintainability debt in Dashboard.js.
 */

/**
 * Compute tradie readiness status for display in the drawer.
 * @param {Object} u - User/tradie object
 * @returns {{ statusLabel: string, tone: string, missing: string[] }}
 */
export function getReadiness(u) {
  const missing = [];
  const active = String(u?.status || '') === 'active';
  const platformVerified = u?.verified === true;
  const stripe = String(u?.stripeOnboardingStatus || '').toLowerCase();
  const stripeOk = stripe === 'completed' || stripe === 'enabled';
  const hasExpertise = Array.isArray(u?.expertiseApproved) && u.expertiseApproved.length > 0;
  const phoneOk = u?.phoneVerified === undefined ? true : (u.phoneVerified === true);
  const abnOk = u?.abnVerified === undefined ? true : (u.abnVerified === true);
  const profileOk = u?.profileCompleted === undefined ? true : (u.profileCompleted === true);
  const serviceLocationOk = u?.serviceLocationPresent === undefined ? true : (u.serviceLocationPresent === true);
  const businessTypeOk = u?.businessTypeSet === undefined ? true : (u.businessTypeSet === true);
  const adultOk = u?.is18PlusConfirmed === undefined ? true : (u.is18PlusConfirmed === true);

  if (!platformVerified) missing.push('Platform verification');
  if (!stripeOk) missing.push('Stripe setup');
  if (!phoneOk) missing.push('Phone verification');
  if (!abnOk) missing.push('ABN verification');
  if (!profileOk) missing.push('Profile completion');
  if (!hasExpertise) missing.push('At least 1 expertise');
  if (!serviceLocationOk) missing.push('Service location');
  if (!businessTypeOk) missing.push('Business type');
  if (!adultOk) missing.push('18+ confirmed');
  if (!active) missing.unshift('Account is not active');

  const ready = active && platformVerified && stripeOk && hasExpertise && phoneOk && abnOk && profileOk && serviceLocationOk && businessTypeOk && adultOk;
  return {
    statusLabel: ready ? 'Ready to quote' : 'Not ready',
    tone: ready ? 'success' : (missing.length ? 'warning' : 'info'),
    missing: missing.slice(0, 5),
  };
}

/**
 * Sort tradies: boosted first, then by last activity (updatedAtMs desc).
 * @param {Object} a - First tradie
 * @param {Object} b - Second tradie
 * @returns {number}
 */
export function sortTradies(a, b) {
  const aBoost = a?.boost?.isBoosted === true || a?.boostedVisibility === true;
  const bBoost = b?.boost?.isBoosted === true || b?.boostedVisibility === true;
  if (aBoost !== bBoost) return aBoost ? -1 : 1;
  const aActive = Number(a?.updatedAtMs || 0) || 0;
  const bActive = Number(b?.updatedAtMs || 0) || 0;
  return bActive - aActive;
}
