import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ShieldCheck } from 'lucide-react';
import { auth, db } from './firebase';
import AppHeader from './components/AppHeader';
import { InlineLoadingCard } from './components/ui/AsyncPageStates';
import adminApi from './api/adminApi';
import {
  addDoc,
  collection,
  limit,
  onSnapshot,
  query,
  serverTimestamp,
  updateDoc,
  where,
  doc,
} from 'firebase/firestore';
import { toMillis } from './utils/adminOps';

function fmt(ts) {
  if (!ts) return '—';
  if (ts?.seconds) return new Date(ts.seconds * 1000).toLocaleString('en-AU');
  if (ts?._seconds) return new Date(ts._seconds * 1000).toLocaleString('en-AU');
  return '—';
}

function severityStyle(sev) {
  const s = String(sev || '').toUpperCase();
  if (s === 'HIGH') return { bg: '#fff1f2', bd: '#fecdd3', fg: '#9f1239' };
  if (s === 'MED') return { bg: '#fffbeb', bd: '#fde68a', fg: '#92400e' };
  return { bg: '#eff6ff', bd: '#bfdbfe', fg: '#1d4ed8' };
}

function labelForFlagType(t) {
  const s = String(t || '').trim();
  if (!s) return '';
  return s.replace(/_/g, ' ');
}

function latestFlag(job) {
  const flags = Array.isArray(job?.chatFlags) ? job.chatFlags : [];
  let best = null;
  let bestMs = 0;
  for (const f of flags) {
    const ms = toMillis(f?.at) || 0;
    if (!best || ms > bestMs) {
      best = f;
      bestMs = ms;
    }
  }
  return best ? { ...best, atMs: bestMs } : null;
}

function workflowCell(jobId, workByJobId, currentUid) {
  const items = workByJobId[jobId] || [];
  if (!items.length) return '—';
  const w = items.find((x) => x.slaState === 'overdue') || items[0];
  const owner = w.assignedTo
    ? (currentUid && w.assignedTo === currentUid ? 'You' : (w.assignedToName || 'Assigned'))
    : 'Unassigned';
  const sla = w.slaState === 'overdue' ? 'Overdue' : w.slaState === 'due_soon' ? 'Due soon' : '';
  return (
    <div style={{ fontSize: 11, lineHeight: 1.4 }}>
      <div style={{ fontWeight: 800 }}>{owner}</div>
      {sla ? <div style={{ color: sla === 'Overdue' ? '#b91c1c' : '#92400e', fontWeight: 800 }}>{sla}</div> : null}
    </div>
  );
}

export default function AdminMonitoring() {
  const [claimsOk, setClaimsOk] = useState(false);
  const [claimsLoading, setClaimsLoading] = useState(true);
  const [jobs, setJobs] = useState([]);
  const [workByJobId, setWorkByJobId] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busyJobId, setBusyJobId] = useState(null);
  const [noteText, setNoteText] = useState('');
  const [noteJobId, setNoteJobId] = useState(null);
  const [freezeModal, setFreezeModal] = useState({
    open: false,
    jobId: '',
    reason: 'Off-platform contact/payment detected',
  });

  useEffect(() => {
    const run = async () => {
      setClaimsLoading(true);
      try {
        const u = auth.currentUser;
        if (!u) {
          setClaimsOk(false);
          return;
        }
        const tok = await u.getIdTokenResult(true);
        const ok = tok?.claims?.admin === true || tok?.claims?.role === 'admin';
        setClaimsOk(!!ok);
      } catch (e) {
        setClaimsOk(false);
      } finally {
        setClaimsLoading(false);
      }
    };
    run();
  }, []);

  useEffect(() => {
    if (!claimsOk) return undefined;
    setLoading(true);
    setError('');

    // Equality filter only -> no composite index required.
    const q = query(collection(db, 'jobs'), where('requiresAdminAttention', '==', true), limit(100));
    const unsub = onSnapshot(
      q,
      (snap) => {
        setJobs(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
        setLoading(false);
      },
      (e) => {
        console.error('Monitoring query failed:', e);
        setError('Failed to load monitoring jobs.');
        setLoading(false);
      }
    );
    return () => unsub();
  }, [claimsOk]);

  const sortedJobs = useMemo(() => {
    return [...jobs].sort((a, b) => {
      const aMs = a.lastMessageAt?.seconds ? a.lastMessageAt.seconds * 1000 : 0;
      const bMs = b.lastMessageAt?.seconds ? b.lastMessageAt.seconds * 1000 : 0;
      return bMs - aMs;
    });
  }, [jobs]);

  useEffect(() => {
    if (!claimsOk || !sortedJobs.length) return undefined;
    const ids = sortedJobs.map((j) => j.id).filter(Boolean).slice(0, 40).join(',');
    let alive = true;
    adminApi.get(`/api/admin/work-items/batch-jobs?ids=${encodeURIComponent(ids)}`)
      .then((r) => {
        if (alive) setWorkByJobId(r.data?.byJobId || {});
      })
      .catch(() => {
        if (alive) setWorkByJobId({});
      });
    return () => { alive = false; };
  }, [claimsOk, sortedJobs]);

  const markReviewed = async (jobId) => {
    setError('');
    const u = auth.currentUser;
    if (!u) return;
    setBusyJobId(jobId);
    try {
      await adminApi.post(`/api/admin/jobs/${jobId}/monitoring/review`, {});
    } catch (e) {
      console.error('Mark reviewed failed:', e);
      setError(e?.message || 'Failed to mark reviewed.');
    } finally {
      setBusyJobId(null);
    }
  };

  const openFreezeModal = (jobId) => {
    setError('');
    setFreezeModal({
      open: true,
      jobId: String(jobId || ''),
      reason: 'Off-platform contact/payment detected',
    });
  };

  const closeFreezeModal = () => {
    if (busyJobId) return;
    setFreezeModal({
      open: false,
      jobId: '',
      reason: 'Off-platform contact/payment detected',
    });
  };

  const confirmFreezeChat = async () => {
    const jobId = String(freezeModal.jobId || '').trim();
    if (!jobId) return;

    setError('');
    const u = auth.currentUser;
    if (!u) return;
    setBusyJobId(jobId);
    try {
      const txt = String(freezeModal.reason || '').trim();
      if (!txt) {
        setError('Please provide a reason to freeze chat.');
        return;
      }
      await adminApi.post(`/api/admin/jobs/${jobId}/chat/freeze`, { frozen: true, reason: txt });
      closeFreezeModal();
    } catch (e) {
      console.error('Freeze chat failed:', e);
      setError(e?.message || 'Failed to freeze chat.');
    } finally {
      setBusyJobId(null);
    }
  };

  const addNote = async () => {
    setError('');
    const u = auth.currentUser;
    if (!u || !noteJobId) return;
    const txt = noteText.trim();
    if (!txt) return setError('Write a note first.');
    setBusyJobId(noteJobId);
    try {
      await addDoc(collection(db, 'jobs', noteJobId, 'adminNotes'), {
        createdByUid: u.uid,
        createdAt: serverTimestamp(),
        text: txt,
      });
      await updateDoc(doc(db, 'jobs', noteJobId), {
        lastAdminActionAt: serverTimestamp(),
        lastAdminActionBy: u.uid,
      });
      setNoteText('');
      setNoteJobId(null);
    } catch (e) {
      console.error('Add note failed:', e);
      setError(e?.message || 'Failed to add note.');
    } finally {
      setBusyJobId(null);
    }
  };

  if (claimsLoading) {
    return <div style={styles.centered}>Checking admin access…</div>;
  }

  if (!claimsOk) {
    return (
      <>
        <AppHeader userRole="admin" userName={auth.currentUser?.displayName || ''} userEmail={auth.currentUser?.email || ''} />
        <div style={styles.centered}>
          <div style={{ maxWidth: 520 }}>
            <div style={{ fontWeight: 900, fontSize: 18, marginBottom: 6 }}>Access denied</div>
            <div style={{ color: '#666' }}>This area is for admin accounts only.</div>
          </div>
        </div>
      </>
    );
  }

  const currentUser = auth.currentUser;
  const currentUid = currentUser?.uid;

  return (
    <div style={{ fontFamily: 'Inter, sans-serif', minHeight: '100vh', background: '#F7F9FA' }}>
      <AppHeader userRole="admin" userName={currentUser?.displayName || ''} userEmail={currentUser?.email || ''} />

      <div style={{ maxWidth: 1400, margin: '0 auto', padding: '40px 24px' }}>
        {error && <div style={styles.error}>{error}</div>}
        <div style={styles.headerBlock}>
          <div>
            <div style={styles.eyebrow}>Monitoring</div>
            <h1 style={styles.title}>Flagged task queue</h1>
            <p style={styles.subTitle}>
              High-attention items only (tasks already flagged for admin). Use the dashboard task queue for routine triage — this page is not a mirror of the full queue.
            </p>
          </div>
          <Link to="/admin/dashboard" style={styles.backLink}>Back to full task queue</Link>
        </div>

        {loading ? (
          <InlineLoadingCard message="Loading monitoring queue…" detail="Getting flagged tasks and risk signals." />
        ) : sortedJobs.length === 0 ? (
          <div style={styles.empty}>
            <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 10 }}>
              <ShieldCheck size={42} strokeWidth={1.9} color="#14C5C5" />
            </div>
            <div style={{ fontWeight: 900, fontSize: 16, marginBottom: 6 }}>No flagged tasks</div>
            <div style={{ color: '#666' }}>When messages are flagged, they’ll appear here.</div>
          </div>
        ) : (
          <div style={styles.tableWrap}>
            <div style={styles.tableHead}>
              <div style={{ ...styles.th, flex: 2 }}>Task</div>
              <div style={{ ...styles.th, width: 100 }}>Owner / SLA</div>
              <div style={{ ...styles.th, width: 120 }}>Severity</div>
              <div style={{ ...styles.th, flex: 1 }}>Reasons</div>
              <div style={{ ...styles.th, width: 120 }}>Flag count</div>
              <div style={{ ...styles.th, width: 160 }}>Last flagged</div>
              <div style={{ ...styles.th, width: 360 }}>Actions</div>
            </div>

            {sortedJobs.map((j) => (
              <div key={j.id} style={styles.tr}>
                <div style={{ ...styles.td, flex: 2 }}>
                  <div style={{ fontWeight: 900 }}>{j.title || j.id}</div>
                  <div style={{ fontSize: 12, color: '#666' }}>ID: {j.id}</div>
                  <div style={{ fontSize: 12, color: '#666' }}>
                    Client: <span style={{ fontFamily: 'monospace' }}>{j.homeownerUid || '—'}</span>
                  </div>
                  <div style={{ fontSize: 12, color: '#666' }}>
                    Expert: <span style={{ fontFamily: 'monospace' }}>{j.acceptedTradieUid || '—'}</span>
                  </div>
                </div>

                <div style={{ ...styles.td, width: 100 }}>
                  {workflowCell(j.id, workByJobId, currentUid)}
                </div>

                <div style={{ ...styles.td, width: 120 }}>
                  <div
                    style={{
                      ...styles.pill,
                      background: severityStyle(j.highestFlagSeverity).bg,
                      borderColor: severityStyle(j.highestFlagSeverity).bd,
                      color: severityStyle(j.highestFlagSeverity).fg,
                    }}
                  >
                    {(j.highestFlagSeverity || 'LOW').toString().toUpperCase()}
                  </div>
                  {j.chatFrozen === true && (
                    <div style={{ ...styles.pill, marginTop: 8, background: '#fff1f2', borderColor: '#fecdd3', color: '#9f1239' }}>
                      Chat frozen
                    </div>
                  )}
                </div>

                <div style={{ ...styles.td, flex: 1 }}>
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    {(Array.isArray(j.flagTypes) ? j.flagTypes : [])
                      .slice(0, 6)
                      .map((t) => (
                        <span key={`${j.id}-ft-${t}`} style={styles.chip}>
                          {labelForFlagType(t)}
                        </span>
                      ))}
                    {Array.isArray(j.flagTypes) && j.flagTypes.length > 6 ? (
                      <span style={{ fontSize: 11, fontWeight: 900, color: '#666' }}>+{j.flagTypes.length - 6}</span>
                    ) : null}
                  </div>
                  {(() => {
                    const lf = latestFlag(j);
                    if (!lf?.match) return null;
                    return (
                      <div style={{ marginTop: 6, fontSize: 12, color: '#555' }}>
                        Match: <span style={{ fontFamily: 'monospace' }}>{String(lf.match).slice(0, 60)}</span>
                      </div>
                    );
                  })()}
                </div>

                <div style={{ ...styles.td, width: 120 }}>
                  <div style={{ fontWeight: 900 }}>{Number(j.flaggedChatCount || 0)}</div>
                </div>

                <div style={{ ...styles.td, width: 160 }}>{fmt(j.lastFlaggedAt)}</div>

                <div
                  style={{
                    ...styles.td,
                    width: 360,
                    display: 'flex',
                    gap: 10,
                    flexWrap: 'wrap',
                    alignItems: 'center',
                    justifyContent: 'flex-end',
                  }}
                >
                  {(() => {
                    const lf = latestFlag(j);
                    const anchor = lf?.messageId ? `#msg-${lf.messageId}` : '';
                    return (
                      <Link to={`/admin/job/${j.id}?view=monitoring${anchor}`} style={styles.linkBtn}>
                        View context
                      </Link>
                    );
                  })()}
                  <button type="button" style={styles.btn} onClick={() => openFreezeModal(j.id)} disabled={busyJobId === j.id || j.chatFrozen === true}>
                    {busyJobId === j.id ? 'Working…' : 'Freeze chat'}
                  </button>
                  <button type="button" style={styles.btnPrimary} onClick={() => markReviewed(j.id)} disabled={busyJobId === j.id}>
                    {busyJobId === j.id ? 'Working…' : 'Mark reviewed'}
                  </button>
                  <button type="button" style={styles.btn} onClick={() => { setNoteJobId(j.id); setNoteText(''); }} disabled={busyJobId === j.id}>
                    Add note
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {noteJobId && (
        <div style={styles.modalOverlay} onClick={() => setNoteJobId(null)}>
          <div style={styles.modalCard} onClick={(e) => e.stopPropagation()}>
            <div style={{ fontWeight: 900, marginBottom: 10 }}>Internal note</div>
            <textarea
              value={noteText}
              onChange={(e) => setNoteText(e.target.value)}
              rows={4}
              placeholder="Write an internal note (admin only)…"
              style={styles.modalTextarea}
            />
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 12 }}>
              <button type="button" style={styles.btn} onClick={() => setNoteJobId(null)} disabled={busyJobId === noteJobId}>
                Cancel
              </button>
              <button type="button" style={styles.btnPrimary} onClick={addNote} disabled={busyJobId === noteJobId}>
                {busyJobId === noteJobId ? 'Saving…' : 'Save note'}
              </button>
            </div>
          </div>
        </div>
      )}
      {freezeModal.open && (
        <div style={styles.modalOverlay} onClick={closeFreezeModal}>
          <div style={styles.modalCard} onClick={(e) => e.stopPropagation()}>
            <div style={{ fontWeight: 900, marginBottom: 10 }}>Freeze chat</div>
            <div style={{ fontSize: 13, color: '#555', marginBottom: 8 }}>
              Provide a reason (required). This is stored for audit.
            </div>
            <textarea
              value={freezeModal.reason}
              onChange={(e) => setFreezeModal((prev) => ({ ...prev, reason: e.target.value }))}
              rows={4}
              placeholder="Why are you freezing chat?"
              style={styles.modalTextarea}
            />
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 12 }}>
              <button type="button" style={styles.btn} onClick={closeFreezeModal} disabled={!!busyJobId}>
                Cancel
              </button>
              <button type="button" style={styles.btnPrimary} onClick={confirmFreezeChat} disabled={!!busyJobId}>
                {busyJobId === freezeModal.jobId ? 'Working…' : 'Freeze chat'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const styles = {
  centered: { padding: 50, textAlign: 'center', color: '#555' },
  headerBlock: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16, marginBottom: 18, flexWrap: 'wrap' },
  eyebrow: { fontSize: 12, fontWeight: 900, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#0f766e', marginBottom: 6 },
  title: { fontFamily: 'Poppins, sans-serif', fontSize: 24, fontWeight: 900, color: '#222' },
  subTitle: { fontSize: 13, color: '#666', marginTop: 2 },
  backLink: { color: '#14C5C5', textDecoration: 'none', fontWeight: 800, paddingTop: 6 },
  error: { background: '#fff1f2', border: '1px solid #fecdd3', color: '#9f1239', padding: '10px 12px', borderRadius: 10, fontSize: 13, marginBottom: 10 },
  empty: { textAlign: 'center', background: '#fff', border: '1px solid #E0E0E0', borderRadius: 12, padding: 30 },
  tableWrap: { background: '#fff', border: '1px solid #E0E0E0', borderRadius: 12, overflow: 'hidden' },
  tableHead: { display: 'flex', gap: 10, padding: 12, background: '#F7F9FA', borderBottom: '1px solid #E0E0E0' },
  th: { fontSize: 12, fontWeight: 900, color: '#555' },
  tr: { display: 'flex', gap: 10, padding: 12, borderBottom: '1px solid #F0F0F0', alignItems: 'flex-start' },
  td: { fontSize: 13, color: '#333' },
  pill: { display: 'inline-block', fontSize: 12, fontWeight: 900, padding: '4px 10px', borderRadius: 999, border: '1px solid #E0E0E0', background: '#F7F9FA', color: '#555', textTransform: 'capitalize' },
  chip: { fontSize: 11, fontWeight: 900, padding: '4px 8px', borderRadius: 999, border: '1px solid #E0E0E0', background: '#fff', color: '#333' },
  btn: { height: 36, borderRadius: 10, border: '1px solid #d1d5db', background: '#fff', padding: '0 12px', fontWeight: 900, cursor: 'pointer', color: '#374151', fontSize: 13 },
  btnPrimary: { height: 36, borderRadius: 10, border: 'none', background: '#FF9100', padding: '0 12px', fontWeight: 900, cursor: 'pointer', color: '#fff', fontSize: 13 },
  linkBtn: { height: 36, display: 'inline-flex', alignItems: 'center', borderRadius: 10, border: '1px solid #d1d5db', background: '#fff', padding: '0 12px', fontWeight: 900, color: '#374151', textDecoration: 'none', fontSize: 13 },
  modalOverlay: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', display: 'flex', justifyContent: 'center', alignItems: 'center', padding: 16, zIndex: 1000 },
  modalCard: { width: '100%', maxWidth: 520, background: '#fff', borderRadius: 12, padding: 16, boxShadow: '0 10px 30px rgba(0,0,0,0.18)' },
  modalTextarea: { width: '100%', borderRadius: 10, border: '1px solid #E0E0E0', padding: 10, fontFamily: 'Inter, sans-serif', fontSize: 14, resize: 'vertical', boxSizing: 'border-box' },
};




