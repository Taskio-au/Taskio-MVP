export function resolveE2EAuthEnabled(env = {}) {
  const enabled = env.REACT_APP_E2E_AUTH_BYPASS === 'true';
  if (env.NODE_ENV === 'production' && enabled) {
    const safeHarnessBuild = env.REACT_APP_E2E_HARNESS_BUILD === 'true'
      && env.REACT_APP_FIREBASE_PROJECT_ID === 'demo-taskio-e2e'
      && /^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/i.test(env.REACT_APP_API_BASE_URL || '');
    if (!safeHarnessBuild) {
      throw new Error('REACT_APP_E2E_AUTH_BYPASS must not be enabled in a production build outside the isolated demo harness.');
    }
  }
  return enabled;
}
