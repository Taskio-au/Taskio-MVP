import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Star } from 'lucide-react';
import { JOB_STATUSES, getPrimaryAction } from '../../constants/jobStatuses';
import {
    deriveClientDashboardNormalizedStatus,
    getClientDashboardCtaLabel,
    getClientDashboardCtaTier,
    getClientDashboardStatusPresentation,
    getClientProgressLine,
    isEscrowFunded,
    getNeedsActionStaleDays,
    getNeedsActionStaleLabel,
    getOptionalCardContext,
    getShortJobRef,
} from '../../utils/homeownerDashboardCards';
import { fullTaskDisplayTitle } from '../../utils/jobDisplayFromJob';
import {
    expertTrustBadgeLabel,
    formatAssignedExpertLine,
    hasExpertRatingRow,
} from '../../utils/clientDashboardTrustSignals';

/**
 * Balanced marketplace-style task card: title + status, meta, progress line, divider, single CTA.
 */
export default function ClientDashboardTaskCard({ job, styles, formatDate, unreadByJobId, needsActionSection }) {
    const navigate = useNavigate();
    const [paymentCtaBusy, setPaymentCtaBusy] = useState(false);
    const jobId =
        job?.id != null && String(job.id).trim() !== '' ? String(job.id).trim() : '';
    const titleDisplay = fullTaskDisplayTitle(job || {});

    const normalized = deriveClientDashboardNormalizedStatus(job || {});
    const escrowFunded = isEscrowFunded(job || {});
    const statusPresentation =
        normalized === JOB_STATUSES.AWAITING_FUNDING && escrowFunded
            ? getClientDashboardStatusPresentation(JOB_STATUSES.FUNDED)
            : getClientDashboardStatusPresentation(normalized);
    const primaryAction = jobId ? getPrimaryAction(normalized, jobId) : null;
    const ctaLabel = getClientDashboardCtaLabel(normalized, jobId, job);
    const ctaTier = getClientDashboardCtaTier(normalized, job);
    const progressLine = getClientProgressLine(normalized, job);
    const optionalCtx = getOptionalCardContext(job, normalized);
    const staleDays = needsActionSection ? getNeedsActionStaleDays(job) : null;
    const unreadCount = jobId ? Math.max(0, Number(unreadByJobId?.[jobId]) || 0) : 0;

    const metaParts = [];
    if (job?.budget) metaParts.push(String(job.budget));
    if (job?.location) metaParts.push(String(job.location));
    const posted = formatDate(job?.createdAt?._seconds ? new Date(job.createdAt._seconds * 1000).toISOString() : null);
    if (posted && posted !== 'N/A') metaParts.push(posted);

    const goDetail = () => {
        if (!jobId) return;
        navigate(`/job/${jobId}`);
    };

    const isPayPath =
        normalized === JOB_STATUSES.AWAITING_FUNDING &&
        Boolean(job?.acceptedQuoteId) &&
        !escrowFunded;
    const ctaDisabled =
        !jobId ||
        !primaryAction?.route ||
        (typeof primaryAction.route === 'string' && primaryAction.route.trim() === '') ||
        (isPayPath && paymentCtaBusy);

    const isAwaitingQuotes = normalized === JOB_STATUSES.OPEN && (job.quoteCount || 0) === 0;
    const expertAssigned = job.expertAssigned === true;
    const expert = job.expert;
    const assignedLine = expertAssigned && expert ? formatAssignedExpertLine(expert) : null;
    const ratingRow = Boolean(expertAssigned && expert && hasExpertRatingRow(expert));
    const jobsLine =
        expertAssigned &&
        expert &&
        typeof expert.jobsCompleted === 'number' &&
        Number.isFinite(expert.jobsCompleted);
    const ratingBadge = ratingRow && expert?.rating != null ? expertTrustBadgeLabel(expert.rating) : null;
    const hasExpertContent = Boolean(assignedLine || ratingRow || jobsLine);
    /** Never show expert block during payment required; other stages only when real data exists. */
    const showExpertBlock =
        normalized !== JOB_STATUSES.AWAITING_FUNDING && expertAssigned && expert && hasExpertContent;
    /** "Assigned to …" only when formatter produced a real line (never empty / placeholder). */
    const showAssignedNameLine = Boolean(assignedLine) && showExpertBlock;
    const showExpertTrustRows = showExpertBlock && (ratingRow || jobsLine);

    const ctaStyle =
        ctaTier === 'primaryPayment'
            ? styles.ctaPrimaryPayment
            : ctaTier === 'primaryApprove'
              ? styles.ctaPrimaryApprove
              : ctaTier === 'secondary'
                ? styles.ctaSecondary
                : styles.ctaPassive;

    const progressLineStyle = needsActionSection
        ? { ...styles.progressLine, marginBottom: '1px' }
        : styles.progressLine;
    const staleHintStyle = needsActionSection
        ? { ...styles.staleHint, marginTop: '2px' }
        : styles.staleHint;
    const cardDividerStyle = needsActionSection
        ? { ...styles.cardDivider, margin: '8px 0 0' }
        : styles.cardDivider;
    const ctaMarginStyle = needsActionSection ? { marginTop: '11px' } : {};

    return (
        <div
            className="homeowner-job-card"
            style={styles.jobCard}
            tabIndex={jobId ? 0 : -1}
            role={jobId ? 'button' : 'group'}
            aria-label={jobId ? `View task: ${titleDisplay}` : titleDisplay}
            onClick={jobId ? goDetail : undefined}
            onKeyDown={
                jobId
                    ? (e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                              e.preventDefault();
                              goDetail();
                          }
                      }
                    : undefined
            }
        >
            <div style={styles.cardHeaderRow} className="homeowner-card-header-row">
                <div style={styles.titleCluster}>
                    <h2 style={styles.jobTitle}>{titleDisplay}</h2>
                    {unreadCount > 0 && (
                        <span style={styles.unreadBadge} aria-label={`${unreadCount} unread messages`}>
                            {unreadCount > 9 ? '9+' : unreadCount}
                        </span>
                    )}
                </div>
                <div style={styles.cardHeaderRight}>
                    <span
                        className="homeowner-status-badge-wrap"
                        style={{
                            ...styles.statusBadge,
                            backgroundColor: statusPresentation.bg,
                            color: statusPresentation.color,
                            border: 'none',
                        }}
                    >
                        {statusPresentation.label}
                    </span>
                </div>
            </div>

            <div style={styles.jobMeta}>{metaParts.join(' · ')}</div>

            {isAwaitingQuotes && !expertAssigned ? (
                <div style={styles.cardGuidanceBlock}>
                    <div style={styles.cardGuidancePrimary}>
                        Experts are reviewing your job. You&apos;ll receive quotes soon.
                    </div>
                </div>
            ) : null}

            {progressLine ? (
                <div style={progressLineStyle} aria-label={progressLine}>
                    {progressLine}
                </div>
            ) : null}

            {normalized === JOB_STATUSES.AWAITING_FUNDING && job?.acceptedQuoteId && !escrowFunded ? (
                <div style={styles.paymentEscrowHint}>
                    Your payment is held securely until the job is completed.
                </div>
            ) : null}

            {showExpertBlock ? (
                <div style={styles.expertTrustBlock}>
                    {showAssignedNameLine ? <div style={styles.expertTrustName}>{assignedLine}</div> : null}
                    {showExpertTrustRows && ratingRow ? (
                        <div style={styles.expertTrustRatingRow}>
                            <Star
                                size={14}
                                strokeWidth={0}
                                fill="#F59E0B"
                                color="#F59E0B"
                                aria-hidden
                                style={styles.expertTrustStarIcon}
                            />
                            <span>
                                {expert.rating.toFixed(1)} ({expert.reviewsCount} reviews)
                            </span>
                            {ratingBadge ? (
                                <span style={styles.expertTrustRatedBadge}>{ratingBadge}</span>
                            ) : null}
                        </div>
                    ) : null}
                    {showExpertTrustRows && jobsLine ? (
                        <div style={styles.expertTrustJobsLine}>{expert.jobsCompleted} jobs completed</div>
                    ) : null}
                </div>
            ) : null}

            {optionalCtx.show && optionalCtx.message ? (
                <div style={styles.optionalContextLine}>{optionalCtx.message}</div>
            ) : null}
            {optionalCtx.show && optionalCtx.hint ? (
                <div style={styles.optionalContextHint}>{optionalCtx.hint}</div>
            ) : null}

            {staleDays != null && typeof staleDays === 'number' ? (
                <div style={staleHintStyle} aria-live="polite">
                    {getNeedsActionStaleLabel(normalized, staleDays)}
                </div>
            ) : null}

            <div style={cardDividerStyle} role="presentation" />

            {primaryAction && (
                <button
                    type="button"
                    className={`homeowner-cta-btn homeowner-cta-${ctaTier}`}
                    disabled={ctaDisabled}
                    style={{
                        ...styles.ctaButtonBase,
                        ...ctaStyle,
                        ...ctaMarginStyle,
                        ...(ctaDisabled ? { opacity: 0.55, cursor: 'not-allowed' } : {}),
                    }}
                    onClick={(e) => {
                        e.stopPropagation();
                        if (ctaDisabled) return;
                        if (isPayPath) {
                            setPaymentCtaBusy(true);
                            navigate(`/payment/${jobId}/${job.acceptedQuoteId}`);
                            return;
                        }
                        navigate(primaryAction.route);
                    }}
                >
                    {paymentCtaBusy && isPayPath ? 'Opening payment…' : ctaLabel || 'View details'}
                </button>
            )}

            <div style={styles.taskRefLine}>
                Ref: {getShortJobRef(job || {})}
            </div>
        </div>
    );
}
