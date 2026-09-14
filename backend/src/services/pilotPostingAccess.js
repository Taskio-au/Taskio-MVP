'use strict';

/**
 * Public-safe posting decision from persisted operational state.
 * Launch readiness is not re-checked here. Missing/invalid settings fail closed.
 */

const { OPERATIONAL_STATES } = require('./pilotSettingsDerive');
const { readPilotSettings } = require('./pilotSettingsService');

function publicPostingClosedError(state) {
  const paused = state === OPERATIONAL_STATES.PAUSED;
  return {
    code: 'PILOT_POSTING_CLOSED',
    state: paused ? OPERATIONAL_STATES.PAUSED : OPERATIONAL_STATES.CLOSED,
    message: paused
      ? 'Taskio is temporarily pausing new job posts while we manage current demand.'
      : 'Taskio is not accepting new jobs right now.',
  };
}

function serializePublicPilotStatus(settings) {
  const raw = settings && settings.effectiveState;
  const homeownerPosting = raw === OPERATIONAL_STATES.OPEN || raw === OPERATIONAL_STATES.PAUSED
    ? raw
    : OPERATIONAL_STATES.CLOSED;
  // Waitlist writes are a separate Admin SDK route and do not read pilotSettings.
  // Status failures therefore still advertise waitlist while posting stays CLOSED.
  return {
    homeownerPosting,
    canPost: homeownerPosting === OPERATIONAL_STATES.OPEN,
    waitlistAvailable: homeownerPosting !== OPERATIONAL_STATES.OPEN,
  };
}

async function assertPilotPostingOpen(db) {
  try {
    const settings = await readPilotSettings(db);
    if (settings.effectiveState === OPERATIONAL_STATES.OPEN) {
      return { ok: true, settings };
    }
    return {
      ok: false,
      error: publicPostingClosedError(settings.effectiveState),
    };
  } catch (_) {
    return {
      ok: false,
      error: publicPostingClosedError(OPERATIONAL_STATES.CLOSED),
    };
  }
}

async function readPublicPilotStatus(db) {
  try {
    const settings = await readPilotSettings(db);
    return serializePublicPilotStatus(settings);
  } catch (_) {
    return serializePublicPilotStatus({ effectiveState: OPERATIONAL_STATES.CLOSED });
  }
}

module.exports = {
  publicPostingClosedError,
  serializePublicPilotStatus,
  assertPilotPostingOpen,
  readPublicPilotStatus,
};
