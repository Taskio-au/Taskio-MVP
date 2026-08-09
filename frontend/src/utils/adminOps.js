// Shared admin operations helpers (frontend)
// Keep internal role values / routes unchanged; these helpers are for UI-only logic.

import { JOB_STATUSES, normalizeStatus } from '../constants/jobStatuses';

export const ATTENTION_NO_OFFER_HOURS = 6;
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

export function needsAttentionNoOffer(job, hasAnyOffer, nowMs = Date.now()) {
  if (!isOpenTask(job)) return false;
  if (hasAnyOffer === true) return false;
  return isOlderThanHours(job?.createdAt, ATTENTION_NO_OFFER_HOURS, nowMs);
}

export function isStaleOpen(job, nowMs = Date.now()) {
  if (!isOpenTask(job)) return false;
  return isOlderThanHours(job?.createdAt, STALE_OPEN_HOURS, nowMs);
}

export function healthLabelForTask({ job, hasOffer, nowMs = Date.now() }) {
  const ageH = ageHoursFrom(job?.createdAt, nowMs);
  const status = normalizeStatus(job?.status);
  if (isDisputeUnreviewed(job)) return { key: 'dispute', label: 'Flagged', tone: 'danger' };
  if ((job?.flaggedChatCount || 0) > 0 || job?.disputeFlag === true) return { key: 'flagged', label: 'Flagged', tone: 'danger' };
  if (hasOffer === false && ageH >= ATTENTION_NO_OFFER_HOURS) return { key: 'needs_attention', label: 'Needs attention', tone: 'warning' };
  if (status === JOB_STATUSES.OPEN && ageH >= STALE_OPEN_HOURS) return { key: 'waiting_too_long', label: 'Waiting too long', tone: 'info' };
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
