import React, { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { auth, db } from './firebase';
import AppHeader from './components/AppHeader';
import DashboardActionModals from './features/admin/dashboard/DashboardActionModals';
import DashboardOpsModals from './features/admin/dashboard/DashboardOpsModals';
import DashboardOverview from './features/admin/dashboard/DashboardOverview';
import TaskDetailsDrawer from './features/admin/dashboard/TaskDetailsDrawer';
import TradiesTab from './features/admin/dashboard/TradiesTab';
import ClientsTab from './features/admin/dashboard/HomeownersTab';
import AdminJobQueuePanel from './features/admin/dashboard/AdminJobQueuePanel';
import TradieDetailsDrawer from './features/admin/dashboard/TradieDetailsDrawer';
import ClientDetailsDrawer from './features/admin/dashboard/ClientDetailsDrawer';
import useAdminDashboardData from './features/admin/dashboard/useAdminDashboardData';
import useAdminDashboardDerivedData from './features/admin/dashboard/useAdminDashboardDerivedData';
import useAdminDashboardMetrics from './features/admin/dashboard/useAdminDashboardMetrics';
import useAdminDashboardQueryState from './features/admin/dashboard/useAdminDashboardQueryState';
import { jobIdsMatchingWorkflowFilters } from './features/admin/utils/workflowQueueFilters';
import { buildDashboardTabUrl } from './features/admin/utils/adminDashboardTabUrl';
import { phase1ExpertiseCatalog } from './shared/expertiseCatalog';
import { dashboardStyles } from './styles/dashboardStyles';
import { createApiClient, API_BASE_URL } from './api/createApiClient';
import {
  healthLabelForTask,
  formatAgeShort,
  getTaskCreatedAtMs,
  toMillis,
} from './utils/adminOps';
import { JOB_STATUSES, normalizeStatus } from './constants/jobStatuses';
import { addDoc, collection, doc, getDocs, limit as fsLimit, query as fsQuery, serverTimestamp, updateDoc, where } from 'firebase/firestore';

const api = createApiClient({ forceRefreshToken: true });

const expertiseOptions = ['all', ...phase1ExpertiseCatalog.map((x) => x.key)];

const DASHBOARD_PATH = '/admin/dashboard';
const TASK_QUEUE_PATH = '/admin/task-queue';
const QUEUE_PREVIEW_LIMIT = 20;

function Dashboard({ variant = 'default' }) {
  const styles = dashboardStyles;
  const navigate = useNavigate();
  const location = useLocation();
  const isFullQueue = variant === 'fullQueue';
  const basePath = isFullQueue ? TASK_QUEUE_PATH : DASHBOARD_PATH;
  const {
    authReady,
    claims,
    adminAccess,
    jobs,
    users,
    usersNextCursor,
    loading,
    error,
    setUsers,
    fetchData,
    loadMoreUsers,
  } = useAdminDashboardData(api);

  const [sortOrder, setSortOrder] = useState('newest');
  const [expertiseFilter, setExpertiseFilter] = useState('all');

  // Tab system
  const [activeTab, setActiveTab] = useState('jobs');

  // Search filters
  const [jobSearchTerm, setJobSearchTerm] = useState('');
  const [jobStatusFilter, setJobStatusFilter] = useState('all');
  const [jobQuickFilter, setJobQuickFilter] = useState(''); // no_offer_6h|stale_open_24h|disputes_unreviewed|''
  const [jobClientUidFilter, setJobClientUidFilter] = useState('');
  const [jobWfOwner, setJobWfOwner] = useState('');
  const [jobWfSla, setJobWfSla] = useState('');
  const [jobWfFollowup, setJobWfFollowup] = useState('');
  const [jobWfPriority, setJobWfPriority] = useState('');
  const [jobWorkItemsAll, setJobWorkItemsAll] = useState([]);
  const [jobWorkItemsLoading, setJobWorkItemsLoading] = useState(false);
  const [selectedJobIds, setSelectedJobIds] = useState(() => new Set());
  const [bulkConfirm, setBulkConfirm] = useState({ open: false, action: '', label: '' });
  const [bulkBusy, setBulkBusy] = useState(false);
  const [teamLoadHint, setTeamLoadHint] = useState(null);
  const [tradieSearchTerm, setTradieSearchTerm] = useState('');
  const [homeownerSearchTerm, setHomeownerSearchTerm] = useState('');
  const [tradieQuickFilter, setTradieQuickFilter] = useState(''); // ready_now|verified_stripe|active_7d|boosted|''
  const [homeownerQuickFilter, setHomeownerQuickFilter] = useState(''); // new|repeat|inactive|''
  const [userOpsModal, setUserOpsModal] = useState({ open: false, uid: '', role: '', title: '' });
  const [userOpsNote, setUserOpsNote] = useState('');
  const [userOpsSaving, setUserOpsSaving] = useState(false);
  const [statusConfirm, setStatusConfirm] = useState({ open: false, uid: '', role: '', name: '', nextStatus: '' });
  const [tradieDrawer, setTradieDrawer] = useState({ open: false, uid: '' });
  const [clientDrawer, setClientDrawer] = useState({ open: false, uid: '' });
  const [clientFull, setClientFull] = useState({ loading: false, error: '', data: null });
  const [clientNoteDraft, setClientNoteDraft] = useState('');
  const [clientNoteSaving, setClientNoteSaving] = useState(false);
  const [clientFocusNote, setClientFocusNote] = useState(false);
  const [clientDisable, setClientDisable] = useState({ open: false, uid: '', name: '' });
  const [clientDisableReason, setClientDisableReason] = useState('fraud');
  const [clientDisableNote, setClientDisableNote] = useState('');
  const [clientCopied, setClientCopied] = useState({ templateId: '', text: '', atMs: 0 });
  const [clientCopyToast, setClientCopyToast] = useState({ open: false, msg: '' });
  const [copyFallbackModal, setCopyFallbackModal] = useState({ open: false, text: '' });
  const [clientLastOutreachAtMs, setClientLastOutreachAtMs] = useState(0);
  const [clientNoteUpdatedAtMs, setClientNoteUpdatedAtMs] = useState(0);

  const clientNoteRef = useRef(null);
  const tradieNoteRef = useRef(null);
  const [tradieNoteSaving, setTradieNoteSaving] = useState(false);
  const [tradieNoteErr, setTradieNoteErr] = useState('');
  const [tradieNoteUpdatedAtMs, setTradieNoteUpdatedAtMs] = useState(0);
  const [tradieNoteUpdatedByName, setTradieNoteUpdatedByName] = useState('');
  const [tradieNoteInitial, setTradieNoteInitial] = useState('');
  const [boostModal, setBoostModal] = useState({ open: false, uid: '', name: '', isOn: false });
  const [boostReason, setBoostReason] = useState('high_quality');
  const [boostNote, setBoostNote] = useState('');
  const [boostSaving, setBoostSaving] = useState(false);
  const [inviteModal, setInviteModal] = useState({ open: false, uid: '', title: '' });
  const [inviteJobId, setInviteJobId] = useState('');
  const [inviting, setInviting] = useState(false);

  const [noteModal, setNoteModal] = useState({ open: false, jobId: '', title: '' });
  const [noteText, setNoteText] = useState('');
  const [noteSaving, setNoteSaving] = useState(false);
  const [taskDrawer, setTaskDrawer] = useState({ open: false, jobId: '' });
  const [opsSummary, setOpsSummary] = useState({
    loading: true,
    failedPayments: 0,
    refundsInProgress: 0,
    disputesAwaiting: 0,
    disputesStale24h: 0,
    riskHighJobs: 0,
    riskCriticalJobs: 0,
  });
  const [workflowSummary, setWorkflowSummary] = useState({
    loading: true,
    assignedToMe: 0,
    overdue: 0,
    unassignedHighPriority: 0,
    followUpsDueToday: 0,
  });

  const refreshOpsSummary = useCallback(async () => {
    try {
      const r = await api.get('/api/admin/ops-summary');
      setOpsSummary({ loading: false, ...r.data });
    } catch (e) {
      console.error('ops-summary failed', e);
      setOpsSummary((s) => ({ ...s, loading: false }));
    }
  }, []);

  const refreshWorkflowSummary = useCallback(async () => {
    try {
      const r = await api.get('/api/admin/work-items/summary');
      setWorkflowSummary({ loading: false, ...r.data });
    } catch (e) {
      console.error('work-items/summary failed', e);
      setWorkflowSummary((s) => ({ ...s, loading: false }));
    }
  }, []);

  // Query-state handling is delegated to a dashboard hook.


  const fetchQuoteMetaForJobIds = useCallback(async (jobIds) => {
    const ids = Array.isArray(jobIds) ? jobIds.map((x) => String(x || '')).filter(Boolean) : [];
    if (ids.length === 0) return { knownJobIds: [], hasAnyByJobId: {}, firstAtMsByJobId: {} };

    const hasAnyByJobId = {};
    const firstAtMsByJobId = {};

    // Firestore "in" supports up to 10 values.
    const queries = [];
    for (let i = 0; i < ids.length; i += 10) {
      const batch = ids.slice(i, i + 10);
      const q = fsQuery(collection(db, 'quotes'), where('jobId', 'in', batch), fsLimit(5000));
      queries.push(getDocs(q));
    }

    const snaps = await Promise.allSettled(queries);
    for (const s of snaps) {
      if (s.status !== 'fulfilled') continue;
      s.value.forEach((d) => {
        const data = d.data() || {};
        const jid = String(data.jobId || '');
        if (!jid) return;
        hasAnyByJobId[jid] = true;
        const at = toMillis(data.createdAt);
        if (at && (!firstAtMsByJobId[jid] || at < firstAtMsByJobId[jid])) {
          firstAtMsByJobId[jid] = at;
        }
      });
    }

    return { knownJobIds: ids, hasAnyByJobId, firstAtMsByJobId };
  }, []);

  const { quoteMeta, attention, opsKpis } = useAdminDashboardMetrics(jobs, fetchQuoteMetaForJobIds);
  const {
    clearJobClientFilter,
    jobClientLabel,
    goAttention,
    goStaleProfileRequests,
    goWorkflowQueue,
  } = useAdminDashboardQueryState({
    locationSearch: location.search,
    locationPathname: location.pathname,
    navigate,
    users,
    jobClientUidFilter,
    setActiveTab,
    setJobStatusFilter,
    setJobQuickFilter,
    setJobSearchTerm,
    setJobClientUidFilter,
    setTaskDrawer,
    setJobWfOwner,
    setJobWfSla,
    setJobWfFollowup,
    setJobWfPriority,
    setSortOrder,
    basePath,
  });

  useEffect(() => {
    if (authReady && !loading) {
      refreshOpsSummary();
      refreshWorkflowSummary();
    }
  }, [authReady, loading, jobs, refreshOpsSummary, refreshWorkflowSummary]);

  const isSuperAdmin = adminAccess?.isSuperAdmin === true;

  const [jobWorkItemsTick, setJobWorkItemsTick] = useState(0);

  const refreshDashboard = useCallback(async () => {
    await fetchData();
    await refreshOpsSummary();
    await refreshWorkflowSummary();
    setJobWorkItemsTick((t) => t + 1);
  }, [fetchData, refreshOpsSummary, refreshWorkflowSummary]);

  // Show auth/debug panel only when explicitly enabled (avoid leaking claims in normal UI)
  const showDebugPanel = process.env.REACT_APP_SHOW_ADMIN_DEBUG === 'true';
  const {
    sortedJobs,
    filteredJobs,
    filteredTradies,
    filteredHomeowners,
    countsByClientUid,
    stats,
  } = useAdminDashboardDerivedData({
    jobs,
    users,
    sortOrder,
    quoteMeta,
    jobSearchTerm,
    jobStatusFilter,
    jobQuickFilter,
    jobClientUidFilter,
    expertiseFilter,
    tradieSearchTerm,
    tradieQuickFilter,
    homeownerSearchTerm,
    homeownerQuickFilter,
  });

  const currentAdminUid = auth.currentUser?.uid || '';

  const hasJobWorkflowFilter = Boolean(jobWfOwner || jobWfSla || jobWfFollowup || jobWfPriority);

  const workflowJobIdSet = useMemo(() => {
    if (!hasJobWorkflowFilter) return null;
    return jobIdsMatchingWorkflowFilters(
      jobWorkItemsAll,
      {
        owner: jobWfOwner,
        sla: jobWfSla,
        followup: jobWfFollowup,
        priority: jobWfPriority,
      },
      currentAdminUid
    );
  }, [jobWorkItemsAll, hasJobWorkflowFilter, jobWfOwner, jobWfSla, jobWfFollowup, jobWfPriority, currentAdminUid]);

  const displayJobsForQueue = useMemo(() => {
    if (!workflowJobIdSet) return filteredJobs;
    return filteredJobs.filter((j) => workflowJobIdSet.has(String(j.id)));
  }, [filteredJobs, workflowJobIdSet]);

  const queueMatchCount = displayJobsForQueue.length;
  const previewJobsForQueue = useMemo(
    () => (isFullQueue ? displayJobsForQueue : displayJobsForQueue.slice(0, QUEUE_PREVIEW_LIMIT)),
    [displayJobsForQueue, isFullQueue]
  );

  const tradieOpenTasks = useMemo(() => {
    const out = {};
    const terminal = new Set([
      JOB_STATUSES.COMPLETED,
      JOB_STATUSES.PAID,
      JOB_STATUSES.CANCELLED,
      JOB_STATUSES.REFUNDED,
    ]);
    for (const job of jobs) {
      const tid = String(job.acceptedTradieUid || '').trim();
      if (!tid) continue;
      const s = normalizeStatus(job.status);
      if (terminal.has(s)) continue;
      out[tid] = (out[tid] || 0) + 1;
    }
    return out;
  }, [jobs]);

  const jobWorkItemsByJobId = useMemo(() => {
    const map = {};
    for (const it of jobWorkItemsAll) {
      const jid = String(it.entityId || '');
      if (!jid) continue;
      if (!map[jid]) map[jid] = [];
      map[jid].push(it);
    }
    return map;
  }, [jobWorkItemsAll]);

  useEffect(() => {
    if (!authReady || loading || (activeTab !== 'jobs' && !isFullQueue)) return undefined;
    let alive = true;
    setJobWorkItemsLoading(true);
    api.get('/api/admin/work-items?entityType=job')
      .then((r) => {
        if (alive) setJobWorkItemsAll(Array.isArray(r.data?.items) ? r.data.items : []);
      })
      .catch(() => {
        if (alive) setJobWorkItemsAll([]);
      })
      .finally(() => {
        if (alive) setJobWorkItemsLoading(false);
      });
    return () => { alive = false; };
  }, [authReady, loading, activeTab, isFullQueue, jobWorkItemsTick]);

  useEffect(() => {
    if (activeTab !== 'jobs' && !isFullQueue) return undefined;
    let alive = true;
    api.get('/api/admin/work-items/team-load')
      .then((r) => {
        if (alive) setTeamLoadHint(r.data || null);
      })
      .catch(() => {
        if (alive) setTeamLoadHint(null);
      });
    return () => { alive = false; };
  }, [activeTab, isFullQueue, jobWorkItemsTick]);

  const handleVerify = async (uid) => {
    try {
      await api.put(`/api/admin/users/${uid}/verify`, null);
      await fetchData();
    } catch (err) {
      console.error('Failed to verify user:', err);
      alert('Error: Could not verify user.');
    }
  };

  const handleStatusChange = async (uid, currentStatus) => {
    const newStatus = currentStatus === 'active' ? 'disabled' : 'active';
    try {
      await api.put(`/api/admin/users/${uid}/status`, { status: newStatus });
      await fetchData();
    } catch (err) {
      console.error('Failed to update status:', err);
      alert('Error: Could not update user status.');
    }
  };

  const requestStatusChange = (e, u) => {
    e?.stopPropagation?.();
    const nextStatus = u.status === 'active' ? 'disabled' : 'active';
    // Confirm only when disabling (trust + safety).
    if (nextStatus === 'disabled') {
      setStatusConfirm({
        open: true,
        uid: u.uid,
        role: u.role,
        name: u.displayName || u.emailMasked || u.uid,
        nextStatus,
      });
      return;
    }
    handleStatusChange(u.uid, u.status);
  };

  const openUserOpsModal = (e, u) => {
    e?.stopPropagation?.();
    setUserOpsNote(String(u.adminNote || ''));
    setUserOpsModal({ open: true, uid: u.uid, role: u.role, title: u.displayName || u.emailMasked || u.uid });
  };

  const closeUserOpsModal = () => {
    if (userOpsSaving) return;
    setUserOpsModal({ open: false, uid: '', role: '', title: '' });
    setUserOpsNote('');
  };

  const saveUserOps = async () => {
    const uid = String(userOpsModal.uid || '');
    if (!uid) return;
    try {
      setUserOpsSaving(true);
      await api.put(`/api/admin/users/${uid}/ops`, { adminNote: String(userOpsNote || '') });
      closeUserOpsModal();
      await fetchData();
    } catch (e) {
      console.error('Save user ops failed:', e);
      alert(e?.response?.data?.message || 'Failed to save note.');
    } finally {
      setUserOpsSaving(false);
    }
  };

  const openTradieDrawer = (e, u) => {
    e?.stopPropagation?.();
    const uid = String(u?.uid || '').trim();
    if (!uid) return;
    setTradieDrawer({ open: true, uid });
    setUserOpsNote(String(u?.adminNote || ''));
    setTradieNoteUpdatedAtMs(Number(u?.adminNoteUpdatedAtMs || 0) || 0);
    setTradieNoteUpdatedByName(String(u?.adminNoteUpdatedByName || u?.adminNoteUpdatedBy || '') || '');
    setTradieNoteInitial(String(u?.adminNote || ''));
    setTradieNoteErr('');
  };

  const closeTradieDrawer = () => {
    if (userOpsSaving) return;
    setTradieDrawer({ open: false, uid: '' });
  };

  useEffect(() => {
    if (!tradieDrawer.open) return undefined;
    const onKeyDown = (e) => {
      if (e.key === 'Escape') closeTradieDrawer();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tradieDrawer.open, userOpsSaving]);

  const drawerTradie = useMemo(() => {
    const uid = String(tradieDrawer.uid || '');
    if (!uid) return null;
    return users.find((x) => x.uid === uid) || null;
  }, [tradieDrawer.uid, users]);


  const saveTradieNote = async () => {
    const uid = String(tradieDrawer.uid || '').trim();
    if (!uid) return;
    try {
      setTradieNoteErr('');
      const txt = String(userOpsNote || '');
      if (txt.length > 500) {
        setTradieNoteErr('Admin note is too long (max 500 characters).');
        return;
      }
      setTradieNoteSaving(true);
      await api.put(`/api/admin/users/${uid}/ops`, { adminNote: txt });
      const now = Date.now();
      setTradieNoteUpdatedAtMs(now);
      setTradieNoteUpdatedByName('You');
      setTradieNoteInitial(txt);
      setUsers((prev) => prev.map((x) => (x.uid === uid ? { ...x, adminNote: txt.slice(0, 200), adminNoteUpdatedAtMs: now } : x)));
      showClientToast('Saved');
      await fetchData();
    } catch (e) {
      setTradieNoteErr('Failed to save note. Try again.');
    } finally {
      setTradieNoteSaving(false);
    }
  };

  const requestBoostToggle = (u) => {
    const uid = String(u?.uid || '').trim();
    if (!uid) return;
    const name = u?.displayName || u?.emailMasked || uid;
    const isOn = (u?.boost?.isBoosted === true) || u?.boostedVisibility === true;
    setBoostModal({ open: true, uid, name, isOn });
    setBoostReason('high_quality');
    setBoostNote('');
  };

  const closeBoostModal = () => {
    if (boostSaving) return;
    setBoostModal({ open: false, uid: '', name: '', isOn: false });
    setBoostNote('');
  };

  const confirmBoost = async () => {
    const uid = String(boostModal.uid || '').trim();
    if (!uid) return;
    try {
      setBoostSaving(true);
      if (boostModal.isOn) {
        // Removing boost
        await api.post(`/api/admin/users/${uid}/boost`, { isBoosted: false });
        showClientToast('Boost removed');
      } else {
        await api.post(`/api/admin/users/${uid}/boost`, {
          isBoosted: true,
          reason: boostReason,
          note: boostNote,
        });
        showClientToast('Boosted');
      }
      closeBoostModal();
      await fetchData();
    } catch (e) {
      alert(e?.response?.data?.message || e?.message || 'Failed to update boost.');
    } finally {
      setBoostSaving(false);
    }
  };

  const openInviteModal = (u) => {
    const uid = String(u?.uid || '').trim();
    if (!uid) return;
    setInviteModal({ open: true, uid, title: u?.displayName || u?.emailMasked || uid });
    setInviteJobId('');
  };

  const closeInviteModal = () => {
    if (inviting) return;
    setInviteModal({ open: false, uid: '', title: '' });
    setInviteJobId('');
  };

  const inviteToSelectedTask = async () => {
    const uid = String(inviteModal.uid || '').trim();
    const jobId = String(inviteJobId || '').trim();
    if (!uid || !jobId) return;
    try {
      setInviting(true);
      await api.post(`/api/admin/jobs/${jobId}/assign`, { tradieUid: uid });
      showClientToast('Invite sent');
      closeInviteModal();
      await fetchData();
    } catch (e) {
      alert(e?.response?.data?.message || e?.message || 'Failed to invite expert.');
    } finally {
      setInviting(false);
    }
  };

  const openClientDrawer = (e, u) => {
    e?.stopPropagation?.();
    const uid = String(u?.uid || '').trim();
    if (!uid) return;
    setClientDrawer({ open: true, uid });
    setClientNoteDraft(String(u?.adminNote || ''));
    setClientNoteUpdatedAtMs(Number(u?.adminNoteUpdatedAtMs || 0) || 0);
    setClientFocusNote(false);
  };

  const openClientDrawerToNote = (e, u) => {
    e?.stopPropagation?.();
    openClientDrawer(e, u);
    setClientFocusNote(true);
  };

  const closeClientDrawer = () => {
    if (clientNoteSaving) return;
    setClientDrawer({ open: false, uid: '' });
    setClientFull({ loading: false, error: '', data: null });
    setClientDisable({ open: false, uid: '', name: '' });
    setClientDisableNote('');
    setClientFocusNote(false);
  };

  useEffect(() => {
    if (!clientDrawer.open || !clientDrawer.uid) return undefined;
    const onKeyDown = (e) => {
      if (e.key === 'Escape') closeClientDrawer();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientDrawer.open, clientDrawer.uid, clientNoteSaving]);

  const drawerClient = useMemo(() => {
    const uid = String(clientDrawer.uid || '');
    if (!uid) return null;
    return users.find((x) => x.uid === uid) || null;
  }, [clientDrawer.uid, users]);

  // Fetch full client details (PII) only when drawer is opened (audit logged by backend).
  useEffect(() => {
    let alive = true;
    const run = async () => {
      if (!clientDrawer.open || !clientDrawer.uid) return;
      try {
        setClientFull({ loading: true, error: '', data: null });
        const res = await api.get(`/api/admin/users/${encodeURIComponent(clientDrawer.uid)}`);
        if (!alive) return;
        setClientFull({ loading: false, error: '', data: res.data || null });
        setClientLastOutreachAtMs(Number(res.data?.lastOutreachAtMs || 0) || 0);
      } catch (e) {
        if (!alive) return;
        setClientFull({ loading: false, error: e?.response?.data?.message || e?.message || 'Failed to load user details.', data: null });
      }
    };
    run();
    return () => { alive = false; };
  }, [clientDrawer.open, clientDrawer.uid]);

  useEffect(() => {
    if (!clientDrawer.open || !clientFocusNote) return;
    // Scroll + focus after drawer renders.
    window.setTimeout(() => {
      const el = clientNoteRef.current;
      if (!el) return;
      try {
        el.scrollIntoView({ block: 'center', behavior: 'smooth' });
      } catch (_) {
        // ignore
      }
      el.focus?.();
    }, 50);
  }, [clientDrawer.open, clientFocusNote]);

  const saveClientNote = async () => {
    const uid = String(clientDrawer.uid || '');
    if (!uid) return;
    try {
      const txt = String(clientNoteDraft || '');
      if (txt.length > 500) {
        alert('Admin note is too long (max 500 characters).');
        return;
      }
      setClientNoteSaving(true);
      await api.put(`/api/admin/users/${uid}/ops`, { adminNote: txt });
      const now = Date.now();
      setClientNoteUpdatedAtMs(now);
      setUsers((prev) => prev.map((x) => (x.uid === uid ? { ...x, adminNote: txt.slice(0, 200), adminNoteUpdatedAtMs: now } : x)));
      showClientToast('Saved');
      await fetchData(); // keep authoritative
    } catch (e) {
      // Keep it simple; Dashboard already uses alert elsewhere.
      alert(e?.response?.data?.message || e?.message || 'Failed to save note.');
    } finally {
      setClientNoteSaving(false);
    }
  };

  const goClientTasks = (uid) => {
    const id = String(uid || '').trim();
    if (!id) return;
    // Force local state update even if already on /admin/dashboard (same-route navigation edge case)
    setActiveTab('jobs');
    setJobClientUidFilter(id);

    const params = new URLSearchParams(location.search || '');
    params.set('tab', 'jobs');
    params.set('clientUid', id);
    navigate(`/admin/dashboard?${params.toString()}`);
    closeClientDrawer();
  };

  const showClientToast = (msg) => {
    const m = String(msg || '').trim();
    if (!m) return;
    setClientCopyToast({ open: true, msg: m });
    window.setTimeout(() => setClientCopyToast({ open: false, msg: '' }), 2000);
  };

  const copyClientTemplate = async ({ templateId, text }) => {
    const id = String(templateId || '').trim();
    const t = String(text || '').trim();
    if (!id || !t) return;
    const now = Date.now();
    try {
      await navigator.clipboard.writeText(t);
      setClientCopied({ templateId: id, text: t, atMs: now });
      showClientToast('Copied to clipboard');
    } catch (_) {
      // Fallback: still treat as "copied" from UX perspective.
      setClientCopied({ templateId: id, text: t, atMs: now });
      setCopyFallbackModal({ open: true, text: t });
      showClientToast('Copied to clipboard');
    }

    // Admin-only logging (best-effort)
    try {
      const uid = String(clientDrawer.uid || '').trim();
      if (uid) {
        const res = await api.post(`/api/admin/users/${encodeURIComponent(uid)}/comms-log`, { templateId: id, text: t });
        const ms = Number(res.data?.lastOutreachAtMs || 0) || now;
        setClientLastOutreachAtMs(ms);
      }
    } catch (_) {
      // non-blocking
    }
  };

  const sendVia = useMemo(() => {
    const email = String(clientFull.data?.email || '').trim();
    const phone = String(clientFull.data?.phone || '').trim();
    const hasCopied = !!String(clientCopied.text || '').trim();
    const subject = 'Taskio update';
    const body = String(clientCopied.text || '');

    const enc = (s) => encodeURIComponent(String(s || ''));
    const digits = (s) => String(s || '').replace(/[^\d+]/g, '');
    const phoneE164 = digits(phone); // usually +61...
    const waPhone = phoneE164.replace(/^\+/, ''); // WhatsApp expects countrycode+number

    const mailto = email && hasCopied
      ? `mailto:${enc(email)}?subject=${enc(subject)}&body=${enc(body)}`
      : null;
    const sms = phoneE164 && hasCopied
      ? `sms:${enc(phoneE164)}?body=${enc(body)}`
      : null;
    const whatsapp = waPhone && hasCopied
      ? `https://web.whatsapp.com/send?phone=${enc(waPhone)}&text=${enc(body)}`
      : null;

    return { email, phone, hasCopied, mailto, sms, whatsapp };
  }, [clientCopied.text, clientFull.data]);

  const openDisableClient = () => {
    const uid = String(drawerClient?.uid || clientDrawer.uid || '');
    if (!uid) return;
    setClientDisable({
      open: true,
      uid,
      name: drawerClient?.displayName || drawerClient?.emailMasked || uid,
    });
    setClientDisableReason('fraud');
    setClientDisableNote('');
  };

  const confirmDisableClient = async () => {
    const uid = String(clientDisable.uid || '').trim();
    if (!uid) return;
    try {
      await api.post(`/api/admin/users/${uid}/disable`, {
        reason: clientDisableReason,
        note: String(clientDisableNote || ''),
      });
      setClientDisable({ open: false, uid: '', name: '' });
      await fetchData();
      closeClientDrawer();
    } catch (e) {
      alert(e?.response?.data?.message || e?.message || 'Failed to disable user.');
    }
  };

  // Boost is now handled via /api/admin/users/:uid/boost (see requestBoostToggle/confirmBoost)

  const openNoteModal = (job) => {
    setNoteText('');
    setNoteModal({ open: true, jobId: String(job?.id || ''), title: String(job?.title || 'Task') });
  };

  const toggleJobWorkflowUrl = useCallback((key, value) => {
    const params = new URLSearchParams(location.search);
    if (!isFullQueue) params.set('tab', 'jobs');
    const cur = {
      owner: jobWfOwner,
      sla: jobWfSla,
      followup: jobWfFollowup,
      wfPriority: jobWfPriority,
    };
    const next = { ...cur };
    if (next[key] === value) next[key] = '';
    else next[key] = value;
    if (next.owner) params.set('owner', next.owner); else params.delete('owner');
    if (next.sla) params.set('sla', next.sla); else params.delete('sla');
    if (next.followup) params.set('followup', next.followup); else params.delete('followup');
    if (next.wfPriority) params.set('wfPriority', next.wfPriority); else params.delete('wfPriority');
    navigate(`${basePath}?${params.toString()}`, { replace: true });
  }, [location.search, navigate, basePath, isFullQueue, jobWfOwner, jobWfSla, jobWfFollowup, jobWfPriority]);

  const onDashboardTabChange = useCallback((tab) => {
    navigate(buildDashboardTabUrl(location.search, tab), { replace: true });
  }, [location.search, navigate]);

  const onToggleSortOrder = useCallback(() => {
    const next = sortOrder === 'newest' ? 'oldest' : 'newest';
    const params = new URLSearchParams(location.search);
    params.set('sort', next);
    if (!isFullQueue) params.set('tab', 'jobs');
    navigate(`${basePath}?${params.toString()}`, { replace: true });
    setSortOrder(next);
  }, [sortOrder, location.search, navigate, basePath, isFullQueue, setSortOrder]);

  const clearWorkflowFilters = useCallback(() => {
    const params = new URLSearchParams(location.search);
    ['owner', 'sla', 'followup', 'wfPriority'].forEach((k) => params.delete(k));
    if (!isFullQueue) params.set('tab', 'jobs');
    navigate(`${basePath}?${params.toString()}`, { replace: true });
  }, [navigate, location.search, basePath, isFullQueue]);

  const clearQueueFilters = useCallback(() => {
    setJobQuickFilter('');
    setJobSearchTerm('');
    setJobStatusFilter('all');
    setJobClientUidFilter('');
    const params = new URLSearchParams(location.search);
    ['quick', 'q', 'owner', 'sla', 'followup', 'wfPriority', 'clientUid'].forEach((k) => params.delete(k));
    params.set('status', 'all');
    if (!isFullQueue) params.set('tab', 'jobs');
    navigate(`${basePath}?${params.toString()}`, { replace: true });
  }, [navigate, location.search, basePath, isFullQueue, setJobQuickFilter, setJobSearchTerm, setJobStatusFilter, setJobClientUidFilter]);

  const openFullTaskQueue = useCallback(() => {
    const params = new URLSearchParams(location.search);
    params.delete('tab');
    params.delete('openJob');
    navigate(`${TASK_QUEUE_PATH}?${params.toString()}`);
  }, [navigate, location.search]);

  const collectSelectedWorkItemIds = () => {
    const ids = [];
    for (const jid of selectedJobIds) {
      const items = jobWorkItemsByJobId[jid] || [];
      for (const it of items) {
        if (String(it.status) !== 'resolved') ids.push(it.id);
      }
    }
    return ids.slice(0, 40);
  };

  const runJobBulkAction = async (action, paramsBody = {}) => {
    const itemIds = collectSelectedWorkItemIds();
    if (itemIds.length === 0) return;
    setBulkBusy(true);
    try {
      const res = await api.post('/api/admin/work-items/bulk-update', {
        itemIds,
        action,
        params: paramsBody,
      });
      const msg = `Done: ${res.data?.successCount ?? 0} ok, ${res.data?.failCount ?? 0} failed.`;
      window.alert(msg);
      setSelectedJobIds(new Set());
      setBulkConfirm({ open: false, action: '', label: '' });
      await refreshWorkflowSummary();
      setJobWorkItemsTick((t) => t + 1);
    } catch (e) {
      window.alert(e?.response?.data?.message || e?.message || 'Bulk action failed.');
    } finally {
      setBulkBusy(false);
    }
  };

  const openTaskDrawer = (job) => {
    const id = String(job?.id || '').trim();
    if (!id) return;
    const params = new URLSearchParams(location.search);
    params.set('tab', 'jobs');
    params.set('openJob', id);
    navigate(`${DASHBOARD_PATH}?${params.toString()}`);
    setTaskDrawer({ open: true, jobId: id });
  };

  const closeTaskDrawer = useCallback(() => {
    setTaskDrawer({ open: false, jobId: '' });
    const params = new URLSearchParams(location.search);
    if (params.has('openJob')) {
      params.delete('openJob');
      navigate(`${DASHBOARD_PATH}?${params.toString()}`, { replace: true });
    }
  }, [navigate, location.search]);

  useEffect(() => {
    if (!taskDrawer.open) return undefined;
    const onKeyDown = (e) => {
      if (e.key === 'Escape') closeTaskDrawer();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [taskDrawer.open, closeTaskDrawer]);

  const drawerTask = useMemo(() => {
    const id = String(taskDrawer.jobId || '');
    if (!id) return null;
    return jobs.find((j) => String(j.id || '') === id) || null;
  }, [taskDrawer.jobId, jobs]);

  const closeNoteModal = () => {
    if (noteSaving) return;
    setNoteModal({ open: false, jobId: '', title: '' });
    setNoteText('');
  };

  const saveInternalNote = async () => {
    const jobId = String(noteModal.jobId || '');
    const txt = String(noteText || '').trim();
    if (!jobId || !txt) return;
    try {
      setNoteSaving(true);
      const u = auth.currentUser;
      await addDoc(collection(db, 'jobs', jobId, 'adminNotes'), {
        text: txt,
        createdAt: serverTimestamp(),
        createdByUid: u?.uid || null,
      });
      await updateDoc(doc(db, 'jobs', jobId), {
        lastAdminActionAt: serverTimestamp(),
        lastAdminActionBy: u?.uid || null,
      });
      closeNoteModal();
    } catch (e) {
      console.error('Save internal note failed:', e);
      alert(e?.message || 'Failed to save note.');
    } finally {
      setNoteSaving(false);
    }
  };

  if (!authReady) return <div style={styles.centered}>Initialising session…</div>;
  if (loading) return <div style={styles.centered}>Loading dashboard…</div>;

  return (
    <>
      <AppHeader 
        userRole="admin" 
        userName={auth.currentUser?.displayName || ''} 
        userEmail={auth.currentUser?.email || ''}
      />
      
      <div style={styles.container}>

      {!isFullQueue ? (
        <DashboardOverview
          styles={styles}
          error={error}
          showDebugPanel={showDebugPanel}
          apiBaseUrl={API_BASE_URL}
          currentUser={auth.currentUser}
          claims={claims}
          adminAccess={adminAccess}
          onRefresh={refreshDashboard}
          attention={attention}
          onGoAttention={goAttention}
          onGoStaleProfileRequests={goStaleProfileRequests}
          onGoWorkflowQueue={goWorkflowQueue}
          stats={stats}
          opsKpis={opsKpis}
          opsSummary={opsSummary}
          workflowSummary={workflowSummary}
          activeTab={activeTab}
          onTabChange={onDashboardTabChange}
          counts={{
            jobs: queueMatchCount,
            tradies: filteredTradies.length,
            homeowners: filteredHomeowners.length,
          }}
        />
      ) : (
        <div style={{ marginBottom: 20 }}>
          <Link to="/admin/dashboard" style={{ fontSize: 14, fontWeight: 700, color: '#2563eb', textDecoration: 'none' }}>
            ← Back to dashboard
          </Link>
        </div>
      )}

      <AdminJobQueuePanel
        visible={isFullQueue || activeTab === 'jobs'}
        variant={isFullQueue ? 'full' : 'preview'}
        styles={styles}
        filteredJobs={isFullQueue ? displayJobsForQueue : previewJobsForQueue}
        totalMatchingCount={queueMatchCount}
        sortedJobs={sortedJobs}
        jobSearchTerm={jobSearchTerm}
        onJobSearchTermChange={setJobSearchTerm}
        jobQuickFilter={jobQuickFilter}
        onClearJobQuickFilter={() => setJobQuickFilter('')}
        jobClientUidFilter={jobClientUidFilter}
        jobClientLabel={jobClientLabel}
        onClearJobClientFilter={clearJobClientFilter}
        sortOrder={sortOrder}
        onToggleSortOrder={onToggleSortOrder}
        jobStatusFilter={jobStatusFilter}
        onJobStatusFilterChange={setJobStatusFilter}
        onApplyQuickNeedsAttention={() => { setJobStatusFilter('OPEN'); setJobQuickFilter('no_offer_6h'); }}
        onApplyQuickWaitingTooLong={() => { setJobStatusFilter('OPEN'); setJobQuickFilter('stale_open_24h'); }}
        onApplyQuickFlagged={() => { setJobStatusFilter('all'); setJobQuickFilter('flagged'); }}
        onApplyQuickPaymentIssues={() => { setJobStatusFilter('all'); setJobQuickFilter('payment_issues'); }}
        onApplyQuickDisputesStale={() => { setJobStatusFilter(JOB_STATUSES.DISPUTED); setJobQuickFilter('disputes_stale_24h'); }}
        getTaskCreatedAtMs={getTaskCreatedAtMs}
        quoteMeta={quoteMeta}
        healthLabelForTask={healthLabelForTask}
        formatAgeShort={formatAgeShort}
        onOpenTaskDrawer={openTaskDrawer}
        onInviteExperts={(job) => navigate(`/admin/job/${job.id}#invite`)}
        users={users}
        jobWfOwner={jobWfOwner}
        jobWfSla={jobWfSla}
        jobWfFollowup={jobWfFollowup}
        jobWfPriority={jobWfPriority}
        onToggleJobWorkflow={toggleJobWorkflowUrl}
        onClearWorkflowFilters={clearWorkflowFilters}
        onClearQueueFilters={clearQueueFilters}
        jobWorkItemsLoading={jobWorkItemsLoading}
        teamLoad={isFullQueue ? teamLoadHint : null}
        onOpenFullQueue={isFullQueue ? undefined : openFullTaskQueue}
        selectedJobIds={selectedJobIds}
        onToggleSelectJob={isFullQueue ? (jobId) => {
          const id = String(jobId || '');
          if (!id) return;
          setSelectedJobIds((prev) => {
            const n = new Set(prev);
            if (n.has(id)) n.delete(id);
            else n.add(id);
            return n;
          });
        } : undefined}
        onSelectAllVisible={isFullQueue ? () => {
          const ids = displayJobsForQueue.map((j) => String(j.id)).filter(Boolean);
          setSelectedJobIds(new Set(ids));
        } : undefined}
        onClearSelection={isFullQueue ? () => setSelectedJobIds(new Set()) : undefined}
        onBulkRequest={isFullQueue ? (action, label) => {
          const n = collectSelectedWorkItemIds().length;
          if (n === 0) return;
          if ((action === 'resolve' || action === 'snooze') && n > 1) {
            setBulkConfirm({ open: true, action, label });
            return;
          }
          if (action === 'snooze') runJobBulkAction('snooze', { snoozeHours: 4 });
          else runJobBulkAction(action, {});
        } : undefined}
      />

      {bulkConfirm.open ? (
        <div
          role="dialog"
          aria-modal="true"
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.35)',
            zIndex: 12000,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 16,
          }}
        >
          <div style={{ background: '#fff', borderRadius: 12, padding: 20, maxWidth: 420, width: '100%' }}>
            <div style={{ fontWeight: 800, marginBottom: 8 }}>Confirm bulk action</div>
            <div style={{ fontSize: 14, color: '#374151', marginBottom: 16 }}>
              {bulkConfirm.label} for {collectSelectedWorkItemIds().length} work items?
            </div>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button type="button" style={styles.buttonSecondary} onClick={() => setBulkConfirm({ open: false, action: '', label: '' })} disabled={bulkBusy}>
                Cancel
              </button>
              <button
                type="button"
                style={styles.button}
                disabled={bulkBusy}
                onClick={() => {
                  if (bulkConfirm.action === 'snooze') runJobBulkAction('snooze', { snoozeHours: 4 });
                  else runJobBulkAction('resolve', {});
                }}
              >
                {bulkBusy ? 'Working…' : 'Confirm'}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {/* Tradies Tab */}
      {!isFullQueue && activeTab === 'tradies' && (
        <TradiesTab
          tradieOpenTasks={tradieOpenTasks}
          filteredTradies={filteredTradies}
          tradieSearchTerm={tradieSearchTerm}
          setTradieSearchTerm={setTradieSearchTerm}
          tradieQuickFilter={tradieQuickFilter}
          setTradieQuickFilter={setTradieQuickFilter}
          expertiseFilter={expertiseFilter}
          setExpertiseFilter={setExpertiseFilter}
          expertiseOptions={expertiseOptions}
          styles={styles}
          navigate={navigate}
          openTradieDrawer={openTradieDrawer}
          openUserOpsModal={openUserOpsModal}
        />
      )}

      <TradieDetailsDrawer
        open={tradieDrawer.open}
        styles={styles}
        closeDrawer={closeTradieDrawer}
        drawerTradie={drawerTradie}
        drawerUid={tradieDrawer.uid}
        tradieNoteRef={tradieNoteRef}
        userOpsNote={userOpsNote}
        onUserOpsNoteChange={setUserOpsNote}
        tradieNoteErr={tradieNoteErr}
        tradieNoteUpdatedAtMs={tradieNoteUpdatedAtMs}
        tradieNoteUpdatedByName={tradieNoteUpdatedByName}
        formatAgeShort={formatAgeShort}
        saveTradieNote={saveTradieNote}
        tradieNoteSaving={tradieNoteSaving}
        tradieNoteInitial={tradieNoteInitial}
        onVerify={handleVerify}
        onRequestStatusChange={requestStatusChange}
        onRequestBoostToggle={requestBoostToggle}
        onOpenInviteModal={openInviteModal}
      />

      {/* Homeowners Tab */}
      {!isFullQueue && activeTab === 'homeowners' && (
        <ClientsTab
          filteredHomeowners={filteredHomeowners}
          homeownerSearchTerm={homeownerSearchTerm}
          setHomeownerSearchTerm={setHomeownerSearchTerm}
          homeownerQuickFilter={homeownerQuickFilter}
          setHomeownerQuickFilter={setHomeownerQuickFilter}
          styles={styles}
          navigate={navigate}
          countsByClientUid={countsByClientUid}
          openClientDrawer={openClientDrawer}
          openClientDrawerToNote={openClientDrawerToNote}
        />
      )}

      <ClientDetailsDrawer
        open={clientDrawer.open}
        styles={styles}
        closeDrawer={closeClientDrawer}
        drawerClient={drawerClient}
        drawerUid={clientDrawer.uid}
        clientFull={clientFull}
        countsByClientUid={countsByClientUid}
        formatAgeShort={formatAgeShort}
        clientNoteRef={clientNoteRef}
        clientNoteDraft={clientNoteDraft}
        onClientNoteDraftChange={setClientNoteDraft}
        clientNoteUpdatedAtMs={clientNoteUpdatedAtMs}
        clientNoteSaving={clientNoteSaving}
        onSaveClientNote={saveClientNote}
        onGoClientTasks={goClientTasks}
        clientLastOutreachAtMs={clientLastOutreachAtMs}
        clientCopied={clientCopied}
        onCopyClientTemplate={copyClientTemplate}
        sendVia={sendVia}
        onOpenDisableClient={openDisableClient}
      />

      {clientCopyToast.open && (
        <div style={styles.toast}>
          {clientCopyToast.msg}
        </div>
      )}
      <DashboardActionModals
        copyFallbackModal={copyFallbackModal}
        onCloseCopyFallback={() => setCopyFallbackModal({ open: false, text: '' })}
        boostModal={boostModal}
        boostReason={boostReason}
        onBoostReasonChange={setBoostReason}
        boostNote={boostNote}
        onBoostNoteChange={setBoostNote}
        boostSaving={boostSaving}
        onCloseBoost={closeBoostModal}
        onConfirmBoost={confirmBoost}
        inviteModal={inviteModal}
        inviteJobId={inviteJobId}
        onInviteJobChange={setInviteJobId}
        jobs={jobs}
        inviting={inviting}
        onCloseInvite={closeInviteModal}
        onInvite={inviteToSelectedTask}
        selectStyle={styles.select}
        modalTextareaStyle={styles.modalTextarea}
      />

      {/* Task details drawer */}
      <TaskDetailsDrawer
        open={taskDrawer.open}
        onClose={closeTaskDrawer}
        drawerTask={drawerTask}
        drawerJobId={taskDrawer.jobId}
        quoteMeta={quoteMeta}
        users={users}
        styles={styles}
        formatAgeShort={formatAgeShort}
        getTaskCreatedAtMs={getTaskCreatedAtMs}
        healthLabelForTask={healthLabelForTask}
        api={api}
        isSuperAdmin={isSuperAdmin}
        onAfterAction={refreshDashboard}
        onInviteExperts={(job) => { closeTaskDrawer(); navigate(`/admin/job/${job.id}#invite`); }}
        onViewTask={(job) => { closeTaskDrawer(); navigate(`/admin/job/${job.id}`); }}
        onAddInternalNote={(job) => { closeTaskDrawer(); openNoteModal(job); }}
        currentUserUid={auth.currentUser?.uid}
      />
      <DashboardOpsModals
        clientDisable={clientDisable}
        clientDisableReason={clientDisableReason}
        clientDisableNote={clientDisableNote}
        onCloseClientDisable={() => setClientDisable({ open: false, uid: '', name: '' })}
        onClientDisableReasonChange={setClientDisableReason}
        onClientDisableNoteChange={setClientDisableNote}
        onConfirmDisableClient={confirmDisableClient}
        noteModal={noteModal}
        noteText={noteText}
        noteSaving={noteSaving}
        onCloseNoteModal={closeNoteModal}
        onNoteTextChange={setNoteText}
        onSaveInternalNote={saveInternalNote}
        userOpsModal={userOpsModal}
        userOpsNote={userOpsNote}
        userOpsSaving={userOpsSaving}
        onCloseUserOpsModal={closeUserOpsModal}
        onUserOpsNoteChange={setUserOpsNote}
        onSaveUserOps={saveUserOps}
        statusConfirm={statusConfirm}
        onCloseStatusConfirm={() => setStatusConfirm({ open: false, uid: '', role: '', name: '', nextStatus: '' })}
        onConfirmStatusDisable={async () => {
          const uid = statusConfirm.uid;
          setStatusConfirm({ open: false, uid: '', role: '', name: '', nextStatus: '' });
          await handleStatusChange(uid, 'active');
        }}
        styles={styles}
      />

      {!isFullQueue && (activeTab === 'tradies' || activeTab === 'homeowners') && usersNextCursor && (
        <div style={{ display: 'flex', justifyContent: 'center', marginTop: 12 }}>
          <button style={styles.buttonSecondary} onClick={loadMoreUsers}>Load more users</button>
        </div>
      )}
      </div>
    </>
  );
}

export default Dashboard;
