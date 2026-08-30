const ALLOWED_PROVIDERS = new Set(['recaptcha-v3', 'recaptcha-enterprise']);

function resolveProvider(raw) {
  const value = String(raw || 'recaptcha-v3').trim().toLowerCase();
  if (!value) return 'recaptcha-v3';
  if (!ALLOWED_PROVIDERS.has(value)) {
    throw new Error('Unknown App Check provider.');
  }
  return value;
}

export function resolveAppCheckConfig(env = {}) {
  const enabled = env.REACT_APP_APPCHECK_ENABLED === 'true';
  const production = env.NODE_ENV === 'production';
  const siteKey = String(env.REACT_APP_APPCHECK_SITE_KEY || '').trim();
  const debugToken = String(env.REACT_APP_APPCHECK_DEBUG_TOKEN || '').trim();
  const provider = resolveProvider(env.REACT_APP_APPCHECK_PROVIDER);

  if (production && debugToken) {
    throw new Error('REACT_APP_APPCHECK_DEBUG_TOKEN is forbidden in production builds.');
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
