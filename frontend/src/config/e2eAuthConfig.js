export function resolveE2EAuthEnabled(env = process.env) {
  const enabled = env.REACT_APP_E2E_AUTH_BYPASS === 'true';
  if (env.NODE_ENV === 'production' && enabled) {
    throw new Error('REACT_APP_E2E_AUTH_BYPASS must not be enabled in a production build.');
  }
  return enabled;
}
