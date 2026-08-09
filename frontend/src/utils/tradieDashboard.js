import {
  JOB_STATUSES,
  getStatusColors,
  getStatusLabel,
  isChatEnabled,
  normalizeStatus,
} from '../constants/jobStatuses';
import { getShortJobRef } from './taskReference';
import { fullTaskDisplayTitle } from './jobDisplayFromJob';

/** OPEN / QUOTED — states where the expert may still submit or revise a quote */
export function jobAllowsExpertQuoting(status) {
  const s = normalizeStatus(status);
  return s === JOB_STATUSES.OPEN || s === JOB_STATUSES.QUOTED;
}

/**
 * True when this expert should act on quoting (server sets `expertNeedsQuoteAction` on /api/tradie/jobs).
 * Fallback: treat legacy OPEN invites as needing a quote until the API field exists.
 */
export function expertNeedsQuoteAction(job) {
  if (job && typeof job.expertNeedsQuoteAction === 'boolean') {
    return job.expertNeedsQuoteAction === true;
  }
  return normalizeStatus(job?.status) === JOB_STATUSES.OPEN;
}

function expertNeedsAttentionQuoteWork(job) {
  return expertNeedsQuoteAction(job) && jobAllowsExpertQuoting(job.status);
}

/**
 * Single priority tier for dashboard "Needs attention" (higher = show first).
 * Order: unread (chat) → awaiting approval → payment required → payment secured →
 * work in progress → expert selected → quote / revision work → other open work.
 */
export function getExpertNeedsAttentionTier(job, unreadByJobId = {}) {
  const s = normalizeStatus(job.status);
  const unread = Math.max(0, Number(unreadByJobId[job.id] || 0));
  if (unread > 0 && isChatEnabled(s)) return 100000;
  if (s === JOB_STATUSES.COMPLETED) return 8000;
  if (s === JOB_STATUSES.AWAITING_FUNDING) return 7000;
  if (s === JOB_STATUSES.FUNDED) return 6000;
  if (s === JOB_STATUSES.IN_PROGRESS) return 5000;
  if (s === JOB_STATUSES.ASSIGNED) return 4500;
  if (expertNeedsAttentionQuoteWork(job)) return 4300;
  if (s === JOB_STATUSES.OPEN || s === JOB_STATUSES.QUOTED) return 100;
  return 50;
}

export function getTimeOfDay(now = new Date()) {
  const hour = now.getHours();
  if (hour < 12) return 'morning';
  if (hour < 18) return 'afternoon';
  return 'evening';
}

export function getExpertJobStatus(job) {
  const s = normalizeStatus(job?.status);
  const colors = getStatusColors(s);
  return {
    label: getStatusLabel(s),
    color: colors.text,
    bg: colors.bg,
    border: colors.border,
  };
}

export function getExpertContextualBadge(job, unreadCount = 0) {
  const unread = Math.max(Number(unreadCount || 0), 0);
  if (unread > 0) {
    return {
      label: `${unread} new ${unread === 1 ? 'message' : 'messages'}`,
      bg: '#FFF4E6',
      color: '#B45309',
    };
  }

  const s = normalizeStatus(job?.status);
  if (s === JOB_STATUSES.COMPLETED) {
    return {
      label: 'Awaiting client approval',
      bg: '#EDE9FE',
      color: '#6D28D9',
    };
  }

  return null;
}

/**
 * Primary button label + optional hash for expert job cards (dashboard + tasks).
 * Unread messages take priority when chat is available for the job state.
 */
export function getExpertDashboardCTA(job, unreadCount = 0) {
  const s = normalizeStatus(job?.status);
  const unread = Math.max(Number(unreadCount || 0), 0);
  if (unread > 0 && isChatEnabled(s)) {
    return { label: 'Open messages', pathSuffix: '#chat' };
  }
  if (expertNeedsQuoteAction(job) && jobAllowsExpertQuoting(job.status)) {
    return { label: 'Submit quote', pathSuffix: '' };
  }
  if (s === JOB_STATUSES.COMPLETED) {
    return { label: 'Review approval', pathSuffix: '' };
  }
  if (s === JOB_STATUSES.FUNDED || s === JOB_STATUSES.IN_PROGRESS) {
    return { label: 'Manage task', pathSuffix: '' };
  }
  return { label: 'View task details', pathSuffix: '' };
}

/**
 * Status pill on expert task cards — unread (when chat is live) and quote work override generic lifecycle labels.
 */
export function getExpertJobCardStatusPill(job, unreadCount = 0) {
  const s = normalizeStatus(job?.status);
  const unread = Math.max(Number(unreadCount || 0), 0);
  if (unread > 0 && isChatEnabled(s)) {
    return {
      label: `${unread} new ${unread === 1 ? 'message' : 'messages'}`,
      bg: '#FFF4E6',
      color: '#B45309',
      border: '#FED7AA',
    };
  }
  if (expertNeedsQuoteAction(job) && jobAllowsExpertQuoting(job.status)) {
    return {
      label: 'Quote requested',
      bg: '#FFF4E6',
      color: '#B45309',
      border: '#FED7AA',
    };
  }
  return getExpertJobStatus(job);
}

export function getExpertJobCTA(job) {
  return getExpertDashboardCTA(job, 0).label;
}

export function formatAuShortDateFromTimestamp(timestamp) {
  if (!timestamp || !timestamp._seconds) return 'N/A';
  return new Date(timestamp._seconds * 1000).toLocaleDateString('en-AU', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

export function filterExpertJobs(jobs, statusFilter) {
  if (statusFilter === 'all') return jobs;
  if (statusFilter === 'active') {
    return jobs.filter((j) => ![JOB_STATUSES.PAID, JOB_STATUSES.CANCELLED, JOB_STATUSES.DISPUTED].includes(normalizeStatus(j.status)));
  }
  if (statusFilter === 'completed') {
    return jobs.filter((j) => normalizeStatus(j.status) === JOB_STATUSES.PAID);
  }
  if (statusFilter === 'disputed') {
    return jobs.filter((j) => normalizeStatus(j.status) === JOB_STATUSES.DISPUTED);
  }
  return jobs;
}

export function computeExpertStats(jobs) {
  const inProgress = jobs.filter((j) => [JOB_STATUSES.FUNDED, JOB_STATUSES.IN_PROGRESS].includes(normalizeStatus(j.status))).length;
  const awaiting = jobs.filter((j) => normalizeStatus(j.status) === JOB_STATUSES.COMPLETED).length;
  const completed = jobs.filter((j) => normalizeStatus(j.status) === JOB_STATUSES.PAID).length;
  const active = jobs.filter((j) => ![JOB_STATUSES.PAID, JOB_STATUSES.CANCELLED, JOB_STATUSES.DISPUTED].includes(normalizeStatus(j.status))).length;
  return { total: jobs.length, inProgress, awaiting, completed, active };
}

/** Firestore-style timestamp → millis for sorting */
export function getJobCreatedMillis(job) {
  const t = job && job.createdAt;
  if (t && typeof t._seconds === 'number') return t._seconds * 1000;
  return 0;
}

/**
 * Client-side search across title, description, location, internal id (compat), and short task ref (TSK-####).
 */
export function filterExpertJobsBySearch(jobs, rawQuery) {
  const q = String(rawQuery || '').trim().toLowerCase();
  if (!q) return jobs;
  const qCompact = q.replace(/\s+/g, '').replace(/^ref:?/i, '');
  return jobs.filter((j) => {
    const title = String(j.title || '').toLowerCase();
    const displayTitle = String(fullTaskDisplayTitle(j) || '').toLowerCase();
    const desc = String(j.description || '').toLowerCase();
    const loc = String(j.location || '').toLowerCase();
    const id = String(j.id || '').toLowerCase();
    const shortRef = getShortJobRef(j).toLowerCase();
    const shortRefCompact = shortRef.replace(/\s+/g, '');
    return (
      title.includes(q)
      || displayTitle.includes(q)
      || desc.includes(q)
      || loc.includes(q)
      || id.includes(q)
      || shortRef.includes(q)
      || shortRefCompact.includes(qCompact)
    );
  });
}

/**
 * @param {'newest'|'oldest'|'title'|'status'} sortKey
 */
export function sortExpertJobs(jobs, sortKey) {
  const list = Array.isArray(jobs) ? [...jobs] : [];
  if (sortKey === 'newest') {
    list.sort((a, b) => getJobCreatedMillis(b) - getJobCreatedMillis(a));
  } else if (sortKey === 'oldest') {
    list.sort((a, b) => getJobCreatedMillis(a) - getJobCreatedMillis(b));
  } else if (sortKey === 'title') {
    list.sort((a, b) =>
      String(fullTaskDisplayTitle(a) || '').localeCompare(String(fullTaskDisplayTitle(b) || ''), undefined, {
        sensitivity: 'base',
      })
    );
  } else if (sortKey === 'status') {
    list.sort((a, b) => String(normalizeStatus(a.status)).localeCompare(String(normalizeStatus(b.status))));
  }
  return list;
}

/**
 * Jobs that require quoting or revision — used for dashboard inclusion and reserved slots.
 */
export function isExpertQuoteAttentionJob(job) {
  return expertNeedsAttentionQuoteWork(job);
}

/**
 * Scored rows for expert attention queue (sorted: tier desc, then created desc).
 */
export function scoreExpertAttentionJobs(jobs, unreadByJobId = {}) {
  const active = filterExpertJobs(jobs, 'active');
  const scored = active.map((j) => ({
    job: j,
    tier: getExpertNeedsAttentionTier(j, unreadByJobId),
    createdMs: getJobCreatedMillis(j),
  }));
  scored.sort((a, b) => {
    if (b.tier !== a.tier) return b.tier - a.tier;
    return b.createdMs - a.createdMs;
  });
  return scored;
}

/**
 * Apply top-N selection with quote-action reserve slot (see selectNeedsAttentionJobs).
 * @param {Array<{job: object, tier: number, createdMs: number}>} scored
 */
export function selectNeedsAttentionJobsFromScored(scored, { limit = 6 } = {}) {
  if (!Number.isFinite(limit) || limit <= 0) return [];

  const top = scored.slice(0, limit);
  const topIds = new Set(top.map((x) => x.job.id));

  const quoteInTop = top.some((x) => isExpertQuoteAttentionJob(x.job));
  if (quoteInTop || top.length < limit) {
    return top.map((x) => x.job);
  }

  const quoteOutside = scored
    .filter((x) => isExpertQuoteAttentionJob(x.job) && !topIds.has(x.job.id))
    .sort((a, b) => b.createdMs - a.createdMs);

  if (quoteOutside.length === 0) {
    return top.map((x) => x.job);
  }

  const inject = quoteOutside[0];
  let replaceIdx = 0;
  for (let i = 1; i < top.length; i += 1) {
    const cur = top[i];
    const best = top[replaceIdx];
    if (cur.tier < best.tier) replaceIdx = i;
    else if (cur.tier === best.tier && cur.createdMs < best.createdMs) replaceIdx = i;
  }

  const merged = top.slice();
  merged[replaceIdx] = inject;
  merged.sort((a, b) => {
    if (b.tier !== a.tier) return b.tier - a.tier;
    return b.createdMs - a.createdMs;
  });

  const outIds = merged.map((x) => x.job.id);
  if (new Set(outIds).size !== outIds.length) {
    return top.map((x) => x.job);
  }

  return merged.map((x) => x.job);
}

/**
 * Prioritised slice of active jobs for the dashboard "needs attention" queue.
 * Reserves at least one slot for quote/revision work when any exists but would otherwise fall outside the top N.
 */
export function selectNeedsAttentionJobs(jobs, unreadByJobId = {}, { limit = 6 } = {}) {
  const scored = scoreExpertAttentionJobs(jobs, unreadByJobId);
  return selectNeedsAttentionJobsFromScored(scored, { limit });
}

// Compatibility aliases for pre-refactor imports.
export const getTradieJobStatus = getExpertJobStatus;
export const getTradieContextualBadge = getExpertContextualBadge;
export const getTradieJobCTA = getExpertJobCTA;
export const filterTradieJobs = filterExpertJobs;
export const computeTradieStats = computeExpertStats;
