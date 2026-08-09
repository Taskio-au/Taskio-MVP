// src/components/HomeownerDashboard.js
import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuthState } from 'react-firebase-hooks/auth';
import { SquarePen } from 'lucide-react';
import { auth } from '../firebase';
import { createApiClient } from '../api/createApiClient';
import AppHeader from './AppHeader';
import ClientDashboardTaskCard from './homeowner/ClientDashboardTaskCard';
import { useChatThreads } from '../hooks/useMessagingSummary';
import { groupClientDashboardJobs, selectVisibleClientNeedsActionJobs } from '../utils/homeownerDashboardCards';
import { useDashboardAttentionLimit } from '../hooks/useDashboardAttentionLimit';
import { ErrorStateCard } from './ui/AsyncPageStates';
import PageMain from './ui/PageMain';

const api = createApiClient();

const SKELETON_CARDS_PER_SECTION = 3;

function DashboardTaskCardSkeleton() {
    const bar = (width, height, marginBottom = '8px') => (
        <div
            className="homeowner-skeleton-bar"
            style={{
                width,
                height,
                marginBottom,
                backgroundColor: '#EEF2F6',
                borderRadius: '6px',
            }}
            aria-hidden
        />
    );
    return (
        <div className="homeowner-skeleton-card" style={styles.jobCard} aria-hidden tabIndex={-1}>
            <div
                style={{
                    display: 'flex',
                    flexDirection: 'row',
                    justifyContent: 'space-between',
                    alignItems: 'flex-start',
                    gap: '14px',
                    marginBottom: '10px',
                }}
            >
                {bar('68%', '18px', '0')}
                {bar('72px', '22px', '0')}
            </div>
            {bar('42%', '13px')}
            {bar('88%', '13px', '2px')}
            {bar('72%', '13px', '2px')}
            <div style={styles.cardDivider} role="presentation" />
            {bar('100%', '38px', '0')}
        </div>
    );
}

function ClientDashboard() {
    const [jobs, setJobs] = useState([]);
    const [loading, setLoading] = useState(true);
    const [fetchError, setFetchError] = useState(false);
    const navigate = useNavigate();
    const [user] = useAuthState(auth);
    const { unreadByJobId } = useChatThreads(user, 100);

    const [searchParams] = useSearchParams();
    const showAllPriority = searchParams.get('priority') === 'all';
    const attentionLimit = useDashboardAttentionLimit();

    const grouped = useMemo(
        () => groupClientDashboardJobs(Array.isArray(jobs) ? jobs : [], unreadByJobId),
        [jobs, unreadByJobId]
    );

    const visibleNeedsAction = useMemo(() => {
        const full = grouped.needsAction;
        if (showAllPriority) return full;
        return selectVisibleClientNeedsActionJobs(full, unreadByJobId, attentionLimit);
    }, [grouped.needsAction, unreadByJobId, attentionLimit, showAllPriority]);

    const needsAttentionTotal = grouped.needsAction.length;
    const needsAttentionHidden = showAllPriority ? 0 : Math.max(0, needsAttentionTotal - visibleNeedsAction.length);

    useEffect(() => {
        if (!showAllPriority) return;
        const t = window.setTimeout(() => {
            document.getElementById('homeowner-priority-needs')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }, 50);
        return () => window.clearTimeout(t);
    }, [showAllPriority]);

    const helperLine = useMemo(() => {
        if (loading) return 'Loading your tasks…';
        if (fetchError) return '';
        const n = grouped.needsAction.length;
        if (n > 0) {
            return n === 1
                ? 'You have 1 task that needs your attention'
                : `You have ${n} tasks that need your attention`;
        }
        return 'All your tasks are on track';
    }, [loading, fetchError, grouped.needsAction.length]);

    const getTimeOfDay = () => {
        const hour = new Date().getHours();
        if (hour < 12) return 'morning';
        if (hour < 18) return 'afternoon';
        return 'evening';
    };

    const loadJobs = useCallback(async () => {
        if (!user) {
            setLoading(false);
            navigate('/login');
            return;
        }

        try {
            setLoading(true);
            setFetchError(false);
            const token = await user.getIdToken();
            const config = { headers: { Authorization: `Bearer ${token}` } };
            const response = await api.get('/api/homeowner/jobs', config);
            const data = response?.data;
            setJobs(Array.isArray(data) ? data : []);
        } catch (err) {
            console.error('Error fetching jobs:', err);
            setFetchError(true);
            setJobs([]);
        } finally {
            setLoading(false);
        }
    }, [user, navigate]);

    useEffect(() => {
        loadJobs();
    }, [loadJobs]);

    const formatDate = (dateString) => {
        if (!dateString) return 'N/A';
        const date = new Date(dateString);
        const now = new Date();
        const diffTime = Math.abs(now - date);
        const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));

        if (diffDays === 0) return 'Today';
        if (diffDays === 1) return 'Yesterday';
        if (diffDays < 7) return `${diffDays} days ago`;
        return date.toLocaleDateString('en-AU', { day: 'numeric', month: 'short' });
    };

    const renderSection = (title, subtitle, list, variant = 'default', empty = {}) => {
        const { emptyMessage, emptyCtaLabel, onEmptyCta, hideWhenEmpty } = empty;
        const shellStyle = variant === 'needsAction' ? styles.sectionNeedsActionShell : styles.sectionDefaultShell;

        const sectionClass =
            variant === 'needsAction' ? 'homeowner-section-priority' : 'homeowner-section-standard';

        const isEmpty = !list || list.length === 0;
        if (hideWhenEmpty && isEmpty) return null;

        return (
            <section style={styles.sectionBlock} key={title}>
                <div style={shellStyle} className={sectionClass}>
                    <div style={styles.sectionHeader}>
                        {variant === 'needsAction' ? <div style={styles.sectionEyebrow}>Priority</div> : null}
                        <h2
                            style={
                                variant === 'needsAction'
                                    ? styles.sectionHeadingPriority
                                    : title === 'In progress'
                                      ? styles.sectionHeadingMuted
                                      : styles.sectionHeading
                            }
                        >
                            {title}
                        </h2>
                        {subtitle ? <p style={styles.sectionSub}>{subtitle}</p> : null}
                    </div>
                    {isEmpty ? (
                        <div style={styles.sectionEmpty}>
                            <p style={styles.sectionEmptyText}>{emptyMessage}</p>
                            {emptyCtaLabel && onEmptyCta ? (
                                <button
                                    type="button"
                                    onClick={onEmptyCta}
                                    style={{ ...styles.ctaButtonBase, ...styles.sectionEmptyCtaBtn }}
                                    className="homeowner-empty-section-cta"
                                >
                                    {emptyCtaLabel}
                                </button>
                            ) : null}
                        </div>
                    ) : (
                        <div style={styles.jobList} className="homeowner-job-list">
                            {list.map((job, idx) => (
                                <ClientDashboardTaskCard
                                    key={job?.id != null ? String(job.id) : `job-${idx}`}
                                    job={job}
                                    styles={styles}
                                    formatDate={formatDate}
                                    unreadByJobId={unreadByJobId}
                                    needsActionSection={variant === 'needsAction'}
                                />
                            ))}
                        </div>
                    )}
                </div>
            </section>
        );
    };

    const renderSkeletonSection = (title, subtitle, variant = 'default') => {
        const shellStyle = variant === 'needsAction' ? styles.sectionNeedsActionShell : styles.sectionDefaultShell;
        const sectionClass =
            variant === 'needsAction' ? 'homeowner-section-priority' : 'homeowner-section-standard';
        return (
            <section style={styles.sectionBlock} key={`sk-${title}`}>
                <div style={shellStyle} className={sectionClass} aria-busy="true">
                    <div style={styles.sectionHeader}>
                        {variant === 'needsAction' ? <div style={styles.sectionEyebrow}>Priority</div> : null}
                        <h2
                            style={
                                variant === 'needsAction' ? styles.sectionHeadingPriority : styles.sectionHeading
                            }
                        >
                            {title}
                        </h2>
                        {subtitle ? <p style={styles.sectionSub}>{subtitle}</p> : null}
                    </div>
                    <div style={styles.jobList} className="homeowner-job-list">
                        {Array.from({ length: SKELETON_CARDS_PER_SECTION }).map((_, i) => (
                            <DashboardTaskCardSkeleton key={i} />
                        ))}
                    </div>
                </div>
            </section>
        );
    };

    return (
        <>
            <style>{`
                .homeowner-skeleton-card {
                    pointer-events: none;
                    cursor: default;
                }
                .homeowner-job-card {
                    transition: all 150ms ease;
                    border: none;
                    box-shadow: 0 2px 6px rgba(0, 0, 0, 0.04);
                }
                .homeowner-section-priority .homeowner-job-card {
                    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.08);
                }
                .homeowner-job-card:hover {
                    transform: translateY(-2px);
                }
                .homeowner-section-standard .homeowner-job-card:hover {
                    box-shadow: 0 6px 16px rgba(15, 23, 42, 0.09);
                }
                .homeowner-section-priority .homeowner-job-card:hover {
                    box-shadow: 0 8px 22px rgba(15, 23, 42, 0.12);
                }
                .homeowner-job-card:focus {
                    outline: 2px solid #14C5C5;
                    outline-offset: 2px;
                }
                .homeowner-cta-btn {
                    transition: all 120ms ease;
                    transform-origin: center;
                }
                .homeowner-cta-primaryPayment:hover,
                .homeowner-cta-primaryApprove:hover {
                    filter: brightness(0.94);
                }
                .homeowner-cta-primaryPayment:active,
                .homeowner-cta-primaryApprove:active {
                    transform: scale(0.98);
                }
                .homeowner-cta-secondary:hover {
                    background-color: #F0FDFA !important;
                    border-color: #5EEAD4 !important;
                }
                .homeowner-cta-secondary:active {
                    transform: scale(0.98);
                }
                .homeowner-cta-passive:hover {
                    background-color: #F9FAFB !important;
                    border-color: #D1D5DB !important;
                    color: #111827 !important;
                }
                .homeowner-cta-passive:active {
                    transform: scale(0.98);
                }
                .homeowner-cta-btn:focus {
                    outline: 2px solid #14C5C5;
                    outline-offset: 2px;
                }
                @media (prefers-reduced-motion: reduce) {
                    .homeowner-job-card:hover {
                        transform: none;
                    }
                    .homeowner-cta-btn:active {
                        transform: none;
                    }
                }
                .homeowner-post-btn:hover {
                    background-color: #12B0B0;
                    transform: translateY(-1px);
                }
                .homeowner-post-btn:focus {
                    outline: 2px solid #14C5C5;
                    outline-offset: 2px;
                }
                .homeowner-profile-btn:focus {
                    outline: 2px solid #14C5C5;
                    outline-offset: 2px;
                }
                .homeowner-view-all-tasks-btn:hover {
                    background-color: #F0FAFA;
                    border-color: #12B0B0;
                }
                .homeowner-view-all-tasks-btn:focus {
                    outline: 2px solid #14C5C5;
                    outline-offset: 2px;
                }
                .homeowner-view-more-priority-btn:focus {
                    outline: 2px solid #14C5C5;
                    outline-offset: 2px;
                    border-radius: 4px;
                }
                @media (min-width: 768px) {
                    .homeowner-dashboard-attention-grid {
                        grid-template-columns: repeat(2, minmax(0, 1fr));
                    }
                }
                @media (min-width: 1024px) {
                    .homeowner-dashboard-attention-grid {
                        grid-template-columns: repeat(3, minmax(0, 1fr));
                    }
                }
                .homeowner-menu-item:hover {
                    background-color: #F7F9FA;
                }

                @media (max-width: 768px) {
                    .homeowner-dashboard-container {
                        padding: 16px !important;
                    }
                    .homeowner-job-list {
                        gap: 14px !important;
                    }
                    .homeowner-job-card {
                        padding: 17px !important;
                    }
                    .homeowner-card-header-row {
                        flex-direction: column !important;
                        align-items: flex-start !important;
                    }
                    .homeowner-status-badge-wrap {
                        align-self: flex-start !important;
                        max-width: 100% !important;
                    }
                    .homeowner-cta-btn {
                        width: 100% !important;
                    }
                    .homeowner-greeting {
                        font-size: 20px !important;
                    }
                }

                @media (max-width: 480px) {
                    .homeowner-dashboard-container {
                        padding: 12px !important;
                    }
                }
            `}</style>
            <AppHeader
                userRole="homeowner"
                userName={user?.displayName || ''}
                userEmail={user?.email || ''}
            />
            <PageMain label="Client dashboard">
            <div style={styles.dashboardShell} className="homeowner-dashboard-shell">
                <div style={styles.dashboardContainer} className="homeowner-dashboard-container">
                    <div style={styles.welcomeSection}>
                        <div style={styles.greeting} className="homeowner-greeting">
                            Good {getTimeOfDay()}, {user?.displayName?.split(' ')[0] || 'there'}
                        </div>
                        {helperLine ? <div style={styles.helperLine}>{helperLine}</div> : null}
                        <div style={styles.subGreeting}>Your tasks, what they need, and what to do next.</div>
                    </div>

                    {loading ? (
                        <>
                            {renderSkeletonSection(
                                'Needs your action',
                                'Complete these steps to move your jobs forward',
                                'needsAction'
                            )}
                            {renderSkeletonSection(
                                'In progress',
                                'Work is underway or awaiting action from experts',
                                'default'
                            )}
                            {renderSkeletonSection('Completed', 'Finished jobs and history', 'default')}
                        </>
                    ) : fetchError ? (
                        <div style={{ maxWidth: 480, margin: '0 auto', width: '100%' }}>
                            <ErrorStateCard
                                title="We couldn’t load your tasks"
                                message="Check your connection, then try again. Your tasks haven’t changed on the server."
                                onRetry={() => loadJobs()}
                                retryLabel="Try again"
                            />
                        </div>
                    ) : jobs.length === 0 ? (
                        <div style={styles.emptyState}>
                            <div style={styles.emptyIcon}>
                                <SquarePen size={40} strokeWidth={1.8} color="#14C5C5" />
                            </div>
                            <h3 style={styles.emptyTitle}>No tasks yet</h3>
                            <p style={styles.emptyText}>Post a task to get started</p>
                            <button
                                type="button"
                                onClick={() => navigate('/post-job')}
                                style={{ ...styles.ctaButtonBase, ...styles.ctaPost, padding: '16px 32px', fontSize: '16px' }}
                                className="homeowner-post-btn"
                            >
                                Post a task
                            </button>
                        </div>
                    ) : (
                        <>
                            {grouped.needsAction.length === 0 ? null : (
                                <section style={styles.sectionBlock} id="homeowner-priority-needs">
                                    <div style={styles.sectionNeedsActionShell} className="homeowner-section-priority">
                                        <div style={styles.needsActionHeaderRow}>
                                            <div style={{ flex: 1, minWidth: 0 }}>
                                                <div style={styles.sectionEyebrow}>Priority</div>
                                                <h2 style={styles.sectionHeadingPriority}>Needs your action</h2>
                                                <p style={styles.sectionSub}>
                                                    Your most important tasks are shown here. View all tasks for the full list.
                                                </p>
                                                {needsAttentionTotal > 0 ? (
                                                    <p style={styles.needsAttentionCountClient}>
                                                        {needsAttentionHidden > 0 && !showAllPriority ? (
                                                            <>
                                                                Showing {visibleNeedsAction.length} of {needsAttentionTotal}{' '}
                                                                priority items
                                                            </>
                                                        ) : (
                                                            <>Showing all priority items</>
                                                        )}
                                                    </p>
                                                ) : null}
                                            </div>
                                            <button
                                                type="button"
                                                style={styles.viewAllTasksBtnClient}
                                                className="homeowner-view-all-tasks-btn"
                                                onClick={() => navigate('/dashboard?priority=all')}
                                            >
                                                View all tasks
                                            </button>
                                        </div>
                                        {needsAttentionHidden > 0 && !showAllPriority ? (
                                            <div style={styles.needsActionOverflowRow}>
                                                <button
                                                    type="button"
                                                    style={styles.viewMoreTasksLinkClient}
                                                    className="homeowner-view-more-priority-btn"
                                                    onClick={() => navigate('/dashboard?priority=all')}
                                                >
                                                    View {needsAttentionHidden} more in Tasks
                                                </button>
                                            </div>
                                        ) : null}
                                        <div style={styles.jobList} className="homeowner-job-list homeowner-dashboard-attention-grid">
                                            {visibleNeedsAction.map((job, idx) => (
                                                <ClientDashboardTaskCard
                                                    key={job?.id != null ? String(job.id) : `job-${idx}`}
                                                    job={job}
                                                    styles={styles}
                                                    formatDate={formatDate}
                                                    unreadByJobId={unreadByJobId}
                                                    needsActionSection
                                                />
                                            ))}
                                        </div>
                                    </div>
                                </section>
                            )}
                            {renderSection(
                                'In progress',
                                'Work is underway or awaiting action from experts',
                                grouped.inProgress,
                                'default',
                                {
                                    emptyMessage: 'No active jobs right now',
                                    emptyCtaLabel: 'Post a task',
                                    onEmptyCta: () => navigate('/post-job'),
                                }
                            )}
                            {renderSection(
                                'Completed',
                                'Finished jobs and history',
                                grouped.completed,
                                'default',
                                {
                                    emptyMessage: 'No completed jobs yet',
                                }
                            )}
                        </>
                    )}
                </div>
            </div>
            </PageMain>
        </>
    );
}

const styles = {
    dashboardShell: {
        width: '100%',
        minHeight: 'calc(100vh - 70px)',
        backgroundColor: '#F9FAFB',
        backgroundImage: 'none',
        position: 'relative',
        zIndex: 0,
        overflow: 'hidden',
        isolation: 'isolate',
    },
    dashboardContainer: {
        fontFamily: 'Inter, sans-serif',
        padding: '32px 24px',
        maxWidth: '960px',
        margin: '0 auto',
        position: 'relative',
        zIndex: 0,
        backgroundColor: 'transparent',
        backgroundImage: 'none',
    },

    welcomeSection: {
        marginBottom: '28px',
    },
    greeting: {
        fontFamily: 'Poppins, sans-serif',
        fontSize: '24px',
        fontWeight: '600',
        color: '#111827',
        marginBottom: '4px',
    },
    helperLine: {
        fontSize: '13px',
        color: '#6B7280',
        fontWeight: '400',
        marginBottom: '4px',
        lineHeight: 1.45,
    },
    subGreeting: {
        fontSize: '15px',
        color: '#6B7280',
        fontWeight: '400',
    },

    emptyState: {
        textAlign: 'center',
        padding: '80px 40px',
        backgroundColor: '#FFFFFF',
        borderRadius: '16px',
        border: '1px solid #E5E7EB',
        maxWidth: '600px',
        margin: '0 auto',
        boxShadow: '0 2px 12px rgba(15, 23, 42, 0.04)',
    },
    emptyIcon: {
        marginBottom: '24px',
    },
    emptyTitle: {
        fontFamily: 'Poppins, sans-serif',
        fontSize: '24px',
        fontWeight: '600',
        color: '#111827',
        marginBottom: '12px',
    },
    emptyText: {
        fontSize: '16px',
        color: '#4B5563',
        lineHeight: '1.6',
        marginBottom: '32px',
    },
    ctaButtonBase: {
        fontFamily: 'Inter, sans-serif',
        borderRadius: '10px',
        fontSize: '14px',
        fontWeight: '600',
        cursor: 'pointer',
        border: 'none',
        lineHeight: 1.3,
    },
    ctaPost: {
        backgroundColor: '#14C5C5',
        color: '#FFFFFF',
        boxShadow: '0 2px 8px rgba(20, 197, 197, 0.25)',
    },

    sectionBlock: {
        marginBottom: '28px',
    },
    sectionDefaultShell: {
        padding: 0,
    },
    sectionNeedsActionShell: {
        backgroundColor: '#FFF7ED',
        borderRadius: '14px',
        padding: '20px',
        border: 'none',
        boxShadow: 'none',
    },
    sectionHeader: {
        marginBottom: '16px',
    },
    sectionEyebrow: {
        fontSize: '11px',
        fontWeight: '700',
        letterSpacing: '0.1em',
        textTransform: 'uppercase',
        color: '#C2410C',
        marginBottom: '6px',
    },
    sectionHeading: {
        fontFamily: 'Poppins, sans-serif',
        fontSize: '18px',
        fontWeight: '700',
        color: '#111827',
        margin: '0 0 6px 0',
        lineHeight: 1.45,
    },
    sectionHeadingMuted: {
        fontFamily: 'Poppins, sans-serif',
        fontSize: '18px',
        fontWeight: '700',
        color: '#64748B',
        opacity: 0.92,
        margin: '0 0 6px 0',
        lineHeight: 1.45,
    },
    sectionHeadingPriority: {
        fontFamily: 'Poppins, sans-serif',
        fontSize: '20px',
        fontWeight: '700',
        color: '#111827',
        margin: '0 0 8px 0',
        lineHeight: 1.45,
    },
    sectionSub: {
        fontSize: '14px',
        color: '#6B7280',
        margin: 0,
        lineHeight: 1.5,
    },
    needsActionHeaderRow: {
        display: 'flex',
        flexWrap: 'wrap',
        alignItems: 'flex-start',
        justifyContent: 'space-between',
        gap: '16px',
        marginBottom: '4px',
    },
    needsAttentionCountClient: {
        fontSize: '13px',
        color: '#4B5563',
        fontWeight: 600,
        margin: '10px 0 0 0',
        lineHeight: 1.45,
    },
    needsActionOverflowRow: {
        marginBottom: '12px',
    },
    viewAllTasksBtnClient: {
        fontFamily: 'Inter, sans-serif',
        fontSize: '14px',
        fontWeight: 600,
        color: '#0F766E',
        backgroundColor: '#FFFFFF',
        border: '1px solid #14C5C5',
        borderRadius: '10px',
        padding: '10px 18px',
        cursor: 'pointer',
        whiteSpace: 'nowrap',
        flexShrink: 0,
    },
    viewMoreTasksLinkClient: {
        fontFamily: 'Inter, sans-serif',
        fontSize: '14px',
        fontWeight: 600,
        color: '#0F766E',
        background: 'none',
        border: 'none',
        padding: 0,
        cursor: 'pointer',
        textDecoration: 'underline',
        textUnderlineOffset: '3px',
    },
    sectionEmpty: {
        paddingTop: '4px',
        paddingBottom: '2px',
    },
    sectionEmptyText: {
        fontSize: '14px',
        color: '#6B7280',
        margin: '0 0 10px 0',
        lineHeight: 1.5,
    },
    sectionEmptyCtaBtn: {
        backgroundColor: '#FFFFFF',
        color: '#0F766E',
        border: '1px solid #A5F3FC',
        padding: '8px 14px',
        fontSize: '13px',
        fontWeight: '600',
    },

    jobList: {
        display: 'grid',
        gap: '16px',
        gridTemplateColumns: '1fr',
    },

    jobCard: {
        backgroundColor: '#FFFFFF',
        borderRadius: '14px',
        padding: '19px 24px 17px',
        display: 'flex',
        flexDirection: 'column',
        cursor: 'pointer',
        outline: 'none',
    },
    cardHeaderRow: {
        display: 'flex',
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
        gap: '14px',
        marginBottom: '10px',
    },
    titleCluster: {
        display: 'flex',
        alignItems: 'flex-start',
        gap: '8px',
        flex: 1,
        minWidth: 0,
    },
    jobTitle: {
        fontFamily: 'Poppins, sans-serif',
        fontSize: '18px',
        fontWeight: '700',
        color: '#111827',
        margin: 0,
        lineHeight: 1.45,
        flex: 1,
        minWidth: 0,
    },
    unreadBadge: {
        flexShrink: 0,
        minWidth: '20px',
        height: '20px',
        padding: '0 6px',
        borderRadius: '999px',
        backgroundColor: '#F3F4F6',
        color: '#6B7280',
        fontSize: '11px',
        fontWeight: '700',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        lineHeight: 1,
        marginTop: '2px',
    },
    cardHeaderRight: {
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'flex-end',
        gap: '6px',
        flexShrink: 0,
        maxWidth: '180px',
    },
    trustPillsRow: {
        display: 'flex',
        flexDirection: 'row',
        flexWrap: 'nowrap',
        gap: '4px',
        justifyContent: 'flex-end',
        maxWidth: '160px',
    },
    trustPill: {
        fontSize: '11px',
        fontWeight: '600',
        lineHeight: 1.25,
        padding: '3px 8px',
        borderRadius: '999px',
        whiteSpace: 'nowrap',
        maxWidth: '160px',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        boxSizing: 'border-box',
    },
    trustPillSecure: {
        backgroundColor: '#ECFDF5',
        color: '#047857',
    },
    statusBadge: {
        display: 'inline-block',
        padding: '5px 9px',
        borderRadius: '999px',
        fontSize: '11px',
        fontWeight: '600',
        lineHeight: 1.25,
        maxWidth: '140px',
        textAlign: 'left',
        boxSizing: 'border-box',
        flexShrink: 0,
        whiteSpace: 'nowrap',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
    },
    jobMeta: {
        fontSize: '13px',
        color: '#64748B',
        lineHeight: 1.45,
        marginBottom: '8px',
        fontWeight: '500',
    },
    cardGuidanceBlock: {
        marginBottom: '6px',
    },
    cardGuidancePrimary: {
        fontSize: '13px',
        fontWeight: '400',
        color: '#94A3B8',
        lineHeight: 1.45,
        marginBottom: '4px',
    },
    cardGuidanceHelper: {
        fontSize: '12px',
        fontWeight: '400',
        color: '#9CA3AF',
        lineHeight: 1.45,
        marginBottom: '3px',
    },
    expertTrustBlock: {
        marginBottom: '6px',
    },
    expertTrustName: {
        fontSize: '13px',
        fontWeight: '500',
        color: '#4B5563',
        lineHeight: 1.45,
        marginBottom: '4px',
    },
    expertTrustRatingRow: {
        display: 'flex',
        flexDirection: 'row',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: '6px',
        fontSize: '13px',
        color: '#374151',
        lineHeight: 1.45,
        marginBottom: '2px',
        maxWidth: '100%',
    },
    expertTrustStarIcon: {
        flexShrink: 0,
    },
    expertTrustRatedBadge: {
        fontSize: '11px',
        fontWeight: '600',
        padding: '2px 7px',
        borderRadius: '999px',
        backgroundColor: '#FFFBEB',
        color: '#B45309',
        border: '1px solid #FDE68A',
        whiteSpace: 'nowrap',
        maxWidth: '120px',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
    },
    expertTrustJobsLine: {
        fontSize: '12px',
        color: '#94A3B8',
        lineHeight: 1.45,
    },
    expertTrustNewExpert: {
        fontSize: '12px',
        color: '#6B7280',
        lineHeight: 1.45,
        fontWeight: '400',
    },
    expertTrustResponse: {
        fontSize: '13px',
        color: '#374151',
        lineHeight: 1.45,
        marginBottom: '6px',
    },
    progressLine: {
        fontSize: '13px',
        fontWeight: '500',
        color: '#475569',
        lineHeight: 1.45,
        marginBottom: '2px',
    },
    paymentEscrowHint: {
        fontSize: '12px',
        fontWeight: '400',
        color: '#94A3B8',
        lineHeight: 1.45,
        marginTop: '4px',
        marginBottom: '2px',
    },
    optionalContextLine: {
        fontSize: '13px',
        fontWeight: '400',
        color: '#64748B',
        lineHeight: 1.45,
        marginTop: '4px',
    },
    optionalContextHint: {
        fontSize: '12px',
        fontWeight: '400',
        color: '#94A3B8',
        lineHeight: 1.4,
        marginTop: '2px',
    },
    staleHint: {
        fontSize: '12px',
        fontWeight: '400',
        color: '#C2410C',
        lineHeight: 1.4,
        marginTop: '4px',
        opacity: 0.92,
    },
    cardDivider: {
        height: '1px',
        backgroundColor: '#EEF2F6',
        margin: '10px 0 0',
        width: '100%',
    },

    ctaHelperText: {
        fontSize: '12px',
        color: '#6B7280',
        margin: '6px 0 0 0',
        lineHeight: 1.45,
        fontWeight: '400',
    },
    ctaContextHint: {
        fontSize: '12px',
        color: '#6B7280',
        margin: '6px 0 0 0',
        lineHeight: 1.45,
        fontWeight: '400',
    },
    taskRefLine: {
        fontSize: '12px',
        color: '#94A3B8',
        margin: '8px 0 0 0',
        lineHeight: 1.35,
        fontWeight: '400',
        opacity: 0.5,
    },

    ctaPrimaryPayment: {
        backgroundColor: '#EA580C',
        color: '#FFFFFF',
        border: '1px solid #EA580C',
        padding: '10px 18px',
        boxShadow: 'none',
        fontWeight: '600',
        width: '100%',
        marginTop: '13px',
        boxSizing: 'border-box',
    },
    ctaPrimaryApprove: {
        backgroundColor: '#14C5C5',
        color: '#FFFFFF',
        border: '1px solid #14C5C5',
        padding: '10px 18px',
        boxShadow: 'none',
        fontWeight: '600',
        width: '100%',
        marginTop: '13px',
        boxSizing: 'border-box',
    },
    ctaSecondary: {
        backgroundColor: '#FFFFFF',
        color: '#0F766E',
        border: '1px solid #A5F3FC',
        padding: '10px 18px',
        boxShadow: 'none',
        fontWeight: '600',
        width: '100%',
        marginTop: '13px',
        boxSizing: 'border-box',
    },
    ctaPassive: {
        backgroundColor: '#F9FAFB',
        color: '#4B5563',
        border: '1px solid #E5E7EB',
        padding: '10px 18px',
        boxShadow: 'none',
        fontWeight: '600',
        width: '100%',
        marginTop: '13px',
        boxSizing: 'border-box',
    },
};

export default ClientDashboard;
