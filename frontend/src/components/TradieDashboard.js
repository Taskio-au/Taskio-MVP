import React, { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import AppHeader from './AppHeader';
import TradieReviewsSection from './tradie/TradieReviewsSection';
import TradieChecklistModal from './tradie/TradieChecklistModal';
import TradieExpertPageStyles from './tradie/TradieExpertPageStyles';
import TradieJobCardsGrid from './tradie/TradieJobCardsGrid';
import { EXPERT_LABEL } from '../utils/roleLabels';
import { EXPERT_QUOTE_READINESS, EXPERT_QUOTE_READINESS_PENDING_ADMIN } from '../constants/blockedFlowCopy';
import { tradieDashboardStyles } from '../styles/tradieDashboardStyles';
import {
    getTimeOfDay,
    computeExpertStats,
    scoreExpertAttentionJobs,
    selectNeedsAttentionJobsFromScored,
} from '../utils/tradieDashboard';
import { useExpertDashboardData } from '../hooks/useExpertDashboardData';
import { useDashboardAttentionLimit } from '../hooks/useDashboardAttentionLimit';
import { InlineLoadingCard, InlineErrorCard } from './ui/AsyncPageStates';
import PageMain from './ui/PageMain';
import ExpertFeeProgramCard from './expert/ExpertFeeProgramCard';

const styles = tradieDashboardStyles;

/** Compact star row — uses Unicode ★/☆ in gold/grey, no emoji. */
function StarRatingRow({ rating, max = 5 }) {
    const filled = Math.round(Math.min(Math.max(rating, 0), max));
    return (
        <span
            aria-label={`Average rating ${rating} out of ${max}`}
            style={styles.statRatingStars}
        >
            {Array.from({ length: max }, (_, i) => (
                <span
                    key={i}
                    aria-hidden="true"
                    style={{ color: i < filled ? '#F59E0B' : '#D1D5DB', fontSize: 18, lineHeight: 1 }}
                >
                    ★
                </span>
            ))}
        </span>
    );
}

function ExpertDashboard() {
    const navigate = useNavigate();
    const {
        user,
        jobs,
        loading,
        error,
        stripeStatus,
        reviews,
        reviewSummary,
        canQuote,
        pendingDeletion,
        eligibilityChecklist,
        fetchDashboardData,
        startStripeOnboarding,
        cancelDeletion,
        refreshingStripe,
        setRefreshingStripe,
        stripeBannerDismissed,
        setStripeBannerDismissed,
        checklistOpen,
        setChecklistOpen,
        quoteReadinessAwaitingAdminOnly,
        deletionCancelling,
        unreadByJobId,
        me,
        meApiUnreachable,
    } = useExpertDashboardData();

    const feeProgramProfile = me?.foundingExpertFeeProfile ?? null;
    const feeProgramCompact =
        meApiUnreachable ||
        !feeProgramProfile ||
        String(feeProgramProfile.stage || '') === 'standard_launch';

    const attentionLimit = useDashboardAttentionLimit();

    const attentionScored = useMemo(
        () => scoreExpertAttentionJobs(jobs, unreadByJobId),
        [jobs, unreadByJobId]
    );
    const attentionTotalCount = attentionScored.length;
    const needsAttentionJobs = useMemo(
        () => selectNeedsAttentionJobsFromScored(attentionScored, { limit: attentionLimit }),
        [attentionScored, attentionLimit]
    );
    const attentionHiddenCount = Math.max(0, attentionTotalCount - needsAttentionJobs.length);

    const stats = useMemo(() => computeExpertStats(jobs), [jobs]);

    if (loading || error) {
        return (
            <>
                <AppHeader
                    userRole="tradie"
                    userName={user?.displayName || ''}
                    userEmail={user?.email || ''}
                />
                <PageMain label="Expert dashboard">
                    <div style={styles.dashboardShell} className="tradie-dashboard-shell">
                        <div style={styles.dashboardContainer} className="tradie-dashboard-container">
                            <div style={styles.welcomeSection}>
                                <div style={styles.greeting} className="tradie-greeting">{EXPERT_LABEL} dashboard</div>
                                <div style={styles.subGreeting}>
                                    {loading ? 'Loading your invites, profile status, and active tasks.' : 'We hit a problem loading your dashboard.'}
                                </div>
                            </div>
                            <div
                                style={{
                                    ...styles.emptyState,
                                    minHeight: 280,
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    padding: '12px 0',
                                }}
                            >
                                {loading ? (
                                    <InlineLoadingCard
                                        message="Loading your dashboard…"
                                        detail="Fetching your tasks, reviews, and account status."
                                    />
                                ) : (
                                    <InlineErrorCard
                                        title="We couldn’t load your dashboard"
                                        message={error}
                                        onRetry={() => fetchDashboardData()}
                                        retryLabel="Try again"
                                    />
                                )}
                            </div>
                        </div>
                    </div>
                </PageMain>
            </>
        );
    }

    return (
        <>
            <TradieExpertPageStyles />
            <AppHeader
                userRole="tradie"
                userName={user?.displayName || ''}
                userEmail={user?.email || ''}
            />
            <PageMain label="Expert dashboard">
            <div style={styles.dashboardShell} className="tradie-dashboard-shell">
                <div style={styles.dashboardContainer} className="tradie-dashboard-container">
                    <div style={styles.welcomeSection}>
                        <div style={styles.greeting} className="tradie-greeting">Good {getTimeOfDay()}, {user?.displayName?.split(' ')[0] || 'there'}</div>
                        <div style={styles.subGreeting}>
                            What needs your attention first — then open Tasks for search, filters, and your full list.
                        </div>
                    </div>

                    {!canQuote && !pendingDeletion && (
                    <div style={styles.quoteEligibilityBanner}>
                        <div style={{ flex: 1 }}>
                            <div style={styles.quoteEligibilityTitle}>
                                {quoteReadinessAwaitingAdminOnly
                                    ? EXPERT_QUOTE_READINESS_PENDING_ADMIN.title
                                    : EXPERT_QUOTE_READINESS.title}
                            </div>
                            <div style={styles.quoteEligibilityText}>
                                {quoteReadinessAwaitingAdminOnly
                                    ? EXPERT_QUOTE_READINESS_PENDING_ADMIN.body
                                    : EXPERT_QUOTE_READINESS.body}
                            </div>
                        </div>
                        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                            {!quoteReadinessAwaitingAdminOnly && (
                                <button
                                    type="button"
                                    style={styles.quoteEligibilityButton}
                                    onClick={() => navigate('/profile')}
                                >
                                    {EXPERT_QUOTE_READINESS.primaryCta}
                                </button>
                            )}
                            <button
                                type="button"
                                style={
                                    quoteReadinessAwaitingAdminOnly
                                        ? styles.quoteEligibilityButton
                                        : styles.quoteEligibilityButtonSecondary
                                }
                                onClick={() => setChecklistOpen(true)}
                            >
                                {EXPERT_QUOTE_READINESS.checklistCta}
                            </button>
                        </div>
                    </div>
                )}

                {pendingDeletion && (
                    <div style={styles.pendingDeletionBanner}>
                        <div style={{ flex: 1 }}>
                            <div style={{ fontWeight: 900, color: '#7c2d12', marginBottom: 4 }}>Account deletion requested</div>
                            <div style={{ fontSize: 13, color: '#7c2d12', lineHeight: 1.5 }}>
                                Your account is scheduled for deletion after the cooling-off period. You can cancel this request at any time before it’s executed.
                            </div>
                        </div>
                        <button
                            type="button"
                            style={styles.pendingDeletionCancelBtn}
                            onClick={cancelDeletion}
                            disabled={deletionCancelling}
                        >
                            {deletionCancelling ? 'Cancelling…' : 'Cancel deletion'}
                        </button>
                    </div>
                )}

                <div style={styles.statsSectionSecondary} className="tradie-stats-summary-wrap" aria-label="Summary at a glance">
                    <div style={styles.statsGrid} className="tradie-stats-grid">
                        <div style={styles.statCard}>
                            <div style={styles.statLabel}>Active tasks</div>
                            <div style={styles.statValue}>{stats.active}</div>
                        </div>
                        <div style={styles.statCard}>
                            <div style={styles.statLabel}>In progress</div>
                            <div style={styles.statValue}>{stats.inProgress}</div>
                        </div>
                        <div style={styles.statCard}>
                            <div style={styles.statLabel}>Completed</div>
                            <div style={styles.statValue}>{stats.completed}</div>
                        </div>
                        <div style={styles.statCard}>
                            <div style={styles.statLabel}>Avg rating</div>
                            {reviewSummary.averageRating ? (
                                <>
                                    <div style={styles.statRatingRow}>
                                        <StarRatingRow rating={reviewSummary.averageRating} />
                                        <span style={styles.statRatingNumber}>{reviewSummary.averageRating.toFixed(1)}</span>
                                    </div>
                                    <div style={styles.statSubLabel}>
                                        Based on {reviewSummary.reviewCount} review{reviewSummary.reviewCount !== 1 ? 's' : ''}
                                    </div>
                                </>
                            ) : (
                                <>
                                    <div style={styles.statRatingEmpty}>No reviews yet</div>
                                    <div style={styles.statRatingEmptyHint}>
                                        Completed paid tasks can receive client reviews.
                                    </div>
                                </>
                            )}
                        </div>
                    </div>
                </div>

                {stripeStatus.enabled && stripeStatus.onboardingStatus === 'completed' && (
                    <div style={styles.stripeTrustBadge}>
                        <span>Secured by Stripe</span>
                    </div>
                )}

                {stripeStatus.enabled && stripeStatus.onboardingStatus !== 'completed' && !stripeBannerDismissed && (
                    <div style={styles.stripeBanner} className="tradie-stripe-banner">
                        <div style={{ flex: 1 }}>
                            <div style={styles.stripeBannerTitle}>
                                {stripeStatus.onboardingStatus === 'pending' ? 'Complete Stripe Setup' : 'Stripe Setup In Progress'}
                            </div>
                            <div style={styles.stripeBannerText}>
                                {stripeStatus.onboardingStatus === 'pending'
                                    ? 'Finish Stripe onboarding to submit quotes. Payouts are processed after the Client approves the completed work.'
                                    : 'Stripe may take a moment to update after onboarding. Refresh to sync your account.'}
                            </div>
                        </div>
                        <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                            <button
                                type="button"
                                className="tradie-stripe-btn-secondary"
                                style={styles.stripeButtonSecondary}
                                onClick={async () => {
                                    setRefreshingStripe(true);
                                    try {
                                        await fetchDashboardData({ forceStripeRefresh: true, preserveLoading: true });
                                    } finally {
                                        setRefreshingStripe(false);
                                    }
                                }}
                            >
                                {refreshingStripe ? 'Refreshing…' : 'Refresh Status'}
                            </button>
                            {stripeStatus.onboardingStatus === 'pending' && (
                                <button type="button" className="tradie-stripe-btn" style={styles.stripeButton} onClick={startStripeOnboarding}>
                                    Complete Setup
                                </button>
                            )}
                            <button
                                type="button"
                                className="tradie-dismiss-btn"
                                style={styles.dismissButton}
                                onClick={() => setStripeBannerDismissed(true)}
                                aria-label="Dismiss notification"
                            >
                                ×
                            </button>
                        </div>
                    </div>
                )}

                <ExpertFeeProgramCard
                    foundingExpertFeeProfile={feeProgramProfile}
                    compact={feeProgramCompact}
                    apiUnavailable={meApiUnreachable}
                />

                <section style={styles.needsAttentionPanel} className="tradie-needs-attention-panel" aria-labelledby="tradie-needs-attention-heading">
                    <div style={styles.needsAttentionPanelHeader}>
                        <div>
                            <div style={styles.needsAttentionEyebrow}>Today&apos;s focus</div>
                            <h2 id="tradie-needs-attention-heading" style={styles.needsAttentionTitle}>Needs attention</h2>
                            <p style={styles.needsAttentionHelper}>
                                Your most important tasks are shown here. View all tasks for the full list, search, and filters.
                            </p>
                            {attentionTotalCount > 0 ? (
                                <p style={styles.needsAttentionCountLine} className="tradie-needs-attention-count">
                                    {attentionHiddenCount > 0 ? (
                                        <>
                                            Showing {needsAttentionJobs.length} of {attentionTotalCount} priority items
                                        </>
                                    ) : (
                                        <>Showing all priority items</>
                                    )}
                                </p>
                            ) : null}
                        </div>
                        <button type="button" className="tradie-view-all-tasks-btn" style={styles.viewAllTasksButton} onClick={() => navigate('/tradie/jobs')}>
                            View all tasks
                        </button>
                    </div>
                    {attentionHiddenCount > 0 ? (
                        <div style={styles.needsAttentionOverflowRow} className="tradie-needs-attention-overflow">
                            <button
                                type="button"
                                className="tradie-view-more-tasks-link"
                                style={styles.needsAttentionMoreLink}
                                onClick={() => navigate('/tradie/jobs')}
                            >
                                View {attentionHiddenCount} more in Tasks
                            </button>
                        </div>
                    ) : null}

                    {needsAttentionJobs.length === 0 ? (
                        <div style={{ ...styles.emptyState, marginTop: 8 }}>
                            <div style={styles.emptyTitle}>You&apos;re caught up</div>
                            <div style={styles.emptyText}>
                                {jobs.length === 0
                                    ? 'We’ll notify you when tasks matching your skills are available.'
                                    : 'No urgent items right now. Open Tasks to browse or filter your invitations.'}
                            </div>
                            <button
                                type="button"
                                style={{ ...styles.ctaButton, maxWidth: 280, margin: '20px auto 0' }}
                                onClick={() => navigate('/tradie/jobs')}
                            >
                                Open Tasks
                            </button>
                        </div>
                    ) : (
                        <TradieJobCardsGrid
                            jobs={needsAttentionJobs}
                            unreadByJobId={unreadByJobId}
                            styles={styles}
                            gridClassName="tradie-dashboard-attention-grid"
                        />
                    )}
                </section>

                <TradieReviewsSection reviewSummary={reviewSummary} reviews={reviews} styles={styles} />
                <TradieChecklistModal
                    open={checklistOpen}
                    eligibilityChecklist={eligibilityChecklist}
                    awaitingAdminOnly={quoteReadinessAwaitingAdminOnly}
                    onClose={() => setChecklistOpen(false)}
                    onGoProfile={() => navigate('/profile')}
                    styles={styles}
                />
                </div>
            </div>
            </PageMain>
        </>
    );
}
export default ExpertDashboard;
