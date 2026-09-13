'use strict';

const { computeLaunchReadiness } = require('../src/utils/pilotLaunchReadiness');

function eligibleExpert(overrides = {}) {
  return {
    role: 'tradie',
    status: 'active',
    verified: true,
    emailVerified: true,
    phoneVerified: true,
    abnVerified: true,
    businessType: 'individual',
    businessName: '',
    abn: '',
    stripe: { onboardingComplete: true },
    profileCompleted: true,
    displayName: 'Alex Expert',
    bio: 'x'.repeat(20),
    photoURL: 'https://example.com/photo.jpg',
    expertiseApproved: ['mounting_tv'],
    serviceLocation: { suburb: 'Melbourne', state: 'VIC', postcode: '3000' },
    dob: { day: 1, month: 1, year: 1990 },
    acceptingJobs: true,
    serviceAreas: ['Richmond'],
    ...overrides,
  };
}

describe('computeLaunchReadiness', () => {
  const token = { email_verified: true };

  it('is launch-ready when technically eligible, accepting, and has a service area', () => {
    const result = computeLaunchReadiness({ decodedToken: token, userDoc: eligibleExpert() });
    expect(result.technicallyEligible).toBe(true);
    expect(result.launchReady).toBe(true);
    expect(result.reasons).toEqual([]);
  });

  it('is not launch-ready when acceptingJobs is false', () => {
    const result = computeLaunchReadiness({
      decodedToken: token,
      userDoc: eligibleExpert({ acceptingJobs: false }),
    });
    expect(result.technicallyEligible).toBe(true);
    expect(result.launchReady).toBe(false);
    expect(result.reasons).toContain('NOT_ACCEPTING_JOBS');
  });

  it('is not launch-ready when acceptingJobs is missing (legacy)', () => {
    const userDoc = eligibleExpert();
    delete userDoc.acceptingJobs;
    const result = computeLaunchReadiness({ decodedToken: token, userDoc });
    expect(result.acceptingJobs).toBe(false);
    expect(result.launchReady).toBe(false);
    expect(result.reasons).toContain('NOT_ACCEPTING_JOBS');
  });

  it('is not launch-ready when serviceAreas is missing (legacy)', () => {
    const userDoc = eligibleExpert();
    delete userDoc.serviceAreas;
    const result = computeLaunchReadiness({ decodedToken: token, userDoc });
    expect(result.serviceAreas).toEqual([]);
    expect(result.launchReady).toBe(false);
    expect(result.reasons).toContain('NO_SERVICE_AREA');
  });

  it('is not launch-ready without a canonical service area', () => {
    const result = computeLaunchReadiness({
      decodedToken: token,
      userDoc: eligibleExpert({ serviceAreas: [] }),
    });
    expect(result.launchReady).toBe(false);
    expect(result.reasons).toContain('NO_SERVICE_AREA');
  });

  it('does not treat home-base serviceLocation as a service area', () => {
    const result = computeLaunchReadiness({
      decodedToken: token,
      userDoc: eligibleExpert({
        serviceAreas: undefined,
        serviceLocation: { suburb: 'Richmond', state: 'VIC', postcode: '3121' },
      }),
    });
    expect(result.serviceAreas).toEqual([]);
    expect(result.launchReady).toBe(false);
    expect(result.reasons).toContain('NO_SERVICE_AREA');
  });

  it('is not launch-ready when unverified', () => {
    const result = computeLaunchReadiness({
      decodedToken: token,
      userDoc: eligibleExpert({ verified: false }),
    });
    expect(result.launchReady).toBe(false);
    expect(result.reasons).toContain('UNVERIFIED');
  });

  it('is not launch-ready when disabled', () => {
    const result = computeLaunchReadiness({
      decodedToken: token,
      userDoc: eligibleExpert({ status: 'disabled' }),
    });
    expect(result.launchReady).toBe(false);
    expect(result.reasons).toContain('STATUS_NOT_ACTIVE');
  });

  it('is not launch-ready when Stripe is required and incomplete', () => {
    const prev = process.env.STRIPE_ENABLED;
    process.env.STRIPE_ENABLED = 'true';
    try {
      const result = computeLaunchReadiness({
        decodedToken: token,
        userDoc: eligibleExpert({
          stripe: { onboardingComplete: false },
          stripeOnboardingStatus: 'pending',
          stripeChargesEnabled: false,
          stripePayoutsEnabled: false,
        }),
      });
      expect(result.launchReady).toBe(false);
      expect(result.reasons).toContain('STRIPE_NOT_COMPLETE');
    } finally {
      if (prev === undefined) delete process.env.STRIPE_ENABLED;
      else process.env.STRIPE_ENABLED = prev;
    }
  });
});
