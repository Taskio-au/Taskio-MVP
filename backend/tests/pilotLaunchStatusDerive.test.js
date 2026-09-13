'use strict';

const { GATE_STATUS } = require('../../shared/launchReadinessManifest');
const {
  OVERALL,
  DECISION,
  derivePilotLaunchStatus,
  withGateOverrides,
} = require('../src/services/pilotLaunchStatusDerive');

function readySupply(overrides = {}) {
  return {
    targets: {
      launchReady: 15,
      afterActivationFloor: 12,
      categoryCoverageMinimum: 4,
      categoryCoverageTarget: 5,
    },
    totals: {
      launchReady: 15,
      truncated: false,
      scanComplete: true,
      ...(overrides.totals || {}),
    },
    categoryCoverage: overrides.categoryCoverage || [
      { category: 'Mounting', launchReadyCount: 5, minimum: 4, target: 5 },
      { category: 'Silicone Sealing', launchReadyCount: 4, minimum: 4, target: 5 },
    ],
    geographyCoverage: overrides.geographyCoverage || [
      { area: 'Richmond', launchReadyCount: 2 },
      { area: 'Carlton', launchReadyCount: 1 },
    ],
  };
}

const allGatesPass = withGateOverrides({
  P01: { status: GATE_STATUS.PASS_COMPLETE },
  P02: { status: GATE_STATUS.COMPLETE },
  P03: { status: GATE_STATUS.PRODUCTION_PASS },
  P04: { status: GATE_STATUS.PRODUCTION_PASS },
  P05: { status: GATE_STATUS.PRODUCTION_PASS },
  P06: { status: GATE_STATUS.PASS },
  P07: { status: GATE_STATUS.PASS },
  P08: { status: GATE_STATUS.PASS },
  P09: { status: GATE_STATUS.PASS },
  P10: { status: GATE_STATUS.PASS },
  P11: { status: GATE_STATUS.BLOCKED },
});

describe('derivePilotLaunchStatus', () => {
  it('returns READY TO OPEN when all required gates pass and supply is ready, even if P11 is blocked', () => {
    const result = derivePilotLaunchStatus({ manifest: allGatesPass, supply: readySupply() });
    expect(result.overallStatus).toBe(OVERALL.READY_TO_OPEN);
    expect(result.blockers).toEqual([]);
    expect(result.gates.find((gate) => gate.id === 'P11').required).toBe(false);
    expect(result.gates.find((gate) => gate.id === 'P11').blocking).toBe(false);
    expect(result.posting.state).toBe('CLOSED');
    expect(result.posting.activateAvailable).toBe(false);
  });

  it('does not treat P03 staging pass as production PASS', () => {
    const result = derivePilotLaunchStatus({
      manifest: withGateOverrides({
        P03: { status: GATE_STATUS.STAGING_PASS_PRODUCTION_PENDING },
      }, allGatesPass),
      supply: readySupply(),
    });
    expect(result.overallStatus).toBe(OVERALL.NOT_READY);
    expect(result.gates.find((gate) => gate.id === 'P03').decision).toBe(DECISION.UNSATISFIED);
    expect(result.blockers.some((row) => row.label.includes('production email'))).toBe(true);
  });

  it('returns NOT READY when P06 is OPEN', () => {
    const result = derivePilotLaunchStatus({
      manifest: withGateOverrides({ P06: { status: GATE_STATUS.OPEN } }, allGatesPass),
      supply: readySupply(),
    });
    expect(result.overallStatus).toBe(OVERALL.NOT_READY);
    expect(result.blockers.some((row) => row.id === 'P06')).toBe(true);
  });

  it('returns NOT READY when P09 is BLOCKED', () => {
    const result = derivePilotLaunchStatus({
      manifest: withGateOverrides({ P09: { status: GATE_STATUS.BLOCKED, blockedBy: ['P06'] } }, allGatesPass),
      supply: readySupply(),
    });
    expect(result.overallStatus).toBe(OVERALL.NOT_READY);
    const p09 = result.gates.find((gate) => gate.id === 'P09');
    expect(p09.status).toBe(GATE_STATUS.BLOCKED);
    expect(p09.blockedBy).toEqual(['P06']);
    expect(result.blockers.some((row) => row.label.includes('trust implementation blocked'))).toBe(true);
  });

  it('returns NOT READY when P07 is NOT STARTED', () => {
    const result = derivePilotLaunchStatus({
      manifest: withGateOverrides({ P07: { status: GATE_STATUS.NOT_STARTED } }, allGatesPass),
      supply: readySupply(),
    });
    expect(result.overallStatus).toBe(OVERALL.NOT_READY);
    expect(result.blockers.some((row) => row.id === 'P07')).toBe(true);
  });

  it('returns NOT READY when P10 is NOT STARTED', () => {
    const result = derivePilotLaunchStatus({
      manifest: withGateOverrides({ P10: { status: GATE_STATUS.NOT_STARTED } }, allGatesPass),
      supply: readySupply(),
    });
    expect(result.overallStatus).toBe(OVERALL.NOT_READY);
    expect(result.blockers.some((row) => row.id === 'P10')).toBe(true);
  });

  it('returns NOT READY when supply is below target or a category is under-covered', () => {
    const result = derivePilotLaunchStatus({
      manifest: allGatesPass,
      supply: readySupply({
        totals: { launchReady: 11, truncated: false, scanComplete: true },
        categoryCoverage: [
          { category: 'Mounting', launchReadyCount: 5, minimum: 4, target: 5 },
          { category: 'Silicone Sealing', launchReadyCount: 3, minimum: 4, target: 5 },
        ],
      }),
    });
    expect(result.overallStatus).toBe(OVERALL.NOT_READY);
    expect(result.blockers.some((row) => row.label === 'SUPPLY — 11 / 15 launch-ready Experts')).toBe(true);
    expect(result.blockers.some((row) => row.label === 'CATEGORY — Silicone Sealing 3 / minimum 4')).toBe(true);
  });

  it('returns DATA INCOMPLETE when the supply scan is truncated', () => {
    const result = derivePilotLaunchStatus({
      manifest: allGatesPass,
      supply: readySupply({ totals: { launchReady: 15, truncated: true, scanComplete: false } }),
    });
    expect(result.overallStatus).toBe(OVERALL.DATA_INCOMPLETE);
    expect(result.scanComplete).toBe(false);
  });

  it('treats an unknown required gate as a NOT READY blocker', () => {
    const result = derivePilotLaunchStatus({
      manifest: withGateOverrides({ P08: { status: 'UNKNOWN' } }, allGatesPass),
      supply: readySupply(),
    });
    expect(result.overallStatus).toBe(OVERALL.NOT_READY);
    expect(result.gates.find((gate) => gate.id === 'P08').decision).toBe(DECISION.UNKNOWN);
    expect(result.blockers.some((row) => row.label === 'P08 — status unknown')).toBe(true);
  });

  it('fails closed when the manifest is invalid', () => {
    const result = derivePilotLaunchStatus({ manifest: { version: 1, gates: null }, supply: readySupply() });
    expect(result.overallStatus).toBe(OVERALL.DATA_UNAVAILABLE);
    expect(result.blockers[0].id).toBe('MANIFEST');
  });

  it('fails closed when supply cannot load', () => {
    const result = derivePilotLaunchStatus({ manifest: allGatesPass, supply: null, supplyError: true });
    expect(result.overallStatus).toBe(OVERALL.DATA_UNAVAILABLE);
    expect(result.blockers.some((row) => row.id === 'SUPPLY')).toBe(true);
  });

  it('uses the current reviewed manifest as NOT READY because production and legal gates are open', () => {
    const result = derivePilotLaunchStatus({ supply: readySupply() });
    expect(result.overallStatus).toBe(OVERALL.NOT_READY);
    expect(result.gates.find((gate) => gate.id === 'P01').decision).toBe(DECISION.SATISFIED);
    expect(result.gates.find((gate) => gate.id === 'P02').decision).toBe(DECISION.SATISFIED);
    expect(result.gates.find((gate) => gate.id === 'P03').status).toBe(GATE_STATUS.STAGING_PASS_PRODUCTION_PENDING);
    expect(result.gates.find((gate) => gate.id === 'P06').status).toBe(GATE_STATUS.OPEN);
    expect(result.gates.find((gate) => gate.id === 'P09').status).toBe(GATE_STATUS.BLOCKED);
  });
});
