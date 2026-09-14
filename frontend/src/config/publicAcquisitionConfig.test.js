import { isPublicAcquisitionEnabled, isExpertPublicSignupEnabled } from './publicAcquisitionConfig';

describe('isExpertPublicSignupEnabled', () => {
  it('is off by default so Expert self-signup stays invite-only', () => {
    expect(isExpertPublicSignupEnabled({})).toBe(false);
    expect(isPublicAcquisitionEnabled({})).toBe(false);
    expect(isExpertPublicSignupEnabled({ REACT_APP_PUBLIC_ACQUISITION_ENABLED: '' })).toBe(false);
    expect(isExpertPublicSignupEnabled({ REACT_APP_PUBLIC_ACQUISITION_ENABLED: 'false' })).toBe(false);
  });

  it('does not control homeowner posting; that follows persisted OPEN / CLOSED / PAUSED', () => {
    expect(isExpertPublicSignupEnabled({ REACT_APP_PUBLIC_ACQUISITION_ENABLED: 'false' })).toBe(false);
    expect(isExpertPublicSignupEnabled({ REACT_APP_PUBLIC_ACQUISITION_ENABLED: 'true' })).toBe(true);
  });
});
