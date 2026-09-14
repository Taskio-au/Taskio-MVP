import { isPublicAcquisitionEnabled, isExpertPublicSignupEnabled } from './publicAcquisitionConfig';

describe('isExpertPublicSignupEnabled', () => {
  it('is off by default and is not a business eligibility authority', () => {
    expect(isExpertPublicSignupEnabled({})).toBe(false);
    expect(isPublicAcquisitionEnabled({})).toBe(false);
    expect(isExpertPublicSignupEnabled({ REACT_APP_PUBLIC_ACQUISITION_ENABLED: '' })).toBe(false);
    expect(isExpertPublicSignupEnabled({ REACT_APP_PUBLIC_ACQUISITION_ENABLED: 'false' })).toBe(false);
  });

  it('does not control homeowner posting or Expert applications; those follow public pilot status', () => {
    expect(isExpertPublicSignupEnabled({ REACT_APP_PUBLIC_ACQUISITION_ENABLED: 'false' })).toBe(false);
    expect(isExpertPublicSignupEnabled({ REACT_APP_PUBLIC_ACQUISITION_ENABLED: 'true' })).toBe(true);
  });
});
