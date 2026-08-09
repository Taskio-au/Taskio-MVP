import {
  buildTaskExpertChecklistItems,
  isExpertQuoteReadinessAwaitingAdminOnly,
} from './taskExpertEligibility';

describe('taskExpertEligibility', () => {
  const fullChecklistBackend = {
    emailVerified: true,
    phoneVerified: true,
    serviceLocationPresent: true,
    dobPresent: true,
    is18PlusConfirmed: true,
    businessTypeSet: true,
    abnRequired: true,
    abnPresent: true,
    abnVerified: true,
    profileCompleted: true,
    stripeOnboardingComplete: true,
    verified: false,
  };

  it('isExpertQuoteReadinessAwaitingAdminOnly when only admin verification is pending', () => {
    const items = buildTaskExpertChecklistItems(fullChecklistBackend, { authEmailVerified: true });
    expect(isExpertQuoteReadinessAwaitingAdminOnly(items)).toBe(true);
  });

  it('isExpertQuoteReadinessAwaitingAdminOnly is false when profile is still incomplete', () => {
    const items = buildTaskExpertChecklistItems(
      { ...fullChecklistBackend, profileCompleted: false },
      { authEmailVerified: true }
    );
    expect(isExpertQuoteReadinessAwaitingAdminOnly(items)).toBe(false);
  });

  it('isExpertQuoteReadinessAwaitingAdminOnly is false for empty items', () => {
    expect(isExpertQuoteReadinessAwaitingAdminOnly([])).toBe(false);
  });
});
