import { JOB_STATUSES, normalizeStatus } from '../constants/jobStatuses';

export const POST_RELEASE_CHAT_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;

function toMillis(value) {
  if (!value) return 0;
  if (typeof value.toMillis === 'function') return value.toMillis();
  if (typeof value === 'number') return value;
  const seconds = Number(value.seconds ?? value._seconds ?? 0);
  return Number.isFinite(seconds) ? seconds * 1000 : 0;
}

export function isChatReadOnly(job, nowMs = Date.now()) {
  if (!job) return true;
  if (job.chatFrozen === true) return true;
  const status = normalizeStatus(job.status);
  if (status === JOB_STATUSES.CANCELLED) return true;
  if (status !== JOB_STATUSES.PAID) return false;

  const reopenedUntilMs = toMillis(job.chatReopenedUntil)
    || Number(job.chatReopenedUntilMs || 0);
  if (reopenedUntilMs > nowMs) return false;
  const releasedAtMs = toMillis(job.releasedAt)
    || Number(job.releasedAtMs || job.paymentReleasedAtMs || 0);
  if (!releasedAtMs) return true;
  return nowMs >= releasedAtMs + POST_RELEASE_CHAT_WINDOW_MS;
}

export { toMillis as chatTimestampToMillis };
