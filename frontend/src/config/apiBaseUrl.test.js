import { resolveApiBaseUrl } from './apiBaseUrl';

test('uses localhost only outside production builds', () => {
  expect(resolveApiBaseUrl({ NODE_ENV: 'development' })).toBe('http://localhost:8000');
  expect(() => resolveApiBaseUrl({ NODE_ENV: 'production' })).toThrow(/required/i);
});

test.each([
  'http://api.taskio.com.au',
  'https://localhost:8000',
  'https://127.0.0.1:8000',
  'not-a-url',
])('rejects unsafe production API URL %s', (url) => {
  expect(() => resolveApiBaseUrl({
    NODE_ENV: 'production',
    REACT_APP_API_BASE_URL: url,
  })).toThrow();
});

test('accepts and normalizes an HTTPS production endpoint', () => {
  expect(resolveApiBaseUrl({
    NODE_ENV: 'production',
    REACT_APP_API_BASE_URL: 'https://api.taskio.com.au/',
  })).toBe('https://api.taskio.com.au');
});

test('allows loopback only for the explicit isolated production E2E harness', () => {
  expect(resolveApiBaseUrl({
    NODE_ENV: 'production',
    REACT_APP_API_BASE_URL: 'http://127.0.0.1:3800',
    REACT_APP_E2E_HARNESS_BUILD: 'true',
    REACT_APP_E2E_AUTH_BYPASS: 'true',
    REACT_APP_FIREBASE_PROJECT_ID: 'demo-taskio-e2e',
  })).toBe('http://127.0.0.1:3800');
  expect(() => resolveApiBaseUrl({
    NODE_ENV: 'production',
    REACT_APP_API_BASE_URL: 'http://127.0.0.1:3800',
    REACT_APP_E2E_HARNESS_BUILD: 'true',
    REACT_APP_E2E_AUTH_BYPASS: 'true',
    REACT_APP_FIREBASE_PROJECT_ID: 'taskio-v2',
  })).toThrow(/HTTPS/i);
});
