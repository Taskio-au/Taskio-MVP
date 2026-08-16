import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate, Link, useLocation } from 'react-router-dom';
import { auth, db } from '../firebase';
import { createApiClient } from '../api/createApiClient';
import AppHeader from './AppHeader';
import { PageLoadingShell, PageErrorShell } from './ui/AsyncPageStates';
import PageMain from './ui/PageMain';
import JobChatPanel from './JobChatPanel';
import VariationPanel from './VariationPanel';
import QuoteSubmissionCard from './tradie-job-detail/QuoteSubmissionCard';
import { collection, doc, serverTimestamp, setDoc } from 'firebase/firestore';
import { JOB_STATUSES, getStatusLabel, normalizeStatus } from '../constants/jobStatuses';
import { buildTaskExpertEligibilityView } from '../utils/taskExpertEligibility';
import { formatTaskRefRowLabelFromJob } from '../utils/taskReference';
import { getExpertPaymentStateLabel } from '../utils/paymentStoryLabels';
import { getJobDisplayLayers } from '../utils/jobDisplayFromJob';

const api = createApiClient();

function ExpertJobDetail() {
    const { jobId } = useParams();
    const navigate = useNavigate();
    const location = useLocation();

    const [job, setJob] = useState(null);
    const [quoteData, setQuoteData] = useState({ amount: '', message: '' });
    const [loading, setLoading] = useState(true);
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');
    const [stripeStatus, setStripeStatus] = useState({ enabled: false, onboardingStatus: 'pending' });
    const [markingComplete, setMarkingComplete] = useState(false);
    const [hasPendingVariationPayment, setHasPendingVariationPayment] = useState(false);
    const [myQuote, setMyQuote] = useState(null);
    const [revisionRequest, setRevisionRequest] = useState(null);
    const [withdrawing, setWithdrawing] = useState(false);
    const [aiBusy, setAiBusy] = useState(false);
    const [aiError, setAiError] = useState('');
    const [aiAssumptions, setAiAssumptions] = useState([]);
    const [eligibility, setEligibility] = useState(() => buildTaskExpertEligibilityView(null));
    const [eligibilityLoading, setEligibilityLoading] = useState(true);
    const [foundingExpertFeeProfile, setFoundingExpertFeeProfile] = useState(null);
    const [refreshingStripe, setRefreshingStripe] = useState(false);
    const [ageGateModal, setAgeGateModal] = useState({ open: false, type: '' }); // 'dob_missing' | 'underage'
    const [clientReview, setClientReview] = useState(null);
    const [clientReviewForm, setClientReviewForm] = useState({ rating: 5, text: '' });
    const [clientReviewBusy, setClientReviewBusy] = useState(false);
    const [clientReviewError, setClientReviewError] = useState('');

    const loadQuotePage = useCallback(async ({ forceStripeRefresh = false, preserveLoading = false } = {}) => {
        try {
            const user = auth.currentUser;
            if (!user) {
                navigate('/');
                return;
            }
            setError('');
            if (!preserveLoading) {
                setLoading(true);
            }
            setEligibilityLoading(true);
            const token = await user.getIdToken();
            const config = { headers: { Authorization: `Bearer ${token}` } };
            const stripePath = forceStripeRefresh ? '/api/tradie/stripe/status?refresh=true' : '/api/tradie/stripe/status';

            const [jobRes, stripeRes, quoteStateRes] = await Promise.all([
                api.get(`/api/tradie/jobs/${jobId}`, config),
                api.get(stripePath, config),
                api.get(`/api/jobs/${jobId}/my-quote`, config),
            ]);
            const meRes = await api.get('/api/me', config);
            setJob(jobRes.data);
            setStripeStatus(stripeRes.data || { enabled: false, onboardingStatus: 'pending' });
            setMyQuote(quoteStateRes.data?.quote || null);
            setRevisionRequest(quoteStateRes.data?.revisionRequest || null);
            setEligibility(buildTaskExpertEligibilityView(meRes?.data?.eligibility, {
                authEmailVerified: user.emailVerified === true,
            }));
            setFoundingExpertFeeProfile(meRes?.data?.foundingExpertFeeProfile ?? null);
            return true;
        } catch (err) {
            console.error("Error fetching expert job details:", err);
            setError(err.response?.data?.message || 'Could not load task details.');
            setEligibility(buildTaskExpertEligibilityView(null));
            setFoundingExpertFeeProfile(null);
            return false;
        } finally {
            setLoading(false);
            setEligibilityLoading(false);
        }
    }, [jobId, navigate]);

    const fetchFeeEstimate = useCallback(async ({ grossAmountCents, jobId: quoteJobId }) => {
        const user = auth.currentUser;
        if (!user) throw new Error('Not signed in');
        const token = await user.getIdToken();
        const config = { headers: { Authorization: `Bearer ${token}` } };
        const res = await api.post(
            '/api/tradie/fee-estimate',
            { grossAmountCents, jobId: quoteJobId },
            config
        );
        return res.data;
    }, []);

    const startStripeOnboarding = async () => {
        setError('');
        try {
            const user = auth.currentUser;
            if (!user) return navigate('/');
            const token = await user.getIdToken();
            const config = { headers: { Authorization: `Bearer ${token}` } };
            const res = await api.post('/api/tradie/stripe/onboarding-link', {}, config);
            const url = res?.data?.url;
            if (!url) throw new Error('Missing onboarding URL');
            window.location.assign(url);
        } catch (e) {
            setError(e?.response?.data?.message || e?.message || 'Failed to start Stripe onboarding.');
        }
    };

    useEffect(() => {
        const params = new URLSearchParams(location.search || '');
        const stripeQuery = String(params.get('stripe') || '').trim();
        const shouldForceStripeRefresh = stripeQuery === 'return' || stripeQuery === 'refresh';
        let active = true;

        const run = async () => {
            const refreshed = await loadQuotePage({ forceStripeRefresh: shouldForceStripeRefresh });
            if (!active || !shouldForceStripeRefresh || refreshed !== true) {
                return;
            }
            const nextParams = new URLSearchParams(location.search || '');
            nextParams.delete('stripe');
            const nextSearch = nextParams.toString();
            navigate(nextSearch ? `${location.pathname}?${nextSearch}` : location.pathname, { replace: true });
        };

        run();
        return () => {
            active = false;
        };
    }, [loadQuotePage, location.pathname, location.search, navigate]);

    useEffect(() => {
        if (!jobId || job?.paymentState !== 'released') return undefined;
        let active = true;
        (async () => {
            try {
                const user = auth.currentUser;
                if (!user) return;
                const token = await user.getIdToken();
                const res = await api.get(`/api/jobs/${jobId}/review`, {
                    headers: { Authorization: `Bearer ${token}` },
                });
                if (active) setClientReview(res.data?.review || null);
            } catch (e) {
                if (active) setClientReviewError(e?.response?.data?.message || 'Could not load your review status.');
            }
        })();
        return () => { active = false; };
    }, [job?.paymentState, jobId]);

    const handleQuoteChange = (e) => {
        const { name, value } = e.target;
        setQuoteData(prevState => ({ ...prevState, [name]: value }));
    };

    const handleQuoteSubmit = async (e) => {
        e.preventDefault();
        setError('');
        setSuccess('');
        setAiError('');

        // 18+ gating (frontend UX) — backend also enforces
        if (!eligibilityLoading) {
            if (eligibility?.dobPresent === false) {
                setAgeGateModal({ open: true, type: 'dob_missing' });
                return;
            }
            if (eligibility?.is18PlusConfirmed === false) {
                setAgeGateModal({ open: true, type: 'underage' });
                return;
            }
        }

        if (!quoteData.amount || isNaN(quoteData.amount) || quoteData.amount <= 0) {
            setError('Please enter a valid quote amount.');
            return;
        }
        if (!quoteData.message.trim()) {
            setError('Please include a message with your quote.');
            return;
        }

        setSubmitting(true);
        try {
            const user = auth.currentUser;
            const token = await user.getIdToken();
            const config = { headers: { Authorization: `Bearer ${token}` } };
            const payload = {
                amount: parseFloat(quoteData.amount),
                message: quoteData.message
            };
            
            // Using the existing endpoint to post a quote
            await api.post(`/api/jobs/${jobId}/quotes`, payload, config);
            setSuccess('Your quote has been submitted successfully! The client will be notified.');
            setQuoteData({ amount: '', message: '' }); // Clear form
            await loadQuotePage({ preserveLoading: true });
        } catch (err) {
            const code = err?.response?.data?.code;
            const reason = err?.response?.data?.reason;
            if (code === 'UNDERAGE_OR_DOB_MISSING') {
                setAgeGateModal({ open: true, type: reason === 'UNDERAGE' ? 'underage' : 'dob_missing' });
                return;
            }
            setError(err.response?.data?.message || 'Failed to submit quote. Please try again.');
        } finally {
            setSubmitting(false);
        }
    };

    const runAiQuoteAssistant = async () => {
        setAiError('');
        setError('');
        setSuccess('');
        setAiBusy(true);
        try {
            const user = auth.currentUser;
            if (!user) return navigate('/');
            const token = await user.getIdToken();
            const config = { headers: { Authorization: `Bearer ${token}` } };
            const res = await api.post('/api/quote-assistant', { jobId }, config);
            const message = res?.data?.message;
            const assumptions = Array.isArray(res?.data?.assumptions) ? res.data.assumptions : [];
            if (message) {
                setQuoteData((p) => ({ ...p, message: String(message) }));
            }
            setAiAssumptions(assumptions.slice(0, 4));
        } catch (e) {
            setAiError(e?.response?.data?.error || e?.response?.data?.message || e?.message || 'AI quote assistant failed.');
        } finally {
            setAiBusy(false);
        }
    };

    const handleWithdrawQuote = async () => {
        if (!myQuote?.id) return;
        setError('');
        setSuccess('');
        setAiError('');
        setWithdrawing(true);
        try {
            const user = auth.currentUser;
            if (!user) return navigate('/');
            const token = await user.getIdToken();
            const config = { headers: { Authorization: `Bearer ${token}` } };
            await api.post(`/api/quotes/${myQuote.id}/withdraw`, {}, config);
            setSuccess('Quote withdrawn. You can submit a new quote for this task.');
            await loadQuotePage({ preserveLoading: true });
        } catch (e) {
            setError(e?.response?.data?.message || 'Failed to withdraw quote.');
        } finally {
            setWithdrawing(false);
        }
    };

    const handleMarkComplete = async () => {
        setError('');
        setSuccess('');
        setMarkingComplete(true);
        try {
            const user = auth.currentUser;
            if (!user) return navigate('/');
            const token = await user.getIdToken();
            const config = { headers: { Authorization: `Bearer ${token}` } };
            await api.post(`/api/jobs/${jobId}/complete`, {}, config);
            setSuccess('Task marked as complete. Waiting for client approval.');
            // Audit trail (system message)
            try {
                const msgRef = doc(collection(db, 'jobs', jobId, 'messages'));
                const senderName = (user.displayName || '').trim() || 'Expert';
                await setDoc(msgRef, {
                    jobId,
                    messageId: msgRef.id,
                    senderUid: user.uid,
                    senderRole: 'tradie',
                    senderName,
                    messageType: 'system',
                    text: 'Marked task as completed (awaiting client approval).',
                    createdAt: serverTimestamp(),
                    flagged: false,
                    flagReasons: [],
                });
            } catch (e) {
                // Non-blocking
            }
            await loadQuotePage({ preserveLoading: true });
        } catch (e) {
            setError(e?.response?.data?.message || 'Failed to mark task complete.');
        } finally {
            setMarkingComplete(false);
        }
    };

    const submitClientReview = async () => {
        setClientReviewBusy(true);
        setClientReviewError('');
        try {
            const user = auth.currentUser;
            if (!user) return navigate('/');
            const token = await user.getIdToken();
            const config = { headers: { Authorization: `Bearer ${token}` } };
            await api.post(`/api/jobs/${jobId}/review`, clientReviewForm, config);
            const res = await api.get(`/api/jobs/${jobId}/review`, config);
            setClientReview(res.data?.review || null);
        } catch (e) {
            setClientReviewError(e?.response?.data?.message || 'Could not submit your review.');
        } finally {
            setClientReviewBusy(false);
        }
    };
    
    const user = auth.currentUser;
    const normalizedStatus = normalizeStatus(job?.status);

    // Show the quote submission panel only while the job is still in a quoteable state.
    // Once the quote is accepted and payment is secured/funded, hide the panel entirely
    // (or show a minimal accepted-quote summary).
    const QUOTEABLE_STATUSES = new Set([JOB_STATUSES.OPEN, JOB_STATUSES.QUOTED, JOB_STATUSES.ASSIGNED]);
    const jobIsQuoteable = !normalizedStatus || QUOTEABLE_STATUSES.has(normalizedStatus);
    const quoteIsAccepted = myQuote?.status === 'accepted';

    if (loading || (error && !job)) {
        return (
            <>
                <AppHeader
                    userRole="tradie"
                    userName={user?.displayName || ''}
                    userEmail={user?.email || ''}
                />
                {loading ? (
                    <PageLoadingShell
                        message="Loading task details…"
                        detail="Fetching the task, your quote, and chat access."
                    />
                ) : (
                    <PageErrorShell
                        title="We couldn’t load this task"
                        message={error}
                        onRetry={() => loadQuotePage()}
                        retryLabel="Try again"
                    />
                )}
            </>
        );
    }

    const displayLayers = getJobDisplayLayers(job || {});

    return (
        <>
            <style>{`
                /* Expert task detail: desktop = 2 columns; mobile = reordered single column */
                .tradie-job-detail-page {
                    /* Single mobile rail: same viewport inset for every section (see max-width:900px overrides) */
                    --td-rail-pad: 16px;
                    --td-card-pad-x: 16px;
                    --td-section-gap: 12px;
                    box-sizing: border-box;
                    width: 100%;
                    max-width: 100%;
                    min-width: 0;
                    overflow-x: clip;
                    padding-left: var(--td-rail-pad);
                    padding-right: var(--td-rail-pad);
                    padding-bottom: 24px;
                }
                @media (min-width: 901px) {
                    .tradie-job-detail-page {
                        padding-left: 32px;
                        padding-right: 32px;
                        padding-bottom: 32px;
                    }
                }
                .tradie-detail-mobile-back {
                    display: none;
                    margin-bottom: 12px;
                }
                .tradie-detail-mobile-back a {
                    display: inline-flex;
                    align-items: center;
                    gap: 6px;
                    font-size: 15px;
                    font-weight: 600;
                    color: #0F766E;
                    text-decoration: none;
                }
                .tradie-detail-mobile-back a:hover {
                    text-decoration: underline;
                }
                .tradie-detail-breadcrumb-desktop {
                    display: flex;
                }
                @media (max-width: 900px) {
                    .tradie-detail-mobile-back { display: block; }
                    .tradie-detail-breadcrumb-desktop {
                        display: none !important;
                    }
                }
                .tradie-job-detail-wrapper {
                    display: grid;
                    gap: 20px;
                    align-items: start;
                    grid-template-columns: 1fr;
                }
                @media (min-width: 901px) {
                    .tradie-job-detail-wrapper {
                        grid-template-columns: 1fr min(400px, 38vw);
                        gap: 24px;
                    }
                    .tradie-detail-quote {
                        position: sticky;
                        top: 72px;
                    }
                }
                .tradie-detail-left {
                    display: flex;
                    flex-direction: column;
                    gap: 16px;
                }
                @media (max-width: 900px) {
                    .tradie-job-detail-wrapper {
                        display: flex;
                        flex-direction: column;
                        align-items: stretch;
                        gap: var(--td-section-gap, 12px);
                        width: 100%;
                        max-width: 100%;
                        min-width: 0;
                        box-sizing: border-box;
                    }
                    .tradie-detail-left {
                        display: contents;
                    }
                    /* One mobile column: every major block is a direct flex child (display:contents on left) */
                    .tradie-job-detail-wrapper > .tradie-detail-summary,
                    .tradie-job-detail-wrapper > .tradie-detail-body,
                    .tradie-job-detail-wrapper > .tradie-detail-chat,
                    .tradie-job-detail-wrapper > .tradie-detail-variations-wrap,
                    .tradie-job-detail-wrapper > .tradie-detail-quote,
                    .tradie-job-detail-wrapper > .tradie-detail-complete-wrap {
                        box-sizing: border-box;
                        width: 100%;
                        max-width: 100%;
                        min-width: 0;
                        margin-left: 0;
                        margin-right: 0;
                        align-self: stretch;
                    }
                    .tradie-detail-summary.tradie-detail-card,
                    .tradie-detail-body.tradie-detail-card {
                        max-width: 100%;
                    }
                    .tradie-detail-chat > div {
                        width: 100%;
                        max-width: 100%;
                        min-width: 0;
                        box-sizing: border-box;
                        padding-left: var(--td-card-pad-x) !important;
                        padding-right: var(--td-card-pad-x) !important;
                    }
                    .tradie-detail-quote .tradie-expert-quote-card {
                        width: 100%;
                        max-width: 100%;
                        min-width: 0;
                        box-sizing: border-box;
                        padding-left: var(--td-card-pad-x) !important;
                        padding-right: var(--td-card-pad-x) !important;
                    }
                    /* VariationPanel root adds marginTop:20 inline — zero inside this page so spacing matches section gap */
                    .tradie-detail-variations-wrap > div:first-child {
                        margin-top: 0 !important;
                        width: 100%;
                        max-width: 100%;
                        min-width: 0;
                        box-sizing: border-box;
                        padding-left: var(--td-card-pad-x) !important;
                        padding-right: var(--td-card-pad-x) !important;
                    }
                    .tradie-detail-variations-wrap {
                        border-radius: 12px;
                        overflow: hidden;
                    }
                    /* Reset section/aside chrome so only the page rail + cards define horizontal inset */
                    .tradie-job-detail-wrapper > section,
                    .tradie-job-detail-wrapper > aside {
                        padding-inline: 0;
                        margin-inline: 0;
                    }
                    .tradie-detail-summary { order: 1; }
                    .tradie-detail-quote { order: 2; }
                    .tradie-detail-chat { order: 3; }
                    .tradie-detail-variations { order: 4; }
                    .tradie-detail-body { order: 5; }
                    .tradie-detail-complete-wrap { order: 6; }
                }
                .tradie-detail-card {
                    background: #fff;
                    border-radius: 12px;
                    border: 1px solid #E0E0E0;
                    box-shadow: 0 2px 8px rgba(0,0,0,0.06);
                }
                .tradie-detail-summary-inner {
                    padding: 20px 18px;
                }
                @media (max-width: 900px) {
                    .tradie-detail-summary-inner {
                        padding: 20px var(--td-card-pad-x) 20px;
                    }
                }
                @media (min-width: 901px) {
                    .tradie-detail-summary-inner { padding: 24px 28px; }
                }
                .tradie-detail-status-row {
                    display: flex;
                    flex-wrap: wrap;
                    gap: 8px;
                    margin-top: 12px;
                    align-items: center;
                }
                .tradie-detail-chip {
                    font-size: 12px;
                    font-weight: 700;
                    padding: 6px 10px;
                    border-radius: 999px;
                    background: #F3F4F6;
                    color: #374151;
                    border: 1px solid #E5E7EB;
                }
                .tradie-detail-chip-accent {
                    background: #ECFEFF;
                    color: #0F766E;
                    border-color: #99F6E4;
                }
                .tradie-detail-key-grid {
                    display: grid;
                    grid-template-columns: 1fr 1fr;
                    gap: 10px 14px;
                    margin-top: 14px;
                    font-size: 13px;
                    color: #444;
                    line-height: 1.4;
                }
                @media (max-width: 900px) {
                    .tradie-detail-key-grid {
                        font-size: 12px;
                        gap: 8px 10px;
                    }
                }
                .tradie-detail-key-grid strong {
                    display: block;
                    font-size: 11px;
                    text-transform: uppercase;
                    letter-spacing: 0.04em;
                    color: #6B7280;
                    font-weight: 700;
                    margin-bottom: 3px;
                }
                .tradie-detail-milestone {
                    margin-top: 4px;
                }
                .tradie-detail-milestone-inner {
                    background: linear-gradient(180deg, #f8fafc 0%, #fff 100%);
                    border: 1px solid #d1fae5;
                    border-radius: 12px;
                    padding: 16px 16px 14px;
                    box-shadow: 0 1px 2px rgba(15, 118, 110, 0.06);
                }
                @media (max-width: 900px) {
                    .tradie-detail-milestone-inner {
                        padding: 16px var(--td-card-pad-x) 14px;
                    }
                }
                .tradie-detail-milestone-label {
                    font-size: 13px;
                    font-weight: 800;
                    color: #0f766e;
                    letter-spacing: 0.02em;
                    margin-bottom: 6px;
                }
                .tradie-detail-milestone-hint {
                    font-size: 13px;
                    color: #4b5563;
                    line-height: 1.45;
                    margin: 0 0 14px 0;
                }
                .tradie-detail-complete-wrap .tradie-detail-milestone-btn {
                    margin-top: 0;
                }
                .tradie-detail-body-inner {
                    padding: 18px 16px 20px;
                }
                @media (max-width: 900px) {
                    .tradie-detail-body-inner {
                        padding: 18px var(--td-card-pad-x) 20px;
                    }
                }
                @media (min-width: 901px) {
                    .tradie-detail-body-inner { padding: 24px 28px 28px; }
                }
                .tradie-detail-body-inner h2 {
                    margin-top: 0;
                }
                .tradie-detail-complete-wrap {
                    padding: 0 0 8px 0;
                }
                @media (max-width: 900px) {
                    .tradie-expert-quote-card {
                        padding-top: 14px !important;
                        padding-bottom: 16px !important;
                    }
                    .tradie-expert-quote-card h2 {
                        font-size: 16px !important;
                        padding-bottom: 6px !important;
                        margin-bottom: 8px !important;
                        border-bottom-width: 1px !important;
                    }
                    .tradie-expert-quote-card .tradie-quote-ai-box {
                        padding: 10px 10px !important;
                        margin-bottom: 10px !important;
                    }
                    .tradie-expert-quote-card .tradie-quote-ai-box > div:first-child {
                        margin-bottom: 4px !important;
                    }
                    .tradie-expert-quote-card .tradie-quote-form label {
                        margin-bottom: 4px !important;
                        margin-top: 10px !important;
                        font-size: 13px !important;
                    }
                    .tradie-expert-quote-card .tradie-quote-form label:first-of-type {
                        margin-top: 0 !important;
                    }
                    .tradie-expert-quote-card .tradie-quote-form input,
                    .tradie-expert-quote-card .tradie-quote-form textarea {
                        margin-bottom: 10px !important;
                        padding: 10px 12px !important;
                    }
                    .tradie-expert-quote-card .tradie-quote-form textarea {
                        min-height: 180px !important;
                    }
                    .tradie-expert-quote-card .tradie-quote-form .tradie-submit-quote-btn {
                        margin-top: 4px !important;
                    }
                    .tradie-expert-quote-card .tradie-quote-inline-error {
                        margin-top: 6px !important;
                        margin-bottom: 8px !important;
                    }
                }
                /* Extra-narrow phones (~375–430px): single-column data, tap-sized actions */
                @media (max-width: 430px) {
                    .tradie-job-detail-page {
                        --td-rail-pad: 12px;
                        --td-card-pad-x: 12px;
                        --td-section-gap: 10px;
                    }
                    .tradie-detail-key-grid {
                        grid-template-columns: 1fr !important;
                        gap: 10px !important;
                    }
                    .tradie-detail-milestone-btn,
                    .tradie-detail-btn,
                    .tradie-submit-quote-btn {
                        min-height: 48px !important;
                        width: 100% !important;
                        box-sizing: border-box !important;
                    }
                    .tradie-expert-quote-card .tradie-quote-form .tradie-submit-quote-btn {
                        width: 100% !important;
                    }
                    .tradie-detail-status-row {
                        gap: 6px !important;
                    }
                }
                /* Hover and focus states */
                .tradie-detail-btn:hover {
                    opacity: 0.9;
                    transform: translateY(-1px);
                }
                .tradie-detail-btn:focus {
                    outline: 2px solid #14C5C5;
                    outline-offset: 2px;
                }
                .tradie-submit-quote-btn:hover {
                    background-color: #12B0B0;
                }
                .tradie-submit-quote-btn:focus {
                    outline: 2px solid #14C5C5;
                    outline-offset: 2px;
                }
                .tradie-ai-btn:hover {
                    background-color: #E68200;
                }
                .tradie-ai-btn:focus {
                    outline: 2px solid #FF9100;
                    outline-offset: 2px;
                }
                @keyframes quote-submit-success {
                    0% { transform: scale(1); }
                    50% { transform: scale(1.05); }
                    100% { transform: scale(1); }
                }
                .quote-success-animation {
                    animation: quote-submit-success 0.5s ease-in-out;
                }
            `}</style>
            
            <AppHeader 
                userRole="tradie" 
                userName={user?.displayName || ''} 
                userEmail={user?.email || ''}
            />
            <PageMain label="Expert task details">
            <div style={styles.container} className="tradie-job-detail-page">
                {ageGateModal.open && (
                    <div style={styles.modalOverlay} onMouseDown={() => setAgeGateModal({ open: false, type: '' })} role="dialog" aria-modal="true">
                        <div style={styles.modalCard} onMouseDown={(ev) => ev.stopPropagation()}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
                                <div>
                                    <div style={{ fontWeight: 900, fontSize: 16, color: '#111' }}>
                                        {ageGateModal.type === 'underage' ? 'You must be 18+ to quote' : 'Complete your profile to start quoting'}
                                    </div>
                                    <div style={{ marginTop: 6, fontSize: 13, color: '#555', lineHeight: 1.5 }}>
                                        {ageGateModal.type === 'underage'
                                            ? 'Taskio requires Experts to be 18 or older to offer services.'
                                            : 'Please add your date of birth. You must be 18+ to quote.'}
                                    </div>
                                </div>
                                <button type="button" onClick={() => setAgeGateModal({ open: false, type: '' })} style={styles.modalClose} aria-label="Close">×</button>
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 18 }}>
                                <button type="button" onClick={() => setAgeGateModal({ open: false, type: '' })} style={styles.modalBtnSecondary}>Close</button>
                                {ageGateModal.type !== 'underage' && (
                                    <button
                                        type="button"
                                        onClick={() => navigate('/profile#dob')}
                                        style={styles.modalBtnPrimary}
                                    >
                                        Open profile
                                    </button>
                                )}
                            </div>
                        </div>
                    </div>
                )}
                <div className="tradie-detail-mobile-back">
                    <Link to="/tradie/jobs">← All tasks</Link>
                </div>
                <nav style={styles.breadcrumb} className="tradie-detail-breadcrumb-desktop" aria-label="Breadcrumb">
                    <Link to="/tradie/dashboard" style={styles.breadcrumbLink}>Dashboard</Link>
                    <span style={styles.breadcrumbDivider}>/</span>
                    <Link to="/tradie/jobs" style={styles.breadcrumbLink}>Tasks</Link>
                    <span style={styles.breadcrumbDivider}>/</span>
                    <span style={styles.breadcrumbCurrent}>{displayLayers.fullTaskDisplayTitle || 'Task Details'}</span>
                </nav>
                <div className="tradie-job-detail-wrapper">
                    <div className="tradie-detail-left">
                        <section className="tradie-detail-card tradie-detail-summary" aria-label="Task summary">
                            <div className="tradie-detail-summary-inner">
                                <h1 style={{ ...styles.jobTitle, marginBottom: 6 }}>{displayLayers.fullTaskDisplayTitle}</h1>
                                <p style={styles.jobId}>{formatTaskRefRowLabelFromJob(job)}</p>
                                <div className="tradie-detail-status-row">
                                    <span className="tradie-detail-chip tradie-detail-chip-accent">{getStatusLabel(normalizedStatus)}</span>
                                    <span className="tradie-detail-chip" title={job.paymentState ? String(job.paymentState) : undefined}>
                                        {getExpertPaymentStateLabel(job.paymentState)}
                                    </span>
                                </div>
                                <div className="tradie-detail-key-grid">
                                    <div>
                                        <strong>Task</strong>
                                        {displayLayers.categoryDisplayLabel || '—'}
                                    </div>
                                    <div>
                                        <strong>Job type</strong>
                                        {displayLayers.taskTypeDisplayLabel || '—'}
                                    </div>
                                    <div>
                                        <strong>Where</strong>
                                        {job.location || '—'}
                                    </div>
                                    <div>
                                        <strong>When</strong>
                                        {job.timeline || '—'}
                                    </div>
                                    <div>
                                        <strong>Budget guide</strong>
                                        {job.budget || '—'}
                                    </div>
                                    <div>
                                        <strong>Posted</strong>
                                        {job.createdAt?._seconds
                                            ? new Date(job.createdAt._seconds * 1000).toLocaleDateString('en-AU')
                                            : '—'}
                                    </div>
                                </div>
                            </div>
                        </section>

                        <section className="tradie-detail-card tradie-detail-body" aria-label="Task description">
                            <div className="tradie-detail-body-inner">
                                <h2 style={styles.sectionTitle}>Description</h2>
                                <p style={styles.jobText}>{job.description}</p>

                                {Array.isArray(job.postingPhotos) && job.postingPhotos.length > 0 && (
                                    <>
                                        <h2 style={{ ...styles.sectionTitle, marginTop: 20 }}>Photos</h2>
                                        <div style={styles.photoGrid}>
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
                                    </>
                                )}
                            </div>
                        </section>

                        <section className="tradie-detail-chat">
                            <JobChatPanel jobId={jobId} fallbackJob={job} variant="expertCompact" />
                        </section>

                        <section className="tradie-detail-variations-wrap tradie-detail-variations">
                            <VariationPanel jobId={jobId} job={job} onPendingVariationPayment={setHasPendingVariationPayment} />
                        </section>

                        {[JOB_STATUSES.FUNDED, JOB_STATUSES.IN_PROGRESS].includes(normalizedStatus) && job.paymentState === 'in_escrow' && (
                            <div className="tradie-detail-complete-wrap tradie-detail-milestone">
                                <div className="tradie-detail-milestone-inner">
                                    <div className="tradie-detail-milestone-label">Finish & hand over</div>
                                    <p className="tradie-detail-milestone-hint">
                                        When the work is done, mark it complete so the Client can review it and approve payment release.
                                    </p>
                                    {hasPendingVariationPayment && (
                                        <div style={{ background: '#fef3c7', border: '1px solid #fde68a', color: '#92400e', borderRadius: 8, padding: '8px 12px', fontSize: 13, fontWeight: 700, marginBottom: 10 }}>
                                            Variation payment is still pending. The Client needs to complete the variation payment before you mark the task as completed.
                                        </div>
                                    )}
                                    <button
                                        type="button"
                                        onClick={handleMarkComplete}
                                        disabled={markingComplete}
                                        className="tradie-detail-milestone-btn"
                                        style={styles.completeButton}
                                    >
                                        {markingComplete ? 'Marking...' : 'Mark task as completed'}
                                    </button>
                                </div>
                            </div>
                        )}

                        {normalizedStatus === JOB_STATUSES.PAID && job.paymentState === 'released' && (
                            <section className="tradie-detail-card tradie-detail-body" aria-label="Client review">
                                <div className="tradie-detail-body-inner">
                                    <h2 style={styles.sectionTitle}>Review the Client</h2>
                                    <p style={styles.jobText}>
                                        Reviews are immutable and remain private until both parties submit or the 14-day window ends.
                                    </p>
                                    {clientReview ? (
                                        <p style={{ ...styles.jobText, fontWeight: 700 }}>
                                            Review submitted: {clientReview.rating}/5
                                            {clientReview.text ? ` — ${clientReview.text}` : ''}
                                        </p>
                                    ) : (
                                        <div style={{ display: 'grid', gap: 12 }}>
                                            <label>
                                                Rating
                                                <select
                                                    value={clientReviewForm.rating}
                                                    onChange={(event) => setClientReviewForm((prev) => ({
                                                        ...prev,
                                                        rating: Number(event.target.value),
                                                    }))}
                                                    style={{ display: 'block', marginTop: 6, minHeight: 44, width: 120 }}
                                                >
                                                    {[5, 4, 3, 2, 1].map((rating) => (
                                                        <option key={rating} value={rating}>{rating}/5</option>
                                                    ))}
                                                </select>
                                            </label>
                                            <label>
                                                Feedback (optional)
                                                <textarea
                                                    value={clientReviewForm.text}
                                                    maxLength={1000}
                                                    rows={4}
                                                    onChange={(event) => setClientReviewForm((prev) => ({
                                                        ...prev,
                                                        text: event.target.value,
                                                    }))}
                                                    style={{ display: 'block', marginTop: 6, width: '100%', boxSizing: 'border-box' }}
                                                />
                                            </label>
                                            {clientReviewError && <div role="alert" style={{ color: '#b91c1c' }}>{clientReviewError}</div>}
                                            <button
                                                type="button"
                                                onClick={submitClientReview}
                                                disabled={clientReviewBusy}
                                                style={styles.completeButton}
                                            >
                                                {clientReviewBusy ? 'Submitting...' : 'Submit immutable review'}
                                            </button>
                                        </div>
                                    )}
                                </div>
                            </section>
                        )}
                    </div>

                    <aside className="tradie-detail-quote">
                {jobIsQuoteable ? (
                <QuoteSubmissionCard
                    className="tradie-expert-quote-card"
                    styles={styles}
                    revisionRequest={revisionRequest}
                    success={success}
                    myQuote={myQuote}
                    withdrawing={withdrawing}
                    onWithdrawQuote={handleWithdrawQuote}
                    stripeStatus={stripeStatus}
                    onStartStripeOnboarding={startStripeOnboarding}
                    onRefreshStripeStatus={async () => {
                        setRefreshingStripe(true);
                        try {
                            await loadQuotePage({ forceStripeRefresh: true, preserveLoading: true });
                        } finally {
                            setRefreshingStripe(false);
                        }
                    }}
                    refreshingStripe={refreshingStripe}
                    eligibilityLoading={eligibilityLoading}
                    eligibility={eligibility}
                    aiBusy={aiBusy}
                    onRunAiQuoteAssistant={runAiQuoteAssistant}
                    aiError={aiError}
                    aiAssumptions={aiAssumptions}
                    quoteData={quoteData}
                    onQuoteChange={handleQuoteChange}
                    aiSuggestedRange={null}
                    error={error}
                    submitting={submitting}
                    onQuoteSubmit={handleQuoteSubmit}
                    jobId={jobId}
                    foundingExpertFeeProfile={foundingExpertFeeProfile}
                    fetchFeeEstimate={fetchFeeEstimate}
                />
                ) : quoteIsAccepted ? (
                <div style={styles.acceptedQuoteNotice}>
                    <div style={styles.acceptedQuoteTitle}>Quote accepted</div>
                    {myQuote?.amount != null && (
                        <div style={styles.acceptedQuoteMeta}>${myQuote.amount}</div>
                    )}
                    {myQuote?.message ? (
                        <div style={styles.acceptedQuoteMsg}>{myQuote.message}</div>
                    ) : null}
                </div>
                ) : null}
                    </aside>
            </div>
            </div>
            </PageMain>
        </>
    );
}

const styles = {
    container: { fontFamily: 'Inter, sans-serif', backgroundColor: '#F7F9FA', minHeight: 'calc(100vh - 64px)', padding: 0, maxWidth: '1400px', margin: '0 auto' },
    centered: { textAlign: 'center', padding: '50px', fontSize: '16px', color: '#444' },
    breadcrumb: { marginBottom: '24px', fontSize: '14px', color: '#757575', display: 'flex', alignItems: 'center', gap: '8px' },
    breadcrumbLink: { color: '#14C5C5', textDecoration: 'none', transition: 'color 0.2s', fontWeight: '500' },
    breadcrumbDivider: { color: '#BDBDBD' },
    breadcrumbCurrent: { color: '#222', fontWeight: '500' },
    // Accepted quote summary shown in the aside when quote form is hidden
    acceptedQuoteNotice: { background: '#F0FDFA', border: '1px solid #CCFBF1', borderRadius: 12, padding: '20px 16px' },
    acceptedQuoteTitle: { fontFamily: 'Poppins, sans-serif', fontSize: 15, fontWeight: 800, color: '#0F766E', marginBottom: 6 },
    acceptedQuoteMeta: { fontSize: 22, fontWeight: 900, color: '#111827', marginBottom: 8 },
    acceptedQuoteMsg: { fontSize: 13, color: '#374151', lineHeight: 1.5, whiteSpace: 'pre-wrap' },
    contentWrapper: { display: 'grid', gap: '24px', alignItems: 'flex-start' },
    jobDetailsCard: { backgroundColor: '#FFFFFF', padding: '32px', borderRadius: '12px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)', border: '1px solid #E0E0E0' },
    quoteCard: { backgroundColor: '#FFFFFF', padding: '32px', borderRadius: '12px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)', border: '1px solid #E0E0E0' },
    jobTitle: { fontFamily: 'Poppins, sans-serif', fontSize: '24px', color: '#222222', margin: '0 0 8px 0', fontWeight: '600' },
    jobId: { fontSize: '12px', color: '#757575', marginBottom: '20px', display: 'block' },
    sectionTitle: { fontFamily: 'Poppins, sans-serif', fontSize: '18px', color: '#222', marginBottom: '16px', borderBottom: '1px solid #F0F0F0', paddingBottom: '10px', fontWeight: '600' },
    jobText: { fontSize: '16px', lineHeight: '1.7', color: '#444' },
    photoGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '12px', marginBottom: '20px' },
    photoLink: { display: 'block', borderRadius: '12px', overflow: 'hidden', border: '1px solid #E0E0E0', backgroundColor: '#F8FAFC' },
    photoImage: { display: 'block', width: '100%', height: '160px', objectFit: 'cover' },
    divider: { border: 'none', borderTop: '1px solid #E0E0E0', margin: '24px 0' },
    infoGrid: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', fontSize: '14px', color: '#444' },
    statusBox: { marginTop: 16, paddingTop: 16, borderTop: '1px solid #F0F0F0', display: 'grid', gap: 8, fontSize: 14, color: '#444' },
    completeButton: { marginTop: 0, width: '100%', padding: '14px 16px', backgroundColor: '#10b981', color: '#fff', border: 'none', borderRadius: '10px', fontSize: '15px', fontWeight: '700', cursor: 'pointer', transition: 'background-color 0.2s, transform 0.2s', boxShadow: '0 1px 3px rgba(16, 185, 129, 0.35)' },
    label: { display: 'block', marginBottom: '8px', fontWeight: '600', fontSize: '14px', color: '#222' },
    input: { width: '100%', padding: '12px 16px', borderRadius: '8px', border: '1px solid #E0E0E0', fontSize: '16px', marginBottom: '20px', fontFamily: 'Inter, sans-serif', transition: 'border-color 0.2s', boxSizing: 'border-box' },
    textarea: { width: '100%', padding: '12px 16px', borderRadius: '8px', border: '1px solid #E0E0E0', fontSize: '16px', minHeight: '220px', marginBottom: '0', resize: 'vertical', fontFamily: 'Inter, sans-serif', lineHeight: '1.6', transition: 'border-color 0.2s', boxSizing: 'border-box' },
    submitButton: { width: '100%', padding: '16px', backgroundColor: '#14C5C5', color: 'white', border: 'none', borderRadius: '8px', fontSize: '16px', fontWeight: '600', cursor: 'pointer', transition: 'background-color 0.2s, transform 0.2s, outline 0.2s', fontFamily: 'Inter, sans-serif', outline: 'none' },
    errorMessage: { color: '#DC3545', textAlign: 'center', marginTop: '12px', fontSize: '14px', backgroundColor: '#FFEBEE', padding: '12px', borderRadius: '8px' },
    quotedBanner: { border: '1px solid #E0E0E0', borderRadius: '12px', backgroundColor: '#F7F9FA', padding: '16px', marginBottom: '16px' },
    revisionBanner: { border: '1px solid #FF9100', borderRadius: '12px', backgroundColor: '#fff7ed', padding: '16px', marginBottom: '16px' },
    withdrawButton: { marginTop: '12px', width: '100%', backgroundColor: '#DC3545', color: '#FFFFFF', border: 'none', borderRadius: '8px', padding: '12px', fontSize: '14px', fontWeight: '600', cursor: 'pointer', transition: 'background-color 0.2s' },
    successMessage: { color: '#52d68a', textAlign: 'center', marginTop: '16px', fontSize: '16px', lineHeight: '1.6', backgroundColor: '#F0FFF4', padding: '24px', borderRadius: '12px', border: '1px solid #52d68a' },
    onboardingWarning: { border: '1px solid #60A5FA', backgroundColor: '#EFF6FF', padding: 16, borderRadius: 12, marginBottom: 16 },
    onboardingButton: { backgroundColor: '#14C5C5', color: '#FFFFFF', border: 'none', borderRadius: 8, padding: '12px 16px', fontWeight: '600', cursor: 'pointer', fontSize: '14px', transition: 'background-color 0.2s' },
    onboardingButtonSecondary: { backgroundColor: '#FFFFFF', color: '#0F766E', border: '1px solid #99F6E4', borderRadius: 8, padding: '12px 16px', fontWeight: '600', cursor: 'pointer', fontSize: '14px', transition: 'background-color 0.2s' },
    aiBox: { border: '1px solid #E0E0E0', backgroundColor: '#FAFAFA', padding: 16, borderRadius: 12, marginBottom: 16 },
    aiButton: { backgroundColor: '#FF9100', color: '#FFFFFF', border: 'none', borderRadius: 8, padding: '12px 16px', fontWeight: '600', cursor: 'pointer', fontSize: '14px', transition: 'background-color 0.2s, transform 0.2s, outline 0.2s', outline: 'none' },
    aiDisclaimer: { marginTop: 10, fontSize: 12, color: '#666', lineHeight: 1.4 },
    helperText: { marginTop: -12, marginBottom: 16, fontSize: 12, color: '#666' },
    eligibilityPanel: { 
        border: '2px solid #FF9100', 
        backgroundColor: '#FFF7ED', 
        padding: 20, 
        borderRadius: 12, 
        marginBottom: 20 
    },
    completeProfileButton: {
        backgroundColor: '#14C5C5',
        color: '#FFFFFF',
        border: 'none',
        borderRadius: 8,
        padding: '10px 16px',
        fontWeight: '600',
        cursor: 'pointer',
        fontSize: '14px',
        textDecoration: 'none',
        display: 'inline-block',
        transition: 'background-color 0.2s',
        whiteSpace: 'nowrap'
    },
    progressBar: {
        width: '100%',
        height: 8,
        backgroundColor: '#E5E7EB',
        borderRadius: 4,
        overflow: 'hidden',
        marginBottom: 16
    },
    progressFill: {
        height: '100%',
        backgroundColor: '#14C5C5',
        transition: 'width 0.3s ease'
    },
    checklistTitle: {
        fontSize: 13,
        fontWeight: '700',
        color: '#444',
        marginBottom: 10
    },
    checklist: {
        display: 'grid',
        gap: 8
    },
    checklistItem: {
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        fontSize: 14
    },
    checkIcon: {
        color: '#10B981',
        fontWeight: '700',
        fontSize: 16
    },
    crossIcon: {
        color: '#EF4444',
        fontWeight: '700',
        fontSize: 16
    },
    checklistTextDone: {
        color: '#666',
        textDecoration: 'line-through'
    },
    checklistTextMissing: {
        color: '#222',
        fontWeight: '500'
    },
    eligibilityNote: {
        marginTop: 16,
        paddingTop: 16,
        borderTop: '1px solid #FED7AA',
        fontSize: 13,
        color: '#666',
        lineHeight: 1.5
    },
    modalOverlay: {
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(0,0,0,0.45)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 16,
        zIndex: 2000,
    },
    modalCard: {
        width: 'min(520px, 100%)',
        background: '#fff',
        borderRadius: 14,
        border: '1px solid #E5E7EB',
        boxShadow: '0 18px 50px rgba(0,0,0,0.22)',
        padding: 16,
    },
    modalClose: {
        background: 'transparent',
        border: 'none',
        fontSize: 22,
        lineHeight: 1,
        cursor: 'pointer',
        color: '#444',
        padding: '6px 10px',
        borderRadius: 10,
    },
    modalBtnPrimary: {
        background: '#14C5C5',
        color: '#fff',
        border: 'none',
        borderRadius: 10,
        padding: '10px 14px',
        cursor: 'pointer',
        fontWeight: 900,
        fontSize: 14,
    },
    modalBtnSecondary: {
        background: '#f3f4f6',
        color: '#374151',
        border: '1px solid #d1d5db',
        borderRadius: 10,
        padding: '10px 14px',
        cursor: 'pointer',
        fontWeight: 900,
        fontSize: 14,
    },
};

export default ExpertJobDetail;
