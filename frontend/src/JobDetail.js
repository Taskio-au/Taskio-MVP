import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useParams, Link, useSearchParams } from 'react-router-dom';
import { auth, db } from './firebase';
import { useAuthState } from 'react-firebase-hooks/auth';
import StatusTag from './StatusTag';
import JobChatPanel from './components/JobChatPanel';
import AdminChatTranscript from './components/AdminChatTranscript';
import FreezeChatModal from './features/admin/job-detail/FreezeChatModal';
import AdminActionsSection from './features/admin/job-detail/AdminActionsSection';
import AdminJobEventLog from './features/admin/job-detail/AdminJobEventLog';
import AdminJobOpsExtras from './features/admin/job-detail/AdminJobOpsExtras';
import MonitoringToolsSection from './features/admin/job-detail/MonitoringToolsSection';
import ClientDetailsDrawer from './features/admin/job-detail/ClientDetailsDrawer';
import ExpertDetailsDrawer from './features/admin/job-detail/ExpertDetailsDrawer';
import InviteExpertsSection from './features/admin/job-detail/InviteExpertsSection';
import AttachmentsSection from './features/admin/job-detail/AttachmentsSection';
import VariationsSection from './features/admin/job-detail/VariationsSection';
import PaymentFeeBreakdownPanel from './features/admin/job-detail/PaymentFeeBreakdownPanel';
import SelectedExpertSection from './features/admin/job-detail/SelectedExpertSection';
import AppHeader from './components/AppHeader';
import { ANALYTICS_EVENTS, trackEvent } from './config/analytics';
import { PageLoadingShell } from './components/ui/AsyncPageStates';
import { addDoc, collection, doc as fsDoc, limit, onSnapshot, orderBy, query, serverTimestamp, updateDoc } from 'firebase/firestore';
import { phase1ExpertiseCatalog } from './shared/expertiseCatalog';
import { getJobDisplayLayers } from './utils/jobDisplayFromJob';
import { JOB_STATUSES, normalizeStatus } from './constants/jobStatuses';
import { healthLabelForTask, toMillis } from './utils/adminOps';
import { getTaskReferenceCode } from './utils/taskReference';
import { createApiClient } from './api/createApiClient';

const api = createApiClient({ forceRefreshToken: true });

const expertiseOptions = ['all', ...phase1ExpertiseCatalog.map((x) => x.key)];

function JobDetail() {
    const { jobId } = useParams();
    const [searchParams] = useSearchParams();
    const [user, authLoading, authError] = useAuthState(auth);
    const [job, setJob] = useState(null);
    const [paymentFeeSummary, setPaymentFeeSummary] = useState(null);
    const [homeownerSummary, setHomeownerSummary] = useState(null);
    const [clientDrawer, setClientDrawer] = useState({ open: false });
    const [clientFull, setClientFull] = useState({ loading: false, error: '', data: null });
    const [users, setUsers] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [unassigning, setUnassigning] = useState(null);
    const [expertiseFilter, setExpertiseFilter] = useState('all');
    const [adminAction, setAdminAction] = useState(null); // 'dispute' | 'manual_release' | 'refund' | null
    const [adminReason, setAdminReason] = useState('');
    const [adminBusy, setAdminBusy] = useState(false);
    const [adminMsg, setAdminMsg] = useState('');
    const [adminErr, setAdminErr] = useState('');
    const [safetyAck, setSafetyAck] = useState(false);
    const [safetyCountdown, setSafetyCountdown] = useState(0);
    const [monitorBusy, setMonitorBusy] = useState(false);
    const [monitorErr, setMonitorErr] = useState('');
    const [freezeModal, setFreezeModal] = useState({
        open: false,
        reason: 'Off-platform contact/payment detected',
    });
    const [variations, setVariations] = useState([]);
    const [notes, setNotes] = useState([]);
    const [attachments, setAttachments] = useState([]);
    const [noteDraft, setNoteDraft] = useState('');
    const [adminNoteDraft, setAdminNoteDraft] = useState('');
    const [selectedInviteUids, setSelectedInviteUids] = useState([]);
    const [bulkInviting, setBulkInviting] = useState(false);
    const [nudgingUid, setNudgingUid] = useState(null);
    const [tagBusy, setTagBusy] = useState(false);
    const [expertDrawer, setExpertDrawer] = useState({ open: false, uid: '' });
    const [jobEvents, setJobEvents] = useState([]);
    const [opsBusy, setOpsBusy] = useState(false);
    const [isSuperAdmin, setIsSuperAdmin] = useState(false);

    useEffect(() => {
        let alive = true;
        if (!user) {
            setIsSuperAdmin(false);
            return undefined;
        }
        (async () => {
            try {
                const token = await user.getIdToken(true);
                const res = await api.get('/api/admin/bootstrap', { headers: { Authorization: `Bearer ${token}` } });
                if (!alive) return;
                setIsSuperAdmin(!!res?.data?.access?.isSuperAdmin);
            } catch {
                if (!alive) return;
                setIsSuperAdmin(false);
            }
        })();
        return () => { alive = false; };
    }, [user]);

    const fetchData = useCallback(async () => {
        if (!user) {
            return;
        }
        setLoading(true);
        try {
            // Force refresh so new custom claims (admin:true) are included.
            const token = await user.getIdToken(true);
            const config = { headers: { Authorization: `Bearer ${token}` } };

            const [jobBundle, usersResponse] = await Promise.all([
                api.get(`/api/admin/jobs/${jobId}`, config),
                api.get('/api/admin/users?role=tradie&limit=200', config)
            ]);

            const bundle = jobBundle.data || {};
            setJob(bundle.job || null);
            setPaymentFeeSummary(bundle.paymentFeeSummary ?? null);
            setJobEvents(Array.isArray(bundle.events) ? bundle.events : []);
            setUsers(usersResponse.data?.users || []);
            setHomeownerSummary(null); // refetch below
            setError('');

            // Fetch homeowner minimal summary (masked), so we can display without pulling full PII.
            const loadedJob = bundle.job;
            if (loadedJob?.homeownerUid) {
                try {
                    const hs = await api.get(`/api/admin/users/${loadedJob.homeownerUid}/summary`, config);
                    setHomeownerSummary(hs.data);
                } catch (e) {
                    setHomeownerSummary(null);
                }
            }
        } catch (err) {
            const status = err?.response?.status;
            const msg = err?.response?.data?.message;
            setError(msg || (status ? `Failed to fetch data (HTTP ${status}).` : 'Failed to fetch data.'));
            setJobEvents([]);
            setPaymentFeeSummary(null);
            console.error(err);
        } finally {
            setLoading(false);
        }
    }, [jobId, user]);

    useEffect(() => {
        if (!authLoading) {
            fetchData();
        }
    }, [authLoading, fetchData]);

    const isMonitoringView = useMemo(() => {
        return searchParams.get('view') === 'monitoring';
    }, [searchParams]);

    const openClientDrawer = () => {
        if (!job?.homeownerUid) return;
        setClientDrawer({ open: true });
    };

    const closeClientDrawer = () => {
        setClientDrawer({ open: false });
        setClientFull({ loading: false, error: '', data: null });
    };

    useEffect(() => {
        if (!clientDrawer.open) return undefined;
        const onKeyDown = (e) => {
            if (e.key === 'Escape') closeClientDrawer();
        };
        window.addEventListener('keydown', onKeyDown);
        return () => window.removeEventListener('keydown', onKeyDown);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [clientDrawer.open]);

    useEffect(() => {
        let alive = true;
        const run = async () => {
            if (!clientDrawer.open) return;
            if (!user || !job?.homeownerUid) return;
            try {
                setClientFull({ loading: true, error: '', data: null });
                const token = await user.getIdToken(true);
                const config = { headers: { Authorization: `Bearer ${token}` } };
                const res = await api.get(`/api/admin/users/${encodeURIComponent(job.homeownerUid)}`, config);
                if (!alive) return;
                setClientFull({ loading: false, error: '', data: res.data || null });
            } catch (e) {
                if (!alive) return;
                setClientFull({ loading: false, error: e?.response?.data?.message || e?.message || 'Failed to load client details.', data: null });
            }
        };
        run();
        return () => { alive = false; };
    }, [clientDrawer.open, job?.homeownerUid, user]);

    useEffect(() => {
        // Initialize the job-level admin note field when the job loads/changes.
        // Avoid clobbering while typing: only sync when draft is empty.
        if (!job) return;
        const current = typeof job.adminNote === 'string' ? job.adminNote : '';
        setAdminNoteDraft((prev) => (String(prev || '').trim() ? prev : current));
    }, [jobId, job]);

    const handleUnassign = async (tradieUid) => {
        setUnassigning(tradieUid);
        try {
            const token = await auth.currentUser.getIdToken();
            const config = { headers: { Authorization: `Bearer ${token}` } };
            await api.delete(`/api/admin/jobs/${jobId}/assign/${tradieUid}`, config);
            fetchData();
        } catch (err) {
            alert('Failed to remove expert.');
            console.error(err);
        } finally {
            setUnassigning(null);
        }
    };
    
    const closeAdminModal = () => {
        setAdminAction(null);
        setAdminReason('');
        setAdminErr('');
        setSafetyAck(false);
        setSafetyCountdown(0);
    };

    useEffect(() => {
        // Add safety delay for destructive actions so accidental clicks don't execute quickly.
        if (adminAction === 'manual_release' || adminAction === 'refund') {
            setSafetyAck(false);
            setSafetyCountdown(4);
            const t = setInterval(() => {
                setSafetyCountdown((c) => (c > 0 ? c - 1 : 0));
            }, 1000);
            return () => clearInterval(t);
        }
        setSafetyAck(false);
        setSafetyCountdown(0);
        return undefined;
    }, [adminAction]);

    // Firestore monitoring panels (chat transcript already rendered via JobChatPanel)
    useEffect(() => {
        if (!user || !jobId) return undefined;

        const vq = query(collection(db, 'jobs', jobId, 'variations'), orderBy('createdAt', 'desc'), limit(50));
        const nq = query(collection(db, 'jobs', jobId, 'adminNotes'), orderBy('createdAt', 'desc'), limit(50));
        const mq = query(collection(db, 'jobs', jobId, 'messages'), orderBy('createdAt', 'desc'), limit(200));

        const unsubV = onSnapshot(vq, (snap) => {
            setVariations(snap.docs.map(d => ({ id: d.id, ...d.data() })));
        }, () => {
            setVariations([]);
        });

        const unsubN = onSnapshot(nq, (snap) => {
            setNotes(snap.docs.map(d => ({ id: d.id, ...d.data() })));
        }, () => {
            setNotes([]);
        });

        const unsubM = onSnapshot(mq, (snap) => {
            const rows = snap.docs.map(d => ({ id: d.id, ...d.data() }));
            const att = rows
                .filter(m => m.messageType === 'attachment' && m.attachment?.downloadUrl)
                .map(m => ({
                    id: m.id,
                    fileName: m.attachment.fileName || 'Attachment',
                    mimeType: m.attachment.mimeType || '',
                    url: m.attachment.downloadUrl,
                }));
            setAttachments(att);
        }, () => {
            setAttachments([]);
        });

        return () => {
            unsubV();
            unsubN();
            unsubM();
        };
    }, [user, jobId]);

    const openFreezeChatModal = () => {
        setMonitorErr('');
        setFreezeModal({
            open: true,
            reason: 'Off-platform contact/payment detected',
        });
    };

    const closeFreezeChatModal = () => {
        if (monitorBusy) return;
        setFreezeModal({
            open: false,
            reason: 'Off-platform contact/payment detected',
        });
    };

    const confirmFreezeChat = async () => {
        setMonitorErr('');
        setMonitorBusy(true);
        try {
            const txt = String(freezeModal.reason || '').trim();
            if (!txt) {
                setMonitorErr('Please provide a reason to freeze chat.');
                setMonitorBusy(false);
                return;
            }
            await api.post(`/api/admin/jobs/${jobId}/chat/freeze`, { frozen: true, reason: txt });
            setJob((p) => (p ? { ...p, chatFrozen: true } : p));
            closeFreezeChatModal();
        } catch (e) {
            setMonitorErr(e?.message || 'Failed to freeze chat.');
        } finally {
            setMonitorBusy(false);
        }
    };

    const unfreezeChat = async () => {
        setMonitorErr('');
        setMonitorBusy(true);
        try {
            await api.post(`/api/admin/jobs/${jobId}/chat/freeze`, { frozen: false });
            setJob((p) => (p ? { ...p, chatFrozen: false } : p));
        } catch (e) {
            setMonitorErr(e?.message || 'Failed to unfreeze chat.');
        } finally {
            setMonitorBusy(false);
        }
    };

    const markReviewed = async () => {
        setMonitorErr('');
        setMonitorBusy(true);
        try {
            await api.post(`/api/admin/jobs/${jobId}/monitoring/review`, {});
            setJob((p) => (p ? { ...p, requiresAdminAttention: false, reviewedByUid: auth.currentUser?.uid || null, adminReviewedBy: auth.currentUser?.uid || null } : p));
        } catch (e) {
            setMonitorErr(e?.message || 'Failed to mark reviewed.');
        } finally {
            setMonitorBusy(false);
        }
    };

    const saveAdminNote = async () => {
        setMonitorErr('');
        const txt = adminNoteDraft.trim();
        if (!txt) return;
        setMonitorBusy(true);
        try {
            await updateDoc(fsDoc(db, 'jobs', jobId), {
                adminNote: txt,
                adminNoteUpdatedAt: serverTimestamp(),
                lastAdminActionAt: serverTimestamp(),
                lastAdminActionBy: auth.currentUser?.uid || null,
            });
            setJob((p) => (p ? { ...p, adminNote: txt } : p));
        } catch (e) {
            setMonitorErr(e?.message || 'Failed to save note.');
        } finally {
            setMonitorBusy(false);
        }
    };

    const addInternalNote = async () => {
        setMonitorErr('');
        const txt = noteDraft.trim();
        if (!txt) return;
        setMonitorBusy(true);
        try {
            await addDoc(collection(db, 'jobs', jobId, 'adminNotes'), {
                createdByUid: auth.currentUser?.uid || null,
                createdAt: serverTimestamp(),
                text: txt,
            });
            await updateDoc(fsDoc(db, 'jobs', jobId), {
                lastAdminActionAt: serverTimestamp(),
                lastAdminActionBy: auth.currentUser?.uid || null,
            });
            setNoteDraft('');
        } catch (e) {
            setMonitorErr(e?.message || 'Failed to add note.');
        } finally {
            setMonitorBusy(false);
        }
    };

    const invitesMap = useMemo(() => {
        const inv = job?.invites;
        return inv && typeof inv === 'object' ? inv : {};
    }, [job]);

    const toggleInviteSelection = (uid) => {
        setSelectedInviteUids((prev) => {
            const s = new Set(prev);
            if (s.has(uid)) s.delete(uid);
            else s.add(uid);
            return Array.from(s);
        });
    };

    const openExpertDrawer = (uid) => {
        const id = String(uid || '').trim();
        if (!id) return;
        setExpertDrawer({ open: true, uid: id });
    };

    const closeExpertDrawer = () => {
        setExpertDrawer({ open: false, uid: '' });
    };

    useEffect(() => {
        if (!expertDrawer.open) return undefined;
        const onKeyDown = (e) => {
            if (e.key === 'Escape') closeExpertDrawer();
        };
        window.addEventListener('keydown', onKeyDown);
        return () => window.removeEventListener('keydown', onKeyDown);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [expertDrawer.open]);

    const drawerExpert = useMemo(() => {
        const uid = String(expertDrawer.uid || '');
        if (!uid) return null;
        return users.find((u) => u.uid === uid) || null;
    }, [expertDrawer.uid, users]);

    const inviteOne = async (uid) => {
        const id = String(uid || '').trim();
        if (!id) return;
        setAdminErr('');
        setAdminMsg('');
        setBulkInviting(true);
        try {
            const current = auth.currentUser || user;
            if (!current) throw new Error('Not authenticated');
            const token = await current.getIdToken();
            const config = { headers: { Authorization: `Bearer ${token}` } };
            await api.post(`/api/admin/jobs/${jobId}/assign`, { tradieUid: id }, config);
            trackEvent(ANALYTICS_EVENTS.EXPERT_INVITED, { role: 'admin', count: 1 });
            setAdminMsg('Invite sent.');
            setSelectedInviteUids((prev) => prev.filter((x) => x !== id));
            await fetchData();
        } catch (e) {
            setAdminErr(e?.response?.data?.message || e?.message || 'Failed to invite expert.');
        } finally {
            setBulkInviting(false);
        }
    };

    const inviteSelected = async () => {
        if (selectedInviteUids.length === 0) return;
        setAdminErr('');
        setAdminMsg('');
        setBulkInviting(true);
        try {
            const current = auth.currentUser || user;
            if (!current) throw new Error('Not authenticated');
            const token = await current.getIdToken();
            const config = { headers: { Authorization: `Bearer ${token}` } };
            const results = await Promise.allSettled(
                selectedInviteUids.map((uid) => api.post(`/api/admin/jobs/${jobId}/assign`, { tradieUid: uid }, config))
            );
            const invited = results.filter((result) => result.status === 'fulfilled').length;
            if (invited > 0) {
                trackEvent(ANALYTICS_EVENTS.EXPERT_INVITED, { role: 'admin', count: invited });
            }
            setSelectedInviteUids([]);
            setAdminMsg('Invites sent.');
            await fetchData();
        } catch (e) {
            setAdminErr(e?.response?.data?.message || e?.message || 'Failed to invite selected experts.');
        } finally {
            setBulkInviting(false);
        }
    };

    const nudgeExpert = async (uid) => {
        setAdminErr('');
        setAdminMsg('');
        setNudgingUid(uid);
        try {
            const current = auth.currentUser || user;
            if (!current) throw new Error('Not authenticated');
            const token = await current.getIdToken();
            const config = { headers: { Authorization: `Bearer ${token}` } };
            await api.post(`/api/admin/jobs/${jobId}/invites/${encodeURIComponent(uid)}/nudge`, {}, config);
            setAdminMsg('Nudge recorded.');
            await fetchData();
        } catch (e) {
            setAdminErr(e?.response?.data?.message || e?.message || 'Failed to record nudge.');
        } finally {
            setNudgingUid(null);
        }
    };

    const toggleAdminTag = async (tag) => {
        const t = String(tag || '').trim();
        if (!t) return;
        if (tagBusy) return;
        setMonitorErr('');
        setTagBusy(true);
        try {
            const current = auth.currentUser || user;
            if (!current) throw new Error('Not authenticated');
            const token = await current.getIdToken();
            const config = { headers: { Authorization: `Bearer ${token}` } };
            const res = await api.post(`/api/admin/jobs/${jobId}/admin-tags/toggle`, { tag: t }, config);
            const next = Array.isArray(res.data?.adminTags) ? res.data.adminTags : null;
            if (next) {
                setJob((p) => (p ? { ...p, adminTags: next } : p));
            } else {
                // Best-effort fallback if response shape is unexpected
                setJob((p) => {
                    if (!p) return p;
                    const prev = Array.isArray(p.adminTags) ? p.adminTags : [];
                    const has = prev.includes(t);
                    const patched = has ? prev.filter((x) => x !== t) : Array.from(new Set([...prev, t]));
                    return { ...p, adminTags: patched };
                });
            }
        } catch (e) {
            setMonitorErr(e?.response?.data?.message || e?.message || 'Failed to update tags.');
        } finally {
            setTagBusy(false);
        }
    };

    const runAdminAction = async () => {
        if (!adminAction) return;
        setAdminErr('');
        setAdminMsg('');
        setAdminBusy(true);

        try {
            const current = auth.currentUser || user;
            if (!current) {
                throw new Error('Not authenticated. Please refresh and login again.');
            }
            const token = await current.getIdToken();
            const config = { headers: { Authorization: `Bearer ${token}` } };

            if (adminAction === 'dispute') {
                await api.post(`/api/admin/jobs/${jobId}/flag-dispute`, { reason: adminReason }, config);
                setAdminMsg('Task flagged as disputed.');
            } else if (adminAction === 'clear_dispute') {
                await api.post(`/api/admin/jobs/${jobId}/clear-dispute`, {}, config);
                setAdminMsg('Dispute cleared and task restored.');
            } else if (adminAction === 'manual_release') {
                await api.post(`/api/admin/jobs/${jobId}/manual-release`, {}, config);
                setAdminMsg('Payment released (admin override).');
            } else if (adminAction === 'refund') {
                await api.post(`/api/admin/jobs/${jobId}/refund`, {}, config);
                setAdminMsg('Refund initiated.');
            }

            closeAdminModal();
            await fetchData();
        } catch (e) {
            setAdminErr(e?.response?.data?.message || e?.message || 'Admin action failed.');
        } finally {
            setAdminBusy(false);
        }
    };

    const handleResolveDispute = async (resolution) => {
        setOpsBusy(true);
        setAdminErr('');
        setAdminMsg('');
        try {
            const current = auth.currentUser || user;
            if (!current) throw new Error('Not authenticated');
            const token = await current.getIdToken(true);
            const config = { headers: { Authorization: `Bearer ${token}` } };
            await api.post(`/api/admin/jobs/${jobId}/resolve-dispute`, { resolution }, config);
            setAdminMsg(resolution === 'expert' ? 'Dispute resolved — payment released to expert.' : 'Refund initiated.');
            await fetchData();
        } catch (e) {
            setAdminErr(e?.response?.data?.message || e?.message || 'Failed to resolve dispute.');
        } finally {
            setOpsBusy(false);
        }
    };

    const handleMarkRefunded = async () => {
        setOpsBusy(true);
        setAdminErr('');
        setAdminMsg('');
        try {
            const current = auth.currentUser || user;
            if (!current) throw new Error('Not authenticated');
            const token = await current.getIdToken(true);
            const config = { headers: { Authorization: `Bearer ${token}` } };
            await api.post(`/api/admin/jobs/${jobId}/mark-refunded`, {}, config);
            setAdminMsg('Marked as refunded.');
            await fetchData();
        } catch (e) {
            setAdminErr(e?.response?.data?.message || e?.message || 'Failed to mark refunded.');
        } finally {
            setOpsBusy(false);
        }
    };

    const handleStatusOverride = async (status) => {
        setOpsBusy(true);
        setAdminErr('');
        setAdminMsg('');
        try {
            const current = auth.currentUser || user;
            if (!current) throw new Error('Not authenticated');
            const token = await current.getIdToken(true);
            const config = { headers: { Authorization: `Bearer ${token}` } };
            await api.put(`/api/admin/jobs/${jobId}/status`, { status }, config);
            setAdminMsg(`Status set to ${status}.`);
            await fetchData();
        } catch (e) {
            setAdminErr(e?.response?.data?.message || e?.message || 'Status update failed.');
        } finally {
            setOpsBusy(false);
        }
    };

    if (authLoading || loading) return <PageLoadingShell message="Loading task details…" detail="Getting the latest task and operations history." />;
    if (authError) return <div style={styles.centered}>Authentication Error: {authError.message}</div>;
    if (error) return <div style={styles.centered}>Error: {error}</div>;
    if (!job) return <div style={styles.centered}>Task not found.</div>;

    const isDisputed = job.status === 'disputed' || job.paymentState === 'disputed' || job.disputeFlag === true;

    const allTradies = users.filter(u => u.role === 'tradie');
    
    const availableTradies = allTradies.filter(
        t => !(job.invitedTradieUids || []).includes(t.uid) && t.verified
    );

    const filteredAvailableTradies = (() => {
        const base = expertiseFilter === 'all'
            ? availableTradies
            : availableTradies.filter(t => Array.isArray(t.expertiseApproved) && t.expertiseApproved.includes(expertiseFilter));
        // MVP boost: prioritise boosted experts in invite lists
        return [...base].sort((a, b) => {
            const aBoost = a?.boost?.isBoosted === true || a?.boostedVisibility === true;
            const bBoost = b?.boost?.isBoosted === true || b?.boostedVisibility === true;
            if (aBoost !== bBoost) return aBoost ? -1 : 1;
            const aMs = Number(a?.updatedAtMs || 0) || 0;
            const bMs = Number(b?.updatedAtMs || 0) || 0;
            return bMs - aMs;
        });
    })();

    const invitedTradies = allTradies.filter(
        t => (job.invitedTradieUids || []).includes(t.uid)
    );

    const selectedTradie = job.acceptedTradieUid
        ? allTradies.find(t => t.uid === job.acceptedTradieUid) || null
        : null;

    const nowMs = Date.now();
    const createdAtMs = toMillis(job.createdAt);
    const ageHours = createdAtMs ? Math.round((nowMs - createdAtMs) / (1000 * 60 * 60)) : null;
    const invitesCount = Array.isArray(job.invitedTradieUids) ? job.invitedTradieUids.length : 0;
    const offersCount = typeof job.offersCount === 'number'
        ? job.offersCount
        : (typeof job.quoteCount === 'number' ? job.quoteCount : null);
    const hasOfferBool = offersCount === null ? true : offersCount > 0;
    const health = healthLabelForTask({ job, hasOffer: hasOfferBool, nowMs });

    const ADMIN_TAGS = ['urgent', 'confusing_scope', 'good_client', 'repeat_client', 'high_value'];

    const statusNorm = normalizeStatus(job.status);
    const criticalStateTint =
        statusNorm === JOB_STATUSES.DISPUTED ? { backgroundColor: '#fff1f2' } :
        statusNorm === JOB_STATUSES.REFUND_PENDING ? { backgroundColor: '#fff7ed' } :
        statusNorm === JOB_STATUSES.REFUNDED ? { backgroundColor: '#f8fafc' } :
        {};

    const adminJobDisplay = getJobDisplayLayers(job);

    return (
        <>
        <AppHeader userRole="admin" userName={user?.displayName || ''} userEmail={user?.email || ''} />
        <div style={styles.container}>
             <nav style={styles.breadcrumb}>
                <Link to="/admin/dashboard" style={styles.breadcrumbLink}>Dashboard</Link>
                <span>/</span>
                <span>Task Details</span>
            </nav>

            <div style={styles.mainContent}>
                <div style={{ ...styles.card, ...criticalStateTint }}>
                    <div style={{ ...styles.cardHeader, alignItems: 'flex-start' }}>
                        <div style={{ flex: 1, minWidth: 260 }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start', flexWrap: 'wrap' }}>
                                <h1 style={styles.jobTitle}>{adminJobDisplay.fullTaskDisplayTitle}</h1>
                                <StatusTag status={job.status} />
                            </div>
                            <div style={{ marginTop: 6, fontSize: 12, color: '#6B7280' }}>
                                <strong>Ref:</strong> {getTaskReferenceCode(jobId)}
                                {' · '}
                                <strong>Task ID:</strong> <span style={{ fontFamily: 'monospace' }}>{jobId}</span>
                            </div>
                            <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', marginTop: 8 }}>
                                <span style={{
                                    ...styles.healthBadge,
                                    ...(health.tone === 'danger' ? styles.healthDanger : null),
                                    ...(health.tone === 'warning' ? styles.healthWarning : null),
                                    ...(health.tone === 'info' ? styles.healthInfo : null),
                                    ...(health.tone === 'success' ? styles.healthSuccess : null),
                                }}>
                                    {health.label}
                                </span>
                                {Array.isArray(job.adminTags) && job.adminTags.length > 0 ? (
                                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                                        {job.adminTags.slice(0, 6).map((t) => (
                                            <span key={t} style={styles.tagChip}>{t}</span>
                                        ))}
                                    </div>
                                ) : null}
                            </div>
                        </div>

                        <div style={styles.healthSummaryBox}>
                            <div style={{ fontWeight: 900, marginBottom: 8 }}>Task Health Summary</div>
                            <div style={styles.healthRow}><span style={styles.healthKey}>Offers</span><span style={styles.healthVal}>{offersCount === null ? <span style={styles.betaTiny}>— beta</span> : offersCount}</span></div>
                            <div style={styles.healthRow}><span style={styles.healthKey}>Invited</span><span style={styles.healthVal}>{invitesCount}</span></div>
                            <div style={styles.healthRow}><span style={styles.healthKey}>Posted</span><span style={styles.healthVal}>{ageHours === null ? '—' : `${ageHours}h ago`}</span></div>
                            <div style={styles.healthRow}><span style={styles.healthKey}>Client last active</span><span style={styles.healthVal}><span style={styles.betaTiny}>— beta</span></span></div>
                        </div>
                    </div>
                    <p><strong>Description:</strong> {job.description}</p>
                    {(() => {
                        const tx = adminJobDisplay;
                        return (
                            <>
                                <p><strong>Task:</strong> {tx.categoryDisplayLabel || '—'}</p>
                                <p><strong>Job type:</strong> {tx.taskTypeDisplayLabel || '—'}</p>
                            </>
                        );
                    })()}
                    <p><strong>Location:</strong> {job.location}</p>
                    <p><strong>Budget:</strong> {job.budget}</p>
                    <p><strong>Payment:</strong> {job.paymentState || '—'} {job.paymentStatus ? `(${job.paymentStatus})` : ''}</p>
                    {adminMsg && <div style={styles.successBanner}>{adminMsg}</div>}
                    {adminErr && <div style={styles.errorBanner}>{adminErr}</div>}
                    <div style={styles.homeownerBox}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
                            <div style={{ fontWeight: 700 }}>Client</div>
                            <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                                <button type="button" onClick={openClientDrawer} style={styles.buttonSecondary}>
                                    Details
                                </button>
                            </div>
                        </div>
                        <div style={styles.homeownerRow}>
                            <div><strong>UID:</strong> {job.homeownerUid}</div>
                            <div><strong>Name:</strong> {homeownerSummary?.displayName || '—'}</div>
                            <div><strong>Email:</strong> {homeownerSummary?.emailMasked || '—'}</div>
                            <div><strong>Status:</strong> {homeownerSummary?.status || '—'}</div>
                        </div>
                        <div style={styles.piiNote}>Full email/phone are only shown on the user detail page.</div>
                    </div>

                    <ClientDetailsDrawer
                        open={clientDrawer.open}
                        onClose={closeClientDrawer}
                        styles={styles}
                        homeownerSummary={homeownerSummary}
                        homeownerUid={job.homeownerUid}
                        clientFull={clientFull}
                    />

                    <div style={{ marginTop: 14 }}>
                        <div style={{ fontSize: 12, fontWeight: 900, color: '#374151', marginBottom: 8 }}>Admin tags</div>
                        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                            {ADMIN_TAGS.map((t) => {
                                const on = Array.isArray(job.adminTags) && job.adminTags.includes(t);
                                return (
                                    <button
                                        key={t}
                                        type="button"
                                        onClick={() => toggleAdminTag(t)}
                                        disabled={tagBusy}
                                        style={on ? styles.tagBtnActive : styles.tagBtn}
                                        title="Admin-only tag"
                                    >
                                        {t.replace(/_/g, ' ')}
                                    </button>
                                );
                            })}
                        </div>
                    </div>
                </div>

                <InviteExpertsSection
                    isMonitoringView={isMonitoringView}
                    styles={styles}
                    expertiseFilter={expertiseFilter}
                    onExpertiseFilterChange={setExpertiseFilter}
                    expertiseOptions={expertiseOptions}
                    onInviteSelected={inviteSelected}
                    selectedInviteUids={selectedInviteUids}
                    bulkInviting={bulkInviting}
                    filteredAvailableTradies={filteredAvailableTradies}
                    onToggleInviteSelection={toggleInviteSelection}
                    onOpenExpertDrawer={openExpertDrawer}
                    invitedTradies={invitedTradies}
                    invitesMap={invitesMap}
                    nowMs={nowMs}
                    nudgingUid={nudgingUid}
                    onNudgeExpert={nudgeExpert}
                    unassigning={unassigning}
                    onUnassign={handleUnassign}
                />

                {/* Chat Transcript */}
                <div style={styles.card}>
                    <h2 style={styles.sectionTitle}>Chat Transcript</h2>
                    {isMonitoringView ? (
                        <AdminChatTranscript jobId={jobId} job={job} />
                    ) : (
                        <JobChatPanel jobId={jobId} fallbackJob={job} alwaysListen />
                    )}
                </div>

                {/* Monitoring tools */}
                <MonitoringToolsSection
                    job={job}
                    monitorErr={monitorErr}
                    monitorBusy={monitorBusy}
                    noteDraft={noteDraft}
                    adminNoteDraft={adminNoteDraft}
                    notes={notes}
                    onOpenFreezeChat={openFreezeChatModal}
                    onUnfreezeChat={unfreezeChat}
                    onMarkReviewed={markReviewed}
                    onNoteDraftChange={setNoteDraft}
                    onAdminNoteDraftChange={setAdminNoteDraft}
                    onSaveAdminNote={saveAdminNote}
                    onAddInternalNote={addInternalNote}
                    styles={styles}
                />

                <AttachmentsSection attachments={attachments} styles={styles} />

                <VariationsSection variations={variations} styles={styles} />

                <PaymentFeeBreakdownPanel summary={paymentFeeSummary} styles={styles} />

                <SelectedExpertSection job={job} selectedTradie={selectedTradie} styles={styles} />

                <AdminJobOpsExtras
                    job={job}
                    styles={styles}
                    onResolveDispute={handleResolveDispute}
                    onMarkRefunded={handleMarkRefunded}
                    onStatusOverride={handleStatusOverride}
                    busy={opsBusy}
                    canResolveDispute={isSuperAdmin}
                />

                <AdminJobEventLog events={jobEvents} styles={styles} />

                {/* Admin Actions (dispute / manual release / refund) */}
                <AdminActionsSection
                    job={job}
                    isDisputed={isDisputed}
                    adminBusy={adminBusy || opsBusy}
                    adminAction={adminAction}
                    adminReason={adminReason}
                    safetyAck={safetyAck}
                    safetyCountdown={safetyCountdown}
                    adminErr={adminErr}
                    onOpenAction={setAdminAction}
                    onCloseModal={closeAdminModal}
                    onRunAction={runAdminAction}
                    onAdminReasonChange={setAdminReason}
                    onSafetyAckChange={setSafetyAck}
                    styles={styles}
                />
            </div>

            <ExpertDetailsDrawer
                open={expertDrawer.open}
                onClose={closeExpertDrawer}
                styles={styles}
                drawerExpert={drawerExpert}
                expertUid={expertDrawer.uid}
                selectedInviteUids={selectedInviteUids}
                invitedTradieUids={job.invitedTradieUids}
                onToggleInviteSelection={toggleInviteSelection}
                onInviteNow={inviteOne}
                bulkInviting={bulkInviting}
            />

            <FreezeChatModal
                open={freezeModal.open}
                reason={freezeModal.reason}
                busy={monitorBusy}
                onChangeReason={(value) => setFreezeModal((prev) => ({ ...prev, reason: value }))}
                onClose={closeFreezeChatModal}
                onConfirm={confirmFreezeChat}
            />

        </div>
        </>
    );
}

const styles = {
    container: { fontFamily: 'Inter, sans-serif', padding: '20px', backgroundColor: '#F7F9FA' },
    breadcrumb: { marginBottom: '20px', fontSize: '14px', color: '#555' },
    breadcrumbLink: { color: '#14C5C5', textDecoration: 'none', marginRight: '8px' },
    mainContent: { display: 'grid', gap: '20px' },
    card: { backgroundColor: '#FFFFFF', borderRadius: '8px', padding: '20px', boxShadow: '0 2px 4px rgba(0,0,0,0.05)' },
    cardHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px', borderBottom: '1px solid #E0E0E0', paddingBottom: '10px' },
    jobTitle: { fontFamily: 'Poppins, sans-serif', margin: 0, fontSize: '24px' },
    sectionTitle: { fontFamily: 'Poppins, sans-serif', margin: 0, fontSize: '18px' },
    filterSelect: { padding: '5px 10px', borderRadius: '4px', border: '1px solid #ccc' },
    list: { listStyle: 'none', padding: 0, margin: 0 },
    listItem: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0', borderBottom: '1px solid #F0F0F0' },
    assignButton: { backgroundColor: '#52d68a', color: 'white', border: 'none', padding: '8px 12px', borderRadius: '4px', cursor: 'pointer' },
    unassignButton: { backgroundColor: '#DC3545', color: 'white', border: 'none', padding: '8px 12px', borderRadius: '4px', cursor: 'pointer' },
    centered: { textAlign: 'center', padding: '50px', fontSize: '18px', color: '#555' },
    homeownerBox: { marginTop: 14, padding: 14, borderRadius: 10, border: '1px solid #E0E0E0', backgroundColor: '#F7F9FA' },
    homeownerRow: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 10, marginTop: 10, fontSize: 14, color: '#333' },
    piiNote: { marginTop: 8, fontSize: 12, color: '#666' },
    userCell: { display: 'flex', flexDirection: 'column', gap: 4 },
    userMeta: { display: 'flex', flexWrap: 'wrap', gap: 8, fontSize: 12, color: '#666', alignItems: 'center' },
    viewUserLink: { color: '#14C5C5', textDecoration: 'none', fontWeight: 700, fontSize: 12 },
    adminNote: { marginTop: 10, marginBottom: 14, padding: 12, borderRadius: 10, border: '1px solid #E0E0E0', backgroundColor: '#fffbeb', color: '#555', fontSize: 13 },
    dangerZoneLabel: { display: 'inline-block', fontSize: 12, fontWeight: 800, color: '#9f1239', backgroundColor: '#fff1f2', border: '1px solid #fecdd3', padding: '4px 10px', borderRadius: 999, marginTop: 6 },
    disputeInfo: { marginBottom: 12, padding: 12, borderRadius: 10, border: '1px solid #fecdd3', backgroundColor: '#fff1f2' },
    adminActionsRow: { display: 'flex', gap: 10, flexWrap: 'wrap' },
    primaryButton: { backgroundColor: '#14C5C5', color: 'white', border: 'none', padding: '10px 12px', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold' },
    dangerButton: { backgroundColor: '#DC3545', color: 'white', border: 'none', padding: '10px 12px', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold' },
    buttonSecondary: { padding: '10px 12px', cursor: 'pointer', backgroundColor: '#f3f4f6', color: '#374151', border: '1px solid #d1d5db', borderRadius: 8, fontWeight: 600 },
    modalOverlay: { position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.45)', display: 'flex', justifyContent: 'center', alignItems: 'center', padding: 16, zIndex: 1000 },
    modalCard: { width: '100%', maxWidth: 520, backgroundColor: '#fff', borderRadius: 12, padding: 16, boxShadow: '0 10px 30px rgba(0,0,0,0.18)', boxSizing: 'border-box' },
    modalTitle: { fontFamily: 'Poppins, sans-serif', fontSize: 18, fontWeight: 700, marginBottom: 10 },
    modalBody: { marginBottom: 14 },
    modalTextarea: { width: '100%', maxWidth: '100%', boxSizing: 'border-box', borderRadius: 10, border: '1px solid #E0E0E0', padding: 10, fontFamily: 'Inter, sans-serif', fontSize: 14, resize: 'vertical', display: 'block' },
    modalActions: { display: 'flex', justifyContent: 'flex-end', gap: 10 },
    safetyLine: { display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', padding: 10, borderRadius: 10, border: '1px solid #E0E0E0', backgroundColor: '#F7F9FA' },
    countdownText: { fontSize: 12, color: '#555', fontWeight: 700 },
    successBanner: { marginTop: 12, backgroundColor: '#eafaf1', border: '1px solid #bde7cd', color: '#1f7a4f', padding: '10px 12px', borderRadius: 10, fontSize: 13 },
    errorBanner: { marginTop: 12, backgroundColor: '#fff1f2', border: '1px solid #fecdd3', color: '#9f1239', padding: '10px 12px', borderRadius: 10, fontSize: 13 },
    healthSummaryBox: { width: 320, maxWidth: '100%', borderRadius: 12, border: '1px solid #E5E7EB', background: '#F9FAFB', padding: 12 },
    healthRow: { display: 'flex', justifyContent: 'space-between', gap: 10, fontSize: 13, padding: '4px 0' },
    healthKey: { color: '#6B7280', fontWeight: 800 },
    healthVal: { color: '#111827', fontWeight: 900 },
    betaTiny: { fontSize: 12, fontWeight: 900, color: '#6B7280' },
    healthBadge: { display: 'inline-flex', alignItems: 'center', padding: '4px 10px', borderRadius: 999, fontWeight: 900, fontSize: 12, border: '1px solid #E5E7EB', background: '#F9FAFB', color: '#374151' },
    healthDanger: { background: '#fff1f2', borderColor: '#fecdd3', color: '#9f1239' },
    healthWarning: { background: '#fff7ed', borderColor: '#fed7aa', color: '#9a3412' },
    healthInfo: { background: '#eff6ff', borderColor: '#bfdbfe', color: '#1d4ed8' },
    healthSuccess: { background: '#ecfdf5', borderColor: '#a7f3d0', color: '#065f46' },
    tagChip: { display: 'inline-block', padding: '4px 10px', borderRadius: 999, border: '1px solid #E5E7EB', background: '#fff', fontWeight: 900, fontSize: 12, color: '#374151' },
    tagBtn: { height: 34, padding: '0 12px', borderRadius: 999, border: '1px solid #d1d5db', background: '#fff', color: '#374151', fontWeight: 900, cursor: 'pointer', fontSize: 13 },
    tagBtnActive: { height: 34, padding: '0 12px', borderRadius: 999, border: '1px solid #111827', background: '#111827', color: '#fff', fontWeight: 900, cursor: 'pointer', fontSize: 13 },
    matchChip: { display: 'inline-block', padding: '4px 10px', borderRadius: 999, border: '1px solid #E5E7EB', background: '#fff', fontWeight: 900, fontSize: 12, color: '#374151' },
    detailsWrap: { backgroundColor: '#FFFFFF', borderRadius: '8px', padding: 16, boxShadow: '0 2px 4px rgba(0,0,0,0.05)', border: '1px solid #ddd', marginBottom: 16 },
    detailsSummary: { fontFamily: 'Poppins, sans-serif', fontSize: 18, fontWeight: 700, cursor: 'pointer' },
    inlineLinkBtn: { border: 'none', background: 'transparent', padding: 0, color: '#14C5C5', fontWeight: 900, cursor: 'pointer', fontSize: 12, textDecoration: 'underline' },

    // Right-side drawer (expert quick view)
    drawerOverlay: { position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.45)', zIndex: 1200, display: 'flex', justifyContent: 'flex-end' },
    drawerPanel: { width: '100%', maxWidth: 420, height: '100%', backgroundColor: '#fff', boxShadow: '0 10px 30px rgba(0,0,0,0.20)', display: 'flex', flexDirection: 'column' },
    drawerHeader: { padding: 14, borderBottom: '1px solid #E5E7EB', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 },
    drawerTitle: { fontFamily: 'Poppins, sans-serif', fontSize: 16, fontWeight: 900, color: '#111827' },
    drawerSubtitle: { marginTop: 4, fontSize: 12, color: '#6B7280', fontWeight: 800, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
    drawerCloseBtn: { height: 34, width: 34, borderRadius: 10, border: '1px solid #E5E7EB', background: '#fff', cursor: 'pointer', fontWeight: 900, color: '#111827' },
    drawerSection: { marginBottom: 14 },
    drawerSectionTitle: { fontSize: 12, fontWeight: 900, color: '#374151', marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.6 },
    drawerGrid: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 },
    drawerItem: { border: '1px solid #E5E7EB', borderRadius: 12, padding: 10, background: '#F9FAFB' },
    drawerKey: { display: 'block', fontSize: 11, fontWeight: 900, color: '#6B7280', marginBottom: 4 },
    drawerVal: { display: 'block', fontSize: 13, fontWeight: 900, color: '#111827' },
    drawerNoteBox: { border: '1px solid #E5E7EB', borderRadius: 12, padding: 10, background: '#fff', fontSize: 13, color: '#374151', whiteSpace: 'pre-wrap' },
    drawerFooter: { marginTop: 10, display: 'grid', gridTemplateColumns: '1fr', gap: 10 },
    drawerBtn: { height: 40, borderRadius: 12, border: '1px solid #d1d5db', background: '#fff', cursor: 'pointer', fontWeight: 900, color: '#111827' },
    drawerBtnActive: { height: 40, borderRadius: 12, border: '1px solid #111827', background: '#111827', cursor: 'pointer', fontWeight: 900, color: '#fff' },
    drawerLinkBtn: { height: 40, borderRadius: 12, border: '1px solid #d1d5db', background: '#f3f4f6', color: '#111827', textDecoration: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 900 },
};

export default JobDetail;
