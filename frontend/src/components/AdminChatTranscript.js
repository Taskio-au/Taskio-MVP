import React, { useEffect, useMemo, useState } from 'react';
import { db } from '../firebase';
import { collection, limit, onSnapshot, orderBy, query } from 'firebase/firestore';

function fmt(ts) {
  if (!ts) return '—';
  if (ts?.seconds) return new Date(ts.seconds * 1000).toLocaleString('en-AU');
  if (ts?._seconds) return new Date(ts._seconds * 1000).toLocaleString('en-AU');
  if (typeof ts === 'number') return new Date(ts).toLocaleString('en-AU');
  return '—';
}

function shortUid(uid) {
  const s = String(uid || '');
  if (!s) return '—';
  if (s.length <= 12) return s;
  return `${s.slice(0, 6)}…${s.slice(-4)}`;
}

function roleLabel(role) {
  if (role === 'homeowner') return 'Client';
  if (role === 'tradie') return 'Expert';
  if (role === 'admin') return 'Admin';
  return 'User';
}

export default function AdminChatTranscript({ jobId, job }) {
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [flaggedOnly, setFlaggedOnly] = useState(false);

  useEffect(() => {
    if (!jobId) return undefined;
    setLoading(true);
    setError('');

    const q = query(
      collection(db, 'jobs', jobId, 'messages'),
      orderBy('createdAt', 'asc'),
      limit(500)
    );

    const unsub = onSnapshot(
      q,
      (snap) => {
        const rows = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        setMessages(rows);
        setLoading(false);
      },
      (e) => {
        console.error('Admin transcript listener error:', e);
        setLoading(false);
        if (e?.code === 'permission-denied') {
          setError('You do not have permission to read this chat.');
        } else {
          setError('Could not load chat transcript. Please refresh.');
        }
      }
    );

    return () => unsub();
  }, [jobId]);

  const filtered = useMemo(() => {
    if (!flaggedOnly) return messages;
    return messages.filter((m) => m.flagged === true);
  }, [flaggedOnly, messages]);

  const summary = useMemo(() => {
    return {
      requiresAdminAttention: job?.requiresAdminAttention === true,
      flaggedMessageCount: Number(job?.flaggedMessageCount || 0),
      chatFrozen: job?.chatFrozen === true,
      lastMessageAt: job?.lastMessageAt || null,
    };
  }, [job]);

  return (
    <div>
      <div style={styles.summaryRow}>
        <div style={styles.summaryItem}>
          <div style={styles.summaryLabel}>Flagged</div>
          <div style={styles.summaryValue}>{summary.flaggedMessageCount}</div>
        </div>
        <div style={styles.summaryItem}>
          <div style={styles.summaryLabel}>Last message</div>
          <div style={styles.summaryValue}>{fmt(summary.lastMessageAt)}</div>
        </div>
        <div style={styles.summaryItem}>
          <div style={styles.summaryLabel}>Attention</div>
          <div style={styles.summaryValue}>
            {summary.requiresAdminAttention ? (
              <span style={{ ...styles.pill, ...styles.pillWarn }}>Required</span>
            ) : (
              <span style={{ ...styles.pill, ...styles.pillOk }}>No</span>
            )}
          </div>
        </div>
        <div style={styles.summaryItem}>
          <div style={styles.summaryLabel}>Chat</div>
          <div style={styles.summaryValue}>
            {summary.chatFrozen ? (
              <span style={{ ...styles.pill, ...styles.pillDanger }}>Frozen</span>
            ) : (
              <span style={{ ...styles.pill, ...styles.pillOk }}>Active</span>
            )}
          </div>
        </div>
      </div>

      <div style={styles.toolbar}>
        <div style={styles.toggleWrap}>
          <button
            type="button"
            style={{ ...styles.toggleBtn, ...(flaggedOnly ? {} : styles.toggleBtnActive) }}
            onClick={() => setFlaggedOnly(false)}
          >
            All
          </button>
          <button
            type="button"
            style={{ ...styles.toggleBtn, ...(flaggedOnly ? styles.toggleBtnActive : {}) }}
            onClick={() => setFlaggedOnly(true)}
          >
            Flagged only
          </button>
        </div>
        <div style={{ fontSize: 12, color: '#666' }}>
          Showing <strong>{filtered.length}</strong> of {messages.length}
        </div>
      </div>

      {error && <div style={styles.error}>{error}</div>}

      {loading ? (
        <div style={{ padding: 12, color: '#666' }}>Loading messages…</div>
      ) : filtered.length === 0 ? (
        <div style={{ padding: 12, color: '#666' }}>
          {flaggedOnly ? 'No flagged messages.' : 'No messages yet.'}
        </div>
      ) : (
        <div style={styles.list}>
          {filtered.map((m) => {
            const ts = m.createdAt || m.flaggedAt || null;
            const isFlagged = m.flagged === true;
            const reasons = Array.isArray(m.flagReasons) ? m.flagReasons : [];
            const hasAttachment = !!(m.attachment?.downloadUrl || m.attachmentUrl || m.downloadUrl);
            const attachmentUrl = m.attachment?.downloadUrl || m.attachmentUrl || m.downloadUrl || '';
            const attachmentName = m.attachment?.fileName || m.fileName || 'Attachment';
            const senderRole = m.senderRole || 'user';
            const senderUid = m.senderUid || '';
            const rowId = `msg-${m.messageId || m.id}`;
            const isAnchor = typeof window !== 'undefined' && window.location?.hash === `#${rowId}`;

            return (
              <div
                key={m.id}
                id={rowId}
                style={{
                  ...styles.row,
                  ...(isFlagged ? styles.rowFlagged : {}),
                  ...(isAnchor ? styles.rowAnchor : {}),
                }}
              >
                <div style={styles.metaCol}>
                  <div style={{ fontWeight: 900, fontSize: 12, color: '#111' }}>
                    {roleLabel(senderRole)}{' '}
                    <span style={{ fontFamily: 'monospace', fontWeight: 700, color: '#555' }}>
                      {shortUid(senderUid)}
                    </span>
                  </div>
                  <div style={{ fontSize: 11, color: '#666' }}>{fmt(ts)}</div>
                </div>

                <div style={styles.contentCol}>
                  {m.messageType === 'text' || m.messageType === 'system' ? (
                    <div style={{ whiteSpace: 'pre-wrap', fontSize: 13, color: '#222' }}>
                      {m.text || ''}
                    </div>
                  ) : null}

                  {hasAttachment ? (
                    <div style={{ marginTop: 8 }}>
                      <a href={attachmentUrl} target="_blank" rel="noreferrer" style={styles.attachmentLink}>
                        {attachmentName}
                      </a>
                    </div>
                  ) : null}

                  {isFlagged && (
                    <div style={styles.flagsRow}>
                      <span style={{ ...styles.pill, ...styles.pillDanger }}>Flagged</span>
                      {reasons.slice(0, 8).map((r, idx) => (
                        <span key={`${m.id}-r-${idx}`} style={styles.chip}>
                          {String(r)}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

const styles = {
  summaryRow: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
    gap: 10,
    padding: 12,
    border: '1px solid #E0E0E0',
    borderRadius: 12,
    background: '#F7F9FA',
    marginBottom: 12,
  },
  summaryItem: { display: 'flex', flexDirection: 'column', gap: 2 },
  summaryLabel: { fontSize: 11, color: '#666', fontWeight: 800, textTransform: 'uppercase', letterSpacing: 0.4 },
  summaryValue: { fontSize: 13, color: '#111', fontWeight: 900 },
  toolbar: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 10, flexWrap: 'wrap' },
  toggleWrap: { display: 'inline-flex', border: '1px solid #E0E0E0', borderRadius: 999, overflow: 'hidden', background: '#fff' },
  toggleBtn: { padding: '8px 12px', border: 'none', background: 'transparent', cursor: 'pointer', fontWeight: 900, fontSize: 12, color: '#555' },
  toggleBtnActive: { background: '#14C5C5', color: '#fff' },
  error: { background: '#fff1f2', border: '1px solid #fecdd3', color: '#9f1239', padding: '10px 12px', borderRadius: 10, fontSize: 13, marginBottom: 10 },
  list: { display: 'grid', gap: 10 },
  row: { display: 'grid', gridTemplateColumns: '180px 1fr', gap: 12, padding: 12, borderRadius: 12, border: '1px solid #E0E0E0', background: '#fff', scrollMarginTop: 90 },
  rowFlagged: { borderColor: '#fecdd3', background: '#fff1f2' },
  rowAnchor: { outline: '3px solid rgba(20, 197, 197, 0.35)' },
  metaCol: { display: 'flex', flexDirection: 'column', gap: 4 },
  contentCol: { display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0 },
  attachmentLink: { color: '#0f766e', fontWeight: 900, textDecoration: 'none' },
  flagsRow: { display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center', marginTop: 8 },
  chip: { fontSize: 11, fontWeight: 900, padding: '4px 8px', borderRadius: 999, border: '1px solid #E0E0E0', background: '#fff', color: '#333' },
  pill: { display: 'inline-block', fontSize: 11, fontWeight: 900, padding: '4px 10px', borderRadius: 999, border: '1px solid transparent' },
  pillOk: { background: '#ecfdf5', color: '#065f46', borderColor: '#a7f3d0' },
  pillWarn: { background: '#fffbeb', color: '#92400e', borderColor: '#fde68a' },
  pillDanger: { background: '#fff1f2', color: '#9f1239', borderColor: '#fecdd3' },
};

