import { initializeTaskioAppCheck, resetAppCheckInitForTests } from './appCheckInit';

describe('initializeTaskioAppCheck', () => {
  afterEach(() => {
    resetAppCheckInitForTests();
  });

  it('does not initialize a provider when App Check is disabled', () => {
    const initializeAppCheckFn = jest.fn();
    const windowRef = {};
    const result = initializeTaskioAppCheck({
      app: { name: 'taskio' },
      config: { enabled: false, siteKey: '', debugToken: '', provider: 'recaptcha-v3' },
      windowRef,
      initializeAppCheckFn,
      recaptchaV3Provider: jest.fn(),
    });
    expect(result).toEqual({ initialized: false, reason: 'disabled' });
    expect(initializeAppCheckFn).not.toHaveBeenCalled();
    expect(windowRef.FIREBASE_APPCHECK_DEBUG_TOKEN).toBeUndefined();
  });

  it('initializes once with auto-refresh when enabled with a public site key', () => {
    const initializeAppCheckFn = jest.fn();
    function RecaptchaV3Provider(siteKey) {
      this.siteKey = siteKey;
    }
    const app = { name: 'taskio' };
    const config = {
      enabled: true,
      siteKey: 'public-site-key',
      debugToken: '',
      provider: 'recaptcha-v3',
    };
    const first = initializeTaskioAppCheck({
      app,
      config,
      initializeAppCheckFn,
      recaptchaV3Provider: RecaptchaV3Provider,
    });
    const second = initializeTaskioAppCheck({
      app,
      config,
      initializeAppCheckFn,
      recaptchaV3Provider: RecaptchaV3Provider,
    });
    expect(first).toEqual({
      initialized: true,
      reason: 'initialized',
      provider: 'recaptcha-v3',
    });
    expect(second.reason).toBe('already_initialized');
    expect(initializeAppCheckFn).toHaveBeenCalledTimes(1);
    expect(initializeAppCheckFn.mock.calls[0][0]).toBe(app);
    expect(initializeAppCheckFn.mock.calls[0][1].isTokenAutoRefreshEnabled).toBe(true);
  });

  it('uses the Enterprise provider constructor when configured', () => {
    const initializeAppCheckFn = jest.fn();
    function RecaptchaEnterpriseProvider(siteKey) {
      this.siteKey = siteKey;
    }
    initializeTaskioAppCheck({
      app: { name: 'taskio' },
      config: {
        enabled: true,
        siteKey: 'enterprise-public-key',
        debugToken: '',
        provider: 'recaptcha-enterprise',
      },
      initializeAppCheckFn,
      recaptchaEnterpriseProvider: RecaptchaEnterpriseProvider,
    });
    const provider = initializeAppCheckFn.mock.calls[0][1].provider;
    expect(provider).toBeInstanceOf(RecaptchaEnterpriseProvider);
    expect(JSON.stringify(initializeAppCheckFn.mock.calls)).not.toMatch(/debug-secret/);
  });

  it('sets a debug token on window only and never passes it to initializeAppCheck', () => {
    const initializeAppCheckFn = jest.fn();
    function RecaptchaV3Provider(siteKey) {
      this.siteKey = siteKey;
    }
    const windowRef = {};
    initializeTaskioAppCheck({
      app: { name: 'taskio' },
      config: {
        enabled: true,
        siteKey: 'public-site-key',
        debugToken: 'local-debug-token',
        provider: 'recaptcha-v3',
      },
      windowRef,
      initializeAppCheckFn,
      recaptchaV3Provider: RecaptchaV3Provider,
    });
    expect(windowRef.FIREBASE_APPCHECK_DEBUG_TOKEN).toBe('local-debug-token');
    expect(JSON.stringify(initializeAppCheckFn.mock.calls)).not.toMatch(/local-debug-token/);
    expect(initializeAppCheckFn.mock.calls[0][1].isTokenAutoRefreshEnabled).toBe(true);
  });

  it('fails closed when the provider constructor is missing', () => {
    expect(() => initializeTaskioAppCheck({
      app: { name: 'taskio' },
      config: {
        enabled: true,
        siteKey: 'public-site-key',
        debugToken: '',
        provider: 'recaptcha-v3',
      },
      initializeAppCheckFn: jest.fn(),
    })).toThrow('provider constructor is missing');
  });
});
