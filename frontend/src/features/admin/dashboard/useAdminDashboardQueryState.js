import { useEffect, useMemo } from 'react';
import { JOB_STATUSES, normalizeStatus } from '../../../constants/jobStatuses';

const validTabs = new Set(['jobs', 'tradies', 'homeowners']);
const validStatuses = new Set([
  'all',
  JOB_STATUSES.OPEN,
  JOB_STATUSES.QUOTED,
  JOB_STATUSES.ASSIGNED,
  JOB_STATUSES.AWAITING_FUNDING,
  JOB_STATUSES.FUNDED,
  JOB_STATUSES.IN_PROGRESS,
  JOB_STATUSES.COMPLETED,
  JOB_STATUSES.PAID,
  JOB_STATUSES.CANCELLED,
  JOB_STATUSES.DISPUTED,
  JOB_STATUSES.REFUND_PENDING,
  JOB_STATUSES.REFUNDED,
]);
const validQuick = new Set([
  '',
  'no_offer_6h',
  'stale_open_24h',
  'disputes_unreviewed',
  'flagged',
  'payment_issues',
  'disputes_stale_24h',
]);

function normalizeAdminStatusParam(status) {
  const raw = String(status || '').trim();
  if (!raw || raw === 'all') return 'all';
  return normalizeStatus(raw);
}

const wfOwners = new Set(['', 'me', 'unassigned']);
const wfSlas = new Set(['', 'overdue', 'due_soon']);
const wfFollowups = new Set(['', 'due']);
const wfPri = new Set(['', 'high', 'critical']);

export default function useAdminDashboardQueryState({
  locationSearch,
  locationPathname = '',
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
  basePath = '/admin/dashboard',
}) {
  useEffect(() => {
    const params = new URLSearchParams(locationSearch || '');
    const tab = String(params.get('tab') || '').trim();
    const status = String(params.get('status') || '').trim();
    const quick = String(params.get('quick') || '').trim();
    const search = String(params.get('q') || '').trim();
    const clientUid = String(params.get('clientUid') || '').trim();
    const openJob = String(params.get('openJob') || '').trim();
    const owner = String(params.get('owner') || '').trim();
    const sla = String(params.get('sla') || '').trim();
    const followup = String(params.get('followup') || '').trim();
    const wfPriority = String(params.get('wfPriority') || '').trim();
    const sort = String(params.get('sort') || '').trim();

    const isTaskQueueRoute = String(locationPathname || '').includes('task-queue');
    const applyJobs = isTaskQueueRoute || tab === 'jobs' || !tab;

    if (validTabs.has(tab)) setActiveTab(tab);
    if (typeof setSortOrder === 'function') {
      if (sort === 'oldest') setSortOrder('oldest');
      else setSortOrder('newest');
    }
    if (applyJobs) {
      const normalizedStatus = normalizeAdminStatusParam(status);
      if (validStatuses.has(normalizedStatus)) setJobStatusFilter(normalizedStatus);
      if (validQuick.has(quick)) setJobQuickFilter(quick);
      if (search) setJobSearchTerm(search);
      setJobClientUidFilter(clientUid);
      if (typeof setJobWfOwner === 'function' && wfOwners.has(owner)) setJobWfOwner(owner);
      if (typeof setJobWfSla === 'function' && wfSlas.has(sla)) setJobWfSla(sla);
      if (typeof setJobWfFollowup === 'function' && wfFollowups.has(followup)) setJobWfFollowup(followup);
      if (typeof setJobWfPriority === 'function' && wfPri.has(wfPriority)) setJobWfPriority(wfPriority);
      if (openJob && typeof setTaskDrawer === 'function') {
        setTaskDrawer({ open: true, jobId: openJob });
      }
    }
  }, [
    locationSearch,
    locationPathname,
    setActiveTab,
    setJobClientUidFilter,
    setJobQuickFilter,
    setJobSearchTerm,
    setJobStatusFilter,
    setTaskDrawer,
    setJobWfOwner,
    setJobWfSla,
    setJobWfFollowup,
    setJobWfPriority,
    setSortOrder,
  ]);

  const clearJobClientFilter = () => {
    setJobClientUidFilter('');
    const params = new URLSearchParams(locationSearch || '');
    params.delete('clientUid');
    params.set('tab', 'jobs');
    navigate(`${basePath}?${params.toString()}`);
  };

  const jobClientLabel = useMemo(() => {
    if (!jobClientUidFilter) return '';
    const match = users.find((user) => String(user.uid || '') === String(jobClientUidFilter || ''));
    if (!match) return String(jobClientUidFilter).slice(0, 8);
    return match.displayName || match.emailMasked || match.email || String(match.uid).slice(0, 8);
  }, [jobClientUidFilter, users]);

  const goAttention = (key) => {
    const params = new URLSearchParams(locationSearch || '');
    params.set('tab', 'jobs');
    params.delete('q');
    setJobSearchTerm('');
    if (key === 'no_offer_6h') {
      params.set('status', JOB_STATUSES.OPEN);
      params.set('quick', 'no_offer_6h');
      setJobStatusFilter(JOB_STATUSES.OPEN);
      setJobQuickFilter('no_offer_6h');
    } else if (key === 'stale_open_24h') {
      params.set('status', JOB_STATUSES.OPEN);
      params.set('quick', 'stale_open_24h');
      setJobStatusFilter(JOB_STATUSES.OPEN);
      setJobQuickFilter('stale_open_24h');
    } else if (key === 'disputes_unreviewed') {
      params.set('status', JOB_STATUSES.DISPUTED);
      params.set('quick', 'disputes_unreviewed');
      setJobStatusFilter(JOB_STATUSES.DISPUTED);
      setJobQuickFilter('disputes_unreviewed');
    } else if (key === 'failed_payments') {
      params.set('status', 'all');
      params.set('quick', 'payment_issues');
      setJobStatusFilter('all');
      setJobQuickFilter('payment_issues');
    } else if (key === 'disputes_stale_24h') {
      params.set('status', JOB_STATUSES.DISPUTED);
      params.set('quick', 'disputes_stale_24h');
      setJobStatusFilter(JOB_STATUSES.DISPUTED);
      setJobQuickFilter('disputes_stale_24h');
    }
    navigate(`${basePath}?${params.toString()}`);
  };

  const goStaleProfileRequests = () => {
    navigate('/admin/profile-change-requests?status=pending&stale=1');
  };

  const goWorkflowQueue = ({ owner, sla, followup, wfPriority } = {}) => {
    const params = new URLSearchParams(locationSearch || '');
    params.set('tab', 'jobs');
    params.delete('owner');
    params.delete('sla');
    params.delete('followup');
    params.delete('wfPriority');
    if (owner) params.set('owner', owner);
    if (sla) params.set('sla', sla);
    if (followup) params.set('followup', followup);
    if (wfPriority) params.set('wfPriority', wfPriority);
    navigate(`${basePath}?${params.toString()}`);
  };

  return {
    clearJobClientFilter,
    jobClientLabel,
    goAttention,
    goStaleProfileRequests,
    goWorkflowQueue,
  };
}
