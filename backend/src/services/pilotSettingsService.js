'use strict';

/**
 * Admin SDK read/write for persisted Pilot operational state.
 * Homeowner posting reads effectiveState only. OPEN requires a live READY TO OPEN check.
 */

const { admin } = require('../firebaseAdmin');
const { buildPilotLaunchReadinessSnapshot } = require('./pilotLaunchStatusService');
const {
  OPERATIONAL_STATES,
  EXPERT_ONBOARDING_EVENT_TYPE,
  normalizeStoredSettings,
  serializePilotSettings,
  evaluateTransition,
  buildSettingsWrite,
  evaluateExpertOnboardingChange,
  buildExpertOnboardingWrite,
  sanitizeReason,
} = require('./pilotSettingsDerive');

const SETTINGS_COLLECTION = 'system';
const SETTINGS_DOC = 'pilotSettings';
const HISTORY_COLLECTION = 'history';

function settingsRef(db) {
  return db.collection(SETTINGS_COLLECTION).doc(SETTINGS_DOC);
}

function toSettingsView(snap) {
  const raw = snap && snap.exists ? snap.data() : null;
  return serializePilotSettings(normalizeStoredSettings(raw), raw);
}

async function readPilotSettings(db) {
  const snap = await settingsRef(db).get();
  return toSettingsView(snap);
}

async function evaluateOpenReadiness(db, loadReadiness) {
  try {
    const loader = loadReadiness || (() => buildPilotLaunchReadinessSnapshot(db));
    const snapshot = await loader();
    if (snapshot && snapshot.overallStatus === 'READY TO OPEN') {
      return { ok: true, snapshot };
    }
    return {
      ok: false,
      snapshot: snapshot && typeof snapshot === 'object'
        ? snapshot
        : { overallStatus: 'DATA UNAVAILABLE', blockers: [] },
    };
  } catch (_) {
    return {
      ok: false,
      snapshot: {
        overallStatus: 'DATA UNAVAILABLE',
        blockers: [{ id: 'READINESS', label: 'Launch readiness could not be loaded' }],
      },
    };
  }
}

function notReadyError(snapshot) {
  return {
    code: 'PILOT_NOT_READY',
    message: 'Pilot cannot open until launch readiness is READY TO OPEN.',
    overallStatus: snapshot && snapshot.overallStatus ? snapshot.overallStatus : 'DATA UNAVAILABLE',
    blockers: Array.isArray(snapshot && snapshot.blockers) ? snapshot.blockers : [],
  };
}

async function updatePilotSettingsState(db, {
  nextState,
  reason,
  actorUid,
  loadReadiness,
} = {}) {
  const current = await readPilotSettings(db);
  const planned = evaluateTransition(current.effectiveState, nextState);
  if (!planned.ok) {
    return { ok: false, status: 400, error: { code: planned.code, message: planned.message } };
  }
  if (planned.noop) {
    return { ok: true, changed: false, settings: current };
  }

  if (planned.requiresReadyToOpen) {
    const readiness = await evaluateOpenReadiness(db, loadReadiness);
    if (!readiness.ok) {
      return { ok: false, status: 409, error: notReadyError(readiness.snapshot) };
    }
  }

  const now = admin.firestore.FieldValue.serverTimestamp();
  const fields = buildSettingsWrite({
    from: planned.from,
    to: planned.to,
    reason,
    actorUid,
    version: current.version,
  });
  const nextDoc = {
    ...fields,
    updatedAt: now,
  };
  if (planned.to === OPERATIONAL_STATES.OPEN) nextDoc.activatedAt = now;
  if (planned.to === OPERATIONAL_STATES.PAUSED) nextDoc.pausedAt = now;
  if (planned.to === OPERATIONAL_STATES.CLOSED) nextDoc.closedAt = now;

  const ref = settingsRef(db);
  const historyRef = ref.collection(HISTORY_COLLECTION).doc();
  const batch = db.batch();
  batch.set(ref, nextDoc, { merge: true });
  batch.set(historyRef, {
    previousState: planned.from,
    newState: planned.to,
    changedAt: now,
    changedByUid: String(actorUid || ''),
    reason: sanitizeReason(reason),
  });
  await batch.commit();

  const saved = await readPilotSettings(db);
  return { ok: true, changed: true, settings: saved };
}

async function updateExpertOnboardingMode(db, {
  nextMode,
  reason,
  actorUid,
} = {}) {
  const current = await readPilotSettings(db);
  const planned = evaluateExpertOnboardingChange(current.effectiveExpertOnboardingMode, nextMode);
  if (!planned.ok) {
    return { ok: false, status: 400, error: { code: planned.code, message: planned.message } };
  }
  if (planned.noop) {
    return { ok: true, changed: false, settings: current };
  }

  const now = admin.firestore.FieldValue.serverTimestamp();
  const fields = buildExpertOnboardingWrite({
    from: planned.from,
    to: planned.to,
    reason,
    actorUid,
    version: current.version,
  });
  const ref = settingsRef(db);
  const historyRef = ref.collection(HISTORY_COLLECTION).doc();
  const batch = db.batch();
  batch.set(ref, {
    ...fields,
    updatedAt: now,
  }, { merge: true });
  batch.set(historyRef, {
    eventType: EXPERT_ONBOARDING_EVENT_TYPE,
    previousMode: planned.from,
    newMode: planned.to,
    changedAt: now,
    changedByUid: String(actorUid || ''),
    reason: sanitizeReason(reason),
  });
  await batch.commit();

  const saved = await readPilotSettings(db);
  return { ok: true, changed: true, settings: saved };
}

module.exports = {
  SETTINGS_COLLECTION,
  SETTINGS_DOC,
  HISTORY_COLLECTION,
  readPilotSettings,
  updatePilotSettingsState,
  updateExpertOnboardingMode,
};
