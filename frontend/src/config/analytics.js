/** Funnel events for later GA4 (or similar). Do not send PII. */
const ANALYTICS_EVENTS = Object.freeze({
  LANDING_VIEWED: 'landing_viewed',
  LOGIN_CTA_CLICKED: 'login_cta_clicked',
  LOGIN_SUCCEEDED: 'login_succeeded',
  INVITED_USER_ACTIVATED: 'invited_user_activated',
  JOB_POST_STARTED: 'job_post_started',
  JOB_POST_COMPLETED: 'job_post_completed',
  JOB_CREATED: 'job_created',
  EXPERT_INVITED: 'expert_invited',
  QUOTE_SUBMITTED: 'quote_submitted',
  QUOTE_RECEIVED: 'quote_received',
  QUOTE_ACCEPTED: 'quote_accepted',
  CHECKOUT_STARTED: 'checkout_started',
  PAYMENT_SUCCEEDED: 'payment_succeeded',
  JOB_IN_PROGRESS: 'job_in_progress',
  JOB_COMPLETED: 'job_completed',
  PAYMENT_RELEASED: 'payment_released',
  REVIEW_SUBMITTED: 'review_submitted',
});

const ALLOWED_PARAM_KEYS = new Set([
  'surface',
  'role',
  'status',
  'source',
  'count',
  'amount_cents',
  'fee_cents',
]);

const FORBIDDEN_PARAM_PATTERN = /phone|email|otp|token|password|description|message|address|name/i;

export function sanitizeAnalyticsParams(params) {
  if (!params || typeof params !== 'object') return {};
  const clean = {};
  for (const [key, value] of Object.entries(params)) {
    if (FORBIDDEN_PARAM_PATTERN.test(key)) continue;
    if (!ALLOWED_PARAM_KEYS.has(key)) continue;
    if (value == null) continue;
    if (typeof value === 'number' && Number.isFinite(value)) {
      clean[key] = value;
      continue;
    }
    if (typeof value === 'boolean') {
      clean[key] = value;
      continue;
    }
    if (typeof value === 'string') {
      const trimmed = value.trim().slice(0, 40);
      if (trimmed) clean[key] = trimmed;
    }
  }
  return clean;
}

export function trackEvent(name, params, gtagImpl) {
  const eventName = String(name || '').trim();
  if (!eventName) return;
  const payload = sanitizeAnalyticsParams(params);
  const gtag = gtagImpl
    || (typeof window !== 'undefined' && typeof window.gtag === 'function' ? window.gtag : null);
  if (typeof gtag !== 'function') return;
  gtag('event', eventName, payload);
}

const ANALYTICS_MVP_METRICS = Object.freeze([
  'invited_homeowner_activation',
  'job_post_completion_rate',
  'jobs_receiving_quotes',
  'time_to_first_quote',
  'quote_acceptance_rate',
  'funded_job_conversion',
  'completion_rate',
  'average_job_value',
  'taskio_fee_revenue',
  'repeat_homeowner_activity',
  'active_verified_expert_utilisation',
]);

export { ANALYTICS_EVENTS, ANALYTICS_MVP_METRICS };
