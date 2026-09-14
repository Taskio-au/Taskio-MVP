export function publicAcquisitionEnvFromProcess() {
  return {
    REACT_APP_PUBLIC_ACQUISITION_ENABLED: process.env.REACT_APP_PUBLIC_ACQUISITION_ENABLED,
  };
}

/**
 * Expert self-signup only.
 *
 * Homeowner posting and homeowner OTP enrollment follow public pilot status
 * (OPEN / CLOSED / PAUSED). This env flag must not block public homeowner
 * demand when operational state is OPEN.
 *
 * Off by default. Set REACT_APP_PUBLIC_ACQUISITION_ENABLED=true only when
 * Saeed opens Expert self-signup. Do not infer this from Hosting or Firebase
 * client config.
 */
export function isExpertPublicSignupEnabled(env = publicAcquisitionEnvFromProcess()) {
  return String(env.REACT_APP_PUBLIC_ACQUISITION_ENABLED || '').trim() === 'true';
}

/** @deprecated Use isExpertPublicSignupEnabled. Same env flag; Expert-only. */
export function isPublicAcquisitionEnabled(env = publicAcquisitionEnvFromProcess()) {
  return isExpertPublicSignupEnabled(env);
}
