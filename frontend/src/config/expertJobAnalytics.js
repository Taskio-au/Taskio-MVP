import { ANALYTICS_EVENTS, trackEvent } from './analytics';
import { amountBucketFromCents } from './analyticsConfig';

export { trackReviewSubmitted } from './homeownerJobAnalytics';

export function trackQuoteSubmitted(amountDollars) {
  const bucket = amountBucketFromCents(Math.round(Number(amountDollars) * 100));
  trackEvent(ANALYTICS_EVENTS.QUOTE_SUBMITTED, {
    role: 'tradie',
    ...(bucket ? { amount_bucket: bucket } : {}),
  });
}

export function trackJobMarkedComplete() {
  trackEvent(ANALYTICS_EVENTS.JOB_MARKED_COMPLETE, { role: 'tradie' });
}
