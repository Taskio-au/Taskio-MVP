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

test('allows a debug token only outside production', () => {
  expect(resolveAppCheckConfig({
    NODE_ENV: 'development',
    REACT_APP_APPCHECK_ENABLED: 'true',
    REACT_APP_APPCHECK_SITE_KEY: 'safe-public-site-key',
    REACT_APP_APPCHECK_DEBUG_TOKEN: 'true',
  }).debugToken).toBe('true');
  expect(resolveAppCheckConfig({
    NODE_ENV: 'development',
    REACT_APP_APPCHECK_DEBUG_TOKEN: 'true',
  })).toEqual({
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
