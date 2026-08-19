import { getReadiness } from './adminDashboardUtils';

function readyBase(overrides = {}) {
  return {
    status: 'active',
    verified: true,
    stripeOnboardingStatus: 'completed',
    expertiseApproved: ['plumbing'],
    phoneVerified: true,
    profileCompleted: true,
    serviceLocationPresent: true,
    businessTypeSet: true,
    is18PlusConfirmed: true,
    businessType: 'individual',
    businessName: '',
    abnVerified: false,
    ...overrides,
  };
}

describe('admin dashboard ABN trust display', () => {
  it('does not flag ABN for an individual without a business name', () => {
    const result = getReadiness(readyBase());
    expect(result.missing).not.toContain('ABN verification');
    expect(result.statusLabel).toBe('Ready to quote');
  });

  it('flags ABN for sole traders without verification', () => {
    const result = getReadiness(readyBase({
      businessType: 'sole_trader',
      abnVerified: false,
    }));
    expect(result.missing).toContain('ABN verification');
    expect(result.statusLabel).toBe('Not ready');
  });

  it('flags ABN for individuals with a business name until verified', () => {
    const result = getReadiness(readyBase({
      businessType: 'individual',
      businessName: 'Acme Services',
      abnVerified: false,
    }));
    expect(result.missing).toContain('ABN verification');
  });
});
