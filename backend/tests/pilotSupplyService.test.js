'use strict';

const { aggregatePilotSupply } = require('../src/services/pilotSupplyService');

function eligibleExpert(overrides = {}) {
  return {
    role: 'tradie',
    status: 'active',
    verified: true,
    emailVerified: true,
    phoneVerified: true,
    abnVerified: true,
    businessType: 'individual',
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

describe('aggregatePilotSupply', () => {
  it('counts launch-ready Experts only for category coverage', () => {
    const snapshot = aggregatePilotSupply([
      { uid: 'a', data: eligibleExpert() },
      { uid: 'b', data: eligibleExpert({ acceptingJobs: false, expertiseApproved: ['mounting_tv'] }) },
      { uid: 'c', data: eligibleExpert({ verified: false, expertiseApproved: ['mounting_tv'] }) },
    ]);

    expect(snapshot.totals.experts).toBe(3);
    expect(snapshot.totals.technicallyEligible).toBe(2);
    expect(snapshot.totals.launchReady).toBe(1);
    const mounting = snapshot.categoryCoverage.find((row) => row.category === 'Mounting');
    expect(mounting.launchReadyCount).toBe(1);
    expect(mounting.target).toBe(5);
  });

  it('uses serviceAreas for geography and ignores home-base', () => {
    const snapshot = aggregatePilotSupply([
      {
        uid: 'home-only',
        data: eligibleExpert({
          serviceAreas: [],
          serviceLocation: { suburb: 'Carlton', state: 'VIC', postcode: '3053' },
        }),
      },
      {
        uid: 'services-richmond',
        data: eligibleExpert({
          serviceAreas: ['Richmond'],
          serviceLocation: { suburb: 'Carlton', state: 'VIC', postcode: '3053' },
        }),
      },
    ]);

    const richmond = snapshot.geographyCoverage.find((row) => row.area === 'Richmond');
    const carlton = snapshot.geographyCoverage.find((row) => row.area === 'Carlton');
    expect(richmond.launchReadyCount).toBe(1);
    expect(carlton.launchReadyCount).toBe(0);
    expect(snapshot.totals.launchReady).toBe(1);
  });

  it('does not apply a 4–5 target per suburb', () => {
    const snapshot = aggregatePilotSupply([
      { uid: 'a', data: eligibleExpert({ serviceAreas: ['Richmond'] }) },
    ]);
    expect(snapshot.geographyCoverage.every((row) => row.target === undefined)).toBe(true);
    expect(snapshot.targets.categoryCoverage).toBe(5);
  });
});
