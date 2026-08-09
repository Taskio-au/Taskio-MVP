const {
  INNER_MELBOURNE_LAUNCH_MESSAGE,
  isSupportedMelbournePilotLocation,
  searchMelbournePilotLocations,
} = require('../../shared/auLocations');

describe('Melbourne pilot locations', () => {
  it('accepts supported Melbourne labels and objects', () => {
    expect(isSupportedMelbournePilotLocation('Docklands, VIC 3008')).toBe(true);
    expect(isSupportedMelbournePilotLocation({
      suburb: 'Richmond',
      state: 'VIC',
      postcode: '3121',
    })).toBe(true);
  });

  it('rejects unsupported suburbs outside the current launch area', () => {
    expect(isSupportedMelbournePilotLocation('Geelong, VIC 3220')).toBe(false);
    expect(isSupportedMelbournePilotLocation({
      suburb: 'Parramatta',
      state: 'NSW',
      postcode: '2150',
    })).toBe(false);
  });

  it('searches only supported Melbourne suburbs', () => {
    const results = searchMelbournePilotLocations('do', 10);
    expect(results.some((item) => item.suburb === 'Docklands')).toBe(true);
    expect(results.some((item) => item.suburb === 'Carlton')).toBe(false);
    expect(results.some((item) => item.suburb === 'Coburg')).toBe(false);
  });

  it('exports the exact inner Melbourne launch message', () => {
    expect(INNER_MELBOURNE_LAUNCH_MESSAGE).toBe("We're currently launching in inner Melbourne. We'll be in your area soon.");
  });
});
