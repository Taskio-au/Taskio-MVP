import { isPublicAcquisitionEnabled } from './publicAcquisitionConfig';

describe('isPublicAcquisitionEnabled', () => {
  it('is off by default so private MVP stays invite-only', () => {
    expect(isPublicAcquisitionEnabled({})).toBe(false);
    expect(isPublicAcquisitionEnabled({ REACT_APP_PUBLIC_ACQUISITION_ENABLED: '' })).toBe(false);
    expect(isPublicAcquisitionEnabled({ REACT_APP_PUBLIC_ACQUISITION_ENABLED: 'false' })).toBe(false);
  });

  it('enables only with an explicit true flag', () => {
    expect(isPublicAcquisitionEnabled({ REACT_APP_PUBLIC_ACQUISITION_ENABLED: 'true' })).toBe(true);
  });
});
