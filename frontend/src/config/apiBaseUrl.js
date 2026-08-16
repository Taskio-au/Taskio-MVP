const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '0.0.0.0', '[::1]']);

export function resolveApiBaseUrl(env = process.env) {
  const configured = String(env.REACT_APP_API_BASE_URL || '').trim();
  const isProductionBuild = env.NODE_ENV === 'production';

  if (!configured) {
    if (isProductionBuild) {
      throw new Error('REACT_APP_API_BASE_URL is required for a production build.');
    }
    return 'http://localhost:8000';
  }

  let parsed;
  try {
    parsed = new URL(configured);
  } catch (_error) {
    throw new Error('REACT_APP_API_BASE_URL must be an absolute URL.');
  }

  if (isProductionBuild) {
    if (parsed.protocol !== 'https:') {
      throw new Error('Production API URL must use HTTPS.');
    }
    if (LOCAL_HOSTS.has(parsed.hostname.toLowerCase())) {
      throw new Error('Production API URL must not use a local or loopback host.');
    }
  }

  return configured.replace(/\/+$/, '');
}
