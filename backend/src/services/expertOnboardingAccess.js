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

function isLocalDevelopmentRuntime(env = process.env) {
  if ((env.NODE_ENV || 'development') !== 'development') return false;
  if (String(env.TASKIO_DEPLOYMENT_ENV || '').trim()) return false;
  return !(
    env.K_SERVICE
    || env.FUNCTION_TARGET
    || env.GAE_ENV
    || env.GOOGLE_CLOUD_PROJECT
    || env.GCLOUD_PROJECT
  );
}

/**
 * Early-pilot convenience for a local backend with no pilotSettings Expert mode.
 * Explicit stored values always win. Invalid values and every non-local runtime
 * remain fail-closed. This only resolves the business mode; the independent
 * enrollment safety switch must still be enabled before signup is allowed.
 */
function resolveRuntimeExpertOnboardingMode(settings, env = process.env) {
  const stored = settings && settings.expertOnboardingMode != null
    ? String(settings.expertOnboardingMode).trim()
    : '';
  if (stored === EXPERT_ONBOARDING_MODES.OPEN || stored === EXPERT_ONBOARDING_MODES.WAITLIST) {
    return stored;
  }
  if (!stored && isLocalDevelopmentRuntime(env)) {
    return EXPERT_ONBOARDING_MODES.OPEN;
  }
  return EXPERT_ONBOARDING_MODES.WAITLIST;
}

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
      persistedMode: resolveRuntimeExpertOnboardingMode(settings, env),
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
  isLocalDevelopmentRuntime,
  resolveRuntimeExpertOnboardingMode,
  serializeEffectiveExpertOnboarding,
  readExpertOnboardingAccess,
  assertNewExpertSignupAllowed,
  adminExpertEnrollmentSafetyFields,
};
