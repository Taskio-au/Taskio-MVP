'use strict';

const {
  aggregatePilotSupply,
  buildPilotSupplySnapshot,
  listAllPilotExperts,
} = require('../src/services/pilotSupplyService');

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
    expect(mounting.minimum).toBe(4);
    expect(mounting.target).toBe(5);
    expect(mounting.status).toBe('UNDER-COVERED');
  });

  it('marks category coverage HEALTHY at 5, ADEQUATE at 4, UNDER-COVERED below 4', () => {
    const make = (count, categoryKey = 'mounting_tv') => Array.from({ length: count }, (_, i) => ({
      uid: `n-${i}`,
      data: eligibleExpert({ expertiseApproved: [categoryKey] }),
    }));
    const healthy = aggregatePilotSupply(make(5)).categoryCoverage.find((row) => row.category === 'Mounting');
    const adequate = aggregatePilotSupply(make(4)).categoryCoverage.find((row) => row.category === 'Mounting');
    const under = aggregatePilotSupply(make(3)).categoryCoverage.find((row) => row.category === 'Mounting');
    expect(healthy.status).toBe('HEALTHY');
    expect(adequate.status).toBe('ADEQUATE');
    expect(under.status).toBe('UNDER-COVERED');
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
    expect(snapshot.targets.categoryCoverageMinimum).toBe(4);
    expect(snapshot.targets.categoryCoverageTarget).toBe(5);
  });
});

function makePagedDb(ids) {
  return {
    collection() {
      const chain = {
        _after: null,
        _limit: 100,
        where() { return chain; },
        orderBy() { return chain; },
        limit(n) {
          chain._limit = n;
          return chain;
        },
        startAfter(doc) {
          chain._after = doc.id;
          return chain;
        },
        async get() {
          let start = 0;
          if (chain._after) {
            start = ids.indexOf(chain._after) + 1;
          }
          const slice = ids.slice(start, start + chain._limit);
          return {
            empty: slice.length === 0,
            docs: slice.map((id) => ({
              id,
              data: () => ({ role: 'tradie' }),
            })),
          };
        },
      };
      return chain;
    },
  };
}

describe('listAllPilotExperts truncation', () => {
  it('is not truncated when the last page is short of pageSize and below cap', async () => {
    const ids = Array.from({ length: 55 }, (_, i) => `e${i}`);
    const listed = await listAllPilotExperts(makePagedDb(ids), { pageSize: 20, cap: 250 });
    expect(listed.scanned).toBe(55);
    expect(listed.truncated).toBe(false);
  });

  it('marks truncated when a short last page still has unread Experts past the cap', async () => {
    const ids = Array.from({ length: 12 }, (_, i) => `e${i}`);
    const listed = await listAllPilotExperts(makePagedDb(ids), { pageSize: 10, cap: 11 });
    expect(listed.scanned).toBe(11);
    expect(listed.truncated).toBe(true);
  });

  it('marks truncated when the cap lands on a full page', async () => {
    const ids = Array.from({ length: 20 }, (_, i) => `e${i}`);
    const listed = await listAllPilotExperts(makePagedDb(ids), { pageSize: 10, cap: 10 });
    expect(listed.scanned).toBe(10);
    expect(listed.truncated).toBe(true);
  });

  it('does not treat a complete short final page at the cap as truncated', async () => {
    const ids = Array.from({ length: 15 }, (_, i) => `e${i}`);
    const listed = await listAllPilotExperts(makePagedDb(ids), { pageSize: 10, cap: 15 });
    expect(listed.scanned).toBe(15);
    expect(listed.truncated).toBe(false);
  });
});

describe('buildPilotSupplySnapshot scanComplete', () => {
  it('sets scanComplete false when the Expert scan is truncated', async () => {
    const ids = Array.from({ length: 12 }, (_, i) => `e${i}`);
    const snapshot = await buildPilotSupplySnapshot(makePagedDb(ids), { pageSize: 10, cap: 11 });
    expect(snapshot.totals.truncated).toBe(true);
    expect(snapshot.totals.scanComplete).toBe(false);
    expect(snapshot.totals.scanned).toBe(11);
    expect(snapshot.totals.cap).toBe(11);
  });
});
