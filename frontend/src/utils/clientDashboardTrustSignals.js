import { JOB_STATUSES } from '../constants/jobStatuses';

/**
 * Awaiting quotes — show marketplace response hint only when backend provides a label.
 */
export function showAwaitingQuotesResponseLine(job, normalized) {
    const label = job?.avgResponseTimeLabel ?? job?.marketplaceAvgResponse;
    const hasLabel = typeof label === 'string' && label.trim().length > 0;
    return normalized === JOB_STATUSES.OPEN && (job.quoteCount || 0) === 0 && hasLabel;
}

export function getAwaitingQuotesResponseLabel(job) {
    const v = job?.avgResponseTimeLabel ?? job?.marketplaceAvgResponse;
    return typeof v === 'string' ? v.trim() : '';
}

/**
 * "Assigned to …" only when we have a displayable name (real data only).
 */
export function formatAssignedExpertLine(expert) {
    if (!expert || typeof expert !== 'object') return null;
    const first = expert.firstName && String(expert.firstName).trim();
    const li = expert.lastInitial && String(expert.lastInitial).trim();
    if (first && li) {
        return `Assigned to ${first} ${li}`;
    }
    const name = expert.name && String(expert.name).trim();
    if (name) {
        return `Assigned to ${name}`;
    }
    if (first) {
        return `Assigned to ${first}`;
    }
    return null;
}

/**
 * Rating row: both must be present (real aggregates).
 */
export function hasExpertRatingRow(expert) {
    if (!expert || typeof expert !== 'object') return false;
    const r = expert.rating;
    const c = expert.reviewsCount;
    return typeof r === 'number' && Number.isFinite(r) && typeof c === 'number' && c > 0;
}

export function expertTrustBadgeLabel(rating) {
    if (typeof rating !== 'number' || !Number.isFinite(rating)) return null;
    if (rating >= 4.8) return 'Top rated';
    if (rating >= 4.5) return 'Highly rated';
    return null;
}
