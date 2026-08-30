import { ANALYTICS_EVENTS, ANALYTICS_MVP_METRICS, sanitizeAnalyticsParams, trackEvent, trackEventOnce, resetAnalyticsOnceForTests } from './analytics';
import { amountBucketFromCents, coercePilotSuburb, resolveAnalyticsConfig } from './analyticsConfig';
import { initializeTaskioAnalytics, resetAnalyticsInitForTests } from './analyticsInit';
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
