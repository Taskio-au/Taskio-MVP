'use strict';

/**
 * Public-safe posting decision from persisted operational state.
 * Launch readiness is not re-checked here. Missing/invalid settings fail closed.
 */

const { isPublicSignupEnabled } = require('../config/publicSignup');
const { OPERATIONAL_STATES, EXPERT_ONBOARDING_MODES } = require('./pilotSettingsDerive');
const { serializeEffectiveExpertOnboarding } = require('./expertOnboardingAccess');
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

function serializePublicPilotStatus(settings, options = {}) {
  const raw = settings && settings.effectiveState;
  const homeownerPosting = raw === OPERATIONAL_STATES.OPEN || raw === OPERATIONAL_STATES.PAUSED
    ? raw
    : OPERATIONAL_STATES.CLOSED;
  const expert = serializeEffectiveExpertOnboarding({
    persistedMode: settings && settings.effectiveExpertOnboardingMode,
    safetyEnabled: options.expertSignupSafetyEnabled === true,
  });
  // Waitlist writes are a separate Admin SDK route and do not read pilotSettings.
  // Status failures therefore still advertise waitlist while posting stays CLOSED.
  return {
    homeownerPosting,
    canPost: homeownerPosting === OPERATIONAL_STATES.OPEN,
    waitlistAvailable: homeownerPosting !== OPERATIONAL_STATES.OPEN,
    expertOnboarding: expert.expertOnboarding,
    canExpertApply: expert.canExpertApply,
    expertWaitlistAvailable: expert.expertWaitlistAvailable,
  };
}

function failClosedPublicPilotStatus() {
  return serializePublicPilotStatus(
    {
      effectiveState: OPERATIONAL_STATES.CLOSED,
      effectiveExpertOnboardingMode: EXPERT_ONBOARDING_MODES.WAITLIST,
    },
    { expertSignupSafetyEnabled: false }
  );
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

async function readPublicPilotStatus(db, env = process.env) {
  try {
    const settings = await readPilotSettings(db);
    return serializePublicPilotStatus(settings, {
      expertSignupSafetyEnabled: isPublicSignupEnabled(env),
    });
  } catch (_) {
    return failClosedPublicPilotStatus();
  }
}

module.exports = {
  publicPostingClosedError,
  serializePublicPilotStatus,
  failClosedPublicPilotStatus,
  assertPilotPostingOpen,
  readPublicPilotStatus,
};
