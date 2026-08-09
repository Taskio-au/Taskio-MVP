import {
  validateDob,
  requiresAbn,
  requiresBusinessName,
  hasVerifiedIdentity,
  computeReadiness,
  canQuote,
} from './profileCompliance';

function tomorrowYmd() {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

describe('profileCompliance', () => {
  it('rejects future DOB', () => {
    const result = validateDob(tomorrowYmd());
    expect(result.valid).toBe(false);
    expect(result.error).toBe('Date of birth cannot be in the future.');
  });

  it('applies ABN requirement rules', () => {
    expect(requiresAbn('individual', '')).toBe(false);
    expect(requiresAbn('sole_trader', '')).toBe(true);
    expect(requiresAbn('individual', 'Acme Services')).toBe(true);
  });

  it('applies business name requirement rules', () => {
    expect(requiresBusinessName('individual')).toBe(false);
    expect(requiresBusinessName('company')).toBe(true);
  });

  it('detects verified identity flags', () => {
    expect(hasVerifiedIdentity({ privateDetailsLocked: true })).toBe(true);
    expect(hasVerifiedIdentity({ verified: true })).toBe(true);
    expect(hasVerifiedIdentity({ abnVerified: true })).toBe(true);
    expect(hasVerifiedIdentity({ stripe: { onboardingComplete: true } })).toBe(true);
    expect(hasVerifiedIdentity({})).toBe(false);
  });

  it('uses draft business name to require ABN in readiness', () => {
    const readiness = computeReadiness(
      { emailVerified: true, phoneVerified: true, stripe: { onboardingComplete: true }, profileCompleted: true },
      '1990-01-01',
      { suburb: 'Sydney', state: 'NSW', postcode: '2000' },
      'individual',
      'Acme Services',
      ''
    );
    expect(readiness.abnRequired).toBe(true);
    expect(readiness.abnPresent).toBe(false);
  });

  it('treats service location as incomplete when required fields are invalid', () => {
    const readiness = computeReadiness(
      { emailVerified: true, phoneVerified: true, stripe: { onboardingComplete: true }, profileCompleted: true },
      '1990-01-01',
      { suburb: 'S', state: 'N', postcode: '20' },
      'individual',
      '',
      ''
    );
    expect(readiness.serviceLocationSet).toBe(false);
  });

  it('does not require ABN for individual without business name', () => {
    const readiness = computeReadiness(
      { emailVerified: true, phoneVerified: true, stripe: { onboardingComplete: true }, profileCompleted: true },
      '1990-01-01',
      { suburb: 'Sydney', state: 'NSW', postcode: '2000' },
      'individual',
      '',
      ''
    );
    expect(readiness.abnRequired).toBe(false);
    expect(readiness.abnPresent).toBe(true);
    expect(readiness.abnVerified).toBe(true);
  });

  it('requires all quote-readiness flags', () => {
    expect(
      canQuote({
        emailVerified: true,
        phoneVerified: true,
        serviceLocationSet: true,
        dob18Plus: true,
        businessTypeSet: true,
        abnPresent: true,
        abnVerified: true,
        stripeReady: true,
        profileCompleted: true,
      })
    ).toBe(true);

    expect(
      canQuote({
        emailVerified: true,
        phoneVerified: true,
        serviceLocationSet: true,
        dob18Plus: true,
        businessTypeSet: true,
        abnPresent: true,
        abnVerified: false,
        stripeReady: true,
        profileCompleted: true,
      })
    ).toBe(false);

    expect(
      canQuote({
        emailVerified: false,
        phoneVerified: true,
        serviceLocationSet: true,
        dob18Plus: true,
        businessTypeSet: true,
        abnPresent: true,
        abnVerified: true,
        stripeReady: true,
        profileCompleted: true,
      })
    ).toBe(false);

    expect(
      canQuote({
        emailVerified: true,
        phoneVerified: true,
        serviceLocationSet: true,
        dob18Plus: true,
        businessTypeSet: true,
        abnPresent: false,
        abnVerified: true,
        stripeReady: true,
        profileCompleted: true,
      })
    ).toBe(false);
  });

  it('treats isProfileComplete like profileCompleted for quote readiness', () => {
    const readiness = computeReadiness(
      {
        emailVerified: true,
        phoneVerified: true,
        stripe: { onboardingComplete: true },
        profileCompleted: false,
        isProfileComplete: true,
      },
      '1990-01-01',
      { suburb: 'Sydney', state: 'NSW', postcode: '2000' },
      'individual',
      '',
      ''
    );
    expect(readiness.profileCompleted).toBe(true);
  });
});
