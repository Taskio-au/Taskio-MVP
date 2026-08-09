import React, { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuthState } from 'react-firebase-hooks/auth';
import { auth, db } from '../firebase';
import AppHeader from './AppHeader';
import { getStatusColors, getStatusLabel } from '../constants/jobStatuses';
import { useChatThreads } from '../hooks/useMessagingSummary';
import { doc, getDoc, serverTimestamp, updateDoc } from 'firebase/firestore';
import { resolveThreadJobId } from '../utils/chatThreads';
import { formatRelativeTimeShort } from '../utils/formatRelativeTime';
import { formatTaskRefRowLabel } from '../utils/taskReference';
import { markMessageNotificationsReadForJob } from '../utils/markMessageNotificationsReadForJob';
import { PageLoadingShell } from './ui/AsyncPageStates';
import PageMain from './ui/PageMain';

export default function MessagesPage() {
    const navigate = useNavigate();
    const [user, loading] = useAuthState(auth);
    const [profile, setProfile] = useState(null);
    const { threads, unreadCount, loadError, retry } = useChatThreads(user);

    useEffect(() => {
        if (!loading && !user) navigate('/login');
    }, [loading, navigate, user]);

    useEffect(() => {
        let active = true;
        async function loadProfile() {
            if (!user?.uid) return;
            try {
                const snap = await getDoc(doc(db, 'users', user.uid));
                if (active) setProfile(snap.exists() ? (snap.data() || {}) : { role: 'homeowner' });
            } catch (e) {
                if (active) setProfile({ role: 'homeowner' });
            }
        }
        loadProfile();
        return () => {
            active = false;
        };
    }, [user?.uid]);

    const role = useMemo(() => {
        const next = profile?.role;
        if (next === 'tradie' || next === 'homeowner' || next === 'admin') return next;
        return 'homeowner';
    }, [profile]);

    const headerName = profile?.displayName || profile?.name || user?.displayName || '';
    const headerEmail = profile?.email || user?.email || '';

    const subTitle = useMemo(() => {
        if (role === 'tradie') {
            return 'Your conversation workspace — each thread is tied to a task (reference below). Use Notifications for payments and milestones without duplicating chat here.';
        }
        return 'Open any task conversation without losing context — task references match your Taskio emails and receipts.';
    }, [role]);

    const openThread = async (thread) => {
        const threadJobId = resolveThreadJobId(thread);
        if (!user?.uid || !threadJobId) return;
        try {
            const threadRef = doc(db, 'users', user.uid, 'chatThreads', threadJobId);
            const threadSnap = await getDoc(threadRef);
            if (threadSnap.exists()) {
                await updateDoc(threadRef, {
                    unreadCount: 0,
                    lastReadAt: serverTimestamp(),
                    updatedAt: serverTimestamp(),
                });
            }
        } catch (e) {
            // Chat page will retry clearing unread state when it opens.
        }
        try {
            await markMessageNotificationsReadForJob(db, user.uid, threadJobId);
        } catch (_) {
            /* best-effort: per-message notification docs may still sync on next open */
        }

        const basePath = role === 'tradie' ? `/tradie/job/${threadJobId}` : `/job/${threadJobId}`;
        navigate(`${basePath}#chat`);
    };

    if (loading || !user) {
        return (
            <PageLoadingShell message="Loading messages…" detail="Getting your conversation list and unread counts." />
        );
    }

    return (
        <>
            <style>{`
                /*
                 * Desktop (>=641px): thread body uses CSS grid so the DOM order
                 * (line1: name+time, title, ref, preview) matches the original card:
                 * left column stacked / right column time+badge / preview full width.
                 */
                @media (min-width: 641px) {
                    .messages-row-main {
                        display: grid !important;
                        grid-template-columns: minmax(0, 1fr) auto !important;
                        grid-template-rows: auto auto auto auto !important;
                        column-gap: 12px !important;
                        row-gap: 6px !important;
                        align-items: start !important;
                        padding: 16px 18px !important;
                    }
                    .messages-thread-line1 {
                        display: contents !important;
                    }
                    .messages-participant {
                        grid-column: 1 !important;
                        grid-row: 1 !important;
                        min-width: 0 !important;
                    }
                    .messages-time-cluster {
                        grid-column: 2 !important;
                        grid-row: 1 / span 2 !important;
                        display: flex !important;
                        flex-direction: column !important;
                        align-items: flex-end !important;
                        justify-content: flex-start !important;
                        gap: 6px !important;
                    }
                    .messages-job-title {
                        grid-column: 1 !important;
                        grid-row: 2 !important;
                        min-width: 0 !important;
                    }
                    .messages-ref-status {
                        grid-column: 1 !important;
                        grid-row: 3 !important;
                        margin-top: 0 !important;
                    }
                    .messages-preview {
                        grid-column: 1 / -1 !important;
                        grid-row: 4 !important;
                        margin-top: 4px !important;
                        max-height: 4.5em !important;
                        display: block !important;
                        -webkit-line-clamp: unset !important;
                        -webkit-box-orient: unset !important;
                        overflow: hidden !important;
                    }
                }

                @media (max-width: 640px) {
                    .messages-page-container {
                        padding: 4px 12px 10px !important;
                    }
                    .messages-page-header {
                        flex-direction: column !important;
                        align-items: flex-start !important;
                        gap: 0 !important;
                        margin-bottom: 3px !important;
                    }
                    .messages-page-title {
                        margin-bottom: 0 !important;
                        font-size: 21px !important;
                        line-height: 1.12 !important;
                    }
                    .messages-page-sub {
                        font-size: 13px !important;
                        line-height: 1.28 !important;
                        margin-top: 0 !important;
                        margin-bottom: 0 !important;
                    }
                    .messages-summary-pill {
                        margin-top: 2px !important;
                        margin-bottom: 0 !important;
                        padding: 4px 9px !important;
                    }
                    .messages-list {
                        gap: 3px !important;
                        margin-top: 0 !important;
                    }
                    .messages-thread-btn {
                        min-height: 0 !important;
                        border-radius: 9px !important;
                    }
                    .messages-row-main {
                        display: flex !important;
                        flex-direction: column !important;
                        align-items: stretch !important;
                        gap: 2px !important;
                        padding: 8px 10px !important;
                    }
                    .messages-thread-line1 {
                        display: flex !important;
                        flex-direction: row !important;
                        justify-content: space-between !important;
                        align-items: flex-start !important;
                        gap: 8px !important;
                        width: 100% !important;
                    }
                    .messages-participant {
                        font-size: 15px !important;
                        font-weight: 700 !important;
                        line-height: 1.2 !important;
                        min-width: 0 !important;
                        flex: 1 !important;
                        text-align: left !important;
                        overflow: hidden !important;
                        text-overflow: ellipsis !important;
                        white-space: nowrap !important;
                    }
                    .messages-time-cluster {
                        display: flex !important;
                        flex-direction: row !important;
                        align-items: center !important;
                        justify-content: flex-end !important;
                        gap: 6px !important;
                        flex-shrink: 0 !important;
                    }
                    .messages-time-label {
                        font-size: 11px !important;
                        font-weight: 600 !important;
                    }
                    .messages-job-title {
                        font-size: 13px !important;
                        line-height: 1.28 !important;
                        font-weight: 500 !important;
                    }
                    .messages-ref-status {
                        gap: 6px 8px !important;
                        margin-top: 0 !important;
                        margin-bottom: 0 !important;
                    }
                    .messages-ref-text {
                        font-size: 11px !important;
                    }
                    .messages-status-pill {
                        padding: 2px 7px !important;
                    }
                    .messages-unread-badge {
                        padding: 2px 7px !important;
                        font-size: 10px !important;
                    }
                    .messages-preview {
                        font-size: 13px !important;
                        line-height: 1.35 !important;
                        margin-top: 2px !important;
                        padding-top: 0 !important;
                        display: -webkit-box !important;
                        -webkit-box-orient: vertical !important;
                        -webkit-line-clamp: 2 !important;
                        overflow: hidden !important;
                        max-height: none !important;
                    }
                    .messages-load-failure {
                        padding: 18px 16px !important;
                    }
                    .messages-load-failure .messages-failure-actions {
                        flex-direction: column !important;
                        align-items: stretch !important;
                    }
                    .messages-load-failure .messages-failure-actions a {
                        text-align: center !important;
                        padding: 12px !important;
                    }
                }
                @media (max-width: 430px) {
                    .messages-page-container {
                        padding: 16px 12px 28px !important;
                    }
                    .messages-page-header {
                        gap: 10px !important;
                        margin-bottom: 12px !important;
                    }
                    .messages-summary-pill {
                        align-self: flex-start !important;
                        min-height: 36px !important;
                        display: inline-flex !important;
                        align-items: center !important;
                    }
                    .messages-list {
                        gap: 8px !important;
                        margin-top: 4px !important;
                    }
                    .messages-thread-btn {
                        min-height: 72px !important;
                    }
                    .messages-row-main {
                        padding: 12px 12px !important;
                        gap: 4px !important;
                    }
                    .messages-participant {
                        white-space: normal !important;
                        display: -webkit-box !important;
                        -webkit-line-clamp: 2 !important;
                        -webkit-box-orient: vertical !important;
                        overflow: hidden !important;
                    }
                }
            `}</style>
            <AppHeader userRole={role} userName={headerName} userEmail={headerEmail} />
            <PageMain label="Messages">
            <div style={styles.page} className="messages-page-shell">
                <div style={styles.container} className="messages-page-container">
                    <div style={styles.headerRow} className="messages-page-header">
                        <div style={{ flex: '1 1 280px', minWidth: 0 }}>
                            <h1 style={{ ...styles.title, margin: 0 }} className="messages-page-title">Messages</h1>
                            <div style={styles.subTitle} className="messages-page-sub">{subTitle}</div>
                        </div>
                        <div
                            style={styles.summaryPill}
                            className="messages-summary-pill"
                            title={loadError ? 'Unread count unavailable while messages fail to load' : undefined}
                            role="status"
                            aria-live="polite"
                            aria-atomic="true"
                        >
                            {loadError ? '—' : unreadCount > 0 ? `${unreadCount} unread` : 'All caught up'}
                        </div>
                    </div>

                    {loadError ? (
                        <div style={styles.loadFailureCard} className="messages-load-failure" role="alert">
                            <div style={styles.loadFailureTitle}>We couldn’t load your messages</div>
                            <p style={styles.loadFailureText}>{loadError}</p>
                            <div style={styles.loadFailureActions} className="messages-failure-actions">
                                <button type="button" style={styles.buttonRetry} onClick={retry}>
                                    Try again
                                </button>
                                <Link to="/support" style={styles.supportLink}>
                                    Help &amp; Support
                                </Link>
                            </div>
                        </div>
                    ) : threads.length === 0 ? (
                        <div style={styles.emptyCard}>
                            <div style={styles.emptyTitle}>No conversations yet</div>
                            <div style={styles.emptyText}>
                                Once a funded task has messages, it will appear here. You&apos;ll always open the full task
                                to reply, so nothing gets lost outside the job.
                            </div>
                        </div>
                    ) : (
                        <div style={styles.list} className="messages-list">
                            {threads.map((thread) => {
                                const jobId = resolveThreadJobId(thread);
                                const unreadN = Math.max(Number(thread?.unreadCount || 0), 0);
                                const hasUnread = unreadN > 0;
                                const status = getStatusLabel(thread?.jobStatus || 'OPEN');
                                const colors = getStatusColors(thread?.jobStatus || 'OPEN');
                                const refLabel = formatTaskRefRowLabel(jobId);
                                const timeLabel = formatRelativeTimeShort(thread.lastMessageAt);
                                const aria = `Conversation with ${thread.otherParticipantName || 'contact'}${refLabel ? `, ${refLabel}` : ''}`;

                                return (
                                    <button
                                        key={thread.id}
                                        type="button"
                                        onClick={() => openThread(thread)}
                                        style={{
                                            ...styles.row,
                                            ...(hasUnread ? styles.rowUnread : {}),
                                        }}
                                        aria-label={aria}
                                        className="messages-thread-btn"
                                    >
                                        <div style={styles.rowMain} className="messages-row-main">
                                            <div className="messages-thread-line1">
                                                <div style={styles.participantName} className="messages-participant">
                                                    {thread.otherParticipantName || 'Taskio user'}
                                                </div>
                                                <div className="messages-time-cluster">
                                                    <div style={styles.timeLabel} className="messages-time-label">{timeLabel}</div>
                                                    {hasUnread ? (
                                                        <span style={styles.unreadBadge} className="messages-unread-badge">{unreadN} new</span>
                                                    ) : null}
                                                </div>
                                            </div>
                                            <div style={styles.jobTitle} className="messages-job-title">{thread.jobTitle || 'Task'}</div>
                                            <div style={styles.refAndStatus} className="messages-ref-status">
                                                {refLabel ? <span style={styles.refText} className="messages-ref-text">{refLabel}</span> : null}
                                                <span
                                                    className="messages-status-pill"
                                                    style={{
                                                        ...styles.statusPill,
                                                        background: colors.bg,
                                                        color: colors.text,
                                                        border: `1px solid ${colors.border}`,
                                                    }}
                                                >
                                                    {status}
                                                </span>
                                            </div>
                                            <div style={styles.preview} className="messages-preview">
                                                {thread.lastMessageText || 'Open this task to continue the conversation.'}
                                            </div>
                                        </div>
                                    </button>
                                );
                            })}
                        </div>
                    )}
                </div>
            </div>
            </PageMain>
        </>
    );
}

const styles = {
    page: { background: '#F3F4F6', minHeight: 'calc(100vh - 64px)' },
    container: { maxWidth: 1100, margin: '0 auto', padding: '24px 20px 40px' },
    headerRow: {
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
        gap: 14,
        marginBottom: 20,
        flexWrap: 'wrap',
    },
    title: { fontFamily: 'Poppins, sans-serif', fontSize: 22, fontWeight: 700, color: '#111827' },
    subTitle: { marginTop: 6, fontSize: 14, color: '#6B7280', lineHeight: 1.55, maxWidth: 640 },
    summaryPill: {
        borderRadius: 999,
        padding: '8px 14px',
        border: '1px solid #E5E7EB',
        background: '#fff',
        color: '#374151',
        fontSize: 12,
        fontWeight: 700,
        flexShrink: 0,
    },
    emptyCard: {
        background: '#fff',
        border: '1px solid #E5E7EB',
        borderRadius: 12,
        padding: 22,
        boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
    },
    emptyTitle: { fontWeight: 700, color: '#111', marginBottom: 8, fontSize: 16 },
    emptyText: { fontSize: 14, color: '#6B7280', lineHeight: 1.55 },
    loadFailureCard: {
        background: '#fff',
        border: '1px solid #E5E7EB',
        borderLeft: '4px solid #0d9488',
        borderRadius: 12,
        padding: '20px 22px',
        boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
    },
    loadFailureTitle: {
        fontFamily: 'Poppins, sans-serif',
        fontSize: 17,
        fontWeight: 700,
        color: '#111827',
        marginBottom: 8,
    },
    loadFailureText: {
        margin: 0,
        fontSize: 14,
        color: '#4B5563',
        lineHeight: 1.55,
    },
    loadFailureActions: {
        marginTop: 16,
        display: 'flex',
        flexWrap: 'wrap',
        gap: 12,
        alignItems: 'center',
    },
    buttonRetry: {
        background: '#fff',
        color: '#0f766e',
        border: '1px solid #99f6e4',
        borderRadius: 10,
        padding: '11px 18px',
        minHeight: 44,
        cursor: 'pointer',
        fontWeight: 700,
        fontSize: 14,
        fontFamily: 'Inter, sans-serif',
        boxSizing: 'border-box',
    },
    supportLink: {
        fontSize: 14,
        fontWeight: 700,
        color: '#0d9488',
        textDecoration: 'none',
        padding: '10px 8px',
        minHeight: 44,
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        boxSizing: 'border-box',
    },
    list: { display: 'grid', gap: 12 },
    row: {
        width: '100%',
        textAlign: 'left',
        borderRadius: 12,
        border: '1px solid #E5E7EB',
        background: '#fff',
        padding: 0,
        cursor: 'pointer',
        boxShadow: '0 1px 2px rgba(0,0,0,0.04)',
        transition: 'border-color 0.15s, box-shadow 0.15s',
    },
    rowUnread: {
        borderColor: '#99F6E4',
        background: '#F0FDFA',
        boxShadow: '0 2px 8px rgba(20, 197, 197, 0.12)',
    },
    rowMain: { padding: '16px 18px' },
    participantName: { fontSize: 16, fontWeight: 700, color: '#111827' },
    jobTitle: { fontSize: 14, color: '#374151', fontWeight: 500, lineHeight: 1.35 },
    refAndStatus: {
        display: 'flex',
        flexWrap: 'wrap',
        alignItems: 'center',
        gap: '8px 10px',
        marginTop: 2,
    },
    refText: { fontSize: 12, color: '#9CA3AF', fontWeight: 500 },
    timeLabel: { fontSize: 12, fontWeight: 600, color: '#6B7280', whiteSpace: 'nowrap' },
    unreadBadge: {
        display: 'inline-flex',
        alignItems: 'center',
        borderRadius: 999,
        background: '#CCFBF1',
        color: '#0F766E',
        fontSize: 11,
        fontWeight: 700,
        padding: '4px 10px',
    },
    statusPill: { fontSize: 11, fontWeight: 700, borderRadius: 999, padding: '4px 10px' },
    preview: {
        fontSize: 14,
        color: '#4B5563',
        lineHeight: 1.5,
        maxHeight: '4.5em',
        overflow: 'hidden',
    },
};
