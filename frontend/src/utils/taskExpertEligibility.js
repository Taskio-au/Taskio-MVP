import { EXPERT_LABEL } from './roleLabels';

export function buildTaskExpertChecklistItems(checklist = {}, { authEmailVerified = false } = {}) {
  const normalized = checklist && typeof checklist === 'object' ? checklist : {};
  const emailVerified = authEmailVerified || normalized.emailVerified === true;
  const abnRequired = normalized.abnRequired !== false;
  const abnDone = abnRequired
    ? normalized.abnPresent === true && normalized.abnVerified === true
    : true;

  return [
    { key: 'email', label: 'Verify email', done: emailVerified },
    { key: 'phone', label: 'Verify phone', done: normalized.phoneVerified === true },
    { key: 'serviceLocation', label: 'Add service location', done: normalized.serviceLocationPresent === true },
    { key: 'dob', label: 'Confirm date of birth (18+)', done: normalized.dobPresent === true && normalized.is18PlusConfirmed === true },
    { key: 'businessType', label: 'Select business type', done: normalized.businessTypeSet === true },
    { key: 'abn', label: abnRequired ? 'Add and verify ABN' : 'ABN requirements met', done: abnDone },
    { key: 'profile', label: `Complete ${EXPERT_LABEL} profile`, done: normalized.profileCompleted === true },
    { key: 'stripe', label: 'Complete Stripe payout setup', done: normalized.stripeOnboardingComplete === true },
    { key: 'verified', label: 'Pass admin verification', done: normalized.verified === true },
  ];
}

export function computeTaskExpertChecklistScore(items = []) {
  const list = Array.isArray(items) ? items : [];
  if (list.length === 0) return 0;
  const doneCount = list.filter((item) => item?.done === true).length;
  return Math.round((doneCount / list.length) * 100);
}

/**
 * True when the expert completed every checklist item except admin verification (`verified`).
 * Used to show “waiting on Taskio” copy instead of “finish your profile”.
 */
export function isExpertQuoteReadinessAwaitingAdminOnly(items = []) {
  const list = Array.isArray(items) ? items : [];
  if (list.length === 0) return false;
  const incomplete = list.filter((item) => item?.done !== true);
  return incomplete.length > 0 && incomplete.every((item) => item?.key === 'verified');
}

export function buildTaskExpertEligibilityView(eligibility, { authEmailVerified = false } = {}) {
  const checklist = eligibility?.checklist && typeof eligibility.checklist === 'object'
    ? eligibility.checklist
    : {};
  const items = buildTaskExpertChecklistItems(checklist, { authEmailVerified });

  return {
    eligible: eligibility?.canQuote === true,
    reasons: Array.isArray(eligibility?.reasons) ? eligibility.reasons : [],
    checklist,
    items,
    score: computeTaskExpertChecklistScore(items),
    abnRequired: checklist.abnRequired === true,
    abnPresent: checklist.abnPresent === true,
    abnVerified: checklist.abnVerified === true,
    emailVerified: items.find((item) => item.key === 'email')?.done === true,
    phoneVerified: items.find((item) => item.key === 'phone')?.done === true,
    serviceLocationPresent: items.find((item) => item.key === 'serviceLocation')?.done === true,
    dobPresent: checklist.dobPresent === true,
    is18PlusConfirmed: checklist.is18PlusConfirmed === true,
    dob18Plus: items.find((item) => item.key === 'dob')?.done === true,
    businessTypeSet: items.find((item) => item.key === 'businessType')?.done === true,
    abnReady: items.find((item) => item.key === 'abn')?.done === true,
    profileCompleted: items.find((item) => item.key === 'profile')?.done === true,
    stripeOnboardingComplete: items.find((item) => item.key === 'stripe')?.done === true,
    adminVerified: items.find((item) => item.key === 'verified')?.done === true,
  };
}
