import React from 'react';

export default function DashboardOpsModals({
  clientDisable,
  clientDisableReason,
  clientDisableNote,
  onCloseClientDisable,
  onClientDisableReasonChange,
  onClientDisableNoteChange,
  onConfirmDisableClient,
  noteModal,
  noteText,
  noteSaving,
  onCloseNoteModal,
  onNoteTextChange,
  onSaveInternalNote,
  userOpsModal,
  userOpsNote,
  userOpsSaving,
  onCloseUserOpsModal,
  onUserOpsNoteChange,
  onSaveUserOps,
  statusConfirm,
  onCloseStatusConfirm,
  onConfirmStatusDisable,
  styles,
}) {
  return (
    <>
      {/* Disable client confirmation modal (reason required) */}
      {clientDisable.open && (
        <div style={styles.modalOverlay} onMouseDown={onCloseClientDisable}>
          <div style={styles.modalCard} onMouseDown={(e) => e.stopPropagation()}>
            <div style={{ fontWeight: 900, fontSize: 16, marginBottom: 6 }}>Disable client?</div>
            <div style={{ fontSize: 13, color: '#555', marginBottom: 12 }}>
              You are about to disable <strong>{clientDisable.name}</strong>. Reason is required.
            </div>

            <div style={{ display: 'grid', gap: 10 }}>
              <div>
                <div style={{ fontSize: 12, fontWeight: 900, color: '#374151', marginBottom: 6 }}>Reason</div>
                <select value={clientDisableReason} onChange={(e) => onClientDisableReasonChange(e.target.value)} style={styles.select}>
                  <option value="fraud">Fraud</option>
                  <option value="abuse">Abuse / harassment</option>
                  <option value="spam">Spam</option>
                  <option value="policy_violation">Policy violation</option>
                  <option value="chargeback_risk">Chargeback risk</option>
                  <option value="other">Other</option>
                </select>
              </div>
              <div>
                <div style={{ fontSize: 12, fontWeight: 900, color: '#374151', marginBottom: 6 }}>Notes (optional)</div>
                <textarea
                  value={clientDisableNote}
                  onChange={(e) => onClientDisableNoteChange(e.target.value)}
                  rows={4}
                  placeholder="Optional details for audit…"
                  style={styles.modalTextarea}
                />
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 12 }}>
              <button type="button" style={styles.buttonSecondary} onClick={onCloseClientDisable}>
                Cancel
              </button>
              <button type="button" style={{ ...styles.button, backgroundColor: '#DC3545' }} onClick={onConfirmDisableClient}>
                Disable
              </button>
            </div>
          </div>
        </div>
      )}

      {noteModal.open && (
        <div style={styles.modalOverlay} onMouseDown={onCloseNoteModal}>
          <div style={styles.modalCard} onMouseDown={(e) => e.stopPropagation()}>
            <div style={{ fontWeight: 900, fontSize: 16, marginBottom: 6 }}>Add internal note</div>
            <div style={{ fontSize: 12, color: '#6B7280', marginBottom: 10 }}>
              Task: <span style={{ fontWeight: 800 }}>{noteModal.title}</span> • ID: <span style={{ fontFamily: 'monospace' }}>{noteModal.jobId.slice(0, 10)}…</span>
            </div>
            <textarea
              value={noteText}
              onChange={(e) => onNoteTextChange(e.target.value)}
              rows={4}
              placeholder="Write an internal note (admin only)…"
              style={styles.modalTextarea}
            />
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 12 }}>
              <button type="button" style={styles.buttonSecondary} onClick={onCloseNoteModal} disabled={noteSaving}>
                Cancel
              </button>
              <button type="button" style={styles.button} onClick={onSaveInternalNote} disabled={noteSaving || !noteText.trim()}>
                {noteSaving ? 'Saving…' : 'Save note'}
              </button>
            </div>
          </div>
        </div>
      )}

      {userOpsModal.open && (
        <div style={styles.modalOverlay} onMouseDown={onCloseUserOpsModal}>
          <div style={styles.modalCard} onMouseDown={(e) => e.stopPropagation()}>
            <div style={{ fontWeight: 900, fontSize: 16, marginBottom: 6 }}>Admin note</div>
            <div style={{ fontSize: 12, color: '#6B7280', marginBottom: 10 }}>
              User: <span style={{ fontWeight: 800 }}>{userOpsModal.title}</span> • UID: <span style={{ fontFamily: 'monospace' }}>{userOpsModal.uid.slice(0, 10)}…</span>
            </div>
            <textarea
              value={userOpsNote}
              onChange={(e) => onUserOpsNoteChange(e.target.value)}
              rows={5}
              placeholder="Internal admin note…"
              style={styles.modalTextarea}
            />
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 12 }}>
              <button type="button" style={styles.buttonSecondary} onClick={onCloseUserOpsModal} disabled={userOpsSaving}>
                Cancel
              </button>
              <button type="button" style={styles.button} onClick={onSaveUserOps} disabled={userOpsSaving}>
                {userOpsSaving ? 'Saving…' : 'Save note'}
              </button>
            </div>
          </div>
        </div>
      )}

      {statusConfirm.open && (
        <div style={styles.modalOverlay} onMouseDown={onCloseStatusConfirm}>
          <div style={styles.modalCard} onMouseDown={(e) => e.stopPropagation()}>
            <div style={{ fontWeight: 900, fontSize: 16, marginBottom: 6 }}>Disable user?</div>
            <div style={{ fontSize: 13, color: '#555', marginBottom: 12 }}>
              You are about to disable <strong>{statusConfirm.name}</strong>. They will not be able to sign in.
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
              <button type="button" style={styles.buttonSecondary} onClick={onCloseStatusConfirm}>
                Cancel
              </button>
              <button
                type="button"
                style={{ ...styles.button, backgroundColor: '#DC3545' }}
                onClick={onConfirmStatusDisable}
              >
                Disable
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
