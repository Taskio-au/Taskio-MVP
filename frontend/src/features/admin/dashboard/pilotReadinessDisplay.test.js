import {
  DEFAULT_TARGETS,
  PILOT_STATUS,
  categoryRowStatus,
  derivePilotReadiness,
  geographyRowStatus,
  launchReadyBand,
  operatingFloorBand,
  statusLabel,
} from './pilotReadinessDisplay';

function supplySnapshot(overrides = {}) {
  const categoryCoverage = overrides.categoryCoverage || [
    { category: 'Mounting', launchReadyCount: 5, minimum: 4, target: 5 },
    { category: 'Hanging', launchReadyCount: 4, minimum: 4, target: 5 },
  ];
  const geographyCoverage = overrides.geographyCoverage || [
    { area: 'Richmond', launchReadyCount: 2 },
    { area: 'Carlton', launchReadyCount: 1 },
  ];
  return {
    targets: {
      launchReady: 15,
      afterActivationFloor: 12,
      categoryCoverageMinimum: 4,
      categoryCoverageTarget: 5,
    },
    totals: {
      experts: 20,
      technicallyEligible: 18,
      launchReady: 15,
      truncated: false,
      scanComplete: true,
      ...(overrides.totals || {}),
    },
    categoryCoverage,
    geographyCoverage,
    ...overrides,
  };
}

describe('pilotReadinessDisplay', () => {
  it('labels launch-ready bands against target and floor', () => {
    expect(launchReadyBand(15)).toBe('TARGET MET');
    expect(launchReadyBand(14)).toBe('BELOW LAUNCH TARGET');
    expect(launchReadyBand(12)).toBe('BELOW LAUNCH TARGET');
    expect(launchReadyBand(11)).toBe('BELOW OPERATING FLOOR');
    expect(operatingFloorBand(12)).toBe('AT OR ABOVE FLOOR');
    expect(operatingFloorBand(11)).toBe('BELOW OPERATING FLOOR');
  });

  it('labels category and geography rows from counts', () => {
    expect(categoryRowStatus(5)).toBe('HEALTHY');
    expect(categoryRowStatus(4)).toBe('ADEQUATE');
    expect(categoryRowStatus(3)).toBe('UNDER-COVERED');
    expect(geographyRowStatus(1)).toBe('COVERED');
    expect(geographyRowStatus(0)).toBe('UNCOVERED');
  });

  it('is READY TO OPEN only when launch target, category minimum, and geography coverage are met', () => {
    const result = derivePilotReadiness(supplySnapshot());
    expect(result.status).toBe(PILOT_STATUS.READY_TO_OPEN);
    expect(statusLabel(result.status)).toBe('READY TO OPEN');
    expect(result.totals.launchReady).toBe(15);
    expect(result.targets.launchReady).toBe(DEFAULT_TARGETS.launchReady);
  });

  it('is NOT READY when launch-ready count is below target', () => {
    const result = derivePilotReadiness(supplySnapshot({
      totals: { launchReady: 7, experts: 10, technicallyEligible: 8, truncated: false, scanComplete: true },
    }));
    expect(result.status).toBe(PILOT_STATUS.NOT_READY);
    expect(result.launchReadyBand).toBe('BELOW OPERATING FLOOR');
  });

  it('is NOT READY when a category is under the minimum', () => {
    const result = derivePilotReadiness(supplySnapshot({
      categoryCoverage: [
        { category: 'Mounting', launchReadyCount: 5, minimum: 4, target: 5 },
        { category: 'Minor Repairs', launchReadyCount: 3, minimum: 4, target: 5 },
      ],
    }));
    expect(result.status).toBe(PILOT_STATUS.NOT_READY);
    expect(result.categoryRows.find((row) => row.category === 'Minor Repairs').status).toBe('UNDER-COVERED');
  });

  it('is NOT READY when a pilot area is uncovered', () => {
    const result = derivePilotReadiness(supplySnapshot({
      geographyCoverage: [
        { area: 'Richmond', launchReadyCount: 2 },
        { area: 'Carlton', launchReadyCount: 0 },
      ],
    }));
    expect(result.status).toBe(PILOT_STATUS.NOT_READY);
    expect(result.geographyRows.find((row) => row.area === 'Carlton').status).toBe('UNCOVERED');
  });

  it('is DATA INCOMPLETE when the scan is truncated even if counts look ready', () => {
    const result = derivePilotReadiness(supplySnapshot({
      totals: { launchReady: 15, experts: 250, technicallyEligible: 200, truncated: true, scanComplete: false },
    }));
    expect(result.status).toBe(PILOT_STATUS.INCOMPLETE);
    expect(statusLabel(result.status)).toBe('DATA INCOMPLETE');
  });

  it('is DATA UNAVAILABLE on API error and does not invent zero-based NOT READY', () => {
    const result = derivePilotReadiness(null, 'error');
    expect(result.status).toBe(PILOT_STATUS.UNAVAILABLE);
    expect(result.snapshot).toBeNull();
    expect(statusLabel(result.status)).toBe('DATA UNAVAILABLE');
  });

  it('keeps a loading state without treating missing data as NOT READY', () => {
    const result = derivePilotReadiness(null, 'loading');
    expect(result.status).toBe(PILOT_STATUS.LOADING);
  });
});
