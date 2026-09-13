'use strict';

const { JOB_STATUSES, resolveJobStatus } = require('../../../shared/jobStatusesCore');

const DESIRED_INVITE_COUNT = 5;
const ZERO_QUOTES_MS = 60 * 60 * 1000;
const ONE_QUOTE_MS = 3 * 60 * 60 * 1000;
const LOW_INVITE_GRACE_MS = ZERO_QUOTES_MS;
const COMPLETION_STALL_MS = 48 * 60 * 60 * 1000;

const REASONS = Object.freeze({
  PAYMENT_ISSUE: 'PAYMENT_ISSUE',
  NO_SUITABLE_SUPPLY: 'NO_SUITABLE_SUPPLY',
  ZERO_QUOTES_60M: 'ZERO_QUOTES_60M',
  NO_EXPERTS_INVITED: 'NO_EXPERTS_INVITED',
  ONLY_ONE_QUOTE_3H: 'ONLY_ONE_QUOTE_3H',
  LOW_INVITE_COVERAGE: 'LOW_INVITE_COVERAGE',
  COMPLETION_STALLED: 'COMPLETION_STALLED',
});

const PRIORITY = Object.freeze({
  CRITICAL: 'CRITICAL',
  HIGH: 'HIGH',
  MEDIUM: 'MEDIUM',
  LOW: 'LOW',
});

const PRIORITY_RANK = Object.freeze({
  CRITICAL: 0,
  HIGH: 1,
  MEDIUM: 2,
  LOW: 3,
});

const REASON_META = Object.freeze({
  [REASONS.PAYMENT_ISSUE]: {
    label: 'Payment / refund / dispute issue',
    priority: PRIORITY.CRITICAL,
    action: 'review_payment',
    actionLabel: 'Review payment',
  },
  [REASONS.NO_SUITABLE_SUPPLY]: {
    label: 'No suitable launch-ready Expert',
    priority: PRIORITY.CRITICAL,
    action: 'view_job',
    actionLabel: 'View job',
  },
  [REASONS.ZERO_QUOTES_60M]: {
    label: '0 quotes after 60 minutes',
    priority: PRIORITY.HIGH,
    action: 'invite_experts',
    actionLabel: 'Invite Experts',
  },
  [REASONS.NO_EXPERTS_INVITED]: {
    label: 'No Experts invited',
    priority: PRIORITY.HIGH,
    action: 'invite_experts',
    actionLabel: 'Invite Experts',
  },
  [REASONS.ONLY_ONE_QUOTE_3H]: {
    label: 'Only 1 quote after 3 hours',
    priority: PRIORITY.MEDIUM,
    action: 'invite_experts',
    actionLabel: 'Invite Experts',
  },
  [REASONS.LOW_INVITE_COVERAGE]: {
    label: 'Fewer than 5 Experts invited',
    priority: PRIORITY.MEDIUM,
    action: 'invite_experts',
    actionLabel: 'Invite Experts',
  },
  [REASONS.COMPLETION_STALLED]: {
    label: 'Completion / release waiting',
    priority: PRIORITY.MEDIUM,
    action: 'review_completion',
    actionLabel: 'Review completion',
  },
});

function normalizeStatus(status) {
  return resolveJobStatus(status).status;
}

function isVisibleQuoteStatus(status) {
  const normalized = String(status || '').trim().toLowerCase();
  return normalized === 'submitted' || normalized === 'accepted';
}

function isQuotingStatus(status) {
  return status === JOB_STATUSES.OPEN || status === JOB_STATUSES.QUOTED;
}

function hasPaymentIssue(status, paymentState) {
  const ps = String(paymentState || '').toLowerCase();
  if (ps === 'payment_failed' || ps === 'refund_failed' || ps === 'refund_pending' || ps === 'disputed') {
    return true;
  }
  return status === JOB_STATUSES.DISPUTED || status === JOB_STATUSES.REFUND_PENDING;
}

function isSettledPayment(paymentState) {
  const ps = String(paymentState || '').toLowerCase();
  return ps === 'released' || ps === 'refunded';
}

function isExcludedTerminal(status, paymentIssue, paymentState) {
  if (status === JOB_STATUSES.PAID || status === JOB_STATUSES.REFUNDED) return true;
  if (isSettledPayment(paymentState)) return true;
  if (status === JOB_STATUSES.CANCELLED && !paymentIssue) return true;
  return false;
}

function inviteCountFromJob(job) {
  if (Array.isArray(job?.invitedTradieUids)) return job.invitedTradieUids.length;
  const n = Number(job?.invitedCount);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

function jobCategory(job) {
  return String(job?.primaryCategory || job?.jobTypeCategory || '').trim();
}

function jobArea(job) {
  if (typeof job?.locationSuburb === 'string' && job.locationSuburb.trim()) {
    return job.locationSuburb.trim();
  }
  if (job?.location && typeof job.location === 'object') {
    return String(job.location.suburb || '').trim();
  }
  return '';
}

function countSuitableLaunchReady(job, launchReadyIndex, categoryKeyMap, pilotAreaSet) {
  const category = jobCategory(job);
  const area = jobArea(job);
  const keys = categoryKeyMap.get(category);
  if (!keys || !pilotAreaSet.has(area)) {
    return { reliable: false, count: null };
  }
  let count = 0;
  for (const expert of launchReadyIndex) {
    if (!keys.some((key) => expert.approved.has(key))) continue;
    if (!expert.serviceAreas.has(area)) continue;
    count += 1;
  }
  return { reliable: true, count };
}

function pickPrimary(candidates) {
  if (!candidates.length) return null;
  return candidates.slice().sort((a, b) => {
    const rank = PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority];
    if (rank !== 0) return rank;
    const order = [
      REASONS.PAYMENT_ISSUE,
      REASONS.NO_SUITABLE_SUPPLY,
      REASONS.ZERO_QUOTES_60M,
      REASONS.NO_EXPERTS_INVITED,
      REASONS.ONLY_ONE_QUOTE_3H,
      REASONS.LOW_INVITE_COVERAGE,
      REASONS.COMPLETION_STALLED,
    ];
    return order.indexOf(a.key) - order.indexOf(b.key);
  })[0];
}

function deriveJobAttention(input, nowMs = Date.now()) {
  const status = normalizeStatus(input?.status);
  const paymentState = input?.paymentState;
  const paymentIssue = hasPaymentIssue(status, paymentState);
  if (isExcludedTerminal(status, paymentIssue, paymentState)) {
    return null;
  }

  const createdAtMs = Number(input?.createdAtMs) || 0;
  const ageMs = createdAtMs ? Math.max(0, nowMs - createdAtMs) : 0;
  const inviteCount = Number(input?.inviteCount) || 0;
  const quoteCount = Number(input?.quoteCount) || 0;
  const quoting = isQuotingStatus(status) && input?.postingReady !== false;
  const candidates = [];

  if (paymentIssue) {
    candidates.push({ key: REASONS.PAYMENT_ISSUE, ...REASON_META[REASONS.PAYMENT_ISSUE] });
  }

  if (quoting && input?.suitableSupplyReliable === true && Number(input?.suitableLaunchReadyCount) === 0) {
    candidates.push({ key: REASONS.NO_SUITABLE_SUPPLY, ...REASON_META[REASONS.NO_SUITABLE_SUPPLY] });
  }

  if (quoting && quoteCount === 0 && createdAtMs && ageMs > ZERO_QUOTES_MS) {
    candidates.push({ key: REASONS.ZERO_QUOTES_60M, ...REASON_META[REASONS.ZERO_QUOTES_60M] });
  }

  if (quoting && inviteCount === 0) {
    candidates.push({ key: REASONS.NO_EXPERTS_INVITED, ...REASON_META[REASONS.NO_EXPERTS_INVITED] });
  }

  if (quoting && quoteCount === 1 && createdAtMs && ageMs > ONE_QUOTE_MS) {
    candidates.push({ key: REASONS.ONLY_ONE_QUOTE_3H, ...REASON_META[REASONS.ONLY_ONE_QUOTE_3H] });
  }

  if (
    quoting
    && inviteCount > 0
    && inviteCount < DESIRED_INVITE_COUNT
    && quoteCount < 2
    && createdAtMs
    && ageMs > LOW_INVITE_GRACE_MS
  ) {
    candidates.push({ key: REASONS.LOW_INVITE_COVERAGE, ...REASON_META[REASONS.LOW_INVITE_COVERAGE] });
  }

  const completedAtMs = Number(input?.completedAtMs) || 0;
  if (status === JOB_STATUSES.COMPLETED && completedAtMs && (nowMs - completedAtMs) > COMPLETION_STALL_MS) {
    candidates.push({ key: REASONS.COMPLETION_STALLED, ...REASON_META[REASONS.COMPLETION_STALLED] });
  }

  const primary = pickPrimary(candidates);
  if (!primary) return null;

  const secondary = candidates
    .filter((row) => row.key !== primary.key)
    .map((row) => ({ key: row.key, label: row.label }));

  return {
    reasonKey: primary.key,
    reasonLabel: primary.label,
    priority: primary.priority,
    action: primary.action,
    actionLabel: primary.actionLabel,
    secondary,
  };
}

module.exports = {
  DESIRED_INVITE_COUNT,
  ZERO_QUOTES_MS,
  ONE_QUOTE_MS,
  LOW_INVITE_GRACE_MS,
  COMPLETION_STALL_MS,
  REASONS,
  PRIORITY,
  PRIORITY_RANK,
  REASON_META,
  normalizeStatus,
  isVisibleQuoteStatus,
  inviteCountFromJob,
  jobCategory,
  jobArea,
  countSuitableLaunchReady,
  deriveJobAttention,
};
