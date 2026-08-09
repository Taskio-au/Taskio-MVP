import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import AppHeader from './AppHeader';
import TradieExpertPageStyles from './tradie/TradieExpertPageStyles';
import TradieJobCardsGrid from './tradie/TradieJobCardsGrid';
import { EXPERT_LABEL } from '../utils/roleLabels';
import { tradieDashboardStyles } from '../styles/tradieDashboardStyles';
import {
    filterExpertJobs,
    filterExpertJobsBySearch,
    sortExpertJobs,
} from '../utils/tradieDashboard';
import { useExpertDashboardData } from '../hooks/useExpertDashboardData';
import { InlineLoadingCard, InlineErrorCard } from './ui/AsyncPageStates';
import PageMain from './ui/PageMain';

const styles = tradieDashboardStyles;

function TradieTasksPage() {
    const navigate = useNavigate();
    const [statusFilter, setStatusFilter] = useState('active');
    const [searchQuery, setSearchQuery] = useState('');
    const [sortKey, setSortKey] = useState('newest');

    const {
        user,
        jobs,
        loading,
        error,
        stripeStatus,
        unreadByJobId,
        fetchDashboardData,
    } = useExpertDashboardData();

    const filteredJobs = useMemo(() => {
        const byStatus = filterExpertJobs(jobs, statusFilter);
        const searched = filterExpertJobsBySearch(byStatus, searchQuery);
        return sortExpertJobs(searched, sortKey);
    }, [jobs, statusFilter, searchQuery, sortKey]);

    if (loading || error) {
        return (
            <>
                <AppHeader
                    userRole="tradie"
                    userName={user?.displayName || ''}
                    userEmail={user?.email || ''}
                />
                <PageMain label="Expert tasks">
                    <div style={styles.dashboardShell} className="tradie-dashboard-shell">
                        <div style={styles.tasksPageContainer} className="tradie-dashboard-container tradie-tasks-page">
                            <div style={styles.welcomeSection}>
                                <div style={styles.greeting} className="tradie-greeting">{EXPERT_LABEL} tasks</div>
                                <div style={styles.subGreeting}>
                                    {loading ? 'Loading your task invitations.' : 'We could not load your tasks.'}
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
                                        message="Loading your tasks…"
                                        detail="Fetching invitations and active work."
                                    />
                                ) : (
                                    <InlineErrorCard
                                        title="We couldn’t load your tasks"
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
            <PageMain label="Expert tasks">
            <div style={styles.dashboardShell} className="tradie-dashboard-shell tradie-tasks-workspace-shell">
                <div style={styles.tasksPageContainer} className="tradie-dashboard-container tradie-tasks-page">
                    <div style={styles.tasksWorkspaceIntro} className="tradie-tasks-workspace-intro">
                        <div style={styles.tasksIntroInner} className="tradie-tasks-intro-inner">
                            <div style={styles.tasksHeadingRow} className="tradie-tasks-heading-row">
                                <h1 style={{ ...styles.greeting, margin: 0 }} className="tradie-greeting">
                                    Tasks
                                </h1>
                                <button
                                    type="button"
                                    className="tradie-tasks-back-link"
                                    style={styles.tasksBackLink}
                                    onClick={() => navigate('/tradie/dashboard')}
                                >
                                    Back to dashboard
                                </button>
                            </div>
                            <div style={styles.subGreeting} className="tradie-tasks-sub">
                                Your full task workspace — search, sort, and filter everything you&apos;re managing. The
                                {' '}
                                <span style={{ fontWeight: 600, color: '#4B5563' }}>Dashboard</span>
                                {' '}
                                stays the priority summary and reviews; this page is your complete list.
                            </div>
                        </div>
                    </div>

                    {stripeStatus.enabled && stripeStatus.onboardingStatus === 'completed' && (
                        <div
                            style={{ ...styles.stripeTrustBadge, marginBottom: '14px' }}
                            className="tradie-tasks-stripe-badge"
                        >
                            <span>Secured by Stripe</span>
                        </div>
                    )}

                    <div style={styles.tasksControlsCard} className="tradie-tasks-controls">
                        <div style={styles.tasksControlsPrimaryRow} className="tradie-tasks-controls-primary-row">
                            <label htmlFor="tradie-tasks-search" style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)' }}>
                                Search tasks
                            </label>
                            <input
                                id="tradie-tasks-search"
                                type="search"
                                placeholder="Search by title, location, or task ref…"
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                style={styles.tasksSearchInput}
                                className="tradie-tasks-search-input"
                                autoComplete="off"
                            />
                            <label htmlFor="tradie-tasks-sort" style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)' }}>
                                Sort tasks
                            </label>
                            <select
                                id="tradie-tasks-sort"
                                value={sortKey}
                                onChange={(e) => setSortKey(e.target.value)}
                                style={styles.tasksSortSelect}
                                className="tradie-tasks-sort-select"
                            >
                                <option value="newest">Sort: Newest first</option>
                                <option value="oldest">Sort: Oldest first</option>
                                <option value="title">Sort: Title A–Z</option>
                                <option value="status">Sort: Status (A–Z)</option>
                            </select>
                        </div>
                        <hr style={styles.tasksFilterDivider} className="tradie-tasks-filter-divider" />
                        <div style={styles.tasksFilterRow}>
                            <span style={styles.tasksFilterLabel} id="tradie-tasks-filter-label">
                                Show
                            </span>
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', alignItems: 'center' }} role="group" aria-labelledby="tradie-tasks-filter-label">
                                <button
                                    type="button"
                                    className="tradie-filter-pill"
                                    style={{ ...styles.filterPill, ...(statusFilter === 'active' ? styles.filterPillActive : {}) }}
                                    onClick={() => setStatusFilter('active')}
                                >
                                    Active
                                </button>
                                <button
                                    type="button"
                                    className="tradie-filter-pill"
                                    style={{ ...styles.filterPill, ...(statusFilter === 'all' ? styles.filterPillActive : {}) }}
                                    onClick={() => setStatusFilter('all')}
                                >
                                    All
                                </button>
                                <button
                                    type="button"
                                    className="tradie-filter-pill"
                                    style={{ ...styles.filterPill, ...(statusFilter === 'completed' ? styles.filterPillActive : {}) }}
                                    onClick={() => setStatusFilter('completed')}
                                >
                                    Completed
                                </button>
                                <button
                                    type="button"
                                    className="tradie-filter-pill"
                                    style={{ ...styles.filterPill, ...(statusFilter === 'disputed' ? styles.filterPillActive : {}) }}
                                    onClick={() => setStatusFilter('disputed')}
                                >
                                    Disputed
                                </button>
                            </div>
                        </div>
                    </div>

                    <div style={styles.tasksListSection} className="tradie-tasks-list-section">
                        <div style={styles.tasksListSectionHeader} className="tradie-tasks-list-header">
                            <h2 style={styles.tasksListSectionTitle} className="tasks-list-section-title">Your tasks</h2>
                            <div style={styles.sectionCount}>
                                {filteredJobs.length} {filteredJobs.length === 1 ? 'task' : 'tasks'}
                            </div>
                        </div>

                        {filteredJobs.length === 0 ? (
                            <div style={styles.emptyState}>
                                <div style={styles.emptyTitle}>
                                    {statusFilter === 'active' ? 'No matching active tasks'
                                        : statusFilter === 'completed' ? 'No completed tasks yet'
                                            : statusFilter === 'disputed' ? 'No disputed tasks'
                                                : 'No task invitations yet'}
                                </div>
                                <div style={styles.emptyText}>
                                    {searchQuery.trim()
                                        ? 'Try a different search or clear the search box.'
                                        : statusFilter === 'active'
                                            ? (jobs.length === 0
                                                ? 'You\'re all set! We\'ll notify you when tasks matching your skills are available.'
                                                : 'Try adjusting your filter to see other tasks.')
                                            : 'Try adjusting your filter or search.'}
                                </div>
                            </div>
                        ) : (
                            <TradieJobCardsGrid
                                jobs={filteredJobs}
                                unreadByJobId={unreadByJobId}
                                styles={styles}
                                variant="workspace"
                            />
                        )}
                    </div>
                </div>
            </div>
            </PageMain>
        </>
    );
}

export default TradieTasksPage;
