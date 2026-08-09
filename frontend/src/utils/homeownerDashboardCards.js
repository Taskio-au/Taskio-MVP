import { JOB_STATUSES, getPrimaryAction, normalizeStatus } from '../constants/jobStatuses';

export { getShortJobRef } from './taskReference';

/** True when client funds escrow (may briefly lag normalized job status). */
export function isEscrowFunded(job) {
    if (!job || typeof job !== 'object') return false;
    return job.paymentState === 'in_escrow' || job.paymentStatus === 'succeeded';
}

/**
 * Simplified 4-step client journey for list cards.
 * @returns {number|null} current step 1–4, or null if cancelled / unknown
 */
export function getClientFourStepIndex(normalizedStatus) {
    const s = normalizeStatus(normalizedStatus);
    if (s === JOB_STATUSES.CANCELLED || s === JOB_STATUSES.REFUNDED) return null;
    if (s === JOB_STATUSES.REFUND_PENDING) return 3;
    if ([JOB_STATUSES.OPEN, JOB_STATUSES.QUOTED, JOB_STATUSES.ASSIGNED].includes(s)) return 1;
    if (s === JOB_STATUSES.AWAITING_FUNDING) return 2;
    if (s === JOB_STATUSES.FUNDED || s === JOB_STATUSES.IN_PROGRESS) return 3;
    if ([JOB_STATUSES.COMPLETED, JOB_STATUSES.PAID, JOB_STATUSES.DISPUTED].includes(s)) return 4;
    return 1;
}

/** Dashboard-only status microcopy + tint (does not replace global STATUS_LABELS). */
export function getClientDashboardStatusPresentation(normalizedStatus) {
    const s = normalizeStatus(normalizedStatus);
    const map = {
        [JOB_STATUSES.OPEN]: {
            label: 'Reviewing',
            bg: '#F3F4F6',
            color: '#4B5563',
        },
        [JOB_STATUSES.QUOTED]: {
            label: 'Quotes received',
            bg: '#EFF6FF',
            color: '#1E40AF',
        },
        [JOB_STATUSES.ASSIGNED]: {
            label: 'Expert selected',
            bg: '#ECFDF5',
            color: '#047857',
        },
        [JOB_STATUSES.AWAITING_FUNDING]: {
            label: 'Payment required',
            bg: '#FFEDD5',
            color: '#9A3412',
        },
        [JOB_STATUSES.FUNDED]: {
            label: 'Payment secured',
            bg: '#D1FAE5',
            color: '#065F46',
        },
        [JOB_STATUSES.IN_PROGRESS]: {
            label: 'In progress',
            bg: '#E0F2FE',
            color: '#075985',
        },
        [JOB_STATUSES.COMPLETED]: {
            label: 'Awaiting approval',
            bg: '#EDE9FE',
            color: '#5B21B6',
        },
        [JOB_STATUSES.PAID]: {
            label: 'Completed',
            bg: '#DCFCE7',
            color: '#166534',
        },
        [JOB_STATUSES.DISPUTED]: {
            label: 'Under review',
            bg: '#EEF2FF',
            color: '#4338CA',
        },
        [JOB_STATUSES.CANCELLED]: {
            label: 'Task cancelled',
            bg: '#F3F4F6',
            color: '#6B7280',
        },
        [JOB_STATUSES.REFUND_PENDING]: {
            label: 'Refund in progress',
            bg: '#F0FDFA',
            color: '#0F766E',
        },
        [JOB_STATUSES.REFUNDED]: {
            label: 'Refund completed',
            bg: '#F8FAFC',
            color: '#475569',
        },
    };
    return map[s] || map[JOB_STATUSES.OPEN];
}

/**
 * Human-readable progress line (no step numbers).
 * @param {object} [job] When set, avoids duplicating OPEN + no-quotes copy shown on the status badge / optional hint.
 */
export function getClientProgressLine(normalizedStatus, job) {
    const s = normalizeStatus(normalizedStatus);
    if (s === JOB_STATUSES.CANCELLED) return 'This task was cancelled';

    if (s === JOB_STATUSES.REFUND_PENDING) return 'Refund in progress';
    if (s === JOB_STATUSES.REFUNDED) return 'Refund completed';

    if ([JOB_STATUSES.OPEN, JOB_STATUSES.QUOTED, JOB_STATUSES.ASSIGNED].includes(s)) {
        if (job && s === JOB_STATUSES.OPEN && (job.quoteCount || 0) === 0) {
            return '';
        }
        return 'Experts are reviewing your job';
    }
    if (s === JOB_STATUSES.AWAITING_FUNDING) {
        if (job && isEscrowFunded(job)) {
            return '';
        }
        return 'Complete payment to secure your booking';
    }
    if (s === JOB_STATUSES.FUNDED || s === JOB_STATUSES.IN_PROGRESS) {
        return 'Your expert is working on this task';
    }
    if (s === JOB_STATUSES.COMPLETED) {
        return "Review the work and release payment when you're satisfied";
    }
    if (s === JOB_STATUSES.PAID) {
        return 'This job is complete';
    }
    if (s === JOB_STATUSES.DISPUTED) {
        return "Issue reported — we're reviewing this";
    }
    return '';
}

/**
 * CTA visual tier for dashboard cards (primary = urgent solid, secondary = outline, passive = ghost).
 * @returns {'primaryPayment'|'primaryApprove'|'secondary'|'passive'}
 */
export function getClientDashboardCtaTier(normalizedStatus, job) {
    const s = normalizeStatus(normalizedStatus);
    if (s === JOB_STATUSES.AWAITING_FUNDING && job && isEscrowFunded(job)) return 'secondary';
    if (s === JOB_STATUSES.AWAITING_FUNDING) return 'primaryPayment';
    if (s === JOB_STATUSES.COMPLETED) return 'primaryApprove';
    if (s === JOB_STATUSES.FUNDED || s === JOB_STATUSES.IN_PROGRESS) return 'secondary';
    return 'passive';
}

/**
 * Button label — short, action-focused dashboard copy.
 */
export function getClientDashboardCtaLabel(normalizedStatus, jobId, job) {
    const s = normalizeStatus(normalizedStatus);
    if (s === JOB_STATUSES.AWAITING_FUNDING && job && isEscrowFunded(job)) return 'Chat with Expert';
    if (s === JOB_STATUSES.AWAITING_FUNDING) return 'Pay & start job';
    if (s === JOB_STATUSES.COMPLETED) return 'Approve & release payment';
    const action = getPrimaryAction(normalizedStatus, jobId);
    if (!action) return 'View details';
    if (action.label === 'View task') return 'View details';
    if (action.label === 'Message expert') return 'Chat with Expert';
    return action.label;
}

/**
 * Same derived display status as the legacy dashboard (invites vs quotes).
 */
export function deriveClientDashboardNormalizedStatus(job) {
    const quoteCount = job.quoteCount || 0;
    const hasAccepted = Boolean(job.acceptedQuoteId);
    const raw = normalizeStatus(job.status);
    if (
        [
            JOB_STATUSES.REFUND_PENDING,
            JOB_STATUSES.REFUNDED,
            JOB_STATUSES.CANCELLED,
            JOB_STATUSES.DISPUTED,
            JOB_STATUSES.PAID,
        ].includes(raw)
    ) {
        return raw;
    }
    if ((raw === JOB_STATUSES.ASSIGNED || raw === JOB_STATUSES.AWAITING_FUNDING) && !hasAccepted) {
        return quoteCount > 0 ? JOB_STATUSES.QUOTED : JOB_STATUSES.OPEN;
    }
    if (raw === JOB_STATUSES.QUOTED && quoteCount === 0) return JOB_STATUSES.OPEN;
    return raw;
}

function getMillis(job) {
    const u = job.updatedAt;
    const c = job.createdAt;
    if (u && typeof u._seconds === 'number') return u._seconds * 1000;
    if (c && typeof c._seconds === 'number') return c._seconds * 1000;
    return 0;
}

function jobHasUnread(job, unreadByJobId = {}) {
    return Math.max(0, Number(unreadByJobId[job.id] || 0)) > 0;
}

function needsActionRank(n) {
    if (n === JOB_STATUSES.AWAITING_FUNDING) return 0;
    if (n === JOB_STATUSES.COMPLETED) return 1;
    if (n === JOB_STATUSES.REFUND_PENDING) return 1;
    if (n === JOB_STATUSES.DISPUTED) return 2;
    return 3;
}

/**
 * @returns {{ needsAction: object[], inProgress: object[], completed: object[] }}
 */
export function groupClientDashboardJobs(jobs, unreadByJobId = {}) {
    const needsAction = [];
    const inProgress = [];
    const completed = [];

    for (const job of jobs) {
        const n = deriveClientDashboardNormalizedStatus(job);
        if (
            [JOB_STATUSES.AWAITING_FUNDING, JOB_STATUSES.COMPLETED, JOB_STATUSES.DISPUTED, JOB_STATUSES.REFUND_PENDING].includes(
                n,
            )
        ) {
            needsAction.push(job);
        } else if (
            [JOB_STATUSES.PAID, JOB_STATUSES.CANCELLED, JOB_STATUSES.REFUNDED].includes(n)
        ) {
            completed.push(job);
        } else {
            inProgress.push(job);
        }
    }

    const byRecent = (a, b) => getMillis(b) - getMillis(a);
    const byNeeds = (a, b) => {
        const ua = jobHasUnread(a, unreadByJobId) ? 0 : 1;
        const ub = jobHasUnread(b, unreadByJobId) ? 0 : 1;
        if (ua !== ub) return ua - ub;
        const na = deriveClientDashboardNormalizedStatus(a);
        const nb = deriveClientDashboardNormalizedStatus(b);
        const r = needsActionRank(na) - needsActionRank(nb);
        if (r !== 0) return r;
        return getMillis(b) - getMillis(a);
    };

    needsAction.sort(byNeeds);
    inProgress.sort(byRecent);
    completed.sort(byRecent);

    return { needsAction, inProgress, completed };
}

/**
 * Visible needs-action cards for dashboard: highest-priority first, optional unread reserve when capped.
 * `needsAction` must already be sorted (e.g. from groupClientDashboardJobs).
 */
export function selectVisibleClientNeedsActionJobs(needsAction, unreadByJobId = {}, limit) {
    if (!Number.isFinite(limit) || limit <= 0) return [];
    const list = Array.isArray(needsAction) ? needsAction : [];
    if (list.length <= limit) return [...list];

    const top = list.slice(0, limit);
    const topIds = new Set(top.map((j) => j.id));
    const withUnreadOutside = list.filter((j) => !topIds.has(j.id) && jobHasUnread(j, unreadByJobId));
    if (withUnreadOutside.length === 0) return top;

    const inject = withUnreadOutside[0];
    const merged = top.slice(0, -1);
    merged.push(inject);
    const outIds = merged.map((j) => j.id);
    if (new Set(outIds).size !== outIds.length) return top;
    return merged;
}

/**
 * Optional hint below progress (quotes / long-running / dispute).
 * @returns {{ show: boolean, message: string, hint?: string }}
 */
export function getOptionalCardContext(job, normalized) {
    const n = normalizeStatus(normalized);
    const now = Date.now();
    const createdAt = job.createdAt?._seconds ? job.createdAt._seconds * 1000 : 0;
    const hoursSinceCreated = createdAt ? (now - createdAt) / (1000 * 60 * 60) : 0;

    if (n === JOB_STATUSES.IN_PROGRESS && hoursSinceCreated > 168) {
        return { show: true, message: 'Running longer than usual — check in with your expert' };
    }

    return { show: false, message: '' };
}

const STALE_NEEDS_ACTION_DAYS = 3;

/**
 * Days a needs-action task has been waiting (from post time). Returns null if not stale enough to nudge.
 */
export function getNeedsActionStaleDays(job) {
    const n = deriveClientDashboardNormalizedStatus(job);
    if (
        ![JOB_STATUSES.AWAITING_FUNDING, JOB_STATUSES.COMPLETED, JOB_STATUSES.DISPUTED, JOB_STATUSES.REFUND_PENDING].includes(n)
    ) {
        return null;
    }
    const createdMs = job.createdAt?._seconds ? job.createdAt._seconds * 1000 : 0;
    if (!createdMs) return null;
    const days = Math.floor((Date.now() - createdMs) / (86400000));
    return days > STALE_NEEDS_ACTION_DAYS ? days : null;
}

/**
 * Stale nudge copy for needs-action cards (payment vs approval vs other).
 */
export function getNeedsActionStaleLabel(normalizedStatus, days) {
    const s = normalizeStatus(normalizedStatus);
    const n = typeof days === 'number' && Number.isFinite(days) ? Math.max(0, Math.floor(days)) : 0;
    if (s === JOB_STATUSES.COMPLETED) {
        return `Waiting for your approval • ${n} days`;
    }
    if (s === JOB_STATUSES.REFUND_PENDING) {
        return `Refund in progress • ${n} days`;
    }
    return `Pending your action • ${n} days`;
}

