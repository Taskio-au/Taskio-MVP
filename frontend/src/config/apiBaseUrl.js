const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '0.0.0.0', '[::1]']);

function developmentDefaultApiBaseUrl() {
  // process.env.NODE_ENV is compile-time inlined so staging/production minification
  // can drop the localhost API fallback instead of shipping it in executable assets.
  if (process.env.NODE_ENV === 'production') {
    throw new Error('REACT_APP_API_BASE_URL is required for a production build.');
  }
  return 'http://localhost:8000';
}

export function resolveApiBaseUrl(env = {}) {
  const configured = String(env.REACT_APP_API_BASE_URL || '').trim();
  const isProductionBuild = env.NODE_ENV === 'production';

  if (!configured) {
    if (isProductionBuild) {
      throw new Error('REACT_APP_API_BASE_URL is required for a production build.');
    }
    return developmentDefaultApiBaseUrl();
  }

  let parsed;
  try {
    parsed = new URL(configured);
  } catch (_error) {
    throw new Error('REACT_APP_API_BASE_URL must be an absolute URL.');
  }

  if (isProductionBuild) {
    const safeHarnessBuild = env.REACT_APP_E2E_HARNESS_BUILD === 'true'
      && env.REACT_APP_E2E_AUTH_BYPASS === 'true'
      && env.REACT_APP_FIREBASE_PROJECT_ID === 'demo-taskio-e2e'
      && parsed.protocol === 'http:'
      && LOCAL_HOSTS.has(parsed.hostname.toLowerCase());
    if (parsed.protocol !== 'https:' && !safeHarnessBuild) {
      throw new Error('Production API URL must use HTTPS.');
    }
    if (LOCAL_HOSTS.has(parsed.hostname.toLowerCase()) && !safeHarnessBuild) {
      throw new Error('Production API URL must not use a local or loopback host.');
    }
  }

  return configured.replace(/\/+$/, '');
}
