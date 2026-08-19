'use strict';

jest.mock('../src/firebaseAdmin', () => {
  const state = { exists: true, data: {} };
  global.__EXPERT_TRUST_STATE__ = state;
  return {
    db: {
      collection: () => ({
        doc: () => ({
          async get() {
            return {
              exists: state.exists,
              data: () => state.data,
            };
          },
        }),
      }),
    },
  };
});

jest.mock('../src/utils/firestore', () => ({
  safeToMillis: jest.fn(() => null),
}));

const { computeVerificationBucket, getExpertTrustSummary } = require('../src/services/expertTrustService');

function completeExpert(overrides = {}) {
  return {
    role: 'tradie',
    status: 'active',
    verified: false,
    displayName: 'Alex Expert',
    bio: 'Experienced Melbourne plumber with residential work.',
    photoURL: 'https://example.com/photo.jpg',
    expertiseApproved: ['plumbing'],
    businessType: 'individual',
    businessName: '',
    abn: '',
    abnVerified: false,
    stripe: { onboardingComplete: true },
    ...overrides,
  };
}

describe('expert trust ABN display', () => {
  beforeEach(() => {
    global.__EXPERT_TRUST_STATE__.exists = true;
    global.__EXPERT_TRUST_STATE__.data = {};
  });

  it('does not treat an individual without a business name as ABN-incomplete', async () => {
    const user = completeExpert();
    expect(computeVerificationBucket(user)).toBe('REQUIRES_ATTENTION');

    global.__EXPERT_TRUST_STATE__.data = user;
    const summary = await getExpertTrustSummary('expert-1');
    expect(summary.abnStatus).toBe('not_required');
    expect(summary.trustFlags).not.toContain('ABN_UNVERIFIED');
  });

  it('treats sole traders without verified ABN as ABN-incomplete', async () => {
    const user = completeExpert({
      businessType: 'sole_trader',
      abn: '51824753556',
      abnVerified: false,
    });
    expect(computeVerificationBucket(user)).toBe('INCOMPLETE');

    global.__EXPERT_TRUST_STATE__.data = user;
    const summary = await getExpertTrustSummary('expert-2');
    expect(summary.abnStatus).toBe('unverified');
    expect(summary.trustFlags).toContain('ABN_UNVERIFIED');
  });

  it('treats individuals with a business name as requiring a verified ABN', async () => {
    const user = completeExpert({
      businessType: 'individual',
      businessName: 'Acme Services',
      abn: '',
      abnVerified: false,
    });
    expect(computeVerificationBucket(user)).toBe('INCOMPLETE');

    global.__EXPERT_TRUST_STATE__.data = user;
    const summary = await getExpertTrustSummary('expert-3');
    expect(summary.abnStatus).toBe('missing');
    expect(summary.trustFlags).toContain('ABN_UNVERIFIED');
  });

  it('treats companies without verified ABN as ABN-incomplete', async () => {
    const user = completeExpert({
      businessType: 'company',
      businessName: 'Acme Pty Ltd',
      abnVerified: false,
    });
    expect(computeVerificationBucket(user)).toBe('INCOMPLETE');
  });

  it('does not flag ABN when a required ABN is verified', async () => {
    const user = completeExpert({
      businessType: 'sole_trader',
      abn: '51824753556',
      abnVerified: true,
    });
    expect(computeVerificationBucket(user)).toBe('REQUIRES_ATTENTION');

    global.__EXPERT_TRUST_STATE__.data = user;
    const summary = await getExpertTrustSummary('expert-4');
    expect(summary.abnStatus).toBe('verified');
    expect(summary.trustFlags).not.toContain('ABN_UNVERIFIED');
  });
});
