const ALLOWED_PROVIDERS = new Set(['recaptcha-v3', 'recaptcha-enterprise']);

function resolveProvider(raw) {
  const value = String(raw || 'recaptcha-v3').trim().toLowerCase();
  if (!value) return 'recaptcha-v3';
  if (!ALLOWED_PROVIDERS.has(value)) {
    throw new Error('Unknown App Check provider.');
  }
  return value;
}

export function resolveAppCheckConfig(env = {}, hostname = '') {
  const enabled = env.REACT_APP_APPCHECK_ENABLED === 'true';
  const production = env.NODE_ENV === 'production';
  const siteKey = String(env.REACT_APP_APPCHECK_SITE_KEY || '').trim();
  const debugToken = String(env.REACT_APP_APPCHECK_DEBUG_TOKEN || '').trim();
  const provider = resolveProvider(env.REACT_APP_APPCHECK_PROVIDER);

  if (production && debugToken) {
    throw new Error('REACT_APP_APPCHECK_DEBUG_TOKEN is forbidden in production builds.');
  }
  if (debugToken && (env.NODE_ENV !== 'development'
    || !['localhost', '127.0.0.1', '[::1]', '::1'].includes(hostname))) {
    throw new Error('App Check debug configuration requires local development on loopback.');
  }
  // Compile developer project restrictions out of hosted bundles; the production
  // debug rejection above remains active. Do not embed production identifiers in staging.
  if (process.env.NODE_ENV !== 'production' && debugToken && (!env.REACT_APP_FIREBASE_EXPECTED_PROJECT_ID
    || ['taskio-v2', 'taskio-v2-staging'].includes(env.REACT_APP_FIREBASE_EXPECTED_PROJECT_ID))) {
    throw new Error('App Check debug requires an explicit isolated developer Firebase project.');
  }
  if (!enabled) {
    return { enabled: false, siteKey: '', debugToken: '', provider };
  }
  if (!siteKey) {
    throw new Error('App Check is enabled but REACT_APP_APPCHECK_SITE_KEY is missing.');
  }

  return {
    enabled: true,
    siteKey,
    debugToken: production ? '' : debugToken,
    provider,
  };
}
