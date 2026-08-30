/** Product analytics for later GA4. Do not send PII. Reuses the G05 taxonomy. */
import { getActiveAnalyticsConfig } from './analyticsInit';

const ANALYTICS_EVENTS = Object.freeze({
  LANDING_VIEWED: 'landing_viewed',
  LOGIN_CTA_CLICKED: 'login_cta_clicked',
  LOGIN_STARTED: 'login_started',
  LOGIN_SUCCEEDED: 'login_succeeded',
  ACCOUNT_ACTIVATION_COMPLETED: 'account_activation_completed',
  INVITED_USER_ACTIVATED: 'account_activation_completed',
  JOB_POST_STARTED: 'job_post_started',
  JOB_POST_STEP_COMPLETED: 'job_post_step_completed',
  JOB_POST_COMPLETED: 'job_post_completed',
  JOB_CREATED: 'job_created',
  EXPERT_INVITED: 'expert_invited',
  QUOTE_SUBMITTED: 'quote_submitted',
  QUOTE_RECEIVED: 'quote_received',
  QUOTE_ACCEPTED: 'quote_accepted',
  CHECKOUT_STARTED: 'checkout_started',
  PAYMENT_SUCCEEDED: 'payment_succeeded',
  PAYMENT_REFUNDED: 'payment_refunded',
  JOB_IN_PROGRESS: 'job_in_progress',
  JOB_MARKED_COMPLETE: 'job_marked_complete',
  JOB_COMPLETED: 'job_marked_complete',
  PAYMENT_RELEASED: 'payment_released',
  REVIEW_SUBMITTED: 'review_submitted',
});

const ALLOWED_PARAM_KEYS = new Set([
  'surface',
  'role',
  'status',
  'source',
  'count',
  'step',
  'result',
  'category',
  'suburb',
  'amount_bucket',
  'fee_plan',
  'payment_state',
  'environment',
]);

const FORBIDDEN_PARAM_PATTERN = /phone|email|otp|token|password|description|message|address|name|uid|user_id|job_id|stripe|card|payment_method|dob|abn|filename|chat/i;
const ONCE_PREFIX = 'taskio_analytics_once:';

function warnDroppedProperty(key) {
  if (process.env.NODE_ENV === 'development') {
    // Key names only — never the value.
    // eslint-disable-next-line no-console
    console.warn('Analytics dropped unsupported property:', String(key || 'unknown'));
  }
}

export function sanitizeAnalyticsParams(params) {
  if (!params || typeof params !== 'object' || Array.isArray(params)) return {};
  const clean = {};
  for (const [key, value] of Object.entries(params)) {
    if (FORBIDDEN_PARAM_PATTERN.test(key)) {
      warnDroppedProperty(key);
      continue;
    }
    if (!ALLOWED_PARAM_KEYS.has(key)) {
      warnDroppedProperty(key);
      continue;
    }
    if (value == null) continue;
    if (typeof value === 'object') {
      warnDroppedProperty(key);
      continue;
    }
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

function withEnvironment(payload) {
  const config = getActiveAnalyticsConfig();
  if (config?.enabled && config.environment && payload.environment == null) {
    return { ...payload, environment: config.environment };
  }
  return payload;
}

export function trackEvent(name, params, gtagImpl) {
  try {
    const eventName = String(name || '').trim();
    if (!eventName) return;
    const payload = withEnvironment(sanitizeAnalyticsParams(params));
    if (typeof gtagImpl === 'function') {
      gtagImpl('event', eventName, payload);
      return;
    }
    if (!getActiveAnalyticsConfig()?.enabled) return;
    const gtag = typeof window !== 'undefined' && typeof window.gtag === 'function'
      ? window.gtag
      : null;
    if (typeof gtag !== 'function') return;
    gtag('event', eventName, payload);
  } catch (_err) {
    // Analytics must never block product actions.
  }
}

function onceStorage() {
  try {
    if (typeof sessionStorage === 'undefined') return null;
    return sessionStorage;
  } catch (_err) {
    return null;
  }
}

export function trackEventOnce(name, dedupeKey, params, gtagImpl) {
  const key = `${ONCE_PREFIX}${String(name || '')}:${String(dedupeKey || 'session')}`;
  const storage = onceStorage();
  if (storage) {
    try {
      if (storage.getItem(key)) return false;
      storage.setItem(key, '1');
    } catch (_err) {
      // Ignore quota / private-mode failures and still attempt a single dispatch.
    }
  }
  trackEvent(name, params, gtagImpl);
  return true;
}

export function resetAnalyticsOnceForTests() {
  const storage = onceStorage();
  if (!storage) return;
  const remove = [];
  for (let i = 0; i < storage.length; i += 1) {
    const key = storage.key(i);
    if (key && key.startsWith(ONCE_PREFIX)) remove.push(key);
  }
  remove.forEach((key) => storage.removeItem(key));
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
