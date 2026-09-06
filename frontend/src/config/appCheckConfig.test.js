import { resolveAppCheckConfig } from './appCheckConfig';

test('keeps App Check disabled unless explicitly enabled', () => {
  expect(resolveAppCheckConfig({ NODE_ENV: 'production' })).toEqual({
    enabled: false, siteKey: '', debugToken: '', provider: 'recaptcha-v3',
  });
});

test('requires a site key when App Check is enabled', () => {
  expect(() => resolveAppCheckConfig({
    NODE_ENV: 'production', REACT_APP_APPCHECK_ENABLED: 'true',
  })).toThrow('SITE_KEY is missing');
});

test('allows debug only in explicit loopback development', () => {
  expect(resolveAppCheckConfig({
    NODE_ENV: 'development',
    REACT_APP_FIREBASE_EXPECTED_PROJECT_ID: 'demo-taskio-appcheck',
    REACT_APP_APPCHECK_ENABLED: 'true',
    REACT_APP_APPCHECK_SITE_KEY: 'safe-public-site-key',
    REACT_APP_APPCHECK_DEBUG_TOKEN: 'true',
  }, 'localhost').debugToken).toBe('true');
  expect(resolveAppCheckConfig({
    NODE_ENV: 'development',
    REACT_APP_FIREBASE_EXPECTED_PROJECT_ID: 'demo-taskio-appcheck',
    REACT_APP_APPCHECK_DEBUG_TOKEN: 'true',
  }, 'localhost')).toEqual({
    enabled: false, siteKey: '', debugToken: '', provider: 'recaptcha-v3',
  });
  expect(() => resolveAppCheckConfig({
    NODE_ENV: 'production',
    REACT_APP_APPCHECK_DEBUG_TOKEN: 'true',
  })).toThrow('forbidden');
});

test('defaults to reCAPTCHA v3 and accepts Enterprise by name only', () => {
  expect(resolveAppCheckConfig({
    REACT_APP_APPCHECK_ENABLED: 'true',
    REACT_APP_APPCHECK_SITE_KEY: 'public-site-key',
  }).provider).toBe('recaptcha-v3');
  expect(resolveAppCheckConfig({
    REACT_APP_APPCHECK_ENABLED: 'true',
    REACT_APP_APPCHECK_SITE_KEY: 'public-site-key',
    REACT_APP_APPCHECK_PROVIDER: 'recaptcha-enterprise',
  }).provider).toBe('recaptcha-enterprise');
  expect(() => resolveAppCheckConfig({
    REACT_APP_APPCHECK_PROVIDER: 'unknown',
  })).toThrow('Unknown App Check provider');
});

test.each(['taskio-v2-staging.web.app', 'taskio.com.au', '', 'localhost.example.com'])(
  'rejects development debug on non-loopback host %s', hostname => {
    expect(() => resolveAppCheckConfig({ NODE_ENV: 'development',
      REACT_APP_APPCHECK_ENABLED: 'true', REACT_APP_APPCHECK_SITE_KEY: 'synthetic-key',
      REACT_APP_APPCHECK_DEBUG_TOKEN: 'true' }, hostname)).toThrow('loopback');
  });

test.each(['taskio-v2', 'taskio-v2-staging', undefined])(
  'rejects debug against hosted or implicit Firebase project %s', project => {
    expect(() => resolveAppCheckConfig({ NODE_ENV: 'development',
      REACT_APP_FIREBASE_EXPECTED_PROJECT_ID: project,
      REACT_APP_APPCHECK_ENABLED: 'true', REACT_APP_APPCHECK_SITE_KEY: 'synthetic-key',
      REACT_APP_APPCHECK_DEBUG_TOKEN: 'true' }, 'localhost')).toThrow('developer Firebase project');
  });
