'use strict';

/**
 * Bounded Admin read of the Pilot Status engine.
 * Reuses the Slice 1 supply snapshot. No mutation.
 */

const { launchReadinessManifest } = require('../../../shared/launchReadinessManifest');
const { buildPilotSupplySnapshot } = require('./pilotSupplyService');
const { derivePilotLaunchStatus } = require('./pilotLaunchStatusDerive');

async function buildPilotLaunchReadinessSnapshot(db, options = {}) {
  try {
    const supply = await buildPilotSupplySnapshot(db, options);
    return {
      source: 'GET /api/admin/pilot-launch-readiness — reviewed launch-gate manifest + one Expert supply scan',
      ...derivePilotLaunchStatus({
        manifest: options.manifest || launchReadinessManifest,
        supply,
        supplyError: false,
      }),
    };
  } catch (error) {
    return {
      source: 'GET /api/admin/pilot-launch-readiness — reviewed launch-gate manifest + one Expert supply scan',
      ...derivePilotLaunchStatus({
        manifest: options.manifest || launchReadinessManifest,
        supply: null,
        supplyError: true,
      }),
    };
  }
}

module.exports = {
  buildPilotLaunchReadinessSnapshot,
};
