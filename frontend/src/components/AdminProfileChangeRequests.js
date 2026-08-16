import React, { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import adminApi from '../api/adminApi';
import AppHeader from './AppHeader';
import { auth } from '../firebase';
import { PROFILE_REQUEST_STALE_HOURS } from '../utils/adminOps';
import AdminEntityNotesSection from '../features/admin/components/AdminEntityNotesSection';
import AdminWorkflowSection from '../features/admin/components/AdminWorkflowSection';
import ExpertTrustChips from '../features/admin/components/ExpertTrustChips';
import { dashboardStyles } from '../styles/dashboardStyles';
import { InlineLoadingCard } from './ui/AsyncPageStates';

function fmt(ms) {
  if (!ms) return '—';
  try { return new Date(ms).toLocaleString('en-AU'); } catch { return '—'; }
}

function ageBadge(createdAtMs) {
  const created = Number(createdAtMs || 0) || 0;
  if (!created) return { text: '—', isStale: false };
  const now = Date.now();
  const ageH = (now - created) / (1000 * 60 * 60);
  const isStale = ageH >= PROFILE_REQUEST_STALE_HOURS;
  if (ageH < 24) return { text: `${Math.max(0, Math.floor(ageH))}h`, isStale };
  const ageD = ageH / 24;
  return { text: `${Math.floor(ageD)}d`, isStale };
}

function fieldLabel(field) {
  if (field === 'firstName') return 'First name';
  if (field === 'lastName') return 'Last name';
  if (field === 'businessName') return 'Business name';
  return field || '—';
}

function statusChip(status) {
  const s = String(status || 'pending');
  const map = {
    pending: { bg: '#fff7ed', bd: '#fed7aa', fg: '#9a3412' },
    approved: { bg: '#ecfdf5', bd: '#a7f3d0', fg: '#065f46' },
    rejected: { bg: '#fff1f2', bd: '#fecdd3', fg: '#9f1239' },
  };
  const c = map[s] || map.pending;
  return { display: 'inline-block', padding: '4px 10px', borderRadius: 999, fontWeight: 900, fontSize: 12, background: c.bg, border: `1px solid ${c.bd}`, color: c.fg, textTransform: 'capitalize' };
}

export default function AdminProfileChangeRequests() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [status, setStatus] = useState('pending'); // pending|approved|rejected|''
  const [items, setItems] = useState([]);
  const [selected, setSelected] = useState(null);
  const [decision, setDecision] = useState('approved');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [detail, setDetail] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);

  const currentUser = auth.currentUser;

  const load = async () => {
    setError('');
    setLoading(true);
    try {
      const qs = status ? `?status=${encodeURIComponent(status)}` : '';
      const res = await adminApi.get(`/api/admin/profile-change-requests${qs}`);
      setItems(res?.data?.items || []);
    } catch (e) {
      console.error('Load profile change requests failed:', e);
      setError(e?.response?.data?.message || 'Failed to load change requests.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const qs = (searchParams.get('status') || '').toString().trim();
    if (qs && (qs === 'pending' || qs === 'approved' || qs === 'rejected')) {
      setStatus(qs);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]);

  const sorted = useMemo(() => {
    const staleOnly = searchParams.get('stale') === '1';
    const trustOnly = searchParams.get('trust') === '1';
    const nowMs = Date.now();
    let base = [...items].sort((a, b) => (b.createdAtMs || 0) - (a.createdAtMs || 0));
    if (trustOnly && status === 'pending') {
      base = base.filter((r) => r.trustImpacting);
    }
    if (!staleOnly) return base;
    // Only meaningful for pending
    if (status !== 'pending') return base;
    return base.filter((r) => {
      const created = Number(r.createdAtMs || 0) || 0;
      if (!created) return false;
      const ageH = (nowMs - created) / (1000 * 60 * 60);
      return ageH >= PROFILE_REQUEST_STALE_HOURS;
    });
  }, [items, searchParams, status]);

  const staleOnly = searchParams.get('stale') === '1' && status === 'pending';

  const setQuickFilter = (key) => {
    if (key === 'stale') {
      setStatus('pending');
      setSearchParams({ status: 'pending', stale: '1' });
      return;
    }
    if (key === 'all') {
      setStatus('');
      setSearchParams({});
      return;
    }
    // pending / approved / rejected
    setStatus(key);
    setSearchParams(key ? { status: key } : {});
  };

  useEffect(() => {
    if (!selected?.id) {
      setDetail(null);
      return undefined;
    }
    let alive = true;
    setDetailLoading(true);
    adminApi.get(`/api/admin/profile-change-requests/${selected.id}`)
      .then((res) => {
        if (alive) setDetail(res.data || null);
      })
      .catch(() => {
        if (alive) setDetail(null);
      })
      .finally(() => {
        if (alive) setDetailLoading(false);
      });
    return () => { alive = false; };
  }, [selected?.id]);

  const submitDecision = async () => {
    if (!selected) return;
    if (decision === 'rejected' && detail?.trustImpacting && String(note || '').trim().length < 8) {
      setError('Trust-impacting rejection needs a clear reason (8+ characters).');
      return;
    }
    setSaving(true);
    setError('');
    try {
      await adminApi.post(`/api/admin/profile-change-requests/${selected.id}/decision`, {
        decision,
        note: note.trim() || '',
      });
      setSelected(null);
      setNote('');
      setDecision('approved');
      await load();
    } catch (e) {
      console.error('Decision failed:', e);
      setError(e?.response?.data?.message || 'Failed to save decision.');
    } finally {
      setSaving(false);
    }
  };

  const escalateRequest = async () => {
    if (!selected) return;
    setSaving(true);
    setError('');
    try {
      await adminApi.post(`/api/admin/profile-change-requests/${selected.id}/escalate`);
      setSelected(null);
      await load();
    } catch (e) {
      setError(e?.response?.data?.message || 'Escalate failed.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#F7F9FA' }}>
      <AppHeader userRole="admin" userName={currentUser?.displayName || ''} userEmail={currentUser?.email || ''} />

      <div style={{ maxWidth: 1400, margin: '0 auto', padding: '40px 24px', fontFamily: 'Inter, sans-serif' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, marginBottom: 16 }}>
          <div>
            <h1 style={{ fontFamily: 'Poppins, sans-serif', fontSize: 28, margin: 0 }}>Profile change requests</h1>
            <div style={{ color: '#666', fontSize: 14, marginTop: 6 }}>Review and approve/reject identity updates for verified profiles.</div>
            {staleOnly ? (
              <div style={{ marginTop: 10 }}>
                <span style={{ display: 'inline-block', padding: '4px 10px', borderRadius: 999, fontWeight: 900, fontSize: 12, background: '#111827', color: '#fff' }}>
                  Showing only requests older than {PROFILE_REQUEST_STALE_HOURS}h
                </span>
              </div>
            ) : null}
          </div>
          <Link to="/admin/dashboard" style={{ color: '#14C5C5', textDecoration: 'none', fontWeight: 900, paddingTop: 6 }}>← Back</Link>
        </div>

        {error && <div style={{ background: '#fff1f2', border: '1px solid #fecdd3', color: '#9f1239', padding: '10px 12px', borderRadius: 10, fontSize: 13, marginBottom: 10 }}>{error}</div>}

        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 12 }}>
          {[
            { key: 'pending', label: 'Pending' },
            { key: 'approved', label: 'Approved' },
            { key: 'rejected', label: 'Rejected' },
            { key: 'stale', label: `Stale > ${PROFILE_REQUEST_STALE_HOURS}h` },
            { key: 'all', label: 'All' },
          ].map((t) => (
            <button
              key={t.key || 'all'}
              type="button"
              onClick={() => setQuickFilter(t.key)}
              style={{
                height: 36,
                borderRadius: 999,
                border: '1px solid #d1d5db',
                background: (t.key === 'stale' ? staleOnly : (t.key === 'all' ? status === '' && !staleOnly : status === t.key)) ? '#111827' : '#fff',
                color: (t.key === 'stale' ? staleOnly : (t.key === 'all' ? status === '' && !staleOnly : status === t.key)) ? '#fff' : '#374151',
                padding: '0 14px',
                fontWeight: 900,
                cursor: 'pointer',
                fontSize: 13,
              }}
            >
              {t.label}
            </button>
          ))}
          <button
            type="button"
            onClick={load}
            style={{ height: 36, borderRadius: 10, border: '1px solid #d1d5db', background: '#fff', padding: '0 12px', fontWeight: 900, cursor: 'pointer', color: '#374151', fontSize: 13 }}
            disabled={loading}
          >
            {loading ? 'Refreshing…' : 'Refresh'}
          </button>
        </div>

        <div style={{ background: '#fff', border: '1px solid #E0E0E0', borderRadius: 12, overflow: 'hidden' }}>
          <div style={{ display: 'flex', gap: 10, padding: 12, background: '#F7F9FA', borderBottom: '1px solid #E0E0E0' }}>
            <div style={{ fontSize: 12, fontWeight: 900, color: '#555', width: 120 }}>Status</div>
            <div style={{ fontSize: 12, fontWeight: 900, color: '#555', width: 220 }}>User</div>
            <div style={{ fontSize: 12, fontWeight: 900, color: '#555', width: 160 }}>Field</div>
            <div style={{ fontSize: 12, fontWeight: 900, color: '#555', flex: 1 }}>Requested</div>
            <div style={{ fontSize: 12, fontWeight: 900, color: '#555', width: 120 }}>Age</div>
            <div style={{ fontSize: 12, fontWeight: 900, color: '#555', width: 220 }}>Created / decision</div>
            <div style={{ fontSize: 12, fontWeight: 900, color: '#555', width: 140, textAlign: 'right' }}>Action</div>
          </div>

          {loading ? (
            <InlineLoadingCard message="Loading profile change requests…" detail="Getting the current review queue." />
          ) : sorted.length === 0 ? (
            <div style={{ padding: 40, textAlign: 'center', color: '#666' }}>No requests found.</div>
          ) : (
            sorted.map((r) => (
              <div
                key={r.id}
                style={{
                  display: 'flex',
                  gap: 10,
                  padding: 12,
                  borderBottom: '1px solid #F0F0F0',
                  alignItems: 'flex-start',
                  background: (r.status === 'pending' && ageBadge(r.createdAtMs).isStale) ? '#FFFBEB' : '#fff',
                }}
              >
                <div style={{ width: 120 }}>
                  <span style={statusChip(r.status)}>{r.status || 'pending'}</span>
                  {r.escalationStatus === 'super_admin_review' ? (
                    <div style={{ marginTop: 6, fontSize: 10, fontWeight: 900, color: '#9f1239' }}>Escalated</div>
                  ) : null}
                </div>
                <div style={{ width: 220 }}>
                  <div style={{ fontWeight: 900, fontFamily: 'monospace' }}>{(r.uid || '').slice(0, 10)}…</div>
                  <div style={{ fontSize: 12, color: '#666' }}>{r.role || '—'}</div>
                  <Link to={`/admin/user/${r.uid}`} style={{ fontSize: 12, color: '#2563eb', textDecoration: 'none', fontWeight: 800 }}>View user</Link>
                </div>
                <div style={{ width: 160, fontWeight: 900 }}>
                  {fieldLabel(r.field)}
                  {r.trustImpacting && r.status === 'pending' ? (
                    <div style={{ marginTop: 6, display: 'inline-block', padding: '2px 8px', borderRadius: 999, fontSize: 10, fontWeight: 900, background: '#fff1f2', border: '1px solid #fecdd3', color: '#9f1239' }}>Trust</div>
                  ) : null}
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 12, color: '#666' }}>From: <span style={{ color: '#111', fontWeight: 700 }}>{r.currentValue || '—'}</span></div>
                  <div style={{ fontSize: 13, color: '#111', fontWeight: 900, marginTop: 2 }}>{r.requestedValue || '—'}</div>
                  {r.reason && <div style={{ fontSize: 12, color: '#666', marginTop: 6 }}>Reason: {r.reason}</div>}
                  {r.adminNote && <div style={{ fontSize: 12, color: '#666', marginTop: 6 }}>Decision note: {r.adminNote}</div>}
                </div>
                <div style={{ width: 120, fontSize: 12, color: '#666' }}>
                  {(() => {
                    const a = ageBadge(r.createdAtMs);
                    return (
                      <span style={{
                        display: 'inline-block',
                        padding: '4px 10px',
                        borderRadius: 999,
                        fontWeight: 900,
                        fontSize: 12,
                        background: a.isStale && r.status === 'pending' ? '#111827' : '#F3F4F6',
                        color: a.isStale && r.status === 'pending' ? '#fff' : '#111',
                        border: '1px solid #E5E7EB',
                      }}>
                        {a.text}
                      </span>
                    );
                  })()}
                </div>
                <div style={{ width: 220, fontSize: 12, color: '#666' }}>
                  <div>Created: {fmt(r.createdAtMs)}</div>
                  {r.decidedAtMs ? (
                    <div style={{ marginTop: 6 }}>
                      Decided: {fmt(r.decidedAtMs)}
                      <div style={{ marginTop: 4 }}>By: <span style={{ fontFamily: 'monospace' }}>{r.decidedByUid || '—'}</span></div>
                    </div>
                  ) : null}
                </div>
                <div style={{ width: 140, textAlign: 'right' }}>
                  <button
                    type="button"
                    onClick={() => { setSelected(r); setDecision('approved'); setNote(''); }}
                    style={{ height: 34, borderRadius: 10, border: '1px solid #d1d5db', background: '#fff', padding: '0 12px', fontWeight: 900, cursor: 'pointer', color: '#374151', fontSize: 13 }}
                  >
                    Review
                  </button>
                </div>
              </div>
            ))
          )}
        </div>

        {selected && (
          <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', display: 'flex', justifyContent: 'center', alignItems: 'center', padding: 16, zIndex: 1000 }} onMouseDown={() => !saving && setSelected(null)}>
            <div style={{ width: '100%', maxWidth: 720, background: '#fff', borderRadius: 12, padding: 16, boxShadow: '0 10px 30px rgba(0,0,0,0.18)' }} onMouseDown={(e) => e.stopPropagation()}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start' }}>
                <div>
                  <div style={{ fontWeight: 900, fontSize: 16, color: '#111' }}>Review request</div>
                  <div style={{ fontSize: 12, color: '#666', marginTop: 2 }}>
                    User: <span style={{ fontFamily: 'monospace' }}>{selected.uid}</span> • Field: <strong>{fieldLabel(selected.field)}</strong>
                  </div>
                </div>
                <button type="button" onClick={() => !saving && setSelected(null)} style={{ border: 'none', background: 'transparent', cursor: 'pointer', fontSize: 18, color: '#666' }}>×</button>
              </div>

              <div style={{ marginTop: 12, background: '#F7F9FA', border: '1px solid #E5E7EB', borderRadius: 10, padding: 12 }}>
                {detailLoading ? <div style={{ fontSize: 12, color: '#666' }}>Loading detail…</div> : null}
                {detail?.trustImpacting ? (
                  <div style={{ display: 'inline-block', marginBottom: 8, padding: '4px 10px', borderRadius: 999, background: '#fff1f2', border: '1px solid #fecdd3', color: '#9f1239', fontWeight: 900, fontSize: 11 }}>
                    Trust-impacting
                  </div>
                ) : null}
                <div style={{ fontSize: 12, color: '#666' }}>User</div>
                <div style={{ fontWeight: 900 }}>{detail?.userDisplayName || '—'} <span style={{ fontWeight: 600, color: '#666' }}>({detail?.userRole || selected.role || '—'})</span></div>
                {detail?.trustSummary && detail?.userRole === 'tradie' ? (
                  <div style={{ marginTop: 8 }}><ExpertTrustChips trust={detail.trustSummary} title="Trust snapshot" /></div>
                ) : null}
                <div style={{ fontSize: 12, color: '#666', marginTop: 10 }}>Evidence</div>
                <div style={{ fontWeight: 800 }}>{detail?.evidenceCount != null ? `${detail.evidenceCount} file(s)` : '—'}</div>
                <div style={{ fontSize: 12, color: '#666', marginTop: 10 }}>Current</div>
                <div style={{ fontWeight: 900, color: '#111' }}>{selected.currentValue || '—'}</div>
                <div style={{ fontSize: 12, color: '#666', marginTop: 10 }}>Requested</div>
                <div style={{ fontWeight: 900, color: '#111' }}>{selected.requestedValue || '—'}</div>
                {selected.reason ? <div style={{ fontSize: 12, color: '#666', marginTop: 10 }}>Reason: {selected.reason}</div> : null}
              </div>

              {selected?.id ? (
                <AdminWorkflowSection
                  api={adminApi}
                  entityType="profile_request"
                  entityId={selected.id}
                  currentUid={currentUser?.uid}
                  styles={dashboardStyles}
                  defaultOpen
                />
              ) : null}

              {selected?.id ? (
                <AdminEntityNotesSection
                  api={adminApi}
                  entityType="profile_request"
                  entityId={selected.id}
                  styles={dashboardStyles}
                  defaultOpen
                />
              ) : null}

              <div style={{ display: 'grid', gridTemplateColumns: '220px 1fr', gap: 12, marginTop: 12 }}>
                <div>
                  <div style={{ fontSize: 12, fontWeight: 900, color: '#374151', marginBottom: 6 }}>Decision</div>
                  <select value={decision} onChange={(e) => setDecision(e.target.value)} style={{ width: '100%', height: 40, borderRadius: 10, border: '1px solid #E0E0E0', padding: '0 10px', fontWeight: 800 }}>
                    <option value="approved">Approve</option>
                    <option value="rejected">Reject</option>
                  </select>
                </div>
                <div>
                  <div style={{ fontSize: 12, fontWeight: 900, color: '#374151', marginBottom: 6 }}>Decision note (shown to the user)</div>
                  <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={3} placeholder="Write a short note for the user (optional)…" style={{ width: '100%', borderRadius: 10, border: '1px solid #E0E0E0', padding: 10, fontFamily: 'Inter, sans-serif', fontSize: 14, resize: 'vertical', boxSizing: 'border-box' }} />
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 14, flexWrap: 'wrap' }}>
                <button type="button" onClick={escalateRequest} disabled={saving || (detail?.escalationStatus || selected?.escalationStatus) === 'super_admin_review'} style={{ height: 40, borderRadius: 10, border: '1px solid #fecdd3', background: '#fff1f2', padding: '0 14px', fontWeight: 900, cursor: 'pointer', color: '#9f1239' }}>
                  Escalate for super admin
                </button>
                <button type="button" onClick={() => !saving && setSelected(null)} disabled={saving} style={{ height: 40, borderRadius: 10, border: '1px solid #d1d5db', background: '#fff', padding: '0 14px', fontWeight: 900, cursor: 'pointer', color: '#374151' }}>
                  Cancel
                </button>
                <button type="button" onClick={submitDecision} disabled={saving} style={{ height: 40, borderRadius: 10, border: 'none', background: '#14C5C5', padding: '0 14px', fontWeight: 900, cursor: 'pointer', color: '#fff' }}>
                  {saving ? 'Saving…' : 'Save decision'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
