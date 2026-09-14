'use strict';

/**
 * Persisted Pilot operational state helpers.
 * Derived launch status (NOT READY / READY TO OPEN) is separate.
 * Missing or invalid stored state fails closed to CLOSED.
 */

const OPERATIONAL_STATES = Object.freeze({
  CLOSED: 'CLOSED',
  OPEN: 'OPEN',
  PAUSED: 'PAUSED',
});

const KNOWN_STATES = new Set(Object.values(OPERATIONAL_STATES));

const EXPERT_ONBOARDING_MODES = Object.freeze({
  OPEN: 'OPEN',
  WAITLIST: 'WAITLIST',
});

const KNOWN_EXPERT_ONBOARDING_MODES = new Set(Object.values(EXPERT_ONBOARDING_MODES));

const EXPERT_ONBOARDING_EVENT_TYPE = 'EXPERT_ONBOARDING_MODE_CHANGED';

const REASON_MAX = 240;

/**
 * Transition table from effective current state.
 * READY_TO_OPEN = allowed only after a live launch-readiness re-evaluation.
 * CLOSED -> PAUSED is rejected: pause is for an already-operating pilot.
 */
const TRANSITION_TABLE = Object.freeze({
  CLOSED: Object.freeze({
    OPEN: 'READY_TO_OPEN',
    CLOSED: 'NOOP',
  }),
  OPEN: Object.freeze({
    PAUSED: 'ALLOW',
    CLOSED: 'ALLOW',
    OPEN: 'NOOP',
  }),
  PAUSED: Object.freeze({
    OPEN: 'READY_TO_OPEN',
    CLOSED: 'ALLOW',
    PAUSED: 'NOOP',
  }),
});

function asInt(value, fallback = 0) {
  const n = Number(value);
  return Number.isInteger(n) ? n : fallback;
}

function sanitizeReason(reason) {
  if (reason == null) return '';
  return String(reason).replace(/\s+/g, ' ').trim().slice(0, REASON_MAX);
}

function serializeTimestamp(value) {
  if (!value) return null;
  if (typeof value.toDate === 'function') {
    try {
      return value.toDate().toISOString();
    } catch (_) {
      return null;
    }
  }
  if (value instanceof Date && Number.isFinite(value.getTime())) {
    return value.toISOString();
  }
  if (typeof value === 'string' && value.trim()) return value.trim();
  return null;
}

function normalizeExpertOnboardingMode(raw) {
  const stored = raw && raw.expertOnboardingMode != null
    ? String(raw.expertOnboardingMode).trim()
    : '';
  if (!KNOWN_EXPERT_ONBOARDING_MODES.has(stored)) {
    return {
      storedExpertOnboardingMode: stored || null,
      effectiveExpertOnboardingMode: EXPERT_ONBOARDING_MODES.WAITLIST,
      expertOnboardingConfigurationValid: !stored,
      expertOnboardingConfigurationWarning: stored
        ? 'Expert onboarding mode is missing or invalid. Effective mode is WAITLIST.'
        : 'Expert onboarding mode is not set. Effective mode is WAITLIST.',
    };
  }
  return {
    storedExpertOnboardingMode: stored,
    effectiveExpertOnboardingMode: stored,
    expertOnboardingConfigurationValid: true,
    expertOnboardingConfigurationWarning: null,
  };
}

function normalizeStoredSettings(raw) {
  if (!raw || typeof raw !== 'object') {
    return {
      documentExists: false,
      configurationValid: true,
      storedState: null,
      effectiveState: OPERATIONAL_STATES.CLOSED,
      configurationWarning: null,
      ...normalizeExpertOnboardingMode(null),
    };
  }

  const expertOnboarding = normalizeExpertOnboardingMode(raw);
  const storedState = raw.state == null ? '' : String(raw.state).trim();
  if (!KNOWN_STATES.has(storedState)) {
    return {
      documentExists: true,
      configurationValid: false,
      storedState: storedState || null,
      effectiveState: OPERATIONAL_STATES.CLOSED,
      configurationWarning: 'Pilot operational state is missing or invalid. Effective state is CLOSED.',
      ...expertOnboarding,
    };
  }

  return {
    documentExists: true,
    configurationValid: true,
    storedState,
    effectiveState: storedState,
    configurationWarning: null,
    ...expertOnboarding,
  };
}

function serializePilotSettings(normalized, raw = null) {
  const data = raw && typeof raw === 'object' ? raw : {};
  return {
    state: normalized.storedState,
    effectiveState: normalized.effectiveState,
    documentExists: normalized.documentExists,
    configurationValid: normalized.configurationValid,
    configurationWarning: normalized.configurationWarning,
    updatedAt: serializeTimestamp(data.updatedAt),
    updatedByUid: data.updatedByUid ? String(data.updatedByUid) : null,
    previousState: data.previousState && KNOWN_STATES.has(data.previousState) ? data.previousState : null,
    reason: typeof data.reason === 'string' ? data.reason : '',
    activatedAt: serializeTimestamp(data.activatedAt),
    pausedAt: serializeTimestamp(data.pausedAt),
    closedAt: serializeTimestamp(data.closedAt),
    version: asInt(data.version, 0),
    postingWired: true,
    postingBehaviour: normalized.effectiveState,
    expertOnboardingMode: normalized.storedExpertOnboardingMode,
    effectiveExpertOnboardingMode: normalized.effectiveExpertOnboardingMode,
    expertOnboardingConfigurationValid: normalized.expertOnboardingConfigurationValid,
    expertOnboardingConfigurationWarning: normalized.expertOnboardingConfigurationWarning,
  };
}

function evaluateTransition(fromEffective, nextState) {
  const target = String(nextState || '').trim();
  if (!KNOWN_STATES.has(target)) {
    return {
      ok: false,
      code: 'INVALID_STATE',
      message: 'State must be CLOSED, OPEN, or PAUSED.',
    };
  }

  const from = KNOWN_STATES.has(fromEffective) ? fromEffective : OPERATIONAL_STATES.CLOSED;
  const rule = TRANSITION_TABLE[from] && TRANSITION_TABLE[from][target];
  if (!rule) {
    return {
      ok: false,
      code: 'INVALID_TRANSITION',
      message: `Cannot change ${from} to ${target}.`,
    };
  }
  if (rule === 'NOOP') {
    return { ok: true, noop: true, from, to: target };
  }
  return {
    ok: true,
    noop: false,
    requiresReadyToOpen: rule === 'READY_TO_OPEN',
    from,
    to: target,
  };
}

function buildSettingsWrite({ from, to, reason, actorUid, version }) {
  const payload = {
    state: to,
    previousState: from,
    reason: sanitizeReason(reason),
    updatedByUid: String(actorUid || ''),
    version: asInt(version, 0) + 1,
  };
  return payload;
}

function evaluateExpertOnboardingChange(fromEffective, nextMode) {
  const target = String(nextMode || '').trim();
  if (!KNOWN_EXPERT_ONBOARDING_MODES.has(target)) {
    return {
      ok: false,
      code: 'INVALID_EXPERT_ONBOARDING_MODE',
      message: 'Expert onboarding mode must be OPEN or WAITLIST.',
    };
  }
  const from = KNOWN_EXPERT_ONBOARDING_MODES.has(fromEffective)
    ? fromEffective
    : EXPERT_ONBOARDING_MODES.WAITLIST;
  if (from === target) {
    return { ok: true, noop: true, from, to: target };
  }
  return { ok: true, noop: false, from, to: target };
}

function buildExpertOnboardingWrite({ from, to, reason, actorUid, version }) {
  return {
    expertOnboardingMode: to,
    previousExpertOnboardingMode: from,
    expertOnboardingReason: sanitizeReason(reason),
    updatedByUid: String(actorUid || ''),
    version: asInt(version, 0) + 1,
  };
}

module.exports = {
  OPERATIONAL_STATES,
  KNOWN_STATES,
  EXPERT_ONBOARDING_MODES,
  KNOWN_EXPERT_ONBOARDING_MODES,
  EXPERT_ONBOARDING_EVENT_TYPE,
  REASON_MAX,
  TRANSITION_TABLE,
  sanitizeReason,
  serializeTimestamp,
  normalizeExpertOnboardingMode,
  normalizeStoredSettings,
  serializePilotSettings,
  evaluateTransition,
  buildSettingsWrite,
  evaluateExpertOnboardingChange,
  buildExpertOnboardingWrite,
};
