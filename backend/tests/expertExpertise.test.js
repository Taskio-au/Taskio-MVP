'use strict';

const {
  signupExpertiseFields,
  applySelfSelectedExpertise,
  approveRequestedExpertise,
  effectiveApprovedExpertise,
  hasApprovedMarketplaceExpertise,
  planExpertiseFieldSync,
  expertMatchesJobCategory,
} = require('../src/utils/expertExpertise');

describe('expertExpertise requested vs approved', () => {
  it('does not treat signup selection as Taskio-approved', () => {
    expect(signupExpertiseFields(['mounting_tv', 'bogus'])).toEqual({
      expertise: ['mounting_tv'],
      expertiseApproved: [],
    });
  });

  it('keeps newly added self-selected categories unapproved', () => {
    const next = applySelfSelectedExpertise(
      { expertise: ['mounting_tv'], expertiseApproved: ['mounting_tv'] },
      ['mounting_tv', 'mounting_shelves']
    );
    expect(next.requested).toEqual(['mounting_tv', 'mounting_shelves']);
    expect(next.approved).toEqual(['mounting_tv']);
  });

  it('drops approval immediately when the Expert removes a category', () => {
    const next = applySelfSelectedExpertise(
      { expertise: ['mounting_tv', 'mounting_shelves'], expertiseApproved: ['mounting_tv', 'mounting_shelves'] },
      ['mounting_tv']
    );
    expect(next.requested).toEqual(['mounting_tv']);
    expect(next.approved).toEqual(['mounting_tv']);
  });

  it('approves only currently requested keys', () => {
    const next = approveRequestedExpertise({
      expertise: ['mounting_tv', 'mounting_shelves'],
      expertiseApproved: ['mounting_tv'],
    });
    expect(next.approved).toEqual(['mounting_tv', 'mounting_shelves']);
  });

  it('mirrors legacy approved lists into requested without wiping eligibility', () => {
    const synced = planExpertiseFieldSync({
      verified: true,
      expertiseApproved: ['mounting_tv'],
    });
    expect(synced.changed).toBe(true);
    expect(synced.requested).toEqual(['mounting_tv']);
    expect(synced.approved).toEqual(['mounting_tv']);
    expect(effectiveApprovedExpertise({
      expertise: synced.requested,
      expertiseApproved: synced.approved,
    })).toEqual(['mounting_tv']);
  });

  it('does not auto-approve unverified legacy requested categories', () => {
    const synced = planExpertiseFieldSync({
      verified: false,
      expertise: ['mounting_tv'],
    });
    expect(synced.approved).toEqual([]);
    expect(hasApprovedMarketplaceExpertise({
      expertise: synced.requested,
      expertiseApproved: synced.approved,
    })).toBe(false);
  });

  it('matches a job only on approved Phase 1 keys when category data is reliable', () => {
    const job = {
      primaryCategory: 'Mounting',
      items: [{ type: 'mounting_tv', quantity: 1 }],
    };
    expect(expertMatchesJobCategory({
      expertise: ['mounting_tv', 'mounting_shelves'],
      expertiseApproved: ['mounting_shelves'],
    }, job).matches).toBe(false);
    expect(expertMatchesJobCategory({
      expertise: ['mounting_tv'],
      expertiseApproved: ['mounting_tv'],
    }, job).matches).toBe(true);
  });
});
