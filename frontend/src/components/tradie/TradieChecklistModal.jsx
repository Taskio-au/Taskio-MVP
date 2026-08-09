import React from 'react';

export default function TradieChecklistModal({
  open,
  eligibilityChecklist,
  awaitingAdminOnly = false,
  onClose,
  onGoProfile,
  styles,
}) {
  if (!open) return null;

  return (
    <div style={styles.modalOverlay} onMouseDown={onClose} role="dialog" aria-modal="true">
      <div style={styles.modalCard} onMouseDown={(e) => e.stopPropagation()}>
        <div style={styles.modalHeader}>
          <div>
            <div style={{ fontWeight: 900, fontSize: 16, color: '#111' }}>Checklist</div>
            <div style={{ fontSize: 12, color: '#666', marginTop: 2 }}>
              {awaitingAdminOnly
                ? 'Your checklist is complete — Taskio is verifying your Expert account.'
                : 'Complete these steps to unlock quoting.'}
            </div>
          </div>
          <button type="button" style={styles.modalClose} onClick={onClose} aria-label="Close">×</button>
        </div>

        <div style={{ display: 'grid', gap: 10, marginTop: 10 }}>
          {eligibilityChecklist.map((item) => (
            <div key={item.key} style={styles.checkRow}>
              <div style={{ ...styles.checkDot, ...(item.done ? styles.checkDotDone : styles.checkDotTodo) }}>
                {item.done ? '✓' : '•'}
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 800, color: '#222', fontSize: 13 }}>{item.label}</div>
                <div style={{ fontSize: 12, color: item.done ? '#15803d' : '#92400e', marginTop: 2 }}>
                  {item.done ? 'Done' : 'Not done'}
                </div>
              </div>
            </div>
          ))}
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 16 }}>
          {!awaitingAdminOnly && (
            <button type="button" style={styles.quoteEligibilityButtonSecondary} onClick={onGoProfile}>
              Go to My Profile
            </button>
          )}
          <button type="button" style={styles.quoteEligibilityButton} onClick={onClose}>
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
