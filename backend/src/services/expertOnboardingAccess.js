'use strict';

/**
 * Server-authoritative Expert onboarding decision.
 * Public apply requires persisted OPEN plus the enrollment safety switch.
 * Missing/invalid settings fail to WAITLIST. Existing Experts are unaffected.
 */

const { isPublicSignupEnabled } = require('../config/publicSignup');
const { EXPERT_ONBOARDING_MODES } = require('./pilotSettingsDerive');
const { readPilotSettings } = require('./pilotSettingsService');

const EXPERT_WAITLIST_ERROR = Object.freeze({
  code: 'EXPERT_ONBOARDING_WAITLIST',
  message: 'Taskio is not accepting new Expert applications right now.',
});

const ENROLLMENT_SAFETY_WARNING =
  'New Expert applications are also blocked by the server enrollment safety switch.';

function serializeEffectiveExpertOnboarding({ persistedMode, safetyEnabled }) {
  const persistedOpen = persistedMode === EXPERT_ONBOARDING_MODES.OPEN;
  const canExpertApply = persistedOpen && safetyEnabled === true;
  return {
    persistedMode: persistedOpen ? EXPERT_ONBOARDING_MODES.OPEN : EXPERT_ONBOARDING_MODES.WAITLIST,
    expertOnboarding: canExpertApply ? EXPERT_ONBOARDING_MODES.OPEN : EXPERT_ONBOARDING_MODES.WAITLIST,
    canExpertApply,
    expertWaitlistAvailable: !canExpertApply,
  };
}

function waitlistDenied() {
  return {
    ok: false,
    status: 403,
    error: { ...EXPERT_WAITLIST_ERROR },
  };
}

async function readExpertOnboardingAccess(db, env = process.env) {
  try {
    const settings = await readPilotSettings(db);
    return serializeEffectiveExpertOnboarding({
      persistedMode: settings.effectiveExpertOnboardingMode,
      safetyEnabled: isPublicSignupEnabled(env),
    });
  } catch (_) {
    return serializeEffectiveExpertOnboarding({
      persistedMode: EXPERT_ONBOARDING_MODES.WAITLIST,
      safetyEnabled: false,
    });
  }
}

async function assertNewExpertSignupAllowed(db, env = process.env) {
  const access = await readExpertOnboardingAccess(db, env);
  if (access.canExpertApply) {
    return { ok: true, access };
  }
  return waitlistDenied();
}

function adminExpertEnrollmentSafetyFields(settings, env = process.env) {
  const safetyEnabled = isPublicSignupEnabled(env);
  const persistedOpen = settings && settings.effectiveExpertOnboardingMode === EXPERT_ONBOARDING_MODES.OPEN;
  return {
    expertEnrollmentSafetyEnabled: safetyEnabled,
    expertEnrollmentSafetyWarning: persistedOpen && !safetyEnabled ? ENROLLMENT_SAFETY_WARNING : null,
  };
}

module.exports = {
  EXPERT_WAITLIST_ERROR,
  ENROLLMENT_SAFETY_WARNING,
  serializeEffectiveExpertOnboarding,
  readExpertOnboardingAccess,
  assertNewExpertSignupAllowed,
  adminExpertEnrollmentSafetyFields,
};
