// src/components/HomeownerJobDetail.js
import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, Link, useLocation } from 'react-router-dom';
import { Zap } from 'lucide-react';
import { auth, db } from '../firebase';
import { createApiClient } from '../api/createApiClient';
import AppHeader from './AppHeader';
import JobChatPanel from './JobChatPanel';
import VariationPanel from './VariationPanel';
import RevisionRequestModal from '../features/homeowner/job-detail/RevisionRequestModal';
import QuotesSection from '../features/homeowner/job-detail/QuotesSection';
import { collection, doc, getDoc, onSnapshot, serverTimestamp, setDoc } from 'firebase/firestore';
import {
    JOB_STATUSES,
    getStatusLabel,
    getStatusColors,
    isChatEnabled,
    normalizeStatus
} from '../constants/jobStatuses';
import { getClientAccountStatus } from '../utils/homeownerAccount';
import { formatTaskReferenceLabel, getTaskReferenceCode } from '../utils/taskReference';
import { isEscrowFunded } from '../utils/homeownerDashboardCards';
import { getClientPaymentStateLabel } from '../utils/paymentStoryLabels';
import { CLIENT_ACCOUNT_INCOMPLETE } from '../constants/blockedFlowCopy';
import { getJobDisplayLayers } from '../utils/jobDisplayFromJob';
import { PageLoadingShell, PageErrorShell } from './ui/AsyncPageStates';
import PageMain from './ui/PageMain';
import { canRequestCancellationAfterStart } from '../utils/jobStateHelpers';
import ConfirmDialog from '../design/components/ConfirmDialog';

const api = createApiClient();

function ClientJobDetail() {
    const { jobId } = useParams();
    const navigate = useNavigate();
    const location = useLocation();
    const [job, setJob] = useState(null);
    const [quotes, setQuotes] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [releasing, setReleasing] = useState(false);
    const [payNavigating, setPayNavigating] = useState(false);
    const [cancellingTask, setCancellingTask] = useState(false);
    const [reportingIssue, setReportingIssue] = useState(false);
    const [success, setSuccess] = useState('');
    const [revisionRequests, setRevisionRequests] = useState([]);
    const [requestingRevisionFor, setRequestingRevisionFor] = useState(null);
    const [review, setReview] = useState(null);
    const [reviewLoading, setReviewLoading] = useState(false);
    const [reviewSubmitting, setReviewSubmitting] = useState(false);
    const [reviewError, setReviewError] = useState('');
    const [reviewSuccess, setReviewSuccess] = useState('');
    const [reviewForm, setReviewForm] = useState({ rating: 5, text: '' });
    const [revisionModal, setRevisionModal] = useState({ open: false, tradieUid: '' });
    const [revisionMessage, setRevisionMessage] = useState('Can you revise your quote based on updated scope?');
    const [quotesLocked, setQuotesLocked] = useState(false);
    const [quotesLockReason, setQuotesLockReason] = useState('');
    const [accountGateNext, setAccountGateNext] = useState('');
    const [accountGateMsg, setAccountGateMsg] = useState('');
    const [taskRefCopied, setTaskRefCopied] = useState(false);
    const [refetchKey, setRefetchKey] = useState(0);
    const [releaseError, setReleaseError] = useState('');
    const [confirmingPayment, setConfirmingPayment] = useState(false);
    const [actionDialog, setActionDialog] = useState(null);
    const [issueReason, setIssueReason] = useState('');

    useEffect(() => {
        const fetchData = async () => {
            const user = auth.currentUser;
            if (!user) {
                navigate('/login');
                return;
            }

            try {
                setLoading(true);
                setError('');
                setReleaseError('');
                setQuotesLocked(false);
                setQuotesLockReason('');
                const token = await user.getIdToken();
                const config = { headers: { Authorization: `Bearer ${token}` } };

                // Always load the job; quotes may be gated by verification requirements.
                const jobResponse = await api.get(`/api/jobs/${jobId}`, config);
                setJob(jobResponse.data);

                try {
                    const quotesResponse = await api.get(`/api/jobs/${jobId}/quotes`, config);
                    setQuotes(quotesResponse.data);
                } catch (qErr) {
                    const code = qErr?.response?.data?.code;
                    if (qErr?.response?.status === 403 && code === 'quote_access_required') {
                        setQuotes([]);
                        setQuotesLocked(true);
                        setQuotesLockReason(qErr?.response?.data?.message || 'Please verify your phone to view quotes.');
                    } else {
                        throw qErr;
                    }
                }
                // Load revision requests (for status display)
                try {
                    const rr = await api.get(`/api/jobs/${jobId}/revision-requests`, config);
                    setRevisionRequests(rr.data?.requests || []);
                } catch (e) {
                    setRevisionRequests([]);
                }

                // Load review (if already submitted)
                setReviewLoading(true);
                setReviewError('');
                try {
                    const rr = await api.get(`/api/jobs/${jobId}/review`, config);
                    setReview(rr.data?.review || null);
                } catch (e) {
                    setReview(null);
                } finally {
                    setReviewLoading(false);
                }
            } catch (err) {
                console.error("Error fetching job details:", err);
                setError('Could not load task details. You may not have permission or the task does not exist.');
            } finally {
                setLoading(false);
            }
        };

        fetchData();
    }, [jobId, navigate, refetchKey]);

    // Banner when returning from /payment/:jobId/:quoteId with payment already recovered
    useEffect(() => {
        const banner = typeof location.state?.taskioBanner === 'string' ? location.state.taskioBanner.trim() : '';
        if (!banner) return;
        setSuccess(banner);
        navigate(`${location.pathname}${location.search || ''}`, { replace: true, state: {} });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [location.state]);

    // Real-time job status listener: merge key fields from Firestore into local state
    // so that action panels (cancel, variations, approval) update without a page refresh.
    // This fires whenever the backend transitions job.status (e.g. FUNDED → IN_PROGRESS
    // when the Expert marks work as started) or when progressStatus/paymentState changes.
    useEffect(() => {
        if (!jobId) return undefined;
        const unsub = onSnapshot(
            doc(db, 'jobs', jobId),
            (snap) => {
                if (!snap.exists()) return;
                const live = snap.data();
                setJob((prev) => ({
                    ...(prev || {}),
                    status: live.status ?? prev?.status,
                    progressStatus: live.progressStatus ?? prev?.progressStatus,
                    progressStatusUpdatedAt: live.progressStatusUpdatedAt ?? prev?.progressStatusUpdatedAt,
                    workStartedAt: live.workStartedAt ?? prev?.workStartedAt,
                    paymentState: live.paymentState ?? prev?.paymentState,
                    paymentStatus: live.paymentStatus ?? prev?.paymentStatus,
                    chatFrozen: live.chatFrozen ?? prev?.chatFrozen,
                }));
            },
            () => {
                // Silently ignore permission errors (e.g. if user role changes mid-session).
            }
        );
        return () => unsub();
    }, [jobId]);

    // Stripe Checkout return banner (success/cancel)
    useEffect(() => {
        let cancelled = false;
        const qs = new URLSearchParams(location.search || '');
        const v = qs.get('checkout');
        const stripeSessionId = qs.get('session_id');

        const jobLooksPaid = (j) => {
            if (!j) return false;
            const ns = normalizeStatus(j.status);
            return (
                j.paymentState === 'in_escrow' ||
                j.paymentStatus === 'succeeded' ||
                [JOB_STATUSES.FUNDED, JOB_STATUSES.IN_PROGRESS, JOB_STATUSES.COMPLETED, JOB_STATUSES.PAID].includes(ns)
            );
        };

        if (v === 'success') {
            setError('');
            setSuccess('');
            setConfirmingPayment(true);

            const syncPayment = async () => {
                try {
                    const user = auth.currentUser;
                    if (!user) {
                        if (!cancelled) setConfirmingPayment(false);
                        return;
                    }
                    const token = await user.getIdToken();
                    const config = { headers: { Authorization: `Bearer ${token}` } };

                    try {
                        const body = stripeSessionId ? { sessionId: stripeSessionId } : {};
                        await api.post(`/api/jobs/${jobId}/payment-confirmed`, body, config);
                    } catch (e) {
                        // Continue polling — webhook or a retry may still complete funding.
                    }

                    for (let attempt = 0; attempt < 10 && !cancelled; attempt += 1) {
                        try {
                            const jobResponse = await api.get(`/api/jobs/${jobId}`, config);
                            const nextJob = jobResponse.data;
                            setJob(nextJob);
                            if (jobLooksPaid(nextJob)) {
                                setConfirmingPayment(false);
                                setSuccess('Payment secured. The Expert can now start the work.');
                                return;
                            }
                        } catch (_) {
                            /* keep polling */
                        }
                        const delayMs = Math.min(5500, 650 + attempt * 550 + attempt * attempt * 40);
                        await new Promise((r) => setTimeout(r, delayMs));
                    }
                    if (!cancelled) {
                        setConfirmingPayment(false);
                        setSuccess(
                            'We could not finish confirming your payment yet. Wait a moment and refresh, or use Pay with Stripe only if Stripe shows the payment did not complete.'
                        );
                    }
                } catch (e) {
                    if (!cancelled) {
                        setConfirmingPayment(false);
                        setSuccess(
                            'We could not finish confirming your payment yet. Wait a moment and refresh, or use Pay with Stripe only if Stripe shows the payment did not complete.'
                        );
                    }
                }
            };

            syncPayment();
        } else if (v === 'cancel') {
            setError('Payment wasn\'t completed. You can try again when ready.');
        }
        if (v === 'success' || v === 'cancel') {
            qs.delete('checkout');
            const nextSearch = qs.toString();
            navigate(`${location.pathname}${nextSearch ? `?${nextSearch}` : ''}`, { replace: true });
        }

        // Variation payment return handling (Stripe Checkout)
        const vp = qs.get('variationPayment');
        const varSessionId = qs.get('session_id');
        if (vp === 'success') {
            setSuccess('Payment successful — we’re confirming your variation payment now.');
            const syncVariationPayment = async () => {
                try {
                    const user = auth.currentUser;
                    if (!user) return;
                    const token = await user.getIdToken();
                    const config = { headers: { Authorization: `Bearer ${token}` } };

                    if (varSessionId) {
                        for (let attempt = 0; attempt < 8 && !cancelled; attempt += 1) {
                            try {
                                const r = await api.post(
                                    `/api/jobs/${jobId}/variations/confirm-checkout-session`,
                                    { sessionId: varSessionId },
                                    config
                                );
                                if (r.data?.status === 'completed') break;
                                if (r.data?.status === 'pending') {
                                    await new Promise((r2) => setTimeout(r2, 1500));
                                    continue;
                                }
                            } catch (e) {
                                if (attempt === 7) throw e;
                                await new Promise((r2) => setTimeout(r2, 1500));
                            }
                        }
                    }

                    if (!cancelled) {
                        setRefetchKey((k) => k + 1);
                        setSuccess(
                            'Your variation payment has been secured. The expert has been notified and can proceed with the approved variation work.'
                        );
                    }
                } catch (e) {
                    if (!cancelled) {
                        setRefetchKey((k) => k + 1);
                        setSuccess(
                            'Payment received. We’re confirming it now — this usually only takes a few seconds. Refresh the page if the variation still shows as unpaid.'
                        );
                    }
                }
            };
            syncVariationPayment();
        } else if (vp === 'cancelled') {
            setError('Variation payment wasn\'t completed. You can try again when ready.');
        }
        if (vp === 'success' || vp === 'cancelled') {
            qs.delete('variationPayment');
            qs.delete('session_id');
            qs.delete('variationId');
            const nextSearch = qs.toString();
            navigate(`${location.pathname}${nextSearch ? `?${nextSearch}` : ''}`, { replace: true });
        }
        return () => {
            cancelled = true;
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [jobId, location.pathname, location.search, navigate]);

    const clientHasCompletedAccount = async () => {
        const user = auth.currentUser;
        if (!user) return false;
        const snap = await getDoc(doc(db, 'users', user.uid));
        const data = snap.exists() ? (snap.data() || {}) : {};
        return getClientAccountStatus(data, user).durableAccountReady;
    };

    const handleAcceptQuote = (quoteId) => {
        (async () => {
            try {
                const user = auth.currentUser;
                if (!user) return navigate('/login');
                const ok = await clientHasCompletedAccount();
                if (!ok) {
                    const next = `/payment/${jobId}/${quoteId}`;
                    setAccountGateNext(next);
                    setAccountGateMsg(CLIENT_ACCOUNT_INCOMPLETE.body);
                    return;
                }
                console.log(`Navigating to payment for job ${jobId} and quote ${quoteId}`);
                navigate(`/payment/${jobId}/${quoteId}`);
            } catch (e) {
                const next = `/payment/${jobId}/${quoteId}`;
                setAccountGateNext(next);
                setAccountGateMsg(CLIENT_ACCOUNT_INCOMPLETE.body);
            }
        })();
    };

    const handleContinuePayment = () => {
        if (!job?.acceptedQuoteId) return;
        setPayNavigating(true);
        (async () => {
            try {
                const user = auth.currentUser;
                if (!user) {
                    setPayNavigating(false);
                    return navigate('/login');
                }
                const ok = await clientHasCompletedAccount();
                if (!ok) {
                    setPayNavigating(false);
                    const next = `/payment/${jobId}/${job.acceptedQuoteId}`;
                    setAccountGateNext(next);
                    setAccountGateMsg(CLIENT_ACCOUNT_INCOMPLETE.body);
                    return;
                }
                navigate(`/payment/${jobId}/${job.acceptedQuoteId}`);
            } catch (e) {
                setPayNavigating(false);
                const next = `/payment/${jobId}/${job.acceptedQuoteId}`;
                setAccountGateNext(next);
                setAccountGateMsg(CLIENT_ACCOUNT_INCOMPLETE.body);
            }
        })();
    };

    const goCompleteAccount = () => {
        navigate(`/account/complete?next=${encodeURIComponent(accountGateNext || `/job/${jobId}`)}`);
    };

    const handleCancelTask = () => {
        setActionDialog({ type: 'cancel' });
    };

    const performCancelTask = () => {
        setCancellingTask(true);
        setError('');
        setSuccess('');
        (async () => {
            try {
                const user = auth.currentUser;
                if (!user) return navigate('/login');
                const token = await user.getIdToken();
                const config = { headers: { Authorization: `Bearer ${token}` } };
                await api.post(`/api/jobs/${jobId}/cancel`, {}, config);
                const jobResponse = await api.get(`/api/jobs/${jobId}`, config);
                setJob(jobResponse.data);
                setSuccess('Task cancelled.');
            } catch (e) {
                setError(e?.response?.data?.message || 'Could not cancel task.');
            } finally {
                setCancellingTask(false);
            }
        })();
    };

    const handleReportIssue = () => {
        setIssueReason('');
        setActionDialog({ type: 'report' });
    };

    const performReportIssue = () => {
        setReportingIssue(true);
        setError('');
        setSuccess('');
        (async () => {
            try {
                const user = auth.currentUser;
                if (!user) return navigate('/login');
                const token = await user.getIdToken();
                const config = { headers: { Authorization: `Bearer ${token}` } };
                await api.post(`/api/jobs/${jobId}/report-issue`, { reason: String(issueReason || '').trim() }, config);
                const jobResponse = await api.get(`/api/jobs/${jobId}`, config);
                setJob(jobResponse.data);
                setSuccess('Issue reported.');
            } catch (e) {
                setError(e?.response?.data?.message || 'Could not report issue.');
            } finally {
                setReportingIssue(false);
            }
        })();
    };

    const handleReleasePayment = async () => {
        setError('');
        setReleaseError('');
        setSuccess('');
        setReleasing(true);
        try {
            const user = auth.currentUser;
            if (!user) return navigate('/login');
            const token = await user.getIdToken();
            const config = { headers: { Authorization: `Bearer ${token}` } };
            await api.post(`/api/jobs/${jobId}/release`, {}, config);
            setSuccess('You approved completion — payment is released. The Expert’s payout is processed by Stripe.');
            // Audit trail (system message)
            try {
                const msgRef = doc(collection(db, 'jobs', jobId, 'messages'));
                const senderName = (user.displayName || '').trim() || 'Client';
                await setDoc(msgRef, {
                    jobId,
                    messageId: msgRef.id,
                    senderUid: user.uid,
                    senderRole: 'homeowner',
                    senderName,
                    messageType: 'system',
                    text: 'Approved work — payment released.',
                    createdAt: serverTimestamp(),
                    flagged: false,
                    flagReasons: [],
                });
            } catch (e) {
                // Non-blocking
            }

            const jobResponse = await api.get(`/api/jobs/${jobId}`, config);
            setJob(jobResponse.data);

            // refresh review state (still null until submitted)
            try {
                const rr = await api.get(`/api/jobs/${jobId}/review`, config);
                setReview(rr.data?.review || null);
            } catch (e) {
                setReview(null);
            }
        } catch (e) {
            setReleaseError(e?.response?.data?.message || 'Failed to release payment.');
        } finally {
            setReleasing(false);
        }
    };

    const openRevisionModal = (tradieUid) => {
        setError('');
        setSuccess('');
        setRevisionModal({ open: true, tradieUid: String(tradieUid || '') });
    };

    const closeRevisionModal = (force = false) => {
        if (requestingRevisionFor && !force) return;
        setRevisionModal({ open: false, tradieUid: '' });
        setRevisionMessage('Can you revise your quote based on updated scope?');
    };

    const submitRevisionRequest = async () => {
        const tradieUid = String(revisionModal.tradieUid || '').trim();
        if (!tradieUid) return;

        setError('');
        setSuccess('');
        setRequestingRevisionFor(tradieUid);
        try {
            const user = auth.currentUser;
            if (!user) return navigate('/login');
            const token = await user.getIdToken();
            const config = { headers: { Authorization: `Bearer ${token}` } };
            await api.post(
                `/api/jobs/${jobId}/quotes/${tradieUid}/request-revision`,
                { message: String(revisionMessage || '').trim() },
                config
            );
            setSuccess('Revision requested from your Expert.');
            closeRevisionModal(true);

            const rr = await api.get(`/api/jobs/${jobId}/revision-requests`, config);
            setRevisionRequests(rr.data?.requests || []);
        } catch (e) {
            setError(e?.response?.data?.message || 'Failed to request a revised quote.');
        } finally {
            setRequestingRevisionFor(null);
        }
    };

    if (loading) {
        return (
            <>
                <AppHeader
                    userRole="homeowner"
                    userName={auth.currentUser?.displayName || ''}
                    userEmail={auth.currentUser?.email || ''}
                />
                <PageLoadingShell
                    message="Loading task details…"
                    detail="Fetching your task, quotes, and related updates."
                />
            </>
        );
    }

    if (error) {
        return (
            <>
                <AppHeader
                    userRole="homeowner"
                    userName={auth.currentUser?.displayName || ''}
                    userEmail={auth.currentUser?.email || ''}
                />
                <PageErrorShell
                    title="We couldn’t load this task"
                    message={error}
                    onRetry={() => setRefetchKey((k) => k + 1)}
                    retryLabel="Try again"
                />
            </>
        );
    }

    if (!job) {
        return (
            <>
                <AppHeader
                    userRole="homeowner"
                    userName={auth.currentUser?.displayName || ''}
                    userEmail={auth.currentUser?.email || ''}
                />
                <PageErrorShell
                    title="Task not found"
                    message="This task may have been removed or you may not have access."
                    onRetry={() => navigate('/dashboard')}
                    retryLabel="Back to dashboard"
                />
            </>
        );
    }

    const canReview = [JOB_STATUSES.COMPLETED, JOB_STATUSES.PAID].includes(normalizeStatus(job.status)) && job.paymentState === 'released';

    const submitReview = async () => {
        setReviewError('');
        setReviewSuccess('');
        setReviewSubmitting(true);
        try {
            const user = auth.currentUser;
            if (!user) return navigate('/login');
            const token = await user.getIdToken();
            const config = { headers: { Authorization: `Bearer ${token}` } };
            await api.post(`/api/jobs/${jobId}/review`, { rating: reviewForm.rating, text: reviewForm.text }, config);
            setReviewSuccess('Thanks! Your review has been submitted.');
            const rr = await api.get(`/api/jobs/${jobId}/review`, config);
            setReview(rr.data?.review || null);
        } catch (e) {
            setReviewError(e?.response?.data?.message || 'Failed to submit review.');
        } finally {
            setReviewSubmitting(false);
        }
    };

    // Normalize status and get badge styling
    const normalized = normalizeStatus(job.status);
    const escrowFunded = isEscrowFunded(job);
    const colors = getStatusColors(normalized);
    const label = getStatusLabel(normalized);
    const statusBadge = { label, color: colors.text, bg: colors.bg };
    
    // Chat opens once escrow is funded (including brief AWAITING_FUNDING while status catches up)
    const chatEnabled = isChatEnabled(normalized) || (normalized === JOB_STATUSES.AWAITING_FUNDING && escrowFunded);
    const displayLayers = getJobDisplayLayers(job);

    return (
        <>
            <style>{`
                /* Hover and Focus States */
                .homeowner-quote-card:hover {
                    transform: translateY(-2px);
                    box-shadow: 0 6px 16px rgba(0,0,0,0.12);
                    border-color: #14C5C5;
                }
                .homeowner-accept-btn:hover {
                    background-color: #12B0B0;
                    transform: translateY(-1px);
                }
                .homeowner-accept-btn:focus,
                .homeowner-revision-btn:focus,
                .homeowner-release-btn:focus,
                .homeowner-pay-btn:focus {
                    outline: 2px solid #14C5C5;
                    outline-offset: 2px;
                }
                .homeowner-revision-btn:hover {
                    opacity: 0.9;
                }
                .homeowner-back-link:hover {
                    text-decoration: underline;
                }
                /* Client task detail — narrow phones (375–480px): readable scan, full-width trust CTAs */
                @media (max-width: 480px) {
                    .homeowner-job-detail-shell {
                        padding: 12px 12px 28px !important;
                        max-width: 100% !important;
                        box-sizing: border-box !important;
                        overflow-x: hidden;
                    }
                    .homeowner-job-detail-breadcrumb {
                        margin-bottom: 16px !important;
                        font-size: 13px !important;
                        flex-wrap: wrap !important;
                    }
                    .homeowner-job-detail-header {
                        flex-direction: column !important;
                        align-items: flex-start !important;
                        gap: 12px !important;
                        padding-bottom: 16px !important;
                        margin-bottom: 20px !important;
                    }
                    .homeowner-job-detail-title {
                        font-size: 22px !important;
                        line-height: 1.25 !important;
                        word-break: break-word;
                    }
                    .homeowner-task-ref-copy {
                        min-height: 40px !important;
                        padding: 8px 12px !important;
                        box-sizing: border-box !important;
                    }
                    .homeowner-job-detail-grid {
                        gap: 16px !important;
                    }
                    .homeowner-job-section {
                        padding: 16px !important;
                        margin-bottom: 14px !important;
                    }
                    .homeowner-detail-details-grid {
                        display: grid !important;
                        grid-template-columns: 1fr !important;
                        gap: 12px !important;
                    }
                    .homeowner-photo-grid {
                        grid-template-columns: repeat(auto-fit, minmax(120px, 1fr)) !important;
                    }
                    .homeowner-urgent-header {
                        flex-direction: column !important;
                        align-items: flex-start !important;
                        gap: 10px !important;
                    }
                    .homeowner-gate-actions {
                        flex-direction: column !important;
                        align-items: stretch !important;
                    }
                    .homeowner-gate-actions .homeowner-pay-btn,
                    .homeowner-gate-actions button {
                        width: 100% !important;
                        flex: 1 1 auto !important;
                        min-height: 48px !important;
                        box-sizing: border-box !important;
                    }
                    .homeowner-pay-btn,
                    .homeowner-release-btn,
                    .homeowner-accept-btn {
                        min-height: 48px !important;
                        box-sizing: border-box !important;
                    }
                    .homeowner-in-progress-action .homeowner-pay-btn {
                        min-height: 48px !important;
                        width: 100% !important;
                        box-sizing: border-box !important;
                    }
                    .homeowner-in-progress-action a {
                        display: block !important;
                        text-align: center !important;
                    }
                }
            `}</style>
            <AppHeader 
                userRole="homeowner" 
                userName={auth.currentUser?.displayName || ''} 
                userEmail={auth.currentUser?.email || ''}
            />
            <PageMain label="Task details">
            <div style={styles.pageContainer} className="homeowner-job-detail-shell">
                {/* Breadcrumb */}
                <nav style={styles.breadcrumb} className="homeowner-job-detail-breadcrumb" aria-label="Breadcrumb">
                    <Link to="/dashboard" style={styles.breadcrumbLink}>Dashboard</Link>
                    <span style={styles.breadcrumbDivider}>/</span>
                    <span style={styles.breadcrumbCurrent}>{displayLayers.fullTaskDisplayTitle}</span>
                </nav>

                {/* Job Header with Status */}
                <div style={styles.jobHeader} className="homeowner-job-detail-header">
                    <div>
                        <h1 style={styles.jobTitle} className="homeowner-job-detail-title">{displayLayers.fullTaskDisplayTitle}</h1>
                        <div style={styles.taskRefRow}>
                            <span style={styles.taskRefText}>{formatTaskReferenceLabel(job.id)}</span>
                            <button
                                type="button"
                                className="homeowner-task-ref-copy"
                                style={styles.taskRefCopyBtn}
                                onClick={async () => {
                                    const code = getTaskReferenceCode(job.id);
                                    try {
                                        await navigator.clipboard.writeText(code);
                                        setTaskRefCopied(true);
                                        window.setTimeout(() => setTaskRefCopied(false), 2000);
                                    } catch {
                                        setTaskRefCopied(false);
                                    }
                                }}
                            >
                                {taskRefCopied ? 'Copied' : 'Copy'}
                            </button>
                        </div>
                        <div style={styles.jobMeta}>
                            <span>{job.location}</span>
                            <span style={styles.metaDivider}>•</span>
                            <span>{job.budget}</span>
                        </div>
                    </div>
                    <div style={{...styles.statusBadge, backgroundColor: statusBadge.bg, color: statusBadge.color}}>
                        {statusBadge.label}
                    </div>
                </div>
            {confirmingPayment && (
                <div style={styles.successBanner} role="status" aria-live="polite">
                    Confirming your payment…
                </div>
            )}
            {success && (
                <div style={styles.successBanner} role="status" aria-live="polite">
                    ✓ {success}
                </div>
            )}

            {/* Two Column Layout */}
            <div style={styles.contentGrid} className="homeowner-job-detail-grid">
                {/* Left Column: Job Info */}
                <div>
                    <div style={styles.section} className="homeowner-job-section">
                        <h2 style={styles.sectionTitle}>Task Description</h2>
                        <p style={styles.description}>{job.description}</p>
                        
                        <div style={styles.detailsGrid} className="homeowner-detail-details-grid">
                            <div style={styles.detailItem}>
                                <div style={styles.detailLabel}>Task</div>
                                <div style={styles.detailValue}>{displayLayers.categoryDisplayLabel || '—'}</div>
                            </div>
                            <div style={styles.detailItem}>
                                <div style={styles.detailLabel}>Job type</div>
                                <div style={styles.detailValue}>{displayLayers.taskTypeDisplayLabel || '—'}</div>
                            </div>
                            <div style={styles.detailItem}>
                                <div style={styles.detailLabel}>Timeline</div>
                                <div style={styles.detailValue}>{job.timeline}</div>
                            </div>
                            <div style={styles.detailItem}>
                                <div style={styles.detailLabel}>Payment</div>
                                <div style={styles.detailValue}>{getClientPaymentStateLabel(job.paymentState)}</div>
                            </div>
                        </div>
                    </div>

                    {Array.isArray(job.postingPhotos) && job.postingPhotos.length > 0 && (
                        <div style={styles.section} className="homeowner-job-section">
                            <h2 style={styles.sectionTitle}>Job photos</h2>
                            <div style={styles.photoGrid} className="homeowner-photo-grid">
                                {job.postingPhotos.map((photo) => (
                                    <a
                                        key={photo.storagePath || photo.downloadUrl}
                                        href={photo.downloadUrl}
                                        target="_blank"
                                        rel="noreferrer"
                                        style={styles.photoLink}
                                    >
                                        <img src={photo.downloadUrl} alt={photo.fileName || 'Job photo'} style={styles.photoImage} />
                                    </a>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Chat & Variations */}
                    {chatEnabled ? (
                        <>
                            <JobChatPanel jobId={jobId} fallbackJob={job} />
                            <VariationPanel jobId={jobId} job={job} />
                        </>
                    ) : (
                        <div style={styles.chatNoticeCard}>
                            <div style={styles.chatNoticeIcon}>💬</div>
                            <div style={styles.chatNoticeTitle}>Chat opens after payment is secured</div>
                            <div style={styles.chatNoticeText}>
                                Once your payment is secured, you and your Expert can message here.
                            </div>
                        </div>
                    )}
                </div>

                {/* Right Column: Actions & Quotes */}
                <div>

                    {/* Account completion gate (used when user attempts payment/accept before full account setup) */}
                    {accountGateNext && (
                        <div style={styles.gateCard}>
                            <div style={styles.gateHeader}>
                                <div style={styles.gateIconWrap} aria-hidden="true">👤</div>
                                <div>
                                    <div style={styles.gateTitle}>{CLIENT_ACCOUNT_INCOMPLETE.title}</div>
                                    <div style={styles.gateText}>
                                        {accountGateMsg || CLIENT_ACCOUNT_INCOMPLETE.body}
                                    </div>
                                </div>
                            </div>
                            <div style={styles.gateActions} className="homeowner-gate-actions">
                                <button onClick={goCompleteAccount} className="homeowner-pay-btn" style={styles.gatePrimaryBtn}>
                                    {CLIENT_ACCOUNT_INCOMPLETE.primaryCta}
                                </button>
                                <button
                                    type="button"
                                    onClick={() => { setAccountGateNext(''); setAccountGateMsg(''); }}
                                    style={styles.gateSecondaryBtn}
                                >
                                    {CLIENT_ACCOUNT_INCOMPLETE.dismiss}
                                </button>
                            </div>
                            <div style={{ marginTop: 12 }}>
                                <Link to="/support" style={{ fontSize: 13, color: '#0d9488', fontWeight: 700, textDecoration: 'none' }}>
                                    Help &amp; Support
                                </Link>
                            </div>
                        </div>
                    )}

                    {/* Payment Required (High Priority) */}
                    {normalized === JOB_STATUSES.AWAITING_FUNDING && job.acceptedQuoteId && !escrowFunded && !confirmingPayment && (
                        <div style={styles.urgentActionCard}>
                            <div style={styles.urgentHeader} className="homeowner-urgent-header">
                                <span style={styles.urgentIcon}><Zap size={18} strokeWidth={2.2} /></span>
                                <div>
                                    <div style={styles.urgentTitle}>Payment required</div>
                                    <div style={styles.urgentText}>
                                        Fund the task so your Expert can start — payment is not released to the Expert until you approve completion
                                    </div>
                                </div>
                            </div>
                            <button
                                type="button"
                                onClick={handleContinuePayment}
                                disabled={payNavigating || confirmingPayment}
                                className="homeowner-pay-btn"
                                style={{
                                    ...styles.payNowButton,
                                    ...((payNavigating || confirmingPayment) ? { opacity: 0.75, cursor: 'not-allowed' } : {}),
                                }}
                            >
                                {payNavigating ? 'Opening payment…' : 'Pay with Stripe'}
                            </button>
                            <div style={styles.paymentEscrowHint}>
                                Stripe processes the payment securely. Funds are not released to the Expert until you approve the completed work.
                            </div>
                            <button
                                type="button"
                                onClick={handleCancelTask}
                                disabled={cancellingTask}
                                style={{
                                    ...styles.subtleTextBtn,
                                    marginTop: 14,
                                    ...(cancellingTask ? { opacity: 0.6, cursor: 'not-allowed' } : {}),
                                }}
                            >
                                {cancellingTask ? 'Cancelling…' : 'Cancel task'}
                            </button>
                        </div>
                    )}

                    {normalized === JOB_STATUSES.AWAITING_FUNDING && job.acceptedQuoteId && escrowFunded && (
                        <div style={styles.urgentActionCard}>
                            <div style={styles.urgentHeader} className="homeowner-urgent-header">
                                <span style={styles.urgentIcon}><Zap size={18} strokeWidth={2.2} /></span>
                                <div>
                                    <div style={styles.urgentTitle}>Payment secured</div>
                                    <div style={{ ...styles.urgentText, marginTop: 6 }}>
                                        Payment is held until you approve completion and release it to the Expert.
                                    </div>
                                </div>
                            </div>
                            <button
                                type="button"
                                onClick={() => navigate(`/job/${jobId}#chat`)}
                                className="homeowner-pay-btn"
                                style={styles.chatAfterPaymentButton}
                            >
                                Chat with Expert
                            </button>
                            <button
                                type="button"
                                onClick={handleCancelTask}
                                disabled={cancellingTask}
                                style={{
                                    ...styles.subtleTextBtn,
                                    marginTop: 12,
                                    ...(cancellingTask ? { opacity: 0.6, cursor: 'not-allowed' } : {}),
                                }}
                            >
                                {cancellingTask ? 'Cancelling…' : 'Cancel task'}
                            </button>
                        </div>
                    )}

                    {normalized === JOB_STATUSES.FUNDED && job.paymentState === 'in_escrow' && job.acceptedQuoteId && (
                        <div style={styles.urgentActionCard}>
                            <div style={styles.urgentText}>
                                Plans changed? You can cancel before work starts. Payment will be refunded according to Taskio&apos;s cancellation policy.
                            </div>
                            <button
                                type="button"
                                onClick={handleCancelTask}
                                disabled={cancellingTask}
                                className="homeowner-pay-btn"
                                style={{
                                    ...styles.chatAfterPaymentButton,
                                    marginTop: 12,
                                    ...(cancellingTask ? { opacity: 0.75, cursor: 'not-allowed' } : {}),
                                }}
                            >
                                {cancellingTask ? 'Cancelling…' : 'Cancel task'}
                            </button>
                        </div>
                    )}

                    {/* Work has started — show support guidance, not a simple cancel button */}
                    {normalized === JOB_STATUSES.IN_PROGRESS && canRequestCancellationAfterStart(job) && (
                        <div style={styles.calmNoticeCard} className="homeowner-in-progress-action">
                            <div style={styles.calmNoticeTitle}>Need to stop the task?</div>
                            <div style={styles.calmNoticeText}>
                                Work has already started. Message your Expert first, or contact Taskio Support if you need help.
                            </div>
                            <button
                                type="button"
                                onClick={() => navigate(`/job/${jobId}#chat`)}
                                className="homeowner-pay-btn"
                                style={{ ...styles.chatAfterPaymentButton, marginTop: 12 }}
                            >
                                Message Expert
                            </button>
                            <Link
                                to="/support"
                                style={{ display: 'block', fontSize: 13, color: '#64748B', marginTop: 10, textAlign: 'center', textDecoration: 'none', fontWeight: 600 }}
                            >
                                Contact Taskio Support
                            </Link>
                        </div>
                    )}

                    {normalized === JOB_STATUSES.REFUND_PENDING && (
                        <div style={styles.calmNoticeCard}>
                            <div style={styles.calmNoticeTitle}>Refund in progress</div>
                            <div style={styles.calmNoticeText}>We&apos;ll update this task when your refund has finished processing.</div>
                        </div>
                    )}

                    {normalized === JOB_STATUSES.REFUNDED && (
                        <div style={styles.calmNoticeCard}>
                            <div style={styles.calmNoticeTitle}>Refund completed</div>
                        </div>
                    )}

                    {normalized === JOB_STATUSES.CANCELLED && (
                        <div style={styles.calmNoticeCard}>
                            <div style={styles.calmNoticeTitle}>Task cancelled</div>
                        </div>
                    )}

                    {normalized === JOB_STATUSES.DISPUTED && (
                        <div style={styles.calmNoticeCard}>
                            <div style={styles.calmNoticeTitle}>Issue reported — we&apos;re reviewing this</div>
                        </div>
                    )}

                    {/* Approve Work & Release Payment */}
                    {normalized === JOB_STATUSES.COMPLETED && job.paymentState === 'in_escrow' && (
                        <div style={styles.approvalCard}>
                            {releaseError ? (
                                <div
                                    style={styles.releaseErrorCard}
                                    role="alert"
                                    className="homeowner-release-error"
                                >
                                    <div style={styles.releaseErrorTitle}>Couldn’t release payment</div>
                                    <div style={styles.releaseErrorText}>{releaseError}</div>
                                </div>
                            ) : null}
                            <div style={styles.approvalHeader} className="homeowner-urgent-header homeowner-approval-header">
                                <span style={styles.checkIcon}>✓</span>
                                <div>
                                    <div style={styles.approvalTitle}>Ready for your approval</div>
                                    <div style={styles.approvalText}>
                                        When you’re happy with the work, approve release of payment — that pays the Expert via Stripe
                                    </div>
                                </div>
                            </div>
                            <button
                                type="button"
                                onClick={handleReleasePayment}
                                disabled={releasing || reportingIssue}
                                className="homeowner-release-btn"
                                style={styles.releaseButton}
                            >
                                {releasing ? 'Releasing…' : 'Approve work & release payment'}
                            </button>
                            <button
                                type="button"
                                onClick={handleReportIssue}
                                disabled={reportingIssue || releasing}
                                style={{
                                    ...styles.subtleTextBtn,
                                    marginTop: 12,
                                    width: '100%',
                                    ...(reportingIssue ? { opacity: 0.6, cursor: 'not-allowed' } : {}),
                                }}
                            >
                                {reportingIssue ? 'Sending…' : 'Report an issue'}
                            </button>
                        </div>
                    )}

                    {/* Quotes Section */}
                    <QuotesSection
                        quotesLocked={quotesLocked}
                        quotes={quotes}
                        quotesLockReason={quotesLockReason}
                        job={job}
                        revisionRequests={revisionRequests}
                        requestingRevisionFor={requestingRevisionFor}
                        paymentConfirmationInProgress={confirmingPayment}
                        onAcceptQuote={handleAcceptQuote}
                        onOpenRevisionModal={openRevisionModal}
                        styles={styles}
                    />

                    {/* Review Section */}
                    {canReview && (
                        <div style={styles.section} className="homeowner-job-section">
                            <h2 style={styles.sectionTitle}>Leave a Review</h2>
                            {!canReview && (
                                <div style={{ fontSize: 14, color: '#757575' }}>
                                    Available once payment has been released after completion.
                                </div>
                            )}
                            {reviewLoading && <div style={{ fontSize: 14, color: '#757575' }}>Loading review…</div>}
                            {review ? (
                                <div style={styles.reviewSubmitted}>
                                    <div style={{ fontWeight: 600, marginBottom: 8, color: '#222' }}>Review Submitted</div>
                                    <div style={styles.ratingRow}>
                                        {[...Array(5)].map((_, i) => (
                                            <span key={i} style={{ color: i < review.rating ? '#FF9100' : '#E0E0E0', fontSize: 20 }}>★</span>
                                        ))}
                                        <span style={{ marginLeft: 8, color: '#757575', fontSize: 14 }}>{review.rating}/5</span>
                                    </div>
                                    {review.text && (
                                        <div style={{ whiteSpace: 'pre-wrap', fontSize: 14, color: '#444', marginTop: 12, lineHeight: 1.6 }}>{review.text}</div>
                                    )}
                                </div>
                            ) : (
                                <div style={styles.reviewForm}>
                                    {reviewSuccess && (
                                        <div style={styles.successBanner} role="status" aria-live="polite">
                                            ✓ {reviewSuccess}
                                        </div>
                                    )}
                                    {reviewError && <div style={styles.errorBanner}>{reviewError}</div>}
                                    <label style={styles.label}>Rating</label>
                                    <div style={styles.ratingRow}>
                                        {[1, 2, 3, 4, 5].map((n) => (
                                            <button
                                                key={n}
                                                type="button"
                                                onClick={() => setReviewForm((p) => ({ ...p, rating: n }))}
                                                style={n <= reviewForm.rating ? styles.starOn : styles.starOff}
                                                aria-label={`Rate ${n} out of 5`}
                                            >
                                                ★
                                            </button>
                                        ))}
                                    </div>
                                    <label style={styles.label}>Feedback (optional)</label>
                                    <textarea
                                        value={reviewForm.text}
                                        onChange={(e) => setReviewForm((p) => ({ ...p, text: e.target.value }))}
                                        placeholder="Share your experience working with this expert…"
                                        style={styles.textArea}
                                        rows={4}
                                    />
                                    <button
                                        type="button"
                                        onClick={submitReview}
                                        disabled={reviewSubmitting}
                                        style={styles.submitReviewButton}
                                    >
                                        {reviewSubmitting ? 'Submitting…' : 'Submit Review'}
                                    </button>
                                </div>
                            )}
                        </div>
                    )}
                    <RevisionRequestModal
                        open={revisionModal.open}
                        message={revisionMessage}
                        submitting={!!requestingRevisionFor}
                        onChangeMessage={setRevisionMessage}
                        onClose={closeRevisionModal}
                        onSubmit={submitRevisionRequest}
                    />
                    <ConfirmDialog
                        open={actionDialog?.type === 'cancel'}
                        title="Cancel this task?"
                        message="If payment is funded but unreleased, Taskio will begin the applicable refund workflow. Released funds require support review."
                        confirmLabel="Cancel task"
                        danger
                        busy={cancellingTask}
                        onCancel={() => setActionDialog(null)}
                        onConfirm={() => {
                            setActionDialog(null);
                            performCancelTask();
                        }}
                    />
                    <ConfirmDialog
                        open={actionDialog?.type === 'report'}
                        title="Report an issue?"
                        message="Taskio will pause payment release while support reviews the issue."
                        confirmLabel="Report issue"
                        danger
                        busy={reportingIssue}
                        onCancel={() => setActionDialog(null)}
                        onConfirm={() => {
                            setActionDialog(null);
                            performReportIssue();
                        }}
                    >
                        <label style={{ display: 'grid', gap: 6 }}>
                            Short note (optional)
                            <textarea
                                value={issueReason}
                                maxLength={1000}
                                rows={4}
                                onChange={(event) => setIssueReason(event.target.value)}
                            />
                        </label>
                    </ConfirmDialog>
                </div>
            </div>
            </div>
            </PageMain>
        </>
    );
}

const styles = {
    // Layout
    pageContainer: { 
        fontFamily: 'Inter, sans-serif', 
        backgroundColor: '#F7F9FA', 
        minHeight: 'calc(100vh - 64px)', 
        padding: '32px',
        maxWidth: '1400px',
        margin: '0 auto'
    },
    centered: { textAlign: 'center', padding: '50px', fontSize: '16px', color: '#444' },
    
    // Breadcrumb
    breadcrumb: { 
        marginBottom: '24px', 
        fontSize: '14px', 
        color: '#757575', 
        display: 'flex', 
        alignItems: 'center', 
        gap: '8px' 
    },
    breadcrumbLink: { 
        color: '#14C5C5', 
        textDecoration: 'none', 
        transition: 'color 0.2s', 
        fontWeight: '500' 
    },
    breadcrumbDivider: { color: '#BDBDBD' },
    breadcrumbCurrent: { color: '#222', fontWeight: '500' },
    jobHeader: { 
        display: 'flex', 
        justifyContent: 'space-between', 
        alignItems: 'flex-start', 
        paddingBottom: '24px', 
        marginBottom: '32px',
        borderBottom: '2px solid #E0E0E0'
    },
    jobTitle: { 
        fontFamily: 'Poppins, sans-serif', 
        fontSize: '32px',
        fontWeight: '600',
        color: '#222222',
        margin: '0 0 8px 0'
    },
    taskRefRow: {
        display: 'flex',
        alignItems: 'center',
        gap: '10px',
        flexWrap: 'wrap',
        marginBottom: '10px',
    },
    taskRefText: {
        fontSize: '13px',
        fontWeight: '500',
        color: '#9CA3AF',
        letterSpacing: '0.02em',
    },
    taskRefCopyBtn: {
        fontSize: '12px',
        fontWeight: '600',
        color: '#6B7280',
        backgroundColor: '#FFFFFF',
        border: '1px solid #E5E7EB',
        borderRadius: '6px',
        padding: '4px 10px',
        cursor: 'pointer',
        fontFamily: 'Inter, sans-serif',
    },
    jobMeta: {
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        fontSize: '14px',
        color: '#757575'
    },
    metaDivider: {
        color: '#BDBDBD'
    },
    statusBadge: {
        padding: '8px 16px',
        borderRadius: '12px',
        fontSize: '14px',
        fontWeight: '600',
        whiteSpace: 'nowrap'
    },
    
    // Two Column Layout
    contentGrid: {
        display: 'grid',
        gridTemplateColumns: '1fr 400px',
        gap: '32px',
        alignItems: 'flex-start'
    },
    
    // Section Containers
    section: {
        backgroundColor: '#FFFFFF',
        borderRadius: '12px',
        padding: '24px',
        boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
        border: '1px solid #E0E0E0',
        marginBottom: '20px'
    },
    sectionTitle: {
        fontFamily: 'Poppins, sans-serif',
        fontSize: '18px',
        fontWeight: '600',
        color: '#222',
        margin: '0 0 16px 0'
    },
    
    // Job Details
    description: {
        fontSize: '16px',
        lineHeight: '1.7',
        color: '#444',
        marginBottom: '20px'
    },
    detailsGrid: {
        display: 'grid',
        gridTemplateColumns: '1fr 1fr',
        gap: '16px'
    },
    detailItem: {
        padding: '12px',
        backgroundColor: '#F7F9FA',
        borderRadius: '8px'
    },
    detailLabel: {
        fontSize: '12px',
        fontWeight: '600',
        color: '#757575',
        textTransform: 'uppercase',
        letterSpacing: '0.5px',
        marginBottom: '4px'
    },
    detailValue: {
        fontSize: '14px',
        fontWeight: '500',
        color: '#222'
    },
    photoGrid: {
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
        gap: '12px'
    },
    photoLink: {
        display: 'block',
        borderRadius: '12px',
        overflow: 'hidden',
        border: '1px solid #E0E0E0',
        backgroundColor: '#F8FAFC'
    },
    photoImage: {
        display: 'block',
        width: '100%',
        height: '160px',
        objectFit: 'cover'
    },
    
    // Urgent Action Cards
    urgentActionCard: {
        backgroundColor: '#FFF8F0',
        border: '2px solid #FF9100',
        borderRadius: '12px',
        padding: '20px',
        marginBottom: '20px'
    },
    urgentHeader: {
        display: 'flex',
        gap: '12px',
        marginBottom: '16px'
    },
    urgentIcon: {
        fontSize: '24px'
    },
    urgentTitle: {
        fontSize: '18px',
        fontWeight: '600',
        color: '#222',
        marginBottom: '4px'
    },
    urgentText: {
        fontSize: '14px',
        color: '#444',
        lineHeight: '1.5'
    },
    payNowButton: {
        width: '100%',
        backgroundColor: '#FF9100',
        color: '#FFFFFF',
        border: 'none',
        borderRadius: '10px',
        height: 44,
        padding: '0 14px',
        fontSize: '15px',
        fontWeight: '800',
        cursor: 'pointer',
        marginTop: 0,
        transition: 'background-color 0.2s, transform 0.2s, outline 0.2s',
        outline: 'none'
    },
    paymentEscrowHint: {
        fontSize: '12px',
        color: '#94A3B8',
        lineHeight: 1.45,
        marginTop: '12px',
        fontWeight: '400',
    },
    chatAfterPaymentButton: {
        width: '100%',
        backgroundColor: '#FFFFFF',
        color: '#0F766E',
        border: '2px solid #14C5C5',
        borderRadius: '10px',
        height: 44,
        padding: '0 14px',
        fontSize: '15px',
        fontWeight: '800',
        cursor: 'pointer',
        marginTop: 0,
        outline: 'none',
    },
    cardButtonStack: {
        display: 'flex',
        flexDirection: 'column',
        gap: 10
    },

    // Phone gate (more neutral + tidy than urgent payment styling)
    gateCard: {
        backgroundColor: '#FFFFFF',
        border: '1px solid #E5E7EB',
        borderLeft: '4px solid var(--taskio-teal, #14C5C5)',
        borderRadius: '12px',
        padding: '18px',
        marginBottom: '20px',
        boxShadow: '0 2px 8px rgba(0,0,0,0.06)'
    },
    gateHeader: {
        display: 'flex',
        gap: '12px',
        alignItems: 'flex-start',
        marginBottom: '14px'
    },
    gateIconWrap: {
        width: 40,
        height: 40,
        borderRadius: 12,
        backgroundColor: 'rgba(20, 197, 197, 0.12)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: 18
    },
    gateTitle: {
        fontSize: '16px',
        fontWeight: '700',
        color: '#111827',
        marginBottom: '4px'
    },
    gateText: {
        fontSize: '14px',
        color: '#4B5563',
        lineHeight: '1.5'
    },
    gateActions: { display: 'flex', gap: 10, flexWrap: 'wrap' },
    gatePrimaryBtn: {
        height: 40,
        padding: '0 14px',
        borderRadius: 10,
        border: 'none',
        backgroundColor: 'var(--taskio-teal, #14C5C5)',
        color: '#fff',
        fontWeight: 800,
        cursor: 'pointer',
        marginTop: 0,
        flex: '1 1 180px'
    },
    subtleTextBtn: {
        background: 'none',
        border: 'none',
        color: '#64748B',
        fontSize: 13,
        fontWeight: 500,
        cursor: 'pointer',
        textDecoration: 'underline',
        padding: '4px 0',
    },
    calmNoticeCard: {
        backgroundColor: '#FAFAFA',
        border: '1px solid #E5E7EB',
        borderRadius: '12px',
        padding: '18px',
        marginBottom: '20px',
    },
    calmNoticeTitle: {
        fontSize: '16px',
        fontWeight: 600,
        color: '#374151',
        marginBottom: '6px',
    },
    calmNoticeText: {
        fontSize: '14px',
        color: '#64748B',
        lineHeight: 1.5,
    },
    gateSecondaryBtn: {
        height: 40,
        padding: '0 14px',
        borderRadius: 10,
        border: '1px solid #D1D5DB',
        backgroundColor: '#fff',
        color: '#374151',
        fontWeight: 800,
        cursor: 'pointer',
        marginTop: 0,
        flex: '1 1 180px'
    },
    rhsSectionTitle: {
        fontFamily: 'Poppins, sans-serif',
        fontSize: '18px',
        fontWeight: '600',
        color: '#222',
        margin: '0 0 12px 0'
    },
    
    // Approval Card
    approvalCard: {
        backgroundColor: '#F0FFF4',
        border: '2px solid #52d68a',
        borderRadius: '12px',
        padding: '20px',
        marginBottom: '20px'
    },
    releaseErrorCard: {
        backgroundColor: '#FEF2F2',
        border: '1px solid #FECACA',
        borderRadius: '10px',
        padding: '12px 14px',
        marginBottom: '16px',
    },
    releaseErrorTitle: {
        fontSize: '15px',
        fontWeight: 700,
        color: '#991B1B',
        marginBottom: '6px',
    },
    releaseErrorText: {
        fontSize: '14px',
        color: '#7F1D1D',
        lineHeight: 1.5,
    },
    approvalHeader: {
        display: 'flex',
        gap: '12px',
        marginBottom: '16px'
    },
    checkIcon: {
        fontSize: '24px',
        color: '#52d68a'
    },
    approvalTitle: {
        fontSize: '18px',
        fontWeight: '600',
        color: '#222',
        marginBottom: '4px'
    },
    approvalText: {
        fontSize: '14px',
        color: '#444',
        lineHeight: '1.5'
    },
    releaseButton: {
        width: '100%',
        backgroundColor: '#52d68a',
        color: '#FFFFFF',
        border: 'none',
        borderRadius: '8px',
        padding: '14px',
        fontSize: '16px',
        fontWeight: '600',
        cursor: 'pointer',
        transition: 'background-color 0.2s, transform 0.2s, outline 0.2s',
        outline: 'none'
    },
    
    // Quotes
    quotesContainer: {
        display: 'grid',
        gap: '16px'
    },
    quoteCard: {
        backgroundColor: '#FFFFFF',
        borderRadius: '12px',
        padding: '20px',
        border: '1px solid #E0E0E0',
        transition: 'transform 0.2s, box-shadow 0.2s, border-color 0.2s',
        outline: 'none'
    },
    quoteHeader: {
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: '12px'
    },
    quoteAmount: {
        fontFamily: 'Poppins, sans-serif',
        fontSize: '28px',
        fontWeight: '600',
        color: '#14C5C5'
    },
    acceptedBadge: {
        padding: '6px 12px',
        borderRadius: '12px',
        fontSize: '12px',
        fontWeight: '600',
        backgroundColor: '#E8F5E9',
        color: '#52d68a'
    },
    quoteMessage: {
        fontSize: '14px',
        color: '#444',
        lineHeight: '1.6',
        marginBottom: '16px'
    },
    quoteActions: {
        display: 'flex',
        flexDirection: 'column',
        gap: '10px'
    },
    acceptButton: {
        backgroundColor: '#14C5C5',  // Changed to teal
        color: '#FFFFFF',
        border: 'none',
        borderRadius: '10px',
        width: '100%',
        height: 44,
        padding: '0 14px',
        fontSize: '15px',
        fontWeight: '800',
        cursor: 'pointer',
        marginTop: 0,
        transition: 'background-color 0.2s, transform 0.2s, outline 0.2s',
        outline: 'none'
    },
    revisionButton: {
        backgroundColor: 'transparent',
        color: '#14C5C5',
        border: '1px solid #14C5C5',
        borderRadius: '10px',
        width: '100%',
        height: 44,
        padding: '0 14px',
        fontSize: '15px',
        fontWeight: '800',
        cursor: 'pointer',
        marginTop: 0,
        transition: 'opacity 0.2s, outline 0.2s',
        outline: 'none'
    },
    revisionPill: {
        alignSelf: 'flex-start',
        marginBottom: 12,
        backgroundColor: '#fff7ed',
        border: '1px solid #FF9100',
        color: '#9a3412',
        padding: '6px 12px',
        borderRadius: '12px',
        fontSize: 12,
        fontWeight: '600'
    },

    // Expert trust summary (Phase 5)
    expertSummary: {
        display: 'flex',
        flexDirection: 'row',
        alignItems: 'flex-start',
        gap: 12,
        marginBottom: 0,
    },
    expertAvatar: {
        width: 48,
        height: 48,
        borderRadius: '50%',
        objectFit: 'cover',
        flexShrink: 0,
    },
    expertAvatarFallback: {
        width: 48,
        height: 48,
        borderRadius: '50%',
        backgroundColor: '#E0F7FA',
        color: '#14C5C5',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: 16,
        fontWeight: '700',
        flexShrink: 0,
        userSelect: 'none',
    },
    expertInfo: {
        flex: 1,
        minWidth: 0,
        display: 'flex',
        flexDirection: 'column',
        gap: 4,
    },
    expertName: {
        fontSize: 15,
        fontWeight: '700',
        color: '#1a1a1a',
        lineHeight: 1.3,
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        whiteSpace: 'nowrap',
    },
    expertMeta: {
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        flexWrap: 'wrap',
    },
    expertMetaText: {
        fontSize: 13,
        color: '#555',
    },
    expertMetaEmpty: {
        fontSize: 13,
        color: '#9E9E9E',
        fontStyle: 'italic',
    },
    expertBio: {
        fontSize: 13,
        color: '#666',
        lineHeight: 1.45,
        overflow: 'hidden',
        display: '-webkit-box',
        WebkitLineClamp: 1,
        WebkitBoxOrient: 'vertical',
        marginTop: 2,
    },
    expertBadgesRow: {
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'flex-end',
        gap: 5,
        flexShrink: 0,
    },
    expertVerifiedBadge: {
        padding: '4px 9px',
        borderRadius: '10px',
        fontSize: 11,
        fontWeight: '700',
        backgroundColor: '#E8F5E9',
        color: '#2E7D32',
        whiteSpace: 'nowrap',
    },
    expertRatingBadge: {
        padding: '4px 9px',
        borderRadius: '10px',
        fontSize: 11,
        fontWeight: '700',
        backgroundColor: '#FFF8E1',
        color: '#B45309',
        whiteSpace: 'nowrap',
    },
    quoteDivider: {
        borderTop: '1px solid #F0F0F0',
        margin: '14px 0 12px',
    },
    stripeHint: {
        fontSize: 12,
        color: '#757575',
        lineHeight: 1.5,
        marginBottom: 10,
        paddingLeft: 2,
    },
    
    // Empty States
    emptyQuotes: {
        textAlign: 'center',
        padding: '40px 20px'
    },
    emptyIcon: {
        fontSize: '48px',
        marginBottom: '16px'
    },
    emptyTitle: {
        fontSize: '18px',
        fontWeight: '600',
        color: '#222',
        marginBottom: '8px'
    },
    emptyText: {
        fontSize: '14px',
        color: '#757575',
        lineHeight: '1.6'
    },
    
    // Chat Notice Card
    chatNoticeCard: {
        backgroundColor: '#E3F2FD',
        border: '1px solid #90CAF9',
        borderRadius: '12px',
        padding: '24px',
        textAlign: 'center',
        marginBottom: '24px'
    },
    chatNoticeIcon: {
        fontSize: '48px',
        marginBottom: '12px'
    },
    chatNoticeTitle: {
        fontSize: '16px',
        fontWeight: '600',
        color: '#222',
        marginBottom: '8px'
    },
    chatNoticeText: {
        fontSize: '14px',
        color: '#444',
        lineHeight: '1.6'
    },
    
    // Review
    reviewForm: {
        marginTop: 16
    },
    ratingRow: {
        display: 'flex',
        gap: 8,
        marginBottom: 16,
        alignItems: 'center'
    },
    starOn: {
        background: 'transparent',
        border: 'none',
        cursor: 'pointer',
        fontSize: 24,
        color: '#FF9100',
        padding: 0,
        lineHeight: 1,
        transition: 'transform 0.2s'
    },
    starOff: {
        background: 'transparent',
        border: 'none',
        cursor: 'pointer',
        fontSize: 24,
        color: '#E0E0E0',  // Fixed contrast
        padding: 0,
        lineHeight: 1,
        transition: 'transform 0.2s'
    },
    label: {
        display: 'block',
        fontSize: 14,
        fontWeight: '600',  // Standardized
        marginBottom: 8,
        color: '#222222'
    },
    textArea: {
        width: '100%',
        borderRadius: 8,
        border: '1px solid #E0E0E0',
        padding: 12,
        fontFamily: 'Inter, sans-serif',
        fontSize: 14,
        boxSizing: 'border-box',
        resize: 'vertical',
        marginBottom: 16,
        lineHeight: '1.6',
        transition: 'border-color 0.2s'
    },
    submitReviewButton: {
        backgroundColor: '#14C5C5',
        color: '#FFFFFF',
        border: 'none',
        borderRadius: '8px',
        padding: '12px 24px',
        fontSize: '16px',
        fontWeight: '600',
        cursor: 'pointer',
        transition: 'background-color 0.2s'
    },
    reviewSubmitted: {
        backgroundColor: '#F7F9FA',
        border: '1px solid #E0E0E0',
        borderRadius: 10,
        padding: 16,
        marginTop: 16
    },
    
    // Banners
    successBanner: {
        backgroundColor: '#F0FFF4',
        border: '1px solid #52d68a',
        color: '#1e7e34',
        padding: '12px 16px',
        borderRadius: '8px',
        marginBottom: '20px',
        fontSize: '14px',
        fontWeight: '500'
    },
    errorBanner: {
        backgroundColor: '#FFEBEE',
        border: '1px solid #DC3545',
        color: '#9f1239',
        padding: '12px 16px',
        borderRadius: '8px',
        marginBottom: '20px',
        fontSize: '14px',
        fontWeight: '500'
    },
    
    // Responsive
    '@media (max-width: 1024px)': {
        contentGrid: {
            gridTemplateColumns: '1fr'
        }
    }
};

export default ClientJobDetail;
