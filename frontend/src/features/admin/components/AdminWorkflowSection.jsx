import React, { useCallback, useEffect, useState } from 'react';

function ownerLabel(item, currentUid) {
  const a = item?.assignedTo;
  if (!a) return 'Unassigned';
  if (currentUid && a === currentUid) return 'Assigned to you';
  return item?.assignedToName ? String(item.assignedToName).slice(0, 40) : `Assigned (${String(a).slice(0, 8)}…)`;
}

function fmtShortMs(ms) {
  const n = Number(ms) || 0;
  if (!n) return '—';
  try {
    return new Date(n).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  } catch {
    return '—';
  }
}

function formatActivityLine(ev) {
  const t = String(ev?.type || '');
  const p = ev?.payload && typeof ev.payload === 'object' ? ev.payload : {};
  if (t === 'WORK_ASSIGNED' || t === 'WORK_REASSIGNED') {
    return 'Ownership updated';
  }
  if (t === 'WORK_REASSIGNED_WITH_NOTE') {
    return p.preview ? `Reassigned (note: ${String(p.preview).slice(0, 80)})` : 'Reassigned with note';
  }
  if (t === 'WORK_HANDOFF_NOTE_ADDED') {
    return p.preview ? `Handoff note: ${String(p.preview).slice(0, 80)}` : 'Handoff note added';
  }
  if (t === 'WORK_UNASSIGNED') return 'Unassigned';
  if (t === 'WORK_STATUS_CHANGED') return `Status → ${(ev.reasonCodes && ev.reasonCodes[0]) || 'updated'}`;
  if (t === 'WORK_SNOOZED') return p.untilMs ? `Snoozed until ${fmtShortMs(p.untilMs)}` : 'Snoozed';
  if (t === 'WORK_OVERDUE') return 'Marked overdue (SLA)';
  if (t === 'WORK_RESOLVED') return 'Resolved';
  if (t === 'WORK_ITEM_UPDATED') return 'Work item updated';
  if (t === 'WORK_ITEM_CREATED') return 'Work item created';
  return t.replace(/^WORK_/, '').replace(/_/g, ' ').toLowerCase() || 'Activity';
}

export default function AdminWorkflowSection({
  api,
  entityType,
  entityId,
  currentUid,
  styles,
  defaultOpen = false,
}) {
  const [open, setOpen] = useState(defaultOpen);
  const [items, setItems] = useState([]);
  const [activity, setActivity] = useState([]);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [handoffDraft, setHandoffDraft] = useState({});

  const load = useCallback(async () => {
    const et = String(entityType || '').trim();
    const eid = String(entityId || '').trim();
    if (!et || !eid || !api) return;
    setLoading(true);
    setErr('');
    try {
      const [wi, act] = await Promise.all([
        api.get(`/api/admin/work-items?entityType=${encodeURIComponent(et)}&entityId=${encodeURIComponent(eid)}`),
        api.get(`/api/admin/work-items/activity?entityType=${encodeURIComponent(et)}&entityId=${encodeURIComponent(eid)}&limit=18`),
      ]);
      setItems(Array.isArray(wi.data?.items) ? wi.data.items : []);
      setActivity(Array.isArray(act.data?.items) ? act.data.items : []);
    } catch (e) {
      setItems([]);
      setActivity([]);
      setErr(e?.response?.data?.message || 'Failed to load workflow.');
    } finally {
      setLoading(false);
    }
  }, [api, entityType, entityId]);

  useEffect(() => {
    if (open && entityId) load();
  }, [open, entityId, load]);

  const act = async (fn) => {
    setBusy(true);
    setErr('');
    try {
      await fn();
      await load();
    } catch (e) {
      setErr(e?.response?.data?.message || e?.message || 'Action failed.');
    } finally {
      setBusy(false);
    }
  };

  const primary = items[0];

  const assignNeedsNote = (it) => {
    const a = it?.assignedTo;
    if (!a || !currentUid) return false;
    if (a === currentUid) return false;
    return String(it.slaState) === 'overdue' || String(it.priority || '').toLowerCase() === 'critical';
  };

  return (
    <div style={{ ...styles.drawerSection, borderTop: '1px solid #eee', paddingTop: 12 }}>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        style={{
          display: 'flex',
          width: '100%',
          justifyContent: 'space-between',
          alignItems: 'center',
          background: 'none',
          border: 'none',
          padding: 0,
          cursor: 'pointer',
          fontWeight: 800,
          fontSize: 14,
          color: '#111',
        }}
      >
        <span>Workflow</span>
        <span style={{ fontSize: 12, color: '#6b7280' }}>{open ? '▼' : '▶'}</span>
      </button>
      {open ? (
        <div style={{ marginTop: 10 }}>
          {err ? <div style={{ fontSize: 12, color: '#b91c1c', marginBottom: 8 }}>{err}</div> : null}
          {loading ? <div style={{ fontSize: 12, color: '#6b7280' }}>Loading…</div> : null}
          {!loading && items.length === 0 ? (
            <div style={{ fontSize: 12, color: '#9ca3af' }}>No active work items yet.</div>
          ) : null}

          {activity.length > 0 ? (
            <div style={{ marginBottom: 10, paddingBottom: 8, borderBottom: '1px solid #f3f4f6' }}>
              <div style={{ fontSize: 11, fontWeight: 800, color: '#9ca3af', marginBottom: 6 }}>Recent activity</div>
              <ul style={{ margin: 0, paddingLeft: 16, fontSize: 11, color: '#4b5563' }}>
                {activity.slice(0, 10).map((ev) => (
                  <li key={ev.id} style={{ marginBottom: 4 }}>
                    {formatActivityLine(ev)}
                    <span style={{ color: '#9ca3af' }}> · {fmtShortMs(ev.createdAtMs)}</span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {items.map((it) => (
            <div
              key={it.id}
              style={{
                marginBottom: 10,
                padding: 10,
                borderRadius: 8,
                border: '1px solid #e5e7eb',
                background: '#fafafa',
                fontSize: 12,
              }}
            >
              <div style={{ fontWeight: 800, color: '#374151' }}>
                {String(it.category || '—')} · {String(it.priority || '—')}
                {it.slaState ? (
                  <span style={{ marginLeft: 8, fontWeight: 700, color: it.slaState === 'overdue' ? '#b91c1c' : '#6b7280' }}>
                    ({it.slaState})
                  </span>
                ) : null}
              </div>
              <div style={{ color: '#6b7280', marginTop: 4 }}>{ownerLabel(it, currentUid)}</div>
              {it.dueAtMs ? (
                <div style={{ marginTop: 2, fontSize: 11, color: '#6b7280' }}>Due {fmtShortMs(it.dueAtMs)}</div>
              ) : null}
              {it.followUpAtMs ? (
                <div style={{ marginTop: 2, fontSize: 11, color: '#6b7280' }}>Follow-up {fmtShortMs(it.followUpAtMs)}</div>
              ) : null}
              {it.lastTouchedAt?._seconds != null || it.lastTouchedBy ? (
                <div style={{ marginTop: 2, fontSize: 11, color: '#9ca3af' }}>
                  Last touched {it.lastTouchedBy ? `${String(it.lastTouchedBy).slice(0, 8)}… · ` : ''}
                  {it.lastTouchedAt?._seconds != null ? fmtShortMs(it.lastTouchedAt._seconds * 1000) : ''}
                </div>
              ) : null}
              {assignNeedsNote(it) ? (
                <label style={{ display: 'block', marginTop: 8, fontSize: 11, color: '#374151' }}>
                  Handoff note (required)
                  <textarea
                    value={handoffDraft[it.id] || ''}
                    onChange={(e) => setHandoffDraft((d) => ({ ...d, [it.id]: e.target.value }))}
                    rows={2}
                    style={{ width: '100%', marginTop: 4, fontSize: 12, padding: 6, borderRadius: 6, border: '1px solid #e5e7eb' }}
                    placeholder="Why are you taking this?"
                  />
                </label>
              ) : null}
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
                <button
                  type="button"
                  disabled={busy || (currentUid && it.assignedTo === currentUid)}
                  style={styles.buttonSecondary}
                  onClick={() => {
                    const note = String(handoffDraft[it.id] || '').trim();
                    if (assignNeedsNote(it) && !note) {
                      setErr('Add a handoff note before assigning to yourself.');
                      return;
                    }
                    act(() => api.post(`/api/admin/work-items/${it.id}/assign`, { handoffNote: note || undefined }));
                  }}
                >
                  Assign to me
                </button>
                <button
                  type="button"
                  disabled={busy}
                  style={styles.buttonSecondary}
                  onClick={() => act(() => api.post(`/api/admin/work-items/${it.id}/unassign`, {}))}
                >
                  Unassign
                </button>
                <button
                  type="button"
                  disabled={busy}
                  style={styles.buttonSecondary}
                  onClick={() => act(() => api.post(`/api/admin/work-items/${it.id}/status`, { status: 'waiting' }))}
                >
                  Waiting
                </button>
                <button
                  type="button"
                  disabled={busy}
                  style={styles.buttonSecondary}
                  onClick={() => act(() => api.post(`/api/admin/work-items/${it.id}/snooze`, { hours: 4 }))}
                >
                  Snooze 4h
                </button>
                <button
                  type="button"
                  disabled={busy}
                  style={styles.buttonSecondary}
                  onClick={() => act(() => api.post(`/api/admin/work-items/${it.id}/remind`, {}))}
                >
                  Remind later
                </button>
                <button
                  type="button"
                  disabled={busy}
                  style={styles.button}
                  onClick={() => act(() => api.post(`/api/admin/work-items/${it.id}/resolve`, {}))}
                >
                  Resolve
                </button>
              </div>
            </div>
          ))}
        </div>
      ) : null}
      {!open && primary ? (
        <div style={{ fontSize: 12, color: '#6b7280', marginTop: 6 }}>
          {ownerLabel(primary, currentUid)}
          {primary.slaState === 'overdue' ? ' · overdue' : ''}
        </div>
      ) : null}
    </div>
  );
}
