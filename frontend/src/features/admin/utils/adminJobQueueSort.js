import {
  getTaskCreatedAtMs,
  isDisputeUnreviewed,
  isOpenTask,
  isStaleOpen,
  needsAttentionNoOffer,
} from '../../../utils/adminOps';

/**
 * Secondary ops attention score (higher = more urgent). Used as tie-breaker after created time.
 */
export function jobAttentionScore(job, quoteMeta, nowMs = Date.now()) {
  const hasAny = quoteMeta?.hasAnyByJobId || {};
  const known = new Set(Array.isArray(quoteMeta?.knownJobIds) ? quoteMeta.knownJobIds : []);
  const id = String(job?.id || '');
  const hasOffer = known.has(id) ? (hasAny[id] === true) : true;
  if (isDisputeUnreviewed(job)) return 4000;
  if (needsAttentionNoOffer(job, hasOffer, nowMs)) return 3000;
  if (isStaleOpen(job, nowMs)) return 2000;
  if (job?.requiresAdminAttention === true) return 1500;
  return 0;
}

/**
 * Primary: created time (newest = higher ms first). Secondary: attention score.
 * @param {'newest'|'oldest'} sortOrder
 * @returns {number} comparator result
 */
export function compareJobsForQueueSort(a, b, sortOrder, quoteMeta) {
  const nowMs = Date.now();
  const aCreated = getTaskCreatedAtMs(a) || 0;
  const bCreated = getTaskCreatedAtMs(b) || 0;
  const byDate = sortOrder === 'newest' ? bCreated - aCreated : aCreated - bCreated;
  if (byDate !== 0) return byDate;

  const scoreA = jobAttentionScore(a, quoteMeta, nowMs);
  const scoreB = jobAttentionScore(b, quoteMeta, nowMs);
  if (scoreA !== scoreB) return scoreB - scoreA;

  const aOpen = isOpenTask(a);
  const bOpen = isOpenTask(b);
  if (aOpen !== bOpen) return aOpen ? -1 : 1;
  return String(a?.id || '').localeCompare(String(b?.id || ''));
}
