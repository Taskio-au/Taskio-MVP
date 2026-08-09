import React from 'react';
import { useNavigate } from 'react-router-dom';
import {
    formatAuShortDateFromTimestamp,
    getExpertDashboardCTA,
    getExpertJobCardStatusPill,
} from '../../utils/tradieDashboard';
import { isChatEnabled, normalizeStatus } from '../../constants/jobStatuses';
import { formatTaskRefRowLabelFromJob } from '../../utils/taskReference';
import { fullTaskDisplayTitle } from '../../utils/jobDisplayFromJob';

/**
 * @param {object} props
 * @param {Array} props.jobs
 * @param {Record<string, number>} props.unreadByJobId
 * @param {object} props.styles - tradieDashboardStyles
 * @param {'dashboard'|'workspace'} [props.variant='dashboard'] — workspace = denser task-management cards (Tasks page)
 */
export default function TradieJobCardsGrid({ jobs, unreadByJobId = {}, styles, variant = 'dashboard', gridClassName = '' }) {
    const navigate = useNavigate();
    const isWorkspace = variant === 'workspace';
    const descMax = isWorkspace ? 110 : 150;

    const cardStyle = isWorkspace ? styles.jobCardWorkspace : styles.jobCard;
    const titleStyle = isWorkspace ? styles.jobTitleWorkspace : styles.jobTitle;
    const titleRowStyle = isWorkspace ? styles.jobCardTitleRowWorkspace : styles.jobCardTitleRow;
    const criticalStyle = isWorkspace ? styles.jobCardCriticalRowWorkspace : styles.jobCardCriticalRow;
    const statusBase = isWorkspace ? styles.jobStatusWorkspace : styles.jobStatus;
    const metaStyle = isWorkspace ? styles.jobMetaWorkspace : styles.jobMeta;
    const descStyle = isWorkspace ? styles.jobDescriptionWorkspace : styles.jobDescription;
    const ctaStyle = isWorkspace ? styles.ctaButtonWorkspace : styles.ctaButton;
    const dotStyle = isWorkspace ? styles.unreadActivityDotWorkspace : styles.unreadActivityDot;
    const budgetStyle = isWorkspace ? styles.budgetMutedWorkspace : styles.budgetMuted;
    const cardClass = isWorkspace ? 'tradie-job-card tradie-job-card-workspace' : 'tradie-job-card';

    return (
        <div
            style={styles.jobList}
            className={`${isWorkspace ? 'tradie-job-list tradie-job-list-workspace' : 'tradie-job-list'}${gridClassName ? ` ${gridClassName}` : ''}`.trim()}
        >
            {jobs.map((job) => {
                const unread = Math.max(0, Number(unreadByJobId?.[job.id] || 0));
                const statusPill = getExpertJobCardStatusPill(job, unread);
                const cta = getExpertDashboardCTA(job, unread);
                const showUnreadDot = unread > 0 && !isChatEnabled(normalizeStatus(job.status));
                const path = `/tradie/job/${job.id}${cta.pathSuffix || ''}`;
                const desc = String(job.description || '').trim();
                const quoteCount = Number(job.quoteCount || 0);
                const summary = desc.length > descMax ? `${desc.substring(0, descMax)}…` : desc || 'No description provided.';
                const refLine = formatTaskRefRowLabelFromJob(job);

                const headlineTitle = fullTaskDisplayTitle(job);
                return (
                    <div
                        key={job.id}
                        style={cardStyle}
                        className={cardClass}
                        onClick={() => navigate(path)}
                        onKeyDown={(e) => {
                            if (e.key === 'Enter' || e.key === ' ') {
                                e.preventDefault();
                                navigate(path);
                            }
                        }}
                        tabIndex={0}
                        role="button"
                        aria-label={`${headlineTitle}. ${refLine}. ${cta.label}.`}
                    >
                        <div style={titleRowStyle}>
                            <h3 style={titleStyle}>{headlineTitle}</h3>
                            {showUnreadDot && (
                                <span
                                    style={dotStyle}
                                    title={`${unread} new ${unread === 1 ? 'message' : 'messages'}`}
                                    aria-hidden
                                />
                            )}
                        </div>

                        <div
                            style={{
                                fontSize: 12,
                                fontWeight: 600,
                                color: '#6B7280',
                                letterSpacing: '0.01em',
                                marginBottom: isWorkspace ? 4 : 6,
                            }}
                        >
                            {refLine}
                        </div>

                        <div style={criticalStyle}>
                            <div
                                style={{
                                    ...statusBase,
                                    backgroundColor: statusPill.bg,
                                    color: statusPill.color,
                                    border: `1px solid ${statusPill.border || 'transparent'}`,
                                }}
                            >
                                {statusPill.label}
                            </div>
                            {job.budget ? (
                                <span style={budgetStyle}>{job.budget}</span>
                            ) : null}
                        </div>

                        <div style={metaStyle}>
                            <span style={styles.jobMetaItem}>📍 {job.location || 'Location TBA'}</span>
                            <span style={styles.jobMetaDivider}>•</span>
                            <span style={styles.jobMetaItem}>{formatAuShortDateFromTimestamp(job.createdAt)}</span>
                            {isWorkspace && quoteCount > 0 ? (
                                <>
                                    <span style={styles.jobMetaDivider}>•</span>
                                    <span style={styles.jobMetaItem}>
                                        {quoteCount} {quoteCount === 1 ? 'quote' : 'quotes'}
                                    </span>
                                </>
                            ) : null}
                        </div>

                        {!isWorkspace && quoteCount > 0 ? (
                            <div style={styles.jobQuoteHint}>
                                {quoteCount} {quoteCount === 1 ? 'quote' : 'quotes'} received
                            </div>
                        ) : null}

                        <p style={descStyle}>{summary}</p>

                        <button
                            type="button"
                            className="tradie-cta-btn"
                            style={ctaStyle}
                            onClick={(e) => {
                                e.stopPropagation();
                                navigate(path);
                            }}
                        >
                            {cta.label} →
                        </button>
                    </div>
                );
            })}
        </div>
    );
}
