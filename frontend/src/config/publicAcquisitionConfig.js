export function publicAcquisitionEnvFromProcess() {
  return {
    REACT_APP_PUBLIC_ACQUISITION_ENABLED: process.env.REACT_APP_PUBLIC_ACQUISITION_ENABLED,
  };
}

/**
 * @deprecated Do not use as Expert or homeowner eligibility authority.
 * Public Expert applications follow GET /api/pilot-status (`canExpertApply`).
 * Homeowner posting follows `canPost`. This env flag must not override either.
 *
 * Kept only for backwards-compatible reads. It is off by default and is not a
 * business control.
 */
export function isExpertPublicSignupEnabled(env = publicAcquisitionEnvFromProcess()) {
  return String(env.REACT_APP_PUBLIC_ACQUISITION_ENABLED || '').trim() === 'true';
}

/** @deprecated Same env flag. Must not gate homeowner or Expert eligibility. */
export function isPublicAcquisitionEnabled(env = publicAcquisitionEnvFromProcess()) {
  return isExpertPublicSignupEnabled(env);
}
