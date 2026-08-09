import React, { useEffect, useState } from 'react';

function toDate(ts) {
  if (!ts) return null;
  if (ts._seconds != null) return new Date(ts._seconds * 1000);
  if (typeof ts === 'string' || ts instanceof Date) return new Date(ts);
  return null;
}

/** Relative when recent; otherwise full locale string. */
function formatRelativeOrFull(ts) {
  const d = toDate(ts);
  if (!d || Number.isNaN(d.getTime())) return '—';
  const diffMs = Date.now() - d.getTime();
  const sec = Math.floor(diffMs / 1000);
  if (sec < 0) return d.toLocaleString();
  if (sec < 60) return sec <= 1 ? 'Just now' : `${sec} secs ago`;
  const min = Math.floor(sec / 60);
  if (min < 60) return min === 1 ? '1 min ago' : `${min} mins ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return hr === 1 ? '1 hour ago' : `${hr} hours ago`;
  const day = Math.floor(hr / 24);
  if (day < 7) return day === 1 ? '1 day ago' : `${day} days ago`;
  return d.toLocaleString();
}

const ACTION_LABELS = {
  TRADIE_MARK_COMPLETE: 'Expert marked task complete',
  HOMEOWNER_RELEASE_PAYMENT: 'Payment released',
  HOMEOWNER_CANCEL_TASK: 'Task cancelled',
  HOMEOWNER_REQUEST_REFUND_CANCEL: 'Refund initiated via Stripe',
  HOMEOWNER_REPORT_ISSUE: 'Dispute reported',
  ADMIN_FLAG_DISPUTE: 'Dispute flagged',
  ADMIN_CLEAR_DISPUTE: 'Dispute cleared',
  ADMIN_MANUAL_RELEASE: 'Manual release to expert',
  ADMIN_REFUND: 'Refund initiated via Stripe',
  ADMIN_RESOLVE_DISPUTE_REFUND: 'Refund initiated via Stripe',
  ADMIN_RESOLVE_DISPUTE_EXPERT: 'Dispute resolved — expert paid',
  ADMIN_MARK_REFUNDED: 'Marked refunded (fallback)',
  ADMIN_STATUS_OVERRIDE: 'Status changed',
  ADMIN_RETRY_CHECKOUT: 'Checkout recreated after failed funding',
  ADMIN_RETRY_REFUND: 'Refund retry initiated',
};

function eventLabel(ev) {
  const m = ev.metadata || {};
  const action = ev.action || '';
  if (action === 'ADMIN_STATUS_OVERRIDE' && (m.from != null || m.to != null)) {
    const from = m.from != null ? String(m.from) : '—';
    const to = m.to != null ? String(m.to) : '—';
    return `Admin changed status from ${from} → ${to}`;
  }
  return ACTION_LABELS[action] || action || 'Event';
}

export default function AdminJobEventLog({ events, styles: S }) {
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 60000);
    return () => clearInterval(id);
  }, []);

  const list = Array.isArray(events) ? events : [];
  if (list.length === 0) {
    return (
      <div style={S.card}>
        <h2 style={S.sectionTitle}>Event log</h2>
        <p style={{ margin: 0, fontSize: 13, color: '#6B7280' }}>No events recorded yet.</p>
      </div>
    );
  }

  return (
    <div style={S.card}>
      <h2 style={S.sectionTitle}>Event log</h2>
      <ul style={{ listStyle: 'none', padding: 0, margin: 0, maxHeight: 320, overflow: 'auto' }}>
        {list.map((ev) => {
          const label = eventLabel(ev);
          const when = formatRelativeOrFull(ev.timestamp);
          return (
            <li
              key={ev.id || `${ev.action}-${when}`}
              style={{
                fontSize: 13,
                padding: '8px 0',
                borderBottom: '1px solid #F0F0F0',
                color: '#374151',
              }}
            >
              <div style={{ fontWeight: 600 }}>{label}</div>
              <div style={{ fontSize: 12, color: '#6B7280', marginTop: 2 }}>
                {when}
                {ev.actorRole ? ` · ${ev.actorRole}` : ''}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
