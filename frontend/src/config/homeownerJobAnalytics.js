import { useEffect, useRef } from 'react';
import { JOB_STATUSES, normalizeStatus } from '../constants/jobStatuses';
import { ANALYTICS_EVENTS, trackEvent, trackEventOnce } from './analytics';

export function jobLooksPaid(job) {
  if (!job) return false;
  const ns = normalizeStatus(job.status);
  return (
    job.paymentState === 'in_escrow'
    || job.paymentStatus === 'succeeded'
    || [JOB_STATUSES.FUNDED, JOB_STATUSES.IN_PROGRESS, JOB_STATUSES.COMPLETED, JOB_STATUSES.PAID].includes(ns)
  );
}

export function useHomeownerJobAnalytics({ jobId, quotes, job, ready }) {
  const prevPaymentStateRef = useRef('');
  const lastJobIdRef = useRef(jobId);

  useEffect(() => {
    if (!ready) return;
    const count = Array.isArray(quotes) ? quotes.length : 0;
    if (count > 0) {
      trackEventOnce(ANALYTICS_EVENTS.QUOTE_RECEIVED, jobId || 'session', { role: 'homeowner', count });
    }
  }, [jobId, quotes, ready]);

  useEffect(() => {
    if (lastJobIdRef.current !== jobId) {
      lastJobIdRef.current = jobId;
      prevPaymentStateRef.current = '';
    }
    const ps = String(job?.paymentState || '');
    const prev = prevPaymentStateRef.current;
    if (prev && prev !== 'refunded' && ps === 'refunded') {
      trackEventOnce(ANALYTICS_EVENTS.PAYMENT_REFUNDED, jobId || 'session', {
        role: 'homeowner',
        payment_state: 'refunded',
      });
    }
    if (ps) prevPaymentStateRef.current = ps;
  }, [job?.paymentState, jobId]);
}

export function trackPaymentSucceeded(jobId) {
  trackEventOnce(ANALYTICS_EVENTS.PAYMENT_SUCCEEDED, jobId, {
    role: 'homeowner',
    payment_state: 'in_escrow',
  });
}

export function trackPaymentReleased() {
  trackEvent(ANALYTICS_EVENTS.PAYMENT_RELEASED, { role: 'homeowner' });
}

export function trackReviewSubmitted(role) {
  trackEvent(ANALYTICS_EVENTS.REVIEW_SUBMITTED, { role });
}
