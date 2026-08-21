const {
  computeEligibility,
  computeProfileCompleted,
  computeStripeOnboardingComplete,
  normalizeBusinessType,
  requiresAbn,
  requiresBusinessName,
  isAbnRequirementSatisfied,
} = require('../src/utils/v11TradieEligibility');

function baseTradie(overrides = {}) {
  return {
    role: 'tradie',
    status: 'active',
    verified: true,
    phoneVerified: true,
    abnVerified: true,
    businessType: 'individual',
    businessName: '',
    abn: '',
    stripe: { onboardingComplete: true },
    profileCompleted: true,
    serviceLocation: { postcode: '2000', suburb: 'Sydney', state: 'NSW' },
    dob: { day: 1, month: 1, year: 1990 },
    ...overrides,
  };
}

describe('v11TradieEligibility regression rules', () => {
  it('normalizes business type aliases consistently', () => {
    expect(normalizeBusinessType('sole trader')).toBe('sole_trader');
    expect(normalizeBusinessType('business')).toBe('company');
    expect(normalizeBusinessType('individual')).toBe('individual');
  });

  it('applies ABN and business-name requirement helpers', () => {
    expect(requiresBusinessName('company')).toBe(true);
    expect(requiresBusinessName('sole_trader')).toBe(false);

    expect(requiresAbn('individual', '')).toBe(false);
    expect(requiresAbn('sole_trader', '')).toBe(true);
    expect(requiresAbn('individual', 'Acme Services')).toBe(true);

    expect(isAbnRequirementSatisfied({ businessType: 'individual', businessName: '', abnVerified: false })).toBe(true);
    expect(isAbnRequirementSatisfied({ businessType: 'sole_trader', abnVerified: false })).toBe(false);
    expect(isAbnRequirementSatisfied({ businessType: 'company', businessName: 'Acme Pty Ltd', abnVerified: true })).toBe(true);
  });

  it('returns DOB_MISSING when DOB is absent', () => {
    const result = computeEligibility({
      decodedToken: { email_verified: true },
      userDoc: baseTradie({ dob: null }),
    });
    expect(result.eligible).toBe(false);
    expect(result.reasons).toContain('DOB_MISSING');
  });

  it('returns UNDERAGE when DOB indicates age < 18', () => {
    const now = new Date();
    const underageYear = now.getUTCFullYear() - 17;
    const result = computeEligibility({
      decodedToken: { email_verified: true },
      userDoc: baseTradie({
        dob: { day: now.getUTCDate(), month: now.getUTCMonth() + 1, year: underageYear },
      }),
    });
    expect(result.eligible).toBe(false);
    expect(result.reasons).toContain('UNDERAGE');
  });

  it('requires ABN when business name is present even for individual', () => {
    const result = computeEligibility({
      decodedToken: { email_verified: true },
      userDoc: baseTradie({
        businessType: 'individual',
        businessName: 'Acme Services',
        abn: '',
        abnVerified: false,
      }),
    });
    expect(result.eligible).toBe(false);
    expect(result.reasons).toContain('ABN_MISSING');
    expect(result.reasons).toContain('ABN_NOT_VERIFIED');
  });

  it('stays eligible for individual without business name and no ABN', () => {
    const result = computeEligibility({
      decodedToken: { email_verified: true },
      userDoc: baseTradie({
        businessType: 'individual',
        businessName: '',
        abn: '',
        abnVerified: false,
      }),
    });
    expect(result.eligible).toBe(true);
    expect(result.reasons).toEqual([]);
  });

  it('treats Stripe as complete when charges and payouts are enabled', () => {
    const userDoc = baseTradie({
      stripe: undefined,
      stripeOnboardingStatus: 'pending',
      stripeChargesEnabled: true,
      stripePayoutsEnabled: true,
    });

    expect(computeStripeOnboardingComplete(userDoc)).toBe(true);
    expect(
      computeEligibility({
        decodedToken: { email_verified: true },
        userDoc,
      }).eligible
    ).toBe(true);
  });

  it('computeProfileCompleted accepts first/last only when displayName is empty', () => {
    const doc = {
      role: 'tradie',
      businessType: 'individual',
      bio: 'x'.repeat(20),
      photoURL: 'https://example.com/photo.jpg',
      expertiseApproved: ['tv_mounting'],
      displayName: '',
      firstName: 'Saeed',
      lastName: 'Zafari',
    };
    expect(computeProfileCompleted(doc)).toBe(true);
  });

  it('computeProfileCompleted accepts Firebase token name when Firestore identity is empty', () => {
    const doc = {
      role: 'tradie',
      businessType: 'individual',
      bio: 'x'.repeat(20),
      photoURL: 'https://example.com/photo.jpg',
      expertiseApproved: ['tv_mounting'],
      displayName: '',
      firstName: '',
      lastName: '',
    };
    expect(computeProfileCompleted(doc)).toBe(false);
    expect(computeProfileCompleted(doc, { name: 'Saeed Zafari' })).toBe(true);
  });

  it('eligibility uses token name for profile completion when Firestore has no display name', () => {
    const userDoc = baseTradie({
      profileCompleted: false,
      displayName: '',
      name: '',
      firstName: '',
      lastName: '',
      bio: 'x'.repeat(20),
      photoURL: 'https://example.com/photo.jpg',
      expertiseApproved: ['tv_mounting'],
    });
    const result = computeEligibility({
      decodedToken: { email_verified: true, name: 'Saeed Zafari' },
      userDoc,
    });
    expect(result.checklist.profileCompleted).toBe(true);
    expect(result.reasons).not.toContain('PROFILE_INCOMPLETE');
  });

  it('does not fail eligibility solely for incomplete Stripe when Stripe is disabled', () => {
    const prev = process.env.STRIPE_ENABLED;
    delete process.env.STRIPE_ENABLED;
    try {
      const result = computeEligibility({
        decodedToken: { email_verified: true },
        userDoc: baseTradie({
          stripe: { onboardingComplete: false },
          stripeOnboardingStatus: 'pending',
        }),
      });
      expect(result.eligible).toBe(true);
      expect(result.reasons).not.toContain('STRIPE_NOT_COMPLETE');
      expect(result.checklist.stripeOnboardingComplete).toBe(false);
    } finally {
      if (prev === undefined) delete process.env.STRIPE_ENABLED;
      else process.env.STRIPE_ENABLED = prev;
    }
  });

  it('still requires Stripe onboarding when Stripe is enabled', () => {
    const prev = process.env.STRIPE_ENABLED;
    process.env.STRIPE_ENABLED = 'true';
    try {
      const result = computeEligibility({
        decodedToken: { email_verified: true },
        userDoc: baseTradie({
          stripe: { onboardingComplete: false },
          stripeOnboardingStatus: 'pending',
        }),
      });
      expect(result.eligible).toBe(false);
      expect(result.reasons).toContain('STRIPE_NOT_COMPLETE');
    } finally {
      if (prev === undefined) delete process.env.STRIPE_ENABLED;
      else process.env.STRIPE_ENABLED = prev;
    }
  });
});
