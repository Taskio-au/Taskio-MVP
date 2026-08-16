import { resolveE2EAuthEnabled } from './e2eAuthConfig';

test('allows the E2E auth bypass only outside production', () => {
  expect(resolveE2EAuthEnabled({
    NODE_ENV: 'test',
    REACT_APP_E2E_AUTH_BYPASS: 'true',
  })).toBe(true);
  expect(resolveE2EAuthEnabled({
    NODE_ENV: 'production',
    REACT_APP_E2E_AUTH_BYPASS: 'false',
  })).toBe(false);
  expect(() => resolveE2EAuthEnabled({
    NODE_ENV: 'production',
    REACT_APP_E2E_AUTH_BYPASS: 'true',
  })).toThrow(/must not be enabled/i);
  expect(resolveE2EAuthEnabled({
    NODE_ENV: 'production',
    REACT_APP_E2E_AUTH_BYPASS: 'true',
    REACT_APP_E2E_HARNESS_BUILD: 'true',
    REACT_APP_FIREBASE_PROJECT_ID: 'demo-taskio-e2e',
    REACT_APP_API_BASE_URL: 'http://127.0.0.1:3800',
  })).toBe(true);
  expect(() => resolveE2EAuthEnabled({
    NODE_ENV: 'production',
    REACT_APP_E2E_AUTH_BYPASS: 'true',
    REACT_APP_E2E_HARNESS_BUILD: 'true',
    REACT_APP_FIREBASE_PROJECT_ID: 'taskio-v2',
    REACT_APP_API_BASE_URL: 'http://127.0.0.1:3800',
  })).toThrow(/must not be enabled/i);
});
