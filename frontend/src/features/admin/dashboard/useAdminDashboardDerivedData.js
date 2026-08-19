import { useMemo } from 'react';
import { JOB_STATUSES, normalizeStatus } from '../../../constants/jobStatuses';
import { getTaskReferenceCode } from '../../../utils/taskReference';
import { sortTradies } from '../../../utils/adminDashboardUtils';
import { requiresAbn } from '../../../utils/profileCompliance';
import {
  hasAdminPaymentIssue,
  isDisputeStale24h,
  isDisputeUnreviewed,
  isStaleOpen,
  needsAttentionNoOffer,
} from '../../../utils/adminOps';
import { compareJobsForQueueSort } from '../utils/adminJobQueueSort';
import { fullTaskDisplayTitle } from '../../../utils/jobDisplayFromJob';

export default function useAdminDashboardDerivedData({
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
}) {
  const tradies = useMemo(() => users.filter((u) => u.role === 'tradie'), [users]);
  const homeowners = useMemo(() => users.filter((u) => u.role === 'homeowner'), [users]);

  const sortedJobs = useMemo(() => {
    const order = sortOrder === 'oldest' ? 'oldest' : 'newest';
    return [...jobs].sort((a, b) => compareJobsForQueueSort(a, b, order, quoteMeta));
  }, [jobs, sortOrder, quoteMeta]);

  const filteredJobs = useMemo(() => {
    let result = sortedJobs;

    if (jobStatusFilter !== 'all') {
      result = result.filter((job) => normalizeStatus(job.status) === normalizeStatus(jobStatusFilter));
    }

    if (jobQuickFilter) {
      const nowMs = Date.now();
      const hasAny = quoteMeta?.hasAnyByJobId || {};
      const known = new Set(Array.isArray(quoteMeta?.knownJobIds) ? quoteMeta.knownJobIds : []);
      if (jobQuickFilter === 'no_offer_6h') {
        result = result.filter((job) => {
          const id = String(job?.id || '');
          const hasOffer = known.has(id) ? (hasAny[id] === true) : true;
          return needsAttentionNoOffer(job, hasOffer, nowMs);
        });
      } else if (jobQuickFilter === 'stale_open_24h') {
        result = result.filter((job) => isStaleOpen(job, nowMs));
      } else if (jobQuickFilter === 'disputes_unreviewed') {
        result = result.filter((job) => isDisputeUnreviewed(job));
      } else if (jobQuickFilter === 'flagged') {
        result = result.filter((job) => (Number(job?.flaggedChatCount || 0) > 0) || job?.disputeFlag === true);
      } else if (jobQuickFilter === 'payment_issues') {
        result = result.filter((job) => hasAdminPaymentIssue(job));
      } else if (jobQuickFilter === 'disputes_stale_24h') {
        result = result.filter((job) => isDisputeStale24h(job, nowMs));
      }
    }

    if (jobSearchTerm) {
      const searchLower = jobSearchTerm.toLowerCase().trim();
      const refNeedle = jobSearchTerm.toUpperCase().replace(/\s/g, '');
      result = result.filter((job) => {
        if (String(job.id || '').toLowerCase().includes(searchLower)) return true;
        if ((job.title || '').toLowerCase().includes(searchLower)) return true;
        if ((fullTaskDisplayTitle(job) || '').toLowerCase().includes(searchLower)) return true;
        if ((job.description || '').toLowerCase().includes(searchLower)) return true;
        if ((job.status || '').toLowerCase().includes(searchLower)) return true;
        if (refNeedle && refNeedle.includes('TSK')) {
          const code = getTaskReferenceCode(String(job.id || '')).toUpperCase();
          if (code === refNeedle || code.includes(refNeedle)) return true;
          const rawNum = job.taskNumber ?? job.referenceNumber;
          if (rawNum != null && String(rawNum).trim() !== '') {
            const n = Number(rawNum);
            if (Number.isFinite(n) && n >= 0) {
              const padded = `TSK-${String(Math.min(Math.floor(Math.abs(n)), 999999)).padStart(4, '0')}`.toUpperCase();
              if (padded === refNeedle) return true;
            }
          }
        }
        return false;
      });
    }

    if (jobClientUidFilter) {
      const uid = String(jobClientUidFilter || '').trim();
      result = result.filter((job) => String(job.homeownerUid || '') === uid);
    }

    return result;
  }, [sortedJobs, jobStatusFilter, jobQuickFilter, jobSearchTerm, jobClientUidFilter, quoteMeta]);

  const countsByClientUid = useMemo(() => {
    const out = {};
    for (const job of jobs) {
      const uid = String(job.homeownerUid || '');
      if (!uid) continue;
      out[uid] = out[uid] || { posted: 0, completed: 0 };
      out[uid].posted += 1;
      const status = normalizeStatus(job.status);
      if (status === JOB_STATUSES.COMPLETED || status === JOB_STATUSES.PAID) out[uid].completed += 1;
    }
    return out;
  }, [jobs]);

  const filteredTradies = useMemo(() => {
    let result = expertiseFilter === 'all'
      ? tradies
      : tradies.filter((tradie) => Array.isArray(tradie.expertiseApproved) && tradie.expertiseApproved.includes(expertiseFilter));

    if (tradieSearchTerm) {
      const searchLower = tradieSearchTerm.toLowerCase();
      result = result.filter((tradie) =>
        (tradie.email || '').toLowerCase().includes(searchLower)
        || (tradie.firstName || '').toLowerCase().includes(searchLower)
        || (tradie.lastName || '').toLowerCase().includes(searchLower)
      );
    }

    if (tradieQuickFilter) {
      const now = Date.now();
      if (tradieQuickFilter === 'ready_now') {
        result = result.filter((tradie) =>
          tradie.status === 'active'
          && tradie.verified === true
          && tradie.phoneVerified === true
          && (tradie.abnVerified === true || !requiresAbn(tradie.businessType, tradie.businessName))
          && tradie.stripeOnboardingComplete === true
          && tradie.profileCompleted === true
        );
      } else if (tradieQuickFilter === 'verified_stripe') {
        result = result.filter((tradie) => tradie.verified === true && tradie.stripeOnboardingComplete === true);
      } else if (tradieQuickFilter === 'active_7d') {
        result = result.filter((tradie) => {
          const ms = Number(tradie.updatedAtMs || 0) || 0;
          return ms ? (now - ms) <= (7 * 24 * 60 * 60 * 1000) : false;
        });
      } else if (tradieQuickFilter === 'boosted') {
        result = result.filter((tradie) => (tradie?.boost?.isBoosted === true) || tradie.boostedVisibility === true);
      }
    }

    return [...result].sort(sortTradies);
  }, [tradies, expertiseFilter, tradieSearchTerm, tradieQuickFilter]);

  const filteredHomeowners = useMemo(() => {
    let result = homeowners;

    if (homeownerSearchTerm) {
      const searchLower = homeownerSearchTerm.toLowerCase();
      result = result.filter((homeowner) =>
        (homeowner.email || '').toLowerCase().includes(searchLower)
        || (homeowner.firstName || '').toLowerCase().includes(searchLower)
        || (homeowner.lastName || '').toLowerCase().includes(searchLower)
      );
    }

    if (homeownerQuickFilter) {
      const now = Date.now();
      if (homeownerQuickFilter === 'new') {
        result = result.filter((user) => (countsByClientUid[user.uid]?.posted || 0) <= 1);
      } else if (homeownerQuickFilter === 'repeat') {
        result = result.filter((user) => (countsByClientUid[user.uid]?.posted || 0) >= 2);
      } else if (homeownerQuickFilter === 'inactive') {
        result = result.filter((user) => {
          const ms = Number(user.updatedAtMs || 0) || 0;
          return ms ? (now - ms) >= (30 * 24 * 60 * 60 * 1000) : false;
        });
      }
    }

    return result;
  }, [homeowners, homeownerSearchTerm, homeownerQuickFilter, countsByClientUid]);

  const stats = useMemo(() => {
    const openJobs = jobs.filter((job) => normalizeStatus(job.status) === JOB_STATUSES.OPEN).length;
    const assignedJobs = jobs.filter((job) => normalizeStatus(job.status) === JOB_STATUSES.ASSIGNED).length;
    const verifiedTradies = tradies.filter((tradie) => tradie.verified).length;
    const activeTradies = tradies.filter((tradie) => tradie.status === 'active').length;

    return {
      totalJobs: jobs.length,
      openJobs,
      assignedJobs,
      totalTradies: tradies.length,
      verifiedTradies,
      activeTradies,
      totalHomeowners: homeowners.length,
    };
  }, [jobs, tradies, homeowners]);

  return {
    tradies,
    homeowners,
    sortedJobs,
    filteredJobs,
    filteredTradies,
    filteredHomeowners,
    countsByClientUid,
    stats,
  };
}
