import { ANALYTICS_EVENTS, ANALYTICS_MVP_METRICS, sanitizeAnalyticsParams, trackEvent } from './analytics';

describe('analytics', () => {
  it('defines the MVP funnel events', () => {
    expect(ANALYTICS_EVENTS.JOB_CREATED).toBe('job_created');
    expect(ANALYTICS_EVENTS.PAYMENT_RELEASED).toBe('payment_released');
    expect(ANALYTICS_EVENTS.REVIEW_SUBMITTED).toBe('review_submitted');
    expect(ANALYTICS_MVP_METRICS).toContain('invited_homeowner_activation');
    expect(ANALYTICS_MVP_METRICS).toContain('taskio_fee_revenue');
  });

  it('drops phone, email, and job-description fields', () => {
    expect(sanitizeAnalyticsParams({
      phone: '+61400000000',
      email: 'a@b.c',
      description: 'Mount a TV in the lounge',
      surface: 'landing',
      amount_cents: 2000,
    })).toEqual({ surface: 'landing', amount_cents: 2000 });
  });

  it('no-ops when gtag is absent and forwards sanitized events when present', () => {
    expect(() => trackEvent(ANALYTICS_EVENTS.LANDING_VIEWED, { surface: 'hero' })).not.toThrow();
    const gtag = jest.fn();
    trackEvent(ANALYTICS_EVENTS.LOGIN_CTA_CLICKED, {
      surface: 'hero',
      email: 'secret@example.com',
    }, gtag);
    expect(gtag).toHaveBeenCalledWith('event', 'login_cta_clicked', { surface: 'hero' });
  });
});
