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
});
