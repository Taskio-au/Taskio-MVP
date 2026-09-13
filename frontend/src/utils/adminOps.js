// Shared admin operations helpers (frontend)
// Keep internal role values / routes unchanged; these helpers are for UI-only logic.

import { JOB_STATUSES, normalizeStatus } from '../constants/jobStatuses';

/** Superseded 6h quote-liquidity rule. Pilot trigger is 60 minutes. */
export const ATTENTION_ZERO_QUOTES_MINUTES = 60;
export const ATTENTION_NO_OFFER_HOURS = 1;
/** Superseded 24h “open too long” quote-liquidity rule. Pilot trigger is 1 quote after 3h. */
export const ATTENTION_ONE_QUOTE_HOURS = 3;
export const STALE_OPEN_HOURS = 24;
export const PROFILE_REQUEST_STALE_HOURS = 48;
export const NUDGE_COOLDOWN_HOURS = 4;

export const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

export function toMillis(ts) {
  if (!ts) return 0;
  if (typeof ts === 'number') return ts;
  // Firestore Timestamp (client SDK): { seconds, nanoseconds }
  if (typeof ts.seconds === 'number') return ts.seconds * 1000;
  // Firestore Timestamp-like (server responses in this repo): { _seconds, _nanoseconds }
  if (typeof ts._seconds === 'number') return ts._seconds * 1000;
  // Date object
  if (ts instanceof Date) return ts.getTime();
  // Anything else: best effort
  try {
    const d = new Date(ts);
    const ms = d.getTime();
    return Number.isFinite(ms) ? ms : 0;
  } catch {
    return 0;
  }
}

export function ageHoursFrom(ts, nowMs = Date.now()) {
  const ms = toMillis(ts);
  if (!ms) return 0;
  return (nowMs - ms) / (1000 * 60 * 60);
}

export function isOlderThanHours(ts, hours, nowMs = Date.now()) {
  return ageHoursFrom(ts, nowMs) >= Number(hours || 0);
}

export function isOpenTask(job) {
  return normalizeStatus(job?.status) === JOB_STATUSES.OPEN;
}

export function isDisputedTask(job) {
  const s = normalizeStatus(job?.status);
  const p = String(job?.paymentState || '').toLowerCase();
  return s === JOB_STATUSES.DISPUTED || p === 'disputed' || job?.disputeFlag === true;
}

export function isDisputeUnreviewed(job) {
  // We reuse reviewedAt used by monitoring; if it doesn't exist, treat as unreviewed.
  return isDisputedTask(job) && !toMillis(job?.reviewedAt);
}

export function getTaskCreatedAtMs(job) {
  return toMillis(job?.createdAt);
}

export function getTaskCompletedAtMs(job) {
  // Prefer explicit completion/release markers; fallback to updatedAt (beta).
  return (
    toMillis(job?.releasedAt) ||
    toMillis(job?.paidAt) ||
    toMillis(job?.completedAt) ||
    toMillis(job?.completedAtMs) ||
    toMillis(job?.updatedAt) ||
    0
  );
}

export function isQuotingTask(job) {
  const status = normalizeStatus(job?.status);
  return status === JOB_STATUSES.OPEN || status === JOB_STATUSES.QUOTED;
}

export function needsAttentionNoOffer(job, hasAnyOffer, nowMs = Date.now()) {
  if (!isQuotingTask(job)) return false;
  if (hasAnyOffer === true) return false;
  return isOlderThanHours(job?.createdAt, ATTENTION_NO_OFFER_HOURS, nowMs);
}

export function needsAttentionOneQuote(job, quoteCount, nowMs = Date.now()) {
  if (!isQuotingTask(job)) return false;
  if (Number(quoteCount) !== 1) return false;
  return isOlderThanHours(job?.createdAt, ATTENTION_ONE_QUOTE_HOURS, nowMs);
}

/** @deprecated 24h open-age is no longer a quote-liquidity trigger. Prefer needsAttentionOneQuote. */
export function isStaleOpen(job, nowMs = Date.now()) {
  if (!isQuotingTask(job)) return false;
  return isOlderThanHours(job?.createdAt, ATTENTION_ONE_QUOTE_HOURS, nowMs);
}

export function healthLabelForTask({ job, hasOffer, quoteCount, nowMs = Date.now() }) {
  const ageH = ageHoursFrom(job?.createdAt, nowMs);
  const status = normalizeStatus(job?.status);
  if (isDisputeUnreviewed(job)) return { key: 'dispute', label: 'Flagged', tone: 'danger' };
  if ((job?.flaggedChatCount || 0) > 0 || job?.disputeFlag === true) return { key: 'flagged', label: 'Flagged', tone: 'danger' };
  const quotes = Number.isFinite(Number(quoteCount)) ? Number(quoteCount) : (hasOffer === true ? null : 0);
  if ((quotes === 0 || (quotes == null && hasOffer === false)) && ageH >= ATTENTION_NO_OFFER_HOURS) {
    return { key: 'needs_attention', label: 'Needs attention', tone: 'warning' };
  }
  if (quotes === 1 && ageH >= ATTENTION_ONE_QUOTE_HOURS) {
    return { key: 'waiting_too_long', label: 'Waiting too long', tone: 'info' };
  }
  if (quotes == null && hasOffer === true && status === JOB_STATUSES.OPEN && ageH >= ATTENTION_ONE_QUOTE_HOURS) {
    return { key: 'healthy', label: 'Healthy', tone: 'success' };
  }
  return { key: 'healthy', label: 'Healthy', tone: 'success' };
}

export function formatAgeShort(msOrTs, nowMs = Date.now()) {
  const ms = typeof msOrTs === 'number' ? msOrTs : toMillis(msOrTs);
  if (!ms) return '—';
  const diff = Math.max(0, nowMs - ms);
  const h = Math.floor(diff / (1000 * 60 * 60));
  if (h < 24) return `${h}h`;
  const d = Math.floor(h / 24);
  return `${d}d`;
}

/** Pilot queue age: 42m, 1h 18m, 4h, 2d. */
export function formatAgePrecise(msOrTs, nowMs = Date.now()) {
  const ms = typeof msOrTs === 'number' ? msOrTs : toMillis(msOrTs);
  if (!ms) return '—';
  const diff = Math.max(0, nowMs - ms);
  const totalMin = Math.floor(diff / (1000 * 60));
  if (totalMin < 60) return `${totalMin}m`;
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  if (h < 24) return m ? `${h}h ${m}m` : `${h}h`;
  const d = Math.floor(h / 24);
  const rh = h % 24;
  return rh ? `${d}d ${rh}h` : `${d}d`;
}

/** Payment UX badge for admin task lists (financial source: job.paymentState + status). */
export function getAdminPaymentBadge(job) {
  const ps = String(job?.paymentState || '').toLowerCase();
  const st = normalizeStatus(job?.status);
  if (ps === 'payment_failed' || ps === 'refund_failed') {
    return { key: 'failed', label: 'PAYMENT FAILED', tone: 'danger' };
  }
  if (st === JOB_STATUSES.REFUND_PENDING || ps === 'refund_pending') {
    return { key: 'refund_pending', label: 'REFUND PENDING', tone: 'warning' };
  }
  if (ps === 'refunded' || st === JOB_STATUSES.REFUNDED) {
    return { key: 'refunded', label: 'REFUNDED', tone: 'muted' };
  }
  if (ps === 'released' || st === JOB_STATUSES.PAID) {
    return { key: 'paid', label: 'PAID', tone: 'success' };
  }
  if (ps === 'in_escrow') {
    return { key: 'escrow', label: 'SECURED', tone: 'info' };
  }
  return { key: 'other', label: ps ? ps.replace(/_/g, ' ').toUpperCase() : '—', tone: 'neutral' };
}

export function hasAdminPaymentIssue(job) {
  const ps = String(job?.paymentState || '').toLowerCase();
  return ps === 'payment_failed' || ps === 'refund_failed';
}

/** DISPUTED with disputedAt older than 24h (best-effort). */
export function isDisputeStale24h(job, nowMs = Date.now()) {
  if (normalizeStatus(job?.status) !== JOB_STATUSES.DISPUTED) return false;
  const t = toMillis(job?.disputedAt);
  if (!t) return false;
  return nowMs - t >= 24 * 60 * 60 * 1000;
}
