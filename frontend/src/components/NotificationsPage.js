import React, { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuthState } from 'react-firebase-hooks/auth';
import { auth, db } from '../firebase';
import AppHeader from './AppHeader';
import {
    collection,
    doc,
    getDoc,
    getDocs,
    limit,
    onSnapshot,
    orderBy,
    query,
    serverTimestamp,
    updateDoc,
    where,
    writeBatch,
} from 'firebase/firestore';
import { formatRelativeTimeShort } from '../utils/formatRelativeTime';
import { formatTaskRefRowLabel } from '../utils/taskReference';
import { PageLoadingShell } from './ui/AsyncPageStates';
import PageMain from './ui/PageMain';

function notificationsListenerErrorMessage(err) {
    const code = String(err?.code || '');
    if (code === 'permission-denied') {
        return 'We couldn’t load notifications. Check that you’re signed in, or try again in a moment.';
    }
    if (code === 'unavailable' || code === 'deadline-exceeded' || code === 'resource-exhausted') {
        return 'We couldn’t reach Taskio. Check your connection and try again.';
    }
    return 'We couldn’t load notifications. Please try again.';
}

function getNotificationKind(type) {
    const t = String(type || '');
    if (t === 'escrow_funded') {
        return { label: 'Payment', accent: '#065f46', bg: '#ECFDF5', border: '#A7F3D0' };
    }
    if (t === 'quote_submitted') {
        return { label: 'Quote', accent: '#075985', bg: '#E0F2FE', border: '#BAE6FD' };
    }
    if (t === 'task_completed') {
        return { label: 'Task', accent: '#1D4ED8', bg: '#EFF6FF', border: '#BFDBFE' };
    }
    if (t === 'payment_released') {
        return { label: 'Payment', accent: '#065f46', bg: '#ECFDF5', border: '#A7F3D0' };
    }
    if (t === 'refund_completed') {
        return { label: 'Refund', accent: '#9A3412', bg: '#FFF7ED', border: '#FED7AA' };
    }
    if (t === 'message_received') {
        return { label: 'Message', accent: '#B45309', bg: '#FFFBEB', border: '#FDE68A' };
    }
    return { label: 'Update', accent: '#4B5563', bg: '#F3F4F6', border: '#E5E7EB' };
}

export default function NotificationsPage() {
    const navigate = useNavigate();
    const [user, loading] = useAuthState(auth);
    const [profile, setProfile] = useState(null);
    const [items, setItems] = useState([]);
    const [listenerError, setListenerError] = useState(null);
    const [retryKey, setRetryKey] = useState(0);
    const [markAllReadError, setMarkAllReadError] = useState('');
    const [busy, setBusy] = useState(false);

    useEffect(() => {
        if (!loading && !user) navigate('/login');
    }, [loading, user, navigate]);

    useEffect(() => {
        const run = async () => {
            if (!user) return;
            try {
                const snap = await getDoc(doc(db, 'users', user.uid));
                setProfile(snap.exists() ? snap.data() : { role: 'homeowner' });
            } catch (e) {
                // eslint-disable-next-line no-console
                console.error('Profile read failed:', e);
                setProfile({ role: 'homeowner' });
            }
        };
        run();
    }, [user]);

    const role = useMemo(() => {
        const r = profile?.role;
        if (r === 'tradie' || r === 'homeowner' || r === 'admin') return r;
        return 'homeowner';
    }, [profile]);

    useEffect(() => {
        if (!user) return undefined;
        setListenerError(null);
        const q = query(
            collection(db, 'users', user.uid, 'notifications'),
            orderBy('createdAt', 'desc'),
            limit(60)
        );
        const unsub = onSnapshot(
            q,
            (snap) => {
                setItems(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
                setListenerError(null);
            },
            (e) => {
                // eslint-disable-next-line no-console
                console.error('Notifications query failed:', e);
                setItems([]);
                setListenerError(notificationsListenerErrorMessage(e));
            }
        );
        return () => {
            if (typeof unsub === 'function') unsub();
        };
    }, [user, retryKey]);

    /** Experts: hide chat notifications here — they belong in Messages. */
    const visibleItems = useMemo(() => {
        if (role === 'tradie') return items.filter((n) => n.type !== 'message_received');
        return items;
    }, [items, role]);

    const visibleUnread = useMemo(() => visibleItems.filter((n) => n.read !== true).length, [visibleItems]);

    const totalUnread = useMemo(() => items.filter((n) => n.read !== true).length, [items]);

    const subTitle = useMemo(() => {
        if (role === 'tradie') {
            return 'Payments, milestones, and task updates. New chat alerts stay in Messages so this feed stays actionable.';
        }
        return 'Quotes, payments, and job progress — each update links back to the task.';
    }, [role]);

    const markAllRead = async () => {
        if (!user) return;
        setBusy(true);
        setMarkAllReadError('');
        try {
            const q = query(collection(db, 'users', user.uid, 'notifications'), where('read', '==', false), limit(100));
            const snap = await getDocs(q);
            const batch = writeBatch(db);
            snap.docs.forEach((d) => {
                batch.update(d.ref, { read: true, readAt: serverTimestamp(), updatedAt: serverTimestamp() });
            });
            await batch.commit();
        } catch (e) {
            setMarkAllReadError(e?.message || 'Failed to mark all as read.');
        } finally {
            setBusy(false);
        }
    };

    const markOneRead = async (id) => {
        if (!user) return;
        try {
            await updateDoc(doc(db, 'users', user.uid, 'notifications', id), {
                read: true,
                readAt: serverTimestamp(),
                updatedAt: serverTimestamp(),
            });
        } catch (e) {
            // non-blocking
        }
    };

    const headerName = profile?.name || user?.displayName || '';
    const headerEmail = profile?.email || user?.email || '';

    if (loading || !user) {
        return (
            <PageLoadingShell message="Loading notifications…" detail="Getting your updates for tasks and payments." />
        );
    }

    return (
        <>
            <style>{`
                @media (max-width: 640px) {
                    .notifications-page-container {
                        padding: 12px 12px 32px !important;
                    }
                    .notifications-page-header {
                        flex-direction: column !important;
                        align-items: stretch !important;
                        gap: 12px !important;
                    }
                    .notifications-page-header-actions {
                        width: 100%;
                        justify-content: space-between !important;
                    }
                    .notifications-info-callout {
                        font-size: 12px !important;
                        padding: 10px 12px !important;
                        margin-bottom: 12px !important;
                        line-height: 1.4 !important;
                    }
                    .notifications-row-card {
                        padding: 13px 14px !important;
                    }
                    .notifications-body-clamp {
                        max-height: 4.5em;
                        overflow: hidden;
                    }
                    .notifications-load-failure {
                        padding: 18px 16px !important;
                    }
                    .notifications-retry-btn {
                        flex: 1;
                        min-width: 140px;
                    }
                    .notifications-failure-actions {
                        flex-direction: column !important;
                        align-items: stretch !important;
                    }
                    .notifications-failure-actions a {
                        text-align: center;
                        padding: 12px;
                    }
                }
                @media (max-width: 430px) {
                    .notifications-page-container {
                        padding: 12px 12px 28px !important;
                    }
                    .notifications-page-header-actions {
                        flex-direction: column !important;
                        align-items: stretch !important;
                        gap: 10px !important;
                        width: 100% !important;
                    }
                    .notifications-page-header-actions .notifications-mark-all-btn {
                        width: 100% !important;
                        display: inline-flex !important;
                        justify-content: center !important;
                        align-items: center !important;
                        box-sizing: border-box !important;
                    }
                    .notifications-row-card {
                        padding: 14px 12px !important;
                        min-height: 72px;
                    }
                    .notifications-body-clamp {
                        max-height: 6.75em !important;
                        line-height: 1.45 !important;
                        display: -webkit-box !important;
                        -webkit-box-orient: vertical !important;
                        -webkit-line-clamp: 5 !important;
                        overflow: hidden !important;
                    }
                }
            `}</style>
            <AppHeader userRole={role} userName={headerName} userEmail={headerEmail} />
            <PageMain label="Notifications">
            <div style={styles.page} className="notifications-page-shell">
                <div style={styles.container} className="notifications-page-container">
                    <div style={styles.headerRow} className="notifications-page-header">
                        <div style={{ flex: '1 1 280px', minWidth: 0 }}>
                            <h1 style={{ ...styles.title, margin: 0 }}>Notifications</h1>
                            <div style={styles.subTitle}>{subTitle}</div>
                        </div>
                        <div style={styles.headerActions} className="notifications-page-header-actions">
                            <div
                                style={styles.summaryPill}
                                title={listenerError ? 'Unread count unavailable while notifications fail to load' : undefined}
                                role="status"
                                aria-live="polite"
                                aria-atomic="true"
                            >
                                {listenerError ? '—' : visibleUnread > 0 ? `${visibleUnread} unread` : 'Caught up'}
                            </div>
                            <button
                                type="button"
                                className="notifications-mark-all-btn"
                                style={styles.buttonSecondary}
                                onClick={markAllRead}
                                disabled={busy || listenerError || totalUnread === 0}
                            >
                                {busy ? 'Working…' : 'Mark all as read'}
                            </button>
                        </div>
                    </div>

                    {role === 'tradie' && (
                        <div style={styles.infoCallout} className="notifications-info-callout">
                            Chats live in Messages — no duplicate new-message alerts here.
                        </div>
                    )}

                    {markAllReadError ? (
                        <div style={styles.error} role="alert">
                            {markAllReadError}
                        </div>
                    ) : null}

                    {listenerError ? (
                        <div style={styles.loadFailureCard} className="notifications-load-failure" role="alert">
                            <div style={styles.loadFailureTitle}>We couldn’t load notifications</div>
                            <p style={styles.loadFailureText}>{listenerError}</p>
                            <div style={styles.loadFailureActions} className="notifications-failure-actions">
                                <button
                                    type="button"
                                    style={styles.buttonRetry}
                                    className="notifications-retry-btn"
                                    onClick={() => setRetryKey((k) => k + 1)}
                                >
                                    Try again
                                </button>
                                <Link to="/support" style={styles.supportLinkInline}>
                                    Help &amp; Support
                                </Link>
                            </div>
                        </div>
                    ) : visibleItems.length === 0 ? (
                        <div style={styles.card}>
                            <div style={{ fontWeight: 700, marginBottom: 8, fontSize: 16, color: '#111' }}>
                                {role === 'tradie' ? 'No system updates yet' : 'No notifications yet'}
                            </div>
                            <div style={{ fontSize: 14, color: '#6B7280', lineHeight: 1.55 }}>
                                {role === 'tradie'
                                    ? 'When payment is secured, funds move, or job milestones change, you’ll see them here. Use Messages for conversations.'
                                    : 'We’ll notify you about quotes, payments, and job progress.'}
                            </div>
                        </div>
                    ) : (
                        <div style={styles.list}>
                            {visibleItems.map((n) => {
                                const unread = n.read !== true;
                                const jobPath = n.jobId
                                    ? role === 'tradie'
                                        ? `/tradie/job/${n.jobId}`
                                        : `/job/${n.jobId}`
                                    : null;
                                const targetPath =
                                    jobPath && n.type === 'message_received' ? `${jobPath}#chat` : jobPath;
                                const kind = getNotificationKind(n.type);
                                const refLine = n.jobId ? formatTaskRefRowLabel(n.jobId) : '';
                                const timeLabel = formatRelativeTimeShort(n.createdAt);

                                return (
                                    <button
                                        key={n.id}
                                        type="button"
                                        onClick={() => {
                                            if (unread) markOneRead(n.id);
                                            if (n.jobId) {
                                                navigate(targetPath);
                                            }
                                        }}
                                        style={{
                                            ...styles.row,
                                            ...(unread ? styles.rowUnread : {}),
                                        }}
                                        className="notifications-row-card"
                                        aria-label={`${n.title || 'Notification'}${refLine ? `, ${refLine}` : ''}`}
                                    >
                                        <div style={styles.rowTop}>
                                            <span
                                                style={{
                                                    ...styles.kindPill,
                                                    color: kind.accent,
                                                    background: kind.bg,
                                                    border: `1px solid ${kind.border}`,
                                                }}
                                            >
                                                {kind.label}
                                            </span>
                                            <span style={styles.timeLabel}>{timeLabel}</span>
                                        </div>
                                        <div style={styles.notifTitle}>{n.title || 'Notification'}</div>
                                        {n.body ? (
                                            <div style={styles.bodyText} className="notifications-body-clamp">{n.body}</div>
                                        ) : null}
                                        <div style={styles.metaRow}>
                                            {refLine ? <span style={styles.refText}>{refLine}</span> : null}
                                            {unread ? (
                                                <span style={styles.unreadDotLabel}>Unread</span>
                                            ) : (
                                                <span style={styles.readLabel}>Read</span>
                                            )}
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
        gap: 14,
        alignItems: 'flex-start',
        marginBottom: 16,
        flexWrap: 'wrap',
    },
    headerActions: { display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center', justifyContent: 'flex-end' },
    title: { fontFamily: 'Poppins, sans-serif', fontSize: 22, fontWeight: 700, color: '#111827' },
    subTitle: { fontSize: 14, color: '#6B7280', marginTop: 6, lineHeight: 1.55, maxWidth: 640 },
    summaryPill: {
        borderRadius: 999,
        padding: '8px 14px',
        border: '1px solid #E5E7EB',
        background: '#fff',
        color: '#374151',
        fontSize: 12,
        fontWeight: 700,
    },
    infoCallout: {
        fontSize: 13,
        color: '#6B7280',
        background: '#fff',
        border: '1px solid #E5E7EB',
        borderRadius: 10,
        padding: '12px 14px',
        marginBottom: 14,
        lineHeight: 1.45,
    },
    card: {
        background: '#fff',
        border: '1px solid #E5E7EB',
        borderRadius: 12,
        padding: 20,
        boxShadow: '0 1px 2px rgba(0,0,0,0.04)',
    },
    error: {
        background: '#fff1f2',
        border: '1px solid #fecdd3',
        color: '#9f1239',
        padding: '10px 12px',
        borderRadius: 10,
        fontSize: 13,
        marginBottom: 10,
    },
    loadFailureCard: {
        background: '#fff',
        border: '1px solid #E5E7EB',
        borderLeft: '4px solid #0d9488',
        borderRadius: 12,
        padding: '20px 22px',
        boxShadow: '0 1px 2px rgba(0,0,0,0.04)',
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
        gap: 10,
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
    supportLinkInline: {
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
    buttonSecondary: {
        background: '#fff',
        color: '#374151',
        border: '1px solid #D1D5DB',
        borderRadius: 10,
        padding: '11px 16px',
        minHeight: 44,
        cursor: 'pointer',
        fontWeight: 600,
        fontSize: 14,
        fontFamily: 'Inter, sans-serif',
        boxSizing: 'border-box',
    },
    list: { display: 'grid', gap: 10 },
    row: {
        width: '100%',
        textAlign: 'left',
        borderRadius: 12,
        border: '1px solid #E5E7EB',
        background: '#fff',
        padding: '14px 16px',
        cursor: 'pointer',
        boxShadow: '0 1px 2px rgba(0,0,0,0.04)',
    },
    rowUnread: {
        borderColor: '#FDE68A',
        background: '#FFFBEB',
    },
    rowTop: {
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        gap: 10,
        marginBottom: 8,
        flexWrap: 'wrap',
    },
    kindPill: {
        fontSize: 11,
        fontWeight: 700,
        textTransform: 'uppercase',
        letterSpacing: '0.04em',
        padding: '4px 10px',
        borderRadius: 999,
    },
    timeLabel: { fontSize: 12, fontWeight: 600, color: '#6B7280', whiteSpace: 'nowrap' },
    notifTitle: { fontSize: 15, fontWeight: 700, color: '#111827', marginBottom: 6, lineHeight: 1.35 },
    bodyText: { fontSize: 14, color: '#4B5563', lineHeight: 1.5, marginBottom: 10 },
    metaRow: { display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 10, justifyContent: 'space-between' },
    refText: { fontSize: 12, color: '#9CA3AF', fontWeight: 500 },
    unreadDotLabel: { fontSize: 11, fontWeight: 700, color: '#B45309' },
    readLabel: { fontSize: 11, fontWeight: 600, color: '#9CA3AF' },
};
