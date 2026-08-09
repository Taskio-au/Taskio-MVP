import { useEffect, useState } from 'react';
import { collection, getDocs, limit as fsLimit, query as fsQuery, where } from 'firebase/firestore';
import { db } from '../../../firebase';
import {
  SEVEN_DAYS_MS,
  getTaskCompletedAtMs,
  getTaskCreatedAtMs,
  isDisputeUnreviewed,
  isDisputedTask,
  isOpenTask,
  isStaleOpen,
  needsAttentionNoOffer,
  toMillis,
} from '../../../utils/adminOps';

const PROFILE_REQUEST_STALE_HOURS = 48;

export default function useAdminDashboardMetrics(jobs, fetchQuoteMetaForJobIds) {
  const [quoteMeta, setQuoteMeta] = useState({
    loading: false,
    knownJobIds: [],
    hasAnyByJobId: {},
    firstAtMsByJobId: {},
  });

  const [attention, setAttention] = useState({
    loading: true,
    noOffer6h: 0,
    staleOpen24h: 0,
    disputesUnreviewed: 0,
    profileRequests48h: 0,
  });

  const [opsKpis, setOpsKpis] = useState({
    loading: true,
    avgFirstOfferHours7d: null,
    completed7d: 0,
    adminInterventionPct7d: null,
  });

  useEffect(() => {
    let alive = true;

    const run = async () => {
      try {
        const nowMs = Date.now();

        setQuoteMeta((prev) => ({ ...prev, loading: true }));
        setAttention((prev) => ({ ...prev, loading: true }));
        setOpsKpis((prev) => ({ ...prev, loading: true }));

        const openTasks = jobs.filter((job) => isOpenTask(job));
        const openIds = openTasks.map((job) => String(job.id || '')).filter(Boolean);
        const qm = await fetchQuoteMetaForJobIds(openIds.slice(0, 500));

        let staleProfileCount = 0;
        try {
          const reqSnap = await getDocs(
            fsQuery(collection(db, 'profile_change_requests'), where('status', '==', 'pending'), fsLimit(500))
          );
          reqSnap.forEach((docSnap) => {
            const data = docSnap.data() || {};
            const createdMs = toMillis(data.createdAt) || Number(data.createdAtMs || 0) || 0;
            if (createdMs && (nowMs - createdMs) / (1000 * 60 * 60) >= PROFILE_REQUEST_STALE_HOURS) {
              staleProfileCount += 1;
            }
          });
        } catch (_) {
          staleProfileCount = 0;
        }

        const known = new Set(Array.isArray(qm.knownJobIds) ? qm.knownJobIds : []);
        const noOffer6h = openTasks.filter((job) => {
          const id = String(job?.id || '');
          const hasOffer = known.has(id) ? (qm.hasAnyByJobId[id] === true) : true;
          return needsAttentionNoOffer(job, hasOffer, nowMs);
        }).length;
        const staleOpen24h = openTasks.filter((job) => isStaleOpen(job, nowMs)).length;
        const disputesUnreviewed = jobs.filter((job) => isDisputeUnreviewed(job)).length;

        const sinceMs = nowMs - SEVEN_DAYS_MS;
        const last7d = jobs.filter((job) => getTaskCreatedAtMs(job) >= sinceMs);
        const completed7d = jobs.filter((job) => {
          const status = String(job.status || '').toLowerCase();
          if (!['completed', 'paid'].includes(status)) return false;
          return getTaskCompletedAtMs(job) >= sinceMs;
        }).length;

        const interventionCount = last7d.filter((job) => job?.requiresAdminAttention === true || isDisputedTask(job)).length;
        const adminInterventionPct7d = last7d.length > 0
          ? Math.round((interventionCount / last7d.length) * 100)
          : null;

        const last7dIds = last7d.slice(0, 100).map((job) => String(job.id || '')).filter(Boolean);
        const qm7 = await fetchQuoteMetaForJobIds(last7dIds);

        const deltas = [];
        for (const job of last7d) {
          const jobId = String(job.id || '');
          const firstAt = qm7.firstAtMsByJobId[jobId];
          const createdAt = getTaskCreatedAtMs(job);
          if (firstAt && createdAt && firstAt >= createdAt) {
            deltas.push((firstAt - createdAt) / (1000 * 60 * 60));
          }
        }

        const avgFirstOfferHours7d = deltas.length > 0
          ? Math.round((deltas.reduce((sum, delta) => sum + delta, 0) / deltas.length) * 10) / 10
          : null;

        if (!alive) return;

        setQuoteMeta({ loading: false, ...qm });
        setAttention({
          loading: false,
          noOffer6h,
          staleOpen24h,
          disputesUnreviewed,
          profileRequests48h: staleProfileCount,
        });
        setOpsKpis({
          loading: false,
          avgFirstOfferHours7d,
          completed7d,
          adminInterventionPct7d,
        });
      } catch (_) {
        if (!alive) return;
        setQuoteMeta((prev) => ({ ...prev, loading: false }));
        setAttention((prev) => ({ ...prev, loading: false }));
        setOpsKpis((prev) => ({ ...prev, loading: false }));
      }
    };

    if (jobs && jobs.length) run();
    return () => {
      alive = false;
    };
  }, [jobs, fetchQuoteMetaForJobIds]);

  return { quoteMeta, attention, opsKpis };
}
