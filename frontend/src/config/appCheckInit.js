let initialized = false;

export function resetAppCheckInitForTests() {
  initialized = false;
}

export function initializeTaskioAppCheck({
  app,
  config,
  windowRef,
  initializeAppCheckFn,
  recaptchaV3Provider,
  recaptchaEnterpriseProvider,
} = {}) {
  if (!config || !config.enabled) {
    return { initialized: false, reason: 'disabled' };
  }
  if (initialized) {
    return { initialized: true, reason: 'already_initialized' };
  }
  if (!app || typeof initializeAppCheckFn !== 'function') {
    throw new Error('App Check initialization is missing a Firebase app.');
  }

  if (config.debugToken && windowRef) {
    windowRef.FIREBASE_APPCHECK_DEBUG_TOKEN =
      config.debugToken === 'true' ? true : config.debugToken;
  }

  const Provider =
    config.provider === 'recaptcha-enterprise'
      ? recaptchaEnterpriseProvider
      : recaptchaV3Provider;
  if (typeof Provider !== 'function') {
    throw new Error('App Check provider constructor is missing.');
  }

  initializeAppCheckFn(app, {
    provider: new Provider(config.siteKey),
    isTokenAutoRefreshEnabled: true,
  });
  initialized = true;
  return {
    initialized: true,
    reason: 'initialized',
    provider: config.provider || 'recaptcha-v3',
  };
}
