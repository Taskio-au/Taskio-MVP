'use strict';

/**
 * Expert operational supply fields for the Controlled Open-Demand Pilot.
 * Canonical geography: shared/auLocations.js melbournePilotSuburbNames.
 * No GIS / radius / maps. No calendar.
 */

const { melbournePilotSuburbNames } = require('../../../shared/auLocations');

const CANONICAL_PILOT_SERVICE_AREAS = Object.freeze([...melbournePilotSuburbNames]);
const CANONICAL_PILOT_SERVICE_AREA_SET = new Set(CANONICAL_PILOT_SERVICE_AREAS);
const CANONICAL_BY_LOWER = new Map(
  CANONICAL_PILOT_SERVICE_AREAS.map((name) => [name.toLowerCase(), name])
);

function getCanonicalPilotServiceAreas() {
  return CANONICAL_PILOT_SERVICE_AREAS;
}

function isCanonicalPilotServiceArea(value) {
  return CANONICAL_PILOT_SERVICE_AREA_SET.has(String(value || '').trim());
}

/** Conservative: only explicit true counts as accepting. Missing/legacy => false. */
function readAcceptingJobs(userDoc) {
  return userDoc?.acceptingJobs === true;
}

/**
 * Safe read for missing/legacy records. Unknown values are dropped (not treated as coverage).
 * Does not infer from serviceLocation.
 */
function readServiceAreas(userDoc) {
  const raw = userDoc?.serviceAreas;
  if (!Array.isArray(raw)) return [];
  const seen = new Set();
  const out = [];
  for (const item of raw) {
    const match = CANONICAL_BY_LOWER.get(String(item || '').trim().toLowerCase());
    if (!match || seen.has(match)) continue;
    seen.add(match);
    out.push(match);
  }
  return out;
}

function parseAcceptingJobsInput(value) {
  if (typeof value !== 'boolean') {
    return {
      ok: false,
      code: 'INVALID_ACCEPTING_JOBS',
      message: 'acceptingJobs must be true or false.',
    };
  }
  return { ok: true, value };
}

function parseServiceAreasInput(value) {
  if (!Array.isArray(value)) {
    return {
      ok: false,
      code: 'INVALID_SERVICE_AREAS',
      message: 'serviceAreas must be an array of approved pilot areas.',
    };
  }
  const seen = new Set();
  const out = [];
  for (const item of value) {
    if (typeof item !== 'string') {
      return {
        ok: false,
        code: 'INVALID_SERVICE_AREAS',
        message: 'Each service area must be a string.',
      };
    }
    const trimmed = item.trim();
    if (!trimmed) {
      return {
        ok: false,
        code: 'UNSUPPORTED_SERVICE_AREA',
        message: 'Unsupported service area.',
      };
    }
    const match = CANONICAL_BY_LOWER.get(trimmed.toLowerCase());
    if (!match) {
      return {
        ok: false,
        code: 'UNSUPPORTED_SERVICE_AREA',
        message: `Unsupported service area: ${trimmed}`,
      };
    }
    if (seen.has(match)) continue;
    seen.add(match);
    out.push(match);
  }
  return { ok: true, value: out };
}

function hasEnabledPilotServiceArea(serviceAreas) {
  if (!Array.isArray(serviceAreas) || serviceAreas.length === 0) return false;
  return serviceAreas.some((area) => CANONICAL_PILOT_SERVICE_AREA_SET.has(area));
}

module.exports = {
  getCanonicalPilotServiceAreas,
  isCanonicalPilotServiceArea,
  readAcceptingJobs,
  readServiceAreas,
  parseAcceptingJobsInput,
  parseServiceAreasInput,
  hasEnabledPilotServiceArea,
};
