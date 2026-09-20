'use strict';

const {
  signupExpertiseFields,
  applySelfSelectedExpertise,
  approveRequestedExpertise,
  effectiveApprovedExpertise,
  hasApprovedMarketplaceExpertise,
  planExpertiseFieldSync,
  planAdminExpertiseMigration,
  expertMatchesJobCategory,
  jobCategoryKeys,
} = require('../src/utils/expertExpertise');

const A = 'mounting_tv';
const B = 'mounting_shelves';

describe('expertExpertise requested vs approved', () => {
  it('does not treat signup selection as Taskio-approved', () => {
    expect(signupExpertiseFields(['mounting_tv', 'bogus'])).toEqual({
      expertise: ['mounting_tv'],
      expertiseApproved: [],
    });
  });

  it('keeps newly added self-selected categories unapproved', () => {
    const next = applySelfSelectedExpertise(
      { expertise: [A], expertiseApproved: [A] },
      [A, B]
    );
    expect(next.requested).toEqual([A, B]);
    expect(next.approved).toEqual([A]);
  });

  it('drops approval immediately when the Expert removes a category', () => {
    const next = applySelfSelectedExpertise(
      { expertise: [A, B], expertiseApproved: [A, B] },
      [A]
    );
    expect(next.requested).toEqual([A]);
    expect(next.approved).toEqual([A]);
  });

  it('does not restore approval when a previously removed category is re-added', () => {
    const afterRemove = applySelfSelectedExpertise(
      { expertise: [A, B], expertiseApproved: [A, B] },
      [A]
    );
    const afterReadd = applySelfSelectedExpertise(
      { expertise: afterRemove.requested, expertiseApproved: afterRemove.approved },
      [A, B]
    );
    expect(afterReadd.requested).toEqual([A, B]);
    expect(afterReadd.approved).toEqual([A]);
    expect(hasApprovedMarketplaceExpertise({
      expertise: afterReadd.requested,
      expertiseApproved: afterReadd.approved,
    })).toBe(true);
    expect(effectiveApprovedExpertise({
      expertise: afterReadd.requested,
      expertiseApproved: afterReadd.approved,
    })).toEqual([A]);
  });

  it('approves only currently requested keys', () => {
    const next = approveRequestedExpertise({
      expertise: [A, B],
      expertiseApproved: [A],
    });
    expect(next.approved).toEqual([A, B]);
  });

  it('cannot invent approval for a category the Expert did not request', () => {
    const next = approveRequestedExpertise({
      expertise: [A],
      expertiseApproved: [A],
    }, [B]);
    expect(next.approved).toEqual([]);
  });

  it('does not copy requested into approved on read-side sync, even when verified', () => {
    const synced = planExpertiseFieldSync({
      verified: true,
      expertise: [A],
    });
    expect(synced.changed).toBe(false);
    expect(synced.approved).toEqual([]);
    expect(hasApprovedMarketplaceExpertise({
      expertise: [A],
      expertiseApproved: synced.approved,
    })).toBe(false);
  });

  it('does not mirror approved-only lists into requested on read-side sync', () => {
    const synced = planExpertiseFieldSync({
      verified: true,
      expertiseApproved: [A],
    });
    expect(synced.changed).toBe(false);
    expect(synced.requested).toEqual([]);
    expect(effectiveApprovedExpertise({
      expertiseApproved: [A],
    })).toEqual([]);
  });

  it('matches a job only on approved Phase 1 keys when category data is reliable', () => {
    const job = {
      primaryCategory: 'Mounting',
      items: [{ type: A, quantity: 1 }],
    };
    expect(expertMatchesJobCategory({
      expertise: [A, B],
      expertiseApproved: [B],
    }, job).matches).toBe(false);
    expect(expertMatchesJobCategory({
      expertise: [A],
      expertiseApproved: [A],
    }, job).matches).toBe(true);
  });
});

describe('fail-closed marketplace expertise (P07F2)', () => {
  function expectClosed(doc) {
    expect(effectiveApprovedExpertise(doc)).toEqual([]);
    expect(hasApprovedMarketplaceExpertise(doc)).toBe(false);
  }

  it('A: both fields missing => false', () => {
    expectClosed({});
  });

  it('B: expertise string + approved missing => false', () => {
    expectClosed({ expertise: A });
  });

  it('C: expertise missing + approved string => false', () => {
    expectClosed({ expertiseApproved: A });
  });

  it('D: both fields non-array => false', () => {
    expectClosed({ expertise: { A: true }, expertiseApproved: { A: true } });
  });

  it('E: both empty arrays => false', () => {
    expectClosed({ expertise: [], expertiseApproved: [] });
  });

  it('F: requested valid + approved empty => false', () => {
    expectClosed({ expertise: [A], expertiseApproved: [] });
  });

  it('G: requested empty + approved valid => false', () => {
    expectClosed({ expertise: [], expertiseApproved: [A] });
  });

  it('H: requested missing + approved valid array => false', () => {
    expectClosed({ expertiseApproved: [A] });
  });

  it('I: disjoint valid keys => false', () => {
    expectClosed({ expertise: [A], expertiseApproved: [B] });
  });

  it('J: matching valid keys => true', () => {
    const doc = { expertise: [A], expertiseApproved: [A] };
    expect(effectiveApprovedExpertise(doc)).toEqual([A]);
    expect(hasApprovedMarketplaceExpertise(doc)).toBe(true);
  });

  it('K: intersection keeps only approved requested keys', () => {
    expect(effectiveApprovedExpertise({
      expertise: [A, B],
      expertiseApproved: [B],
    })).toEqual([B]);
  });

  it('L: unknown/noncanonical values are dropped and never create eligibility', () => {
    expectClosed({
      expertise: ['plumbing', 'Mounting_TV', A],
      expertiseApproved: ['plumbing', 'TV mounting'],
    });
    expect(effectiveApprovedExpertise({
      expertise: [A, 'bogus'],
      expertiseApproved: [A, 'bogus'],
    })).toEqual([A]);
  });

  it('does not treat verified=true as approved expertise', () => {
    expectClosed({ verified: true, expertise: [A] });
    expectClosed({ verified: true, status: 'active', profileCompleted: true });
  });
});

describe('planAdminExpertiseMigration', () => {
  it('does not pre-approve an unverified Expert', () => {
    const planned = planAdminExpertiseMigration({
      verified: false,
      expertise: [A],
    });
    expect(planned.changed).toBe(false);
    expect(planned.migrated).toBe(false);
    expect(planned.approved).toEqual([]);
  });

  it('copies canonical requested into approved only when verified and approved is missing', () => {
    const planned = planAdminExpertiseMigration({
      verified: true,
      expertise: [A, 'bogus'],
    });
    expect(planned.changed).toBe(true);
    expect(planned.migrated).toBe(true);
    expect(planned.approved).toEqual([A]);
  });

  it('does not parse a non-array expertise string into approval', () => {
    const planned = planAdminExpertiseMigration({
      verified: true,
      expertise: A,
    });
    expect(planned.changed).toBe(false);
    expect(planned.migrated).toBe(false);
  });

  it('does not overwrite an explicit empty approved array', () => {
    const planned = planAdminExpertiseMigration({
      verified: true,
      expertise: [A],
      expertiseApproved: [],
    });
    expect(planned.changed).toBe(false);
    expect(planned.approved).toEqual([]);
  });

  it('is idempotent for already-canonical approved arrays', () => {
    const planned = planAdminExpertiseMigration({
      verified: true,
      expertise: [A],
      expertiseApproved: [A],
    });
    expect(planned.changed).toBe(false);
    expect(planned.migrated).toBe(false);
    expect(planned.prunedCount).toBe(0);
  });

  it('prunes unknown approved keys', () => {
    const planned = planAdminExpertiseMigration({
      verified: true,
      expertise: [A],
      expertiseApproved: [A, 'plumbing'],
    });
    expect(planned.changed).toBe(true);
    expect(planned.approved).toEqual([A]);
    expect(planned.prunedCount).toBe(1);
  });
});

describe('job category reliability', () => {
  it('treats Phase 1 item types as reliable', () => {
    expect(jobCategoryKeys({ items: [{ type: A }] })).toEqual({
      reliable: true,
      keys: [A],
    });
  });

  it('treats catalog primaryCategory as reliable', () => {
    expect(jobCategoryKeys({ primaryCategory: 'Hanging' }).reliable).toBe(true);
  });

  it('treats empty/unknown job shapes as unreliable', () => {
    expect(jobCategoryKeys({})).toEqual({ reliable: false, keys: [] });
    expect(jobCategoryKeys({ primaryCategory: 'Plumbing', jobType: 'handyman' })).toEqual({
      reliable: false,
      keys: [],
    });
  });

  it('does not match an unreliable job even when the Expert has approved expertise', () => {
    const match = expertMatchesJobCategory(
      { expertise: [A], expertiseApproved: [A] },
      { primaryCategory: 'Misc' }
    );
    expect(match.reliable).toBe(false);
    expect(match.matches).toBe(false);
  });
});
