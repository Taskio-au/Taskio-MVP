/**
 * Display-only SUPPLY readiness from GET /api/admin/pilot-supply.
 * Not the future Pilot Status engine and not a posting control.
 * Do not infer READY TO OPEN / OPEN / WATCH / PAUSED from supply alone.
 */

export const PILOT_STATUS = Object.freeze({
  LOADING: 'LOADING',
  UNAVAILABLE: 'UNAVAILABLE',
  INCOMPLETE: 'INCOMPLETE',
  SUPPLY_NOT_READY: 'SUPPLY_NOT_READY',
  SUPPLY_READY: 'SUPPLY_READY',
});

export const DEFAULT_TARGETS = Object.freeze({
  launchReady: 15,
  afterActivationFloor: 12,
  categoryCoverageMinimum: 4,
  categoryCoverageTarget: 5,
});

export const POSTING_CLOSED_COPY =
  'Posting remains closed until all launch-readiness gates are complete and explicitly activated.';

export const SUPPLY_READY_COPY =
  'Expert supply targets are met. This does not open homeowner posting. Other launch gates and explicit owner activation are still required.';

export const INCOMPLETE_COPY =
  'The Expert supply scan hit its current cap, so readiness cannot be proven from this data.';

export const UNAVAILABLE_COPY = 'Pilot readiness data unavailable';

export const ZERO_EXPERTS_COPY =
  'Recruit and onboard launch-ready Experts before opening homeowner posting.';

export const GEOGRAPHY_HEURISTIC_COPY =
  'Coverage means at least one launch-ready Expert has selected this service area. It does not guarantee availability for every category.';

function asInt(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

export function readTargets(snapshot) {
  const targets = snapshot?.targets && typeof snapshot.targets === 'object' ? snapshot.targets : {};
  return {
    launchReady: asInt(targets.launchReady, DEFAULT_TARGETS.launchReady) || DEFAULT_TARGETS.launchReady,
    afterActivationFloor:
      asInt(targets.afterActivationFloor, DEFAULT_TARGETS.afterActivationFloor)
      || DEFAULT_TARGETS.afterActivationFloor,
    categoryCoverageMinimum:
      asInt(targets.categoryCoverageMinimum, DEFAULT_TARGETS.categoryCoverageMinimum)
      || DEFAULT_TARGETS.categoryCoverageMinimum,
    categoryCoverageTarget:
      asInt(targets.categoryCoverageTarget, DEFAULT_TARGETS.categoryCoverageTarget)
      || DEFAULT_TARGETS.categoryCoverageTarget,
  };
}

export function launchReadyBand(count, target = DEFAULT_TARGETS.launchReady, floor = DEFAULT_TARGETS.afterActivationFloor) {
  const n = asInt(count, 0);
  if (n >= target) return 'TARGET MET';
  if (n >= floor) return 'BELOW LAUNCH TARGET';
  return 'BELOW OPERATING FLOOR';
}

export function operatingFloorBand(count, floor = DEFAULT_TARGETS.afterActivationFloor) {
  return asInt(count, 0) >= floor ? 'AT OR ABOVE FLOOR' : 'BELOW OPERATING FLOOR';
}

export function categoryRowStatus(
  count,
  minimum = DEFAULT_TARGETS.categoryCoverageMinimum,
  target = DEFAULT_TARGETS.categoryCoverageTarget
) {
  const n = asInt(count, 0);
  if (n >= target) return 'HEALTHY';
  if (n >= minimum) return 'ADEQUATE';
  return 'UNDER-COVERED';
}

export function geographyRowStatus(count) {
  return asInt(count, 0) > 0 ? 'COVERED' : 'UNCOVERED';
}

export function isScanIncomplete(snapshot) {
  const totals = snapshot?.totals && typeof snapshot.totals === 'object' ? snapshot.totals : {};
  return totals.scanComplete === false || totals.truncated === true;
}

export function derivePilotReadiness(snapshot, loadState = 'ok') {
  if (loadState === 'loading') {
    return { status: PILOT_STATUS.LOADING, snapshot: null, targets: readTargets(null) };
  }
  if (loadState === 'error' || !snapshot || typeof snapshot !== 'object') {
    return { status: PILOT_STATUS.UNAVAILABLE, snapshot: null, targets: readTargets(null) };
  }

  const targets = readTargets(snapshot);
  const totals = snapshot.totals && typeof snapshot.totals === 'object' ? snapshot.totals : {};
  const launchReady = asInt(totals.launchReady, 0);
  const categories = Array.isArray(snapshot.categoryCoverage) ? snapshot.categoryCoverage : [];
  const areas = Array.isArray(snapshot.geographyCoverage) ? snapshot.geographyCoverage : [];

  const categoryRows = categories.map((row) => {
    const count = asInt(row?.launchReadyCount, 0);
    const minimum = asInt(row?.minimum, targets.categoryCoverageMinimum) || targets.categoryCoverageMinimum;
    const target = asInt(row?.target, targets.categoryCoverageTarget) || targets.categoryCoverageTarget;
    return {
      category: String(row?.category || '').trim() || 'Unknown',
      launchReadyCount: count,
      minimum,
      target,
      status: categoryRowStatus(count, minimum, target),
    };
  });

  const geographyRows = areas.map((row) => {
    const count = asInt(row?.launchReadyCount, 0);
    return {
      area: String(row?.area || '').trim() || 'Unknown',
      launchReadyCount: count,
      status: geographyRowStatus(count),
    };
  });

  const categoriesAdequate = categoryRows.length > 0
    && categoryRows.every((row) => row.launchReadyCount >= row.minimum);
  const geographyCovered = geographyRows.length > 0
    && geographyRows.every((row) => row.launchReadyCount > 0);
  const launchTargetMet = launchReady >= targets.launchReady;
  const supplyReady = launchTargetMet && categoriesAdequate && geographyCovered;

  let status = PILOT_STATUS.SUPPLY_NOT_READY;
  if (isScanIncomplete(snapshot)) {
    status = PILOT_STATUS.INCOMPLETE;
  } else if (supplyReady) {
    status = PILOT_STATUS.SUPPLY_READY;
  }

  return {
    status,
    snapshot,
    targets,
    totals: {
      experts: asInt(totals.experts, 0),
      technicallyEligible: asInt(totals.technicallyEligible, 0),
      launchReady,
      truncated: totals.truncated === true,
      scanComplete: totals.scanComplete === true,
    },
    categoryRows,
    geographyRows,
    categoriesAdequateCount: categoryRows.filter((row) => row.launchReadyCount >= row.minimum).length,
    categoriesTotal: categoryRows.length,
    geographyCoveredCount: geographyRows.filter((row) => row.launchReadyCount > 0).length,
    geographyTotal: geographyRows.length,
    launchReadyBand: launchReadyBand(launchReady, targets.launchReady, targets.afterActivationFloor),
    operatingFloorBand: operatingFloorBand(launchReady, targets.afterActivationFloor),
    supplyReady,
  };
}

export function statusLabel(status) {
  switch (status) {
    case PILOT_STATUS.LOADING:
      return 'Loading';
    case PILOT_STATUS.UNAVAILABLE:
      return 'DATA UNAVAILABLE';
    case PILOT_STATUS.INCOMPLETE:
      return 'DATA INCOMPLETE';
    case PILOT_STATUS.SUPPLY_READY:
      return 'SUPPLY READY';
    case PILOT_STATUS.SUPPLY_NOT_READY:
    default:
      return 'SUPPLY NOT READY';
  }
}
