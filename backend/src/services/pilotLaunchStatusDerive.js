'use strict';

/**
 * Read-only Pilot Status / launch-gate engine.
 * Never fail open. Does not persist OPEN/PAUSED or mutate posting.
 */

const {
  GATE_STATUS,
  KNOWN_GATE_STATUSES,
  REQUIRED_RESULT,
  launchReadinessManifest,
} = require('../../../shared/launchReadinessManifest');

const OVERALL = Object.freeze({
  READY_TO_OPEN: 'READY TO OPEN',
  NOT_READY: 'NOT READY',
  DATA_INCOMPLETE: 'DATA INCOMPLETE',
  DATA_UNAVAILABLE: 'DATA UNAVAILABLE',
});

const DECISION = Object.freeze({
  SATISFIED: 'SATISFIED',
  UNSATISFIED: 'UNSATISFIED',
  UNKNOWN: 'UNKNOWN',
});

const REQUIRED_GATE_IDS = Object.freeze(
  launchReadinessManifest.gates
    .filter((gate) => gate.requiredForReadyToOpen)
    .map((gate) => gate.id)
);

function asInt(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function validateManifest(manifest) {
  if (!manifest || typeof manifest !== 'object' || !Array.isArray(manifest.gates)) {
    return { valid: false, reason: 'Launch-gate manifest is missing or not an object with gates[].' };
  }
  if (!Number.isInteger(manifest.version) || manifest.version < 1) {
    return { valid: false, reason: 'Launch-gate manifest version is invalid.' };
  }
  const ids = new Set();
  for (const gate of manifest.gates) {
    if (!gate || typeof gate !== 'object' || !gate.id || !gate.label) {
      return { valid: false, reason: 'Launch-gate manifest contains an incomplete gate.' };
    }
    if (ids.has(gate.id)) {
      return { valid: false, reason: `Launch-gate manifest has a duplicate gate id ${gate.id}.` };
    }
    ids.add(gate.id);
    if (gate.requiredForReadyToOpen && !KNOWN_GATE_STATUSES.has(gate.status) && gate.status !== 'UNKNOWN') {
      if (typeof gate.status !== 'string' || !gate.status.trim()) {
        return { valid: false, reason: `Gate ${gate.id} has a missing status.` };
      }
    }
  }
  for (const requiredId of REQUIRED_GATE_IDS) {
    if (!ids.has(requiredId)) {
      return { valid: false, reason: `Required gate ${requiredId} is missing from the manifest.` };
    }
  }
  return { valid: true };
}

function decisionForGate(gate) {
  const status = String(gate?.status || '').trim();
  if (!status || status === 'UNKNOWN' || !KNOWN_GATE_STATUSES.has(status)) {
    return DECISION.UNKNOWN;
  }
  if (gate.requiredResult === REQUIRED_RESULT.PRODUCTION_PASS) {
    if (status === GATE_STATUS.PRODUCTION_PASS || status === GATE_STATUS.PASS) {
      return DECISION.SATISFIED;
    }
    return DECISION.UNSATISFIED;
  }
  if (
    status === GATE_STATUS.PASS
    || status === GATE_STATUS.PASS_COMPLETE
    || status === GATE_STATUS.COMPLETE
    || status === GATE_STATUS.PRODUCTION_PASS
  ) {
    return DECISION.SATISFIED;
  }
  return DECISION.UNSATISFIED;
}

function gateBlockerLabel(gate, decision) {
  if (decision === DECISION.UNKNOWN) {
    return `${gate.id} — status unknown`;
  }
  if (gate.id === 'P03') return 'P03 — production email not proven';
  if (gate.id === 'P04') return 'P04 — production analytics not proven';
  if (gate.id === 'P05') return 'P05 — production App Check not proven';
  if (gate.id === 'P06') return 'P06 — legal/privacy review open';
  if (gate.id === 'P07') return 'P07 — production security/configuration not complete';
  if (gate.id === 'P08') return 'P08 — production operations not complete';
  if (gate.id === 'P09') return 'P09 — legal/trust implementation blocked';
  if (gate.id === 'P10') return 'P10 — production acceptance not complete';
  return `${gate.id} — ${gate.status}`;
}

function evaluateSupply(snapshot) {
  if (!snapshot || typeof snapshot !== 'object') {
    return {
      available: false,
      incomplete: false,
      ready: false,
      decision: DECISION.UNKNOWN,
      blockers: [{ id: 'SUPPLY', label: 'SUPPLY — data unavailable' }],
      summary: null,
    };
  }

  const totals = snapshot.totals && typeof snapshot.totals === 'object' ? snapshot.totals : {};
  const targets = snapshot.targets && typeof snapshot.targets === 'object' ? snapshot.targets : {};
  const launchTarget = asInt(targets.launchReady, 15) || 15;
  const categoryMinimum = asInt(targets.categoryCoverageMinimum, 4) || 4;
  const launchReady = asInt(totals.launchReady, 0);
  const categories = Array.isArray(snapshot.categoryCoverage) ? snapshot.categoryCoverage : [];
  const areas = Array.isArray(snapshot.geographyCoverage) ? snapshot.geographyCoverage : [];
  const incomplete = totals.scanComplete === false || totals.truncated === true;
  const blockers = [];

  if (launchReady < launchTarget) {
    blockers.push({
      id: 'SUPPLY',
      label: `SUPPLY — ${launchReady} / ${launchTarget} launch-ready Experts`,
    });
  }
  for (const row of categories) {
    const count = asInt(row?.launchReadyCount, 0);
    const minimum = asInt(row?.minimum, categoryMinimum) || categoryMinimum;
    if (count < minimum) {
      blockers.push({
        id: 'CATEGORY',
        label: `CATEGORY — ${String(row?.category || 'Unknown')} ${count} / minimum ${minimum}`,
      });
    }
  }
  if (categories.length === 0) {
    blockers.push({ id: 'CATEGORY', label: 'CATEGORY — coverage cannot be proven' });
  }
  for (const row of areas) {
    const count = asInt(row?.launchReadyCount, 0);
    if (count < 1) {
      blockers.push({
        id: 'GEOGRAPHY',
        label: `GEOGRAPHY — ${String(row?.area || 'Unknown')} has no launch-ready Expert`,
      });
    }
  }
  if (areas.length === 0) {
    blockers.push({ id: 'GEOGRAPHY', label: 'GEOGRAPHY — coverage cannot be proven' });
  }

  const ready = blockers.length === 0 && !incomplete;
  return {
    available: true,
    incomplete,
    ready,
    decision: incomplete ? DECISION.UNKNOWN : (ready ? DECISION.SATISFIED : DECISION.UNSATISFIED),
    blockers,
    summary: {
      launchReady,
      launchTarget,
      scanComplete: totals.scanComplete === true,
      truncated: totals.truncated === true,
      status: incomplete ? 'DATA INCOMPLETE' : (ready ? 'READY' : 'NOT READY'),
    },
  };
}

function derivePilotLaunchStatus({
  manifest = launchReadinessManifest,
  supply = null,
  supplyError = false,
} = {}) {
  const checked = validateManifest(manifest);
  if (!checked.valid) {
    return {
      overallStatus: OVERALL.DATA_UNAVAILABLE,
      sourceVersion: manifest && manifest.version != null ? manifest.version : null,
      updatedAt: manifest && manifest.updatedAt ? manifest.updatedAt : null,
      source: manifest && manifest.source ? manifest.source : null,
      scanComplete: false,
      gates: [],
      supply: null,
      blockers: [{ id: 'MANIFEST', label: checked.reason }],
      posting: { state: 'CLOSED', activateAvailable: false },
    };
  }

  const gates = manifest.gates.map((gate) => {
    const decision = decisionForGate(gate);
    const required = gate.requiredForReadyToOpen === true;
    return {
      id: gate.id,
      label: gate.label,
      group: gate.group,
      status: gate.status,
      required,
      requiredResult: gate.requiredResult,
      decision,
      blocking: required && decision !== DECISION.SATISFIED,
      evidenceSummary: gate.evidenceSummary || '',
      lastUpdated: gate.lastUpdated || null,
      notes: gate.notes || '',
      blockedBy: Array.isArray(gate.blockedBy) ? gate.blockedBy.slice() : [],
    };
  });

  if (supplyError) {
    return {
      overallStatus: OVERALL.DATA_UNAVAILABLE,
      sourceVersion: manifest.version,
      updatedAt: manifest.updatedAt,
      source: manifest.source,
      scanComplete: false,
      gates,
      supply: null,
      blockers: [{ id: 'SUPPLY', label: 'SUPPLY — data unavailable' }],
      posting: { state: 'CLOSED', activateAvailable: false },
    };
  }

  const supplyEval = evaluateSupply(supply);
  const blockers = [];
  for (const gate of gates) {
    if (!gate.required) continue;
    if (gate.decision !== DECISION.SATISFIED) {
      const raw = manifest.gates.find((row) => row.id === gate.id);
      blockers.push({
        id: gate.id,
        label: gateBlockerLabel(raw || gate, gate.decision),
      });
    }
  }
  blockers.push(...supplyEval.blockers);

  let overallStatus = OVERALL.NOT_READY;
  if (supplyEval.incomplete) {
    overallStatus = OVERALL.DATA_INCOMPLETE;
  } else if (
    supplyEval.ready
    && gates.filter((gate) => gate.required).every((gate) => gate.decision === DECISION.SATISFIED)
  ) {
    overallStatus = OVERALL.READY_TO_OPEN;
  }

  return {
    overallStatus,
    sourceVersion: manifest.version,
    updatedAt: manifest.updatedAt,
    source: manifest.source,
    scanComplete: supplyEval.available && !supplyEval.incomplete,
    gates,
    supply: supplyEval.summary,
    blockers: overallStatus === OVERALL.READY_TO_OPEN ? [] : blockers,
    posting: {
      state: 'CLOSED',
      activateAvailable: false,
      note: overallStatus === OVERALL.READY_TO_OPEN
        ? 'All required launch gates are satisfied. Homeowner posting remains closed until explicitly activated by the owner.'
        : 'Homeowner posting remains closed until all launch-readiness gates are complete and explicitly activated.',
    },
  };
}

function withGateOverrides(overrides = {}, base = launchReadinessManifest) {
  return {
    ...base,
    gates: base.gates.map((gate) => (
      Object.prototype.hasOwnProperty.call(overrides, gate.id)
        ? { ...gate, ...overrides[gate.id] }
        : gate
    )),
  };
}

module.exports = {
  OVERALL,
  DECISION,
  REQUIRED_GATE_IDS,
  validateManifest,
  decisionForGate,
  evaluateSupply,
  derivePilotLaunchStatus,
  withGateOverrides,
};
