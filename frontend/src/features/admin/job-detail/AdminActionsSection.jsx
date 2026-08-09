import React from 'react';

export default function AdminActionsSection({
  job,
  isDisputed,
  adminBusy,
  adminAction,
  adminReason,
  safetyAck,
  safetyCountdown,
  adminErr,
  onOpenAction,
  onCloseModal,
  onRunAction,
  onAdminReasonChange,
  onSafetyAckChange,
  styles,
}) {
  return (
    <>
      <div style={styles.card}>
        <h2 style={styles.sectionTitle}>Admin Actions</h2>
        <div style={styles.dangerZoneLabel}>Danger zone</div>
        <div style={styles.adminNote}>
          Use these tools for dispute resolution and operational support. No CSV export. PII access is logged only on user detail pages.
        </div>

        {isDisputed && (
          <div style={styles.disputeInfo}>
            <div style={{ fontWeight: 800, marginBottom: 6 }}>This task is currently disputed.</div>
            <div style={{ fontSize: 13, color: '#555' }}>
              Reason: {job.disputeReason ? job.disputeReason : '—'}
            </div>
          </div>
        )}

        <div style={styles.adminActionsRow}>
          <button
            style={styles.dangerButton}
            onClick={() => onOpenAction('dispute')}
            disabled={adminBusy || isDisputed}
            title={isDisputed ? 'Already disputed.' : ''}
          >
            Flag dispute
          </button>
          <button
            style={styles.buttonSecondary}
            onClick={() => onOpenAction('clear_dispute')}
            disabled={adminBusy || !isDisputed}
            title={!isDisputed ? 'Task is not disputed.' : ''}
          >
            Clear dispute
          </button>
          <button
            style={styles.primaryButton}
            onClick={() => onOpenAction('manual_release')}
            disabled={adminBusy || job.paymentState !== 'in_escrow'}
            title={job.paymentState !== 'in_escrow' ? 'Manual release is only available when paymentState is in_escrow.' : ''}
          >
            Manual release
          </button>
          <button
            style={styles.dangerButton}
            onClick={() => onOpenAction('refund')}
            disabled={adminBusy || !job.paymentIntentId || job.paymentState === 'refunded'}
            title={!job.paymentIntentId ? 'Refund requires a paymentIntentId.' : (job.paymentState === 'refunded' ? 'Already refunded.' : '')}
          >
            Refund (full)
          </button>
        </div>
      </div>

      {/* Confirmation Modal */}
      {adminAction && (
        <div style={styles.modalOverlay} onClick={onCloseModal}>
          <div style={styles.modalCard} onClick={(e) => e.stopPropagation()}>
            <div style={styles.modalTitle}>
              {adminAction === 'dispute' && 'Flag task as disputed?'}
              {adminAction === 'clear_dispute' && 'Clear dispute and restore task?'}
              {adminAction === 'manual_release' && 'Manually release payment to expert?'}
              {adminAction === 'refund' && 'Issue a full refund?'}
            </div>
            <div style={styles.modalBody}>
              {adminAction === 'dispute' && (
                <>
                  <div style={{ marginBottom: 8, fontSize: 13, color: '#555' }}>
                    Optional reason (stored for audit).
                  </div>
                  <textarea
                    value={adminReason}
                    onChange={(e) => onAdminReasonChange(e.target.value)}
                    rows={4}
                    style={styles.modalTextarea}
                    placeholder="e.g., Client reported incomplete work…"
                  />
                </>
              )}
              {adminAction === 'manual_release' && (
                <>
                  <div style={{ fontSize: 13, color: '#555', marginBottom: 10 }}>
                    This will create a Stripe Transfer to the assigned expert&apos;s Connect account and mark the task as completed.
                  </div>
                  <div style={styles.safetyLine}>
                    <input
                      type="checkbox"
                      checked={safetyAck}
                      onChange={(e) => onSafetyAckChange(e.target.checked)}
                      id="ack"
                    />
                    <label htmlFor="ack">
                      I understand this action is hard to undo.
                    </label>
                    <span style={styles.countdownText}>
                      {safetyCountdown > 0 ? `Confirm enabled in ${safetyCountdown}s…` : 'Ready'}
                    </span>
                  </div>
                </>
              )}
              {adminAction === 'refund' && (
                <>
                  <div style={{ fontSize: 13, color: '#555', marginBottom: 10 }}>
                    This issues a full refund for the PaymentIntent. Use for dispute resolution or cancellations.
                  </div>
                  <div style={styles.safetyLine}>
                    <input
                      type="checkbox"
                      checked={safetyAck}
                      onChange={(e) => onSafetyAckChange(e.target.checked)}
                      id="ack"
                    />
                    <label htmlFor="ack">
                      I understand this action is hard to undo.
                    </label>
                    <span style={styles.countdownText}>
                      {safetyCountdown > 0 ? `Confirm enabled in ${safetyCountdown}s…` : 'Ready'}
                    </span>
                  </div>
                </>
              )}

              {adminErr && <div style={{ marginTop: 10, color: '#DC3545', fontSize: 13 }}>{adminErr}</div>}
            </div>
            <div style={styles.modalActions}>
              <button style={styles.buttonSecondary} onClick={onCloseModal} disabled={adminBusy}>Cancel</button>
              <button
                style={adminAction === 'manual_release' ? styles.primaryButton : styles.dangerButton}
                onClick={onRunAction}
                disabled={
                  adminBusy ||
                  ((adminAction === 'manual_release' || adminAction === 'refund') && (!safetyAck || safetyCountdown > 0))
                }
              >
                {adminBusy ? 'Working…' : 'Confirm'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
