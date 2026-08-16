import React, { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuthState } from 'react-firebase-hooks/auth';
import { auth, db } from '../firebase';
import AppHeader from './AppHeader';
import adminApi from '../api/adminApi';
import { collection, doc, getDoc, getDocs, limit, query, serverTimestamp, setDoc, where } from 'firebase/firestore';
import { toMillis } from '../utils/adminOps';
import { PageLoadingShell } from './ui/AsyncPageStates';
import {
  PROFILE_REQUEST_STALE_HOURS,
  STALE_OPEN_HOURS,
  ageHoursFrom,
  getTaskCreatedAtMs,
  isDisputeUnreviewed,
  isOpenTask,
  isStaleOpen,
  needsAttentionNoOffer,
} from '../utils/adminOps';

function todayKey() {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

function fmtCount(n) {
  const x = Number(n || 0);
  return Number.isFinite(x) ? x : 0;
}

function pillStyle(kind) {
  if (kind === 'danger') return { bg: '#fff1f2', bd: '#fecdd3', fg: '#9f1239' };
  if (kind === 'warn') return { bg: '#fffbeb', bd: '#fde68a', fg: '#92400e' };
  if (kind === 'ok') return { bg: '#ecfdf5', bd: '#a7f3d0', fg: '#065f46' };
  return { bg: '#eff6ff', bd: '#bfdbfe', fg: '#1d4ed8' };
}

export default function AdminDailyChecklist() {
  const navigate = useNavigate();
  const [user, loading] = useAuthState(auth);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState('');

  const [jobs, setJobs] = useState([]);
  const [pendingProfileReqs, setPendingProfileReqs] = useState([]);
  const [supportTickets, setSupportTickets] = useState([]);
  const [opsSummary, setOpsSummary] = useState({
    loading: true,
    failedPayments: 0,
    disputesStale24h: 0,
  });
  const [workflowSummary, setWorkflowSummary] = useState({
    loading: true,
    overdue: 0,
    unassignedHighPriority: 0,
    followUpsDueToday: 0,
    overdueUnassigned: 0,
    assignedToMeOverdue: 0,
  });

  const [doneMap, setDoneMap] = useState({});
  const [savingDone, setSavingDone] = useState(false);

  const dayId = useMemo(() => todayKey(), []);

  useEffect(() => {
    if (!loading && !user) navigate('/login');
  }, [loading, user, navigate]);

  useEffect(() => {
    const run = async () => {
      if (!user) return;
      setBusy(true);
      setError('');
      try {
        // Jobs (admin API)
        const jobsRes = await adminApi.get('/api/admin/jobs');
        setJobs(Array.isArray(jobsRes.data) ? jobsRes.data : []);

        const opsRes = await adminApi.get('/api/admin/ops-summary');
        setOpsSummary({
          loading: false,
          failedPayments: Number(opsRes?.data?.failedPayments) || 0,
          disputesStale24h: Number(opsRes?.data?.disputesStale24h) || 0,
        });

        const wsRes = await adminApi.get('/api/admin/work-items/summary');
        setWorkflowSummary({
          loading: false,
          overdue: Number(wsRes?.data?.overdue) || 0,
          unassignedHighPriority: Number(wsRes?.data?.unassignedHighPriority) || 0,
          followUpsDueToday: Number(wsRes?.data?.followUpsDueToday) || 0,
          overdueUnassigned: Number(wsRes?.data?.overdueUnassigned) || 0,
          assignedToMeOverdue: Number(wsRes?.data?.assignedToMeOverdue) || 0,
        });

        // Profile change requests (pending)
        const reqRes = await adminApi.get('/api/admin/profile-change-requests?status=pending&limit=200');
        setPendingProfileReqs(Array.isArray(reqRes?.data?.items) ? reqRes.data.items : []);

        // Support tickets (Firestore)
        // Support tickets (Firestore)
        // Avoid composite index requirements by NOT ordering server-side.
        // We'll sort in-memory using updatedAt (best-effort).
        const qTickets = query(
          collection(db, 'supportTickets'),
          where('status', 'in', ['new', 'open', 'in_progress', 'waiting_on_user']),
          limit(200)
        );
        const tSnap = await getDocs(qTickets);
        const rows = tSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
        rows.sort((a, b) => (toMillis(b.updatedAt) - toMillis(a.updatedAt)));
        setSupportTickets(rows);

        // Done map for today
        const doneRef = doc(db, 'adminDailyChecklist', dayId);
        const doneSnap = await getDoc(doneRef);
        const data = doneSnap.exists() ? doneSnap.data() : {};
        setDoneMap((data && typeof data.doneItems === 'object' && data.doneItems) ? data.doneItems : {});
      } catch (e) {
        console.error('Daily checklist load failed:', e);
        setOpsSummary((p) => ({ ...p, loading: false }));
        setWorkflowSummary((p) => ({ ...p, loading: false }));
        setError(e?.response?.data?.message || e?.message || 'Failed to load daily checklist.');
      } finally {
        setBusy(false);
      }
    };
    run();
  }, [dayId, user]);

  const derived = useMemo(() => {
    const nowMs = Date.now();

    // Offers: best-effort. If we don't have an explicit count, treat as unknown and skip from MUST ACT NOW.
    const hasOfferByJobId = {};
    for (const j of jobs) {
      const count = (typeof j.offersCount === 'number') ? j.offersCount : (typeof j.quoteCount === 'number' ? j.quoteCount : null);
      if (count === null) continue;
      hasOfferByJobId[String(j.id || '')] = count > 0;
    }

    const noOffer6h = jobs.filter((j) => {
      const id = String(j.id || '');
      if (!(id in hasOfferByJobId)) return false; // unknown -> beta; don't count
      return needsAttentionNoOffer(j, { hasOffer: !!hasOfferByJobId[id], nowMs });
    });

    const staleOpen24h = jobs.filter((j) => isStaleOpen(j, { nowMs }));

    const disputesUnreviewed = jobs.filter((j) => isDisputeUnreviewed(j));

    const staleProfileReqs = pendingProfileReqs.filter((r) => {
      const ageH = ageHoursFrom(r?.createdAtMs);
      return typeof ageH === 'number' && ageH >= PROFILE_REQUEST_STALE_HOURS;
    });

    const highPrioritySupport = supportTickets.filter((t) => {
      const p = String(t?.priority || '').toUpperCase();
      return p === 'HIGH';
    });

    const trustCriticalProfiles = pendingProfileReqs.filter((r) => r.trustImpacting && String(r.status || '') === 'pending').length;

    const supportEscalations = supportTickets.filter((t) => {
      const e = String(t?.escalationStatus || 'normal').toLowerCase();
      return e === 'priority' || e === 'ops' || e === 'super_admin';
    }).length;

    // Tasks that are open but have no admin touch (best-effort).
    const noAdminTouch = jobs.filter((j) => {
      if (!isOpenTask(j)) return false;
      const createdAtMs = getTaskCreatedAtMs(j);
      if (!createdAtMs) return false;
      const touched = j.lastAdminActionAt || j.lastAdminActionAtMs || null;
      return !touched && (nowMs - createdAtMs) >= (6 * 60 * 60 * 1000);
    });

    return {
      noOffer6h,
      staleOpen24h,
      disputesUnreviewed,
      staleProfileReqs,
      highPrioritySupport,
      noAdminTouch,
      trustCriticalProfiles,
      supportEscalations,
      failedPaymentsOps: opsSummary.failedPayments,
      disputesStale24hOps: opsSummary.disputesStale24h,
    };
  }, [jobs, pendingProfileReqs, supportTickets, opsSummary.failedPayments, opsSummary.disputesStale24h]);

  const items = useMemo(() => {
    const make = ({ key, section, tone, title, meta, to, cta }) => ({
      key,
      section,
      tone,
      title,
      meta,
      to,
      cta,
    });

    const out = [];

    out.push(make({
      key: 'banner_goal',
      section: 'banner',
      tone: 'info',
      title: 'Today’s goal: Ensure every open task gets at least one offer.',
      meta: '',
      to: '/admin/dashboard',
      cta: 'Open dashboard',
    }));

    out.push(make({
      key: 'failed_payments_review',
      section: 'must',
      tone: derived.failedPaymentsOps > 0 ? 'danger' : 'ok',
      title: 'Failed / stuck payments to review',
      meta: `${fmtCount(derived.failedPaymentsOps)} tasks`,
      to: '/admin/dashboard?tab=jobs&quick=payment_issues',
      cta: 'Open queue',
    }));

    out.push(make({
      key: 'stale_disputes_24h',
      section: 'must',
      tone: derived.disputesStale24hOps > 0 ? 'danger' : 'ok',
      title: 'Stale disputes (>24h)',
      meta: `${fmtCount(derived.disputesStale24hOps)} tasks`,
      to: '/admin/dashboard?tab=jobs&quick=disputes_stale_24h',
      cta: 'Review disputes',
    }));

    out.push(make({
      key: 'trust_critical_profiles',
      section: 'must',
      tone: derived.trustCriticalProfiles > 0 ? 'warn' : 'ok',
      title: 'Trust-critical profile requests',
      meta: `${fmtCount(derived.trustCriticalProfiles)} pending`,
      to: '/admin/profile-change-requests?status=pending&trust=1',
      cta: 'Review requests',
    }));

    out.push(make({
      key: 'support_escalations_queue',
      section: 'must',
      tone: derived.supportEscalations > 0 ? 'danger' : 'ok',
      title: 'Support escalations awaiting action',
      meta: `${fmtCount(derived.supportEscalations)} tickets`,
      to: '/admin/support',
      cta: 'Open support',
    }));

    out.push(make({
      key: 'no_offer_6h',
      section: 'must',
      tone: derived.noOffer6h.length > 0 ? 'danger' : 'ok',
      title: 'Tasks with 0 offers (after 6h)',
      meta: `${fmtCount(derived.noOffer6h.length)} tasks`,
      to: '/admin/dashboard?tab=jobs&status=open&quick=no_offer_6h',
      cta: 'Review tasks',
    }));

    out.push(make({
      key: 'stale_open_24h',
      section: 'must',
      tone: derived.staleOpen24h.length > 0 ? 'warn' : 'ok',
      title: `Tasks open > ${STALE_OPEN_HOURS}h`,
      meta: `${fmtCount(derived.staleOpen24h.length)} tasks`,
      to: '/admin/dashboard?tab=jobs&status=open&quick=stale_open_24h',
      cta: 'Review tasks',
    }));

    out.push(make({
      key: 'disputes_unreviewed',
      section: 'must',
      tone: derived.disputesUnreviewed.length > 0 ? 'danger' : 'ok',
      title: 'Open disputes flagged / unreviewed',
      meta: `${fmtCount(derived.disputesUnreviewed.length)} tasks`,
      to: '/admin/monitoring',
      cta: 'Open monitoring',
    }));

    out.push(make({
      key: 'profile_requests_stale',
      section: 'must',
      tone: derived.staleProfileReqs.length > 0 ? 'warn' : 'ok',
      title: `Pending profile change requests > ${PROFILE_REQUEST_STALE_HOURS}h`,
      meta: `${fmtCount(derived.staleProfileReqs.length)} requests`,
      to: '/admin/profile-change-requests?status=pending&stale=1',
      cta: 'Review requests',
    }));

    out.push(make({
      key: 'support_high',
      section: 'follow',
      tone: derived.highPrioritySupport.length > 0 ? 'warn' : 'ok',
      title: 'High priority support tickets',
      meta: `${fmtCount(derived.highPrioritySupport.length)} tickets`,
      to: '/admin/support',
      cta: 'Open support',
    }));

    out.push(make({
      key: 'no_admin_touch_6h',
      section: 'follow',
      tone: derived.noAdminTouch.length > 0 ? 'info' : 'ok',
      title: 'Open tasks with no admin touch (6h+)',
      meta: `${fmtCount(derived.noAdminTouch.length)} tasks`,
      to: '/admin/dashboard?tab=jobs&status=open',
      cta: 'Open tasks',
    }));

    out.push(make({
      key: 'workflow_overdue_items',
      section: 'follow',
      tone: workflowSummary.overdue > 0 ? 'danger' : 'ok',
      title: 'Overdue admin work items (SLA)',
      meta: `${fmtCount(workflowSummary.overdue)} items`,
      to: '/admin/dashboard?tab=jobs&sla=overdue',
      cta: 'Open queue',
    }));

    out.push(make({
      key: 'workflow_overdue_unassigned',
      section: 'must',
      tone: workflowSummary.overdueUnassigned > 0 ? 'danger' : 'ok',
      title: 'Overdue work items with no owner',
      meta: `${fmtCount(workflowSummary.overdueUnassigned)} items`,
      to: '/admin/dashboard?tab=jobs&owner=unassigned&sla=overdue',
      cta: 'Triage',
    }));

    out.push(make({
      key: 'workflow_my_overdue',
      section: 'must',
      tone: workflowSummary.assignedToMeOverdue > 0 ? 'danger' : 'ok',
      title: 'Assigned to you — overdue',
      meta: `${fmtCount(workflowSummary.assignedToMeOverdue)} items`,
      to: '/admin/dashboard?tab=jobs&owner=me&sla=overdue',
      cta: 'Work queue',
    }));

    out.push(make({
      key: 'workflow_unassigned_critical',
      section: 'follow',
      tone: workflowSummary.unassignedHighPriority > 0 ? 'warn' : 'ok',
      title: 'Unassigned high-priority work items',
      meta: `${fmtCount(workflowSummary.unassignedHighPriority)} items`,
      to: '/admin/dashboard?tab=jobs&owner=unassigned&wfPriority=high',
      cta: 'Assign from queue',
    }));

    out.push(make({
      key: 'workflow_followups_today',
      section: 'follow',
      tone: workflowSummary.followUpsDueToday > 0 ? 'warn' : 'ok',
      title: 'Follow-ups due today (assigned to you)',
      meta: `${fmtCount(workflowSummary.followUpsDueToday)} reminders`,
      to: '/admin/dashboard?tab=jobs&owner=me&followup=due',
      cta: 'Review queue',
    }));

    return out;
  }, [derived, workflowSummary]);

  const mustActNow = items.filter((i) => i.section === 'must');
  const needsFollowUp = items.filter((i) => i.section === 'follow');
  const doneToday = items.filter((i) => i.section !== 'banner' && doneMap?.[i.key]);

  const markDone = async (key) => {
    if (!user || !key) return;
    if (savingDone) return;
    setSavingDone(true);
    setError('');
    try {
      const ref = doc(db, 'adminDailyChecklist', dayId);
      await setDoc(ref, {
        date: dayId,
        updatedAt: serverTimestamp(),
        updatedBy: user.uid,
        doneItems: {
          ...(doneMap || {}),
          [key]: { doneAt: new Date().toISOString(), doneBy: user.uid },
        },
      }, { merge: true });
      setDoneMap((p) => ({ ...(p || {}), [key]: { doneAt: new Date().toISOString(), doneBy: user.uid } }));
    } catch (e) {
      console.error('Mark done failed:', e);
      setError(e?.message || 'Failed to mark done.');
    } finally {
      setSavingDone(false);
    }
  };

  if (loading) return <PageLoadingShell message="Loading daily checklist…" detail="Getting the current operations summary." />;

  return (
    <div style={{ minHeight: '100vh', background: '#F7F9FA' }}>
      <AppHeader userRole="admin" userName={user?.displayName || ''} userEmail={user?.email || ''} />

      <div style={{ maxWidth: 1400, margin: '0 auto', padding: '40px 24px', fontFamily: 'Inter, sans-serif' }}>
        <div style={styles.headerRow}>
          <div>
            <h1 style={styles.title}>Daily admin checklist</h1>
            <div style={styles.subTitle}>Quick triage so nothing important slips.</div>
            <div style={{ marginTop: 10, fontSize: 12, color: '#6B7280' }}>Date: <strong>{dayId}</strong></div>
          </div>
          <Link to="/admin/dashboard" style={styles.backLink}>← Back</Link>
        </div>

        {error ? <div style={styles.error}>{error}</div> : null}

        {/* Banner */}
        <div style={{ ...styles.banner, ...styles.card }}>
          <div style={{ fontWeight: 900, fontSize: 14 }}>{items.find((i) => i.key === 'banner_goal')?.title}</div>
          <div style={{ marginTop: 10 }}>
            <Link to="/admin/dashboard" style={styles.primaryBtn}>Open dashboard</Link>
          </div>
        </div>

        {busy ? (
          <div style={styles.centered}>Loading checklist…</div>
        ) : (
          <div style={styles.grid}>
            <div style={styles.col}>
              <div style={styles.sectionTitle}>MUST ACT NOW</div>
              {mustActNow.map((it) => (
                <div key={it.key} style={styles.card}>
                  <div style={styles.cardTop}>
                    <div style={{ fontWeight: 900 }}>{it.title}</div>
                    <span style={{ ...styles.pill, ...(() => {
                      const s = pillStyle(it.tone);
                      return { background: s.bg, borderColor: s.bd, color: s.fg };
                    })() }}>
                      {it.meta}
                    </span>
                  </div>
                  <div style={styles.cardActions}>
                    <Link to={it.to} style={styles.linkBtn}>{it.cta}</Link>
                    <button type="button" style={styles.btn} disabled={savingDone || !!doneMap?.[it.key]} onClick={() => markDone(it.key)}>
                      {!!doneMap?.[it.key] ? 'Done' : 'Mark done'}
                    </button>
                  </div>
                </div>
              ))}
            </div>

            <div style={styles.col}>
              <div style={styles.sectionTitle}>NEEDS FOLLOW‑UP</div>
              {needsFollowUp.map((it) => (
                <div key={it.key} style={styles.card}>
                  <div style={styles.cardTop}>
                    <div style={{ fontWeight: 900 }}>{it.title}</div>
                    <span style={{ ...styles.pill, ...(() => {
                      const s = pillStyle(it.tone);
                      return { background: s.bg, borderColor: s.bd, color: s.fg };
                    })() }}>
                      {it.meta}
                    </span>
                  </div>
                  <div style={styles.cardActions}>
                    <Link to={it.to} style={styles.linkBtn}>{it.cta}</Link>
                    <button type="button" style={styles.btn} disabled={savingDone || !!doneMap?.[it.key]} onClick={() => markDone(it.key)}>
                      {!!doneMap?.[it.key] ? 'Done' : 'Mark done'}
                    </button>
                  </div>
                </div>
              ))}
            </div>

            <div style={styles.col}>
              <div style={styles.sectionTitle}>DONE TODAY</div>
              {doneToday.length === 0 ? (
                <div style={{ ...styles.card, color: '#666' }}>Nothing marked done yet.</div>
              ) : (
                doneToday.map((it) => (
                  <div key={it.key} style={styles.card}>
                    <div style={styles.cardTop}>
                      <div style={{ fontWeight: 900 }}>{it.title}</div>
                      <span style={{ ...styles.pill, background: '#F3F4F6', borderColor: '#E5E7EB', color: '#111' }}>
                        Done
                      </span>
                    </div>
                    <div style={{ marginTop: 10, fontSize: 12, color: '#6B7280' }}>
                      Done by: <span style={{ fontFamily: 'monospace' }}>{String(doneMap?.[it.key]?.doneBy || '—').slice(0, 12)}</span>
                    </div>
                    <div style={styles.cardActions}>
                      <Link to={it.to} style={styles.linkBtn}>Open</Link>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

const styles = {
  centered: { padding: 50, textAlign: 'center', color: '#555' },
  headerRow: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, marginBottom: 16 },
  title: { fontFamily: 'Poppins, sans-serif', fontSize: 28, margin: 0, color: '#111' },
  subTitle: { fontSize: 14, color: '#666', marginTop: 6 },
  backLink: { color: '#14C5C5', textDecoration: 'none', fontWeight: 900, paddingTop: 6 },
  error: { background: '#fff1f2', border: '1px solid #fecdd3', color: '#9f1239', padding: '10px 12px', borderRadius: 10, fontSize: 13, marginBottom: 12 },
  banner: { marginBottom: 16, borderLeft: '6px solid #14C5C5' },
  grid: { display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 14 },
  col: { display: 'grid', gap: 10, alignContent: 'start' },
  sectionTitle: { fontSize: 12, fontWeight: 900, color: '#374151', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 2 },
  card: { background: '#fff', border: '1px solid #E5E7EB', borderRadius: 12, padding: 14 },
  cardTop: { display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'flex-start' },
  pill: { display: 'inline-flex', alignItems: 'center', padding: '4px 10px', borderRadius: 999, border: '1px solid #E5E7EB', fontWeight: 900, fontSize: 12, whiteSpace: 'nowrap' },
  cardActions: { display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 12, flexWrap: 'wrap' },
  linkBtn: { height: 36, display: 'inline-flex', alignItems: 'center', borderRadius: 10, border: '1px solid #d1d5db', background: '#fff', padding: '0 12px', fontWeight: 900, color: '#374151', textDecoration: 'none', fontSize: 13 },
  btn: { height: 36, borderRadius: 10, border: 'none', background: '#111827', padding: '0 12px', fontWeight: 900, cursor: 'pointer', color: '#fff', fontSize: 13 },
  primaryBtn: { height: 40, display: 'inline-flex', alignItems: 'center', borderRadius: 10, border: 'none', background: '#FF9100', padding: '0 14px', fontWeight: 900, cursor: 'pointer', color: '#fff', fontSize: 13, textDecoration: 'none' },
};
