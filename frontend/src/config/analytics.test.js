import { ANALYTICS_EVENTS, ANALYTICS_MVP_METRICS, sanitizeAnalyticsParams, trackEvent, trackEventOnce, resetAnalyticsOnceForTests } from './analytics';
import { amountBucketFromCents, coercePilotSuburb, resolveAnalyticsConfig, resolveAnalyticsEnvironment } from './analyticsConfig';
import { initializeTaskioAnalytics, resetAnalyticsInitForTests } from './analyticsInit';
import { readFileSync } from 'fs';
import { join } from 'path';
import { canonicalizeAnalyticsPathname, canonicalAnalyticsOrigin, sanitizeAnalyticsPageContext } from './analyticsPageContext';
import { jobLooksPaid } from './homeownerJobAnalytics';
import { trackQuoteSubmitted } from './expertJobAnalytics';

describe('analytics config', () => {
  it('keeps analytics disabled unless explicitly enabled with a measurement ID', () => {
    expect(resolveAnalyticsConfig({ NODE_ENV: 'production' })).toMatchObject({
      enabled: false,
      measurementId: '',
      reason: 'disabled',
    });
    expect(resolveAnalyticsConfig({
      REACT_APP_ANALYTICS_ENABLED: 'true',
    }).enabled).toBe(false);
    expect(resolveAnalyticsConfig({
      REACT_APP_ANALYTICS_ENABLED: 'true',
      REACT_APP_GA_MEASUREMENT_ID: 'not-a-ga-id',
    }).enabled).toBe(false);
  });

  it('enables only with a public GA4 measurement ID', () => {
    expect(resolveAnalyticsConfig({
      REACT_APP_ANALYTICS_ENABLED: 'true',
      REACT_APP_GA_MEASUREMENT_ID: 'G-TESTONLY123',
      REACT_APP_FIREBASE_EXPECTED_PROJECT_ID: 'taskio-v2-staging',
    })).toEqual({
      enabled: true,
      measurementId: 'G-TESTONLY123',
      environment: 'staging',
      reason: 'enabled',
    });
  });

  it('resolves environment without embedding a production project fingerprint', () => {
    expect(resolveAnalyticsEnvironment('taskio-v2-staging')).toBe('staging');
    expect(resolveAnalyticsEnvironment('taskio-v2')).toBe('production');
    expect(resolveAnalyticsEnvironment('')).toBe('local');
    const source = readFileSync(join(__dirname, 'analyticsConfig.js'), 'utf8');
    expect(source).not.toMatch(/(?:^|[^a-z0-9-])taskio-v2(?!-staging)(?:[^a-z0-9-]|$)/);
  });

  it('maps cents to coarse amount buckets and allows only launch suburbs', () => {
    expect(amountBucketFromCents(9900)).toBe('under_100');
    expect(amountBucketFromCents(12000)).toBe('100_249');
    expect(amountBucketFromCents(40000)).toBe('250_499');
    expect(amountBucketFromCents(50000)).toBe('500_plus');
    expect(coercePilotSuburb('Richmond')).toBe('Richmond');
    expect(coercePilotSuburb('Bondi')).toBe('');
  });
});

describe('analytics init', () => {
  afterEach(() => {
    resetAnalyticsInitForTests();
  });

  it('does not load a provider when disabled', () => {
    const appendScript = jest.fn();
    const result = initializeTaskioAnalytics({
      config: { enabled: false, measurementId: '', environment: 'local' },
      windowRef: {},
      appendScript,
    });
    expect(result).toEqual({ initialized: false, reason: 'disabled' });
    expect(appendScript).not.toHaveBeenCalled();
  });

  it('fails closed when enabled without a measurement ID', () => {
    const appendScript = jest.fn();
    const result = initializeTaskioAnalytics({
      config: { enabled: true, measurementId: '', environment: 'staging' },
      windowRef: {},
      appendScript,
    });
    expect(result).toEqual({ initialized: false, reason: 'missing_measurement_id' });
    expect(appendScript).not.toHaveBeenCalled();
  });

  it('initializes gtag once when enabled', () => {
    const appendScript = jest.fn();
    const windowRef = {};
    const first = initializeTaskioAnalytics({
      config: {
        enabled: true,
        measurementId: 'G-TESTONLY123',
        environment: 'staging',
      },
      windowRef,
      appendScript,
    });
    const second = initializeTaskioAnalytics({
      config: {
        enabled: true,
        measurementId: 'G-TESTONLY123',
        environment: 'staging',
      },
      windowRef,
      appendScript,
    });
    expect(first).toEqual({ initialized: true, reason: 'initialized' });
    expect(second.reason).toBe('already_initialized');
    expect(appendScript).toHaveBeenCalledTimes(1);
    expect(appendScript.mock.calls[0][0]).toContain('G-TESTONLY123');
    expect(typeof windowRef.gtag).toBe('function');
    const configArgs = [...windowRef.dataLayer].find((entry) => entry && entry[0] === 'config');
    expect(configArgs[2]).toMatchObject({
      anonymize_ip: true,
      send_page_view: false,
      allow_google_signals: false,
      allow_ad_personalization_signals: false,
    });
    expect(configArgs[2].page_location).toBeTruthy();
    expect(String(configArgs[2].page_location)).not.toMatch(/localhost|127\.0\.0\.1/);
    const setArgs = [...windowRef.dataLayer].find((entry) => entry && entry[0] === 'set');
    expect(setArgs[1]).toMatchObject({
      page_location: configArgs[2].page_location,
      page_referrer: configArgs[2].page_referrer,
    });
  });
});

describe('analytics page context', () => {
  afterEach(() => {
    resetAnalyticsOnceForTests();
    resetAnalyticsInitForTests();
  });

  it('uses an environment-specific canonical origin', () => {
    expect(canonicalAnalyticsOrigin('staging')).toBe('https://taskio-v2-staging.web.app');
    expect(canonicalAnalyticsOrigin('production')).toBe('https://taskio.com.au');
    expect(canonicalAnalyticsOrigin('local')).toBe('');
    const source = readFileSync(join(__dirname, 'analyticsPageContext.js'), 'utf8');
    expect(source).not.toContain('taskio-v2.web.app');
    expect(source).not.toContain('taskio-v2.firebaseapp.com');
  });

  it('keeps static public pathnames', () => {
    expect(canonicalizeAnalyticsPathname('/login')).toBe('/login');
    const page = sanitizeAnalyticsPageContext({
      href: 'https://taskio-v2-staging.web.app/login',
      environment: 'staging',
    });
    expect(page.page_location).toBe('https://taskio-v2-staging.web.app/login');
  });

  it('resolves production page_location to the public canonical origin', () => {
    const page = sanitizeAnalyticsPageContext({
      href: 'https://taskio.com.au/login',
      environment: 'production',
    });
    expect(page.page_location).toBe('https://taskio.com.au/login');
  });

  it('canonicalises dynamic job routes without the job ID', () => {
    const page = sanitizeAnalyticsPageContext({
      href: 'https://taskio-v2-staging.web.app/job/507iZTK6ZsEEqswzgoRN',
      environment: 'staging',
    });
    expect(page.page_location).toBe('https://taskio-v2-staging.web.app/job/:id');
    expect(page.page_location).not.toContain('507iZTK6ZsEEqswzgoRN');
  });

  it('strips query strings including emails and tokens', () => {
    const emailPage = sanitizeAnalyticsPageContext({
      href: 'https://taskio-v2-staging.web.app/login?email=someone@example.com',
      environment: 'staging',
    });
    expect(emailPage.page_location).toBe('https://taskio-v2-staging.web.app/login');
    expect(JSON.stringify(emailPage)).not.toMatch(/someone@example\.com/);

    const tokenPage = sanitizeAnalyticsPageContext({
      href: 'https://taskio-v2-staging.web.app/auth/action?token=secret',
      environment: 'staging',
    });
    expect(tokenPage.page_location).toBe('https://taskio-v2-staging.web.app/auth/action');
    expect(JSON.stringify(tokenPage)).not.toMatch(/secret/);
  });

  it('strips hashes from dynamic routes', () => {
    const page = sanitizeAnalyticsPageContext({
      href: 'https://taskio-v2-staging.web.app/job/abc#details',
      environment: 'staging',
    });
    expect(page.page_location).toBe('https://taskio-v2-staging.web.app/job/:id');
    expect(page.page_location).not.toMatch(/abc|#details/);
  });

  it('canonicalises same-origin referrers that contain job IDs', () => {
    const page = sanitizeAnalyticsPageContext({
      href: 'https://taskio-v2-staging.web.app/dashboard',
      referrer: 'https://taskio-v2-staging.web.app/job/507iZTK6ZsEEqswzgoRN?tab=chat',
      environment: 'staging',
    });
    expect(page.page_referrer).toBe('https://taskio-v2-staging.web.app/job/:id');
    expect(page.page_referrer).not.toContain('507iZTK6ZsEEqswzgoRN');
    expect(page.page_referrer).not.toContain('tab=');
  });

  it('keeps only the origin of external referrers', () => {
    const page = sanitizeAnalyticsPageContext({
      href: 'https://taskio-v2-staging.web.app/login',
      referrer: 'https://outlook.live.com/mail/inbox?id=secret-token',
      environment: 'staging',
    });
    expect(page.page_referrer).toBe('https://outlook.live.com');
    expect(page.page_referrer).not.toMatch(/inbox|secret-token|\?/);
  });

  it('does not send localhost origins into page_location', () => {
    const staging = sanitizeAnalyticsPageContext({
      href: 'http://localhost:3000/job/507iZTK6ZsEEqswzgoRN',
      environment: 'staging',
    });
    expect(staging.page_location).toBe('https://taskio-v2-staging.web.app/job/:id');
    expect(staging.page_location).not.toMatch(/localhost|3000/);

    const local = sanitizeAnalyticsPageContext({
      href: 'http://localhost:3000/login',
      environment: 'local',
    });
    expect(local.page_location).toBe('/login');
    expect(local.page_location).not.toMatch(/localhost|127\.0\.0\.1/);
  });

  it('rejects caller-supplied page_location and page_referrer', () => {
    expect(sanitizeAnalyticsParams({
      surface: 'landing',
      page_location: 'https://evil.example/job/507iZTK6ZsEEqswzgoRN?token=secret',
      page_referrer: 'https://evil.example/?email=a@b.c',
    })).toEqual({ surface: 'landing' });
  });

  it('replaces caller page context with internally generated values when enabled', () => {
    initializeTaskioAnalytics({
      config: { enabled: true, measurementId: 'G-TESTONLY123', environment: 'staging' },
      windowRef: {
        location: { href: 'https://taskio-v2-staging.web.app/job/507iZTK6ZsEEqswzgoRN' },
        document: { referrer: 'https://taskio-v2-staging.web.app/job/abc123' },
      },
      appendScript: () => {},
    });
    const previousHref = window.location.href;
    window.history.pushState({}, '', '/job/507iZTK6ZsEEqswzgoRN');
    Object.defineProperty(document, 'referrer', {
      configurable: true,
      value: 'https://taskio-v2-staging.web.app/job/abc123',
    });
    const gtag = jest.fn();
    trackEvent(ANALYTICS_EVENTS.LANDING_VIEWED, {
      surface: 'landing',
      page_location: 'https://evil.example/job/507iZTK6ZsEEqswzgoRN?token=secret',
      page_referrer: 'https://evil.example/?email=a@b.c',
    }, gtag);
    expect(gtag).toHaveBeenCalledWith('event', 'landing_viewed', expect.objectContaining({
      surface: 'landing',
      environment: 'staging',
      page_location: 'https://taskio-v2-staging.web.app/job/:id',
    }));
    const payload = gtag.mock.calls[0][2];
    expect(payload.page_location).not.toContain('507iZTK6ZsEEqswzgoRN');
    expect(JSON.stringify(payload)).not.toMatch(/evil\.example|token=secret|a@b\.c/);
    window.history.pushState({}, '', previousHref.replace(window.location.origin, '') || '/');
  });
});

describe('analytics events', () => {
  afterEach(() => {
    resetAnalyticsOnceForTests();
  });

  it('defines the MVP funnel events', () => {
    expect(ANALYTICS_EVENTS.JOB_CREATED).toBe('job_created');
    expect(ANALYTICS_EVENTS.PAYMENT_RELEASED).toBe('payment_released');
    expect(ANALYTICS_EVENTS.REVIEW_SUBMITTED).toBe('review_submitted');
    expect(ANALYTICS_EVENTS.LOGIN_STARTED).toBe('login_started');
    expect(ANALYTICS_EVENTS.ACCOUNT_ACTIVATION_COMPLETED).toBe('account_activation_completed');
    expect(ANALYTICS_EVENTS.JOB_MARKED_COMPLETE).toBe('job_marked_complete');
    expect(ANALYTICS_MVP_METRICS).toContain('invited_homeowner_activation');
    expect(ANALYTICS_MVP_METRICS).toContain('taskio_fee_revenue');
  });

  it('drops PII keys, nested objects, and unknown fields without logging values', () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    expect(sanitizeAnalyticsParams({
      phone: '+61400000000',
      email: 'a@b.c',
      description: 'Mount a TV in the lounge',
      uid: 'firebase-uid',
      stripe: 'pi_secret',
      nested: { email: 'a@b.c' },
      surface: 'landing',
      amount_bucket: 'under_100',
    })).toEqual({ surface: 'landing', amount_bucket: 'under_100' });
    expect(sanitizeAnalyticsParams(['free-text'])).toEqual({});
    expect(sanitizeAnalyticsParams({
      name: 'Ada',
      address: '1 Example St',
      token: 'secret',
      job_id: 'abc',
      dob: '1990-01-01',
      abn: '123',
      card: '4242',
      payment_method: 'pm_1',
      message: 'hello',
      surface: 'payment',
    })).toEqual({ surface: 'payment' });
    expect(JSON.stringify(warn.mock.calls)).not.toMatch(/Mount a TV|a@b\.c|firebase-uid|pi_secret|\+614|Ada|Example St|secret|1990/);
    warn.mockRestore();
  });

  it('does not dispatch through window.gtag when analytics is disabled', () => {
    window.gtag = jest.fn();
    trackEvent(ANALYTICS_EVENTS.LANDING_VIEWED, { surface: 'landing' });
    expect(window.gtag).not.toHaveBeenCalled();
    delete window.gtag;
  });

  it('no-ops when gtag is absent and forwards sanitized events when present', () => {
    expect(() => trackEvent(ANALYTICS_EVENTS.LANDING_VIEWED, { surface: 'hero' })).not.toThrow();
    const gtag = jest.fn(() => {
      throw new Error('provider failed');
    });
    expect(() => trackEvent(ANALYTICS_EVENTS.LOGIN_CTA_CLICKED, {
      surface: 'hero',
      email: 'secret@example.com',
    }, gtag)).not.toThrow();
    expect(gtag).toHaveBeenCalledWith('event', 'login_cta_clicked', { surface: 'hero' });
  });

  it('does not emit a duplicate once-event on rerender', () => {
    const gtag = jest.fn();
    trackEventOnce(ANALYTICS_EVENTS.LANDING_VIEWED, 'session', { surface: 'landing' }, gtag);
    trackEventOnce(ANALYTICS_EVENTS.LANDING_VIEWED, 'session', { surface: 'landing' }, gtag);
    expect(gtag).toHaveBeenCalledTimes(1);
  });
});

describe('marketplace helpers', () => {
  afterEach(() => {
    resetAnalyticsOnceForTests();
    resetAnalyticsInitForTests();
  });

  it('treats reconciled escrow/funded jobs as paid and ignores unpaid open jobs', () => {
    expect(jobLooksPaid({ status: 'open', paymentState: 'unpaid' })).toBe(false);
    expect(jobLooksPaid({ status: 'funded', paymentState: 'in_escrow' })).toBe(true);
  });

  it('sends quote amount buckets rather than exact dollars', () => {
    const gtag = jest.fn();
    window.gtag = gtag;
    initializeTaskioAnalytics({
      config: { enabled: true, measurementId: 'G-TESTONLY123', environment: 'staging' },
      windowRef: window,
      appendScript: () => {},
    });
    trackQuoteSubmitted(120);
    const eventCall = gtag.mock.calls.find((call) => call[0] === 'event');
    expect(eventCall).toEqual(['event', 'quote_submitted', expect.objectContaining({
      role: 'tradie',
      amount_bucket: '100_249',
    })]);
    expect(JSON.stringify(eventCall)).not.toMatch(/120/);
    delete window.gtag;
  });
});
