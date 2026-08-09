import React, { useCallback, useEffect, useState } from 'react';

const NOTE_TYPES = [
  { v: 'general', l: 'General' },
  { v: 'risk', l: 'Risk' },
  { v: 'payment', l: 'Payment' },
  { v: 'verification', l: 'Verification' },
];

export default function AdminEntityNotesSection({
  api,
  entityType,
  entityId,
  styles,
  defaultOpen = false,
}) {
  const [open, setOpen] = useState(defaultOpen);
  const [loading, setLoading] = useState(false);
  const [notes, setNotes] = useState([]);
  const [draft, setDraft] = useState('');
  const [noteType, setNoteType] = useState('general');
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    const id = String(entityId || '').trim();
    const et = String(entityType || '').trim();
    if (!id || !et || !api) return;
    setLoading(true);
    try {
      const res = await api.get(`/api/admin/notes?entityType=${encodeURIComponent(et)}&entityId=${encodeURIComponent(id)}`);
      setNotes(Array.isArray(res.data?.notes) ? res.data.notes : []);
    } catch {
      setNotes([]);
    } finally {
      setLoading(false);
    }
  }, [api, entityType, entityId]);

  useEffect(() => {
    if (open && entityId) load();
  }, [open, entityId, load]);

  const save = async () => {
    const txt = String(draft || '').trim();
    const id = String(entityId || '').trim();
    const et = String(entityType || '').trim();
    if (!txt || !id || !et) return;
    setSaving(true);
    try {
      await api.post('/api/admin/notes', { entityType: et, entityId: id, note: txt, noteType });
      setDraft('');
      await load();
    } catch (e) {
      window.alert(e?.response?.data?.message || 'Failed to save note.');
    } finally {
      setSaving(false);
    }
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
        <span>Internal notes</span>
        <span style={{ fontSize: 12, color: '#6b7280' }}>{open ? '▼' : '▶'}</span>
      </button>
      {open ? (
        <div style={{ marginTop: 10 }}>
          {loading ? <div style={{ fontSize: 12, color: '#6b7280' }}>Loading…</div> : null}
          <div style={{ display: 'grid', gap: 8, maxHeight: 200, overflowY: 'auto', marginBottom: 10 }}>
            {notes.length === 0 && !loading ? (
              <div style={{ fontSize: 12, color: '#9ca3af' }}>No notes yet.</div>
            ) : (
              notes.map((n) => (
                <div key={n.id} style={{ fontSize: 12, padding: 8, borderRadius: 8, background: '#f9fafb', border: '1px solid #e5e7eb' }}>
                  <div style={{ color: '#6b7280', marginBottom: 4 }}>
                    {n.noteType || 'general'} · {n.createdBy ? `${String(n.createdBy).slice(0, 8)}…` : '—'}
                    {' · '}
                    {n.createdAtMs ? new Date(n.createdAtMs).toLocaleString() : '—'}
                  </div>
                  <div style={{ whiteSpace: 'pre-wrap', color: '#111' }}>{n.note}</div>
                </div>
              ))
            )}
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
            <select value={noteType} onChange={(e) => setNoteType(e.target.value)} style={{ ...styles.filterSelect, maxWidth: 140 }}>
              {NOTE_TYPES.map((x) => (
                <option key={x.v} value={x.v}>{x.l}</option>
              ))}
            </select>
            <input
              type="text"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder="Short note…"
              style={{ flex: 1, minWidth: 120, padding: '8px 10px', borderRadius: 8, border: '1px solid #e5e7eb', fontSize: 13 }}
            />
            <button type="button" style={styles.buttonSecondary} disabled={saving || !draft.trim()} onClick={save}>
              {saving ? '…' : 'Add'}
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
