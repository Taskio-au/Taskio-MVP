export function resolveAppCheckConfig(env = {}) {
  const enabled = env.REACT_APP_APPCHECK_ENABLED === 'true';
  const production = env.NODE_ENV === 'production';
  const siteKey = String(env.REACT_APP_APPCHECK_SITE_KEY || '').trim();
  const debugToken = String(env.REACT_APP_APPCHECK_DEBUG_TOKEN || '').trim();

  if (production && debugToken) {
    throw new Error('REACT_APP_APPCHECK_DEBUG_TOKEN is forbidden in production builds.');
  }
  if (!enabled) return { enabled: false, siteKey: '', debugToken: '' };
  if (!siteKey) throw new Error('App Check is enabled but REACT_APP_APPCHECK_SITE_KEY is missing.');

  return { enabled: true, siteKey, debugToken: production ? '' : debugToken };
}
