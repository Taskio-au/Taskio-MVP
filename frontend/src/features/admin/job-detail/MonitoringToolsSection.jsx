import React from 'react';

export default function MonitoringToolsSection({
  job,
  monitorErr,
  monitorBusy,
  noteDraft,
  adminNoteDraft,
  notes,
  onOpenFreezeChat,
  onUnfreezeChat,
  onMarkReviewed,
  onNoteDraftChange,
  onAdminNoteDraftChange,
  onSaveAdminNote,
  onAddInternalNote,
  styles,
}) {
  return (
    <div style={styles.card}>
      <h2 style={styles.sectionTitle}>Disputes / Monitoring</h2>
      {monitorErr && <div style={styles.errorBanner}>{monitorErr}</div>}
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        {job.chatFrozen === true ? (
          <button
            type="button"
            style={styles.primaryButton}
            onClick={onUnfreezeChat}
            disabled={monitorBusy}
          >
            {monitorBusy ? 'Working…' : 'Unfreeze chat'}
          </button>
        ) : (
          <button
            type="button"
            style={styles.dangerButton}
            onClick={onOpenFreezeChat}
            disabled={monitorBusy}
          >
            {monitorBusy ? 'Working…' : 'Freeze chat'}
          </button>
        )}
        <button
          type="button"
          style={styles.primaryButton}
          onClick={onMarkReviewed}
          disabled={monitorBusy}
        >
          {monitorBusy ? 'Working…' : 'Mark reviewed'}
        </button>
      </div>

      <div style={{ marginTop: 12 }}>
        <div style={{ fontWeight: 800, marginBottom: 6 }}>Internal note (task-level)</div>
        <textarea
          value={adminNoteDraft}
          onChange={(e) => onAdminNoteDraftChange(e.target.value)}
          rows={3}
          style={styles.modalTextarea}
          placeholder="Saved on the task (admin only)…"
        />
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 8 }}>
          <button type="button" style={styles.buttonSecondary} onClick={onSaveAdminNote} disabled={monitorBusy || !adminNoteDraft.trim()}>
            {monitorBusy ? 'Saving…' : 'Save note'}
          </button>
        </div>
      </div>

      <div style={{ marginTop: 12 }}>
        <div style={{ fontWeight: 800, marginBottom: 6 }}>Internal note</div>
        <textarea
          value={noteDraft}
          onChange={(e) => onNoteDraftChange(e.target.value)}
          rows={3}
          style={styles.modalTextarea}
          placeholder="Write an internal note (admin only)…"
        />
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 8 }}>
          <button type="button" style={styles.buttonSecondary} onClick={onAddInternalNote} disabled={monitorBusy || !noteDraft.trim()}>
            {monitorBusy ? 'Saving…' : 'Save note'}
          </button>
        </div>

        {notes.length > 0 && (
          <div style={{ marginTop: 12, display: 'grid', gap: 10 }}>
            {notes.slice(0, 10).map((n) => (
              <div key={n.id} style={{ padding: 12, borderRadius: 10, border: '1px solid #E0E0E0', backgroundColor: '#F7F9FA' }}>
                <div style={{ fontSize: 12, color: '#666', marginBottom: 6 }}>
                  {n.createdByUid ? `By ${n.createdByUid}` : '—'}
                </div>
                <div style={{ fontSize: 13, whiteSpace: 'pre-wrap' }}>{n.text}</div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
