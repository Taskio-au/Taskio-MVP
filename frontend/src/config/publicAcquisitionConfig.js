export function publicAcquisitionEnvFromProcess() {
  return {
    REACT_APP_PUBLIC_ACQUISITION_ENABLED: process.env.REACT_APP_PUBLIC_ACQUISITION_ENABLED,
  };
}

/**
 * Public acquisition (open homeowner OTP enrollment + expert self-signup).
 *
 * Off by default. The private Melbourne MVP is invite-only.
 * Set REACT_APP_PUBLIC_ACQUISITION_ENABLED=true only when Saeed opens public
 * acquisition. Do not infer this from Hosting or Firebase client config.
 */
export function isPublicAcquisitionEnabled(env = publicAcquisitionEnvFromProcess()) {
  return String(env.REACT_APP_PUBLIC_ACQUISITION_ENABLED || '').trim() === 'true';
}
