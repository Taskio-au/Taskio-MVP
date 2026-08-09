import React from 'react';
import Button from '../../../design/components/Button';
import Modal from '../../../design/components/Modal';

export default function DashboardActionModals({
  copyFallbackModal,
  onCloseCopyFallback,
  boostModal,
  boostReason,
  onBoostReasonChange,
  boostNote,
  onBoostNoteChange,
  boostSaving,
  onCloseBoost,
  onConfirmBoost,
  inviteModal,
  inviteJobId,
  onInviteJobChange,
  jobs,
  inviting,
  onCloseInvite,
  onInvite,
  selectStyle,
  modalTextareaStyle,
}) {
  return (
    <>
      <Modal open={copyFallbackModal.open} onClose={onCloseCopyFallback}>
        <div style={{ fontWeight: 900, fontSize: 16, marginBottom: 6 }}>Copy message</div>
        <div style={{ fontSize: 13, color: '#555', marginBottom: 10 }}>
          Clipboard access is blocked in this browser context. Copy the text below manually.
        </div>
        <textarea
          readOnly
          value={copyFallbackModal.text}
          rows={6}
          style={modalTextareaStyle}
        />
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 12 }}>
          <Button variant="secondary" onClick={onCloseCopyFallback}>
            Close
          </Button>
        </div>
      </Modal>

      <Modal open={boostModal.open} onClose={onCloseBoost}>
        <div style={{ fontWeight: 900, fontSize: 16, marginBottom: 6 }}>
          {boostModal.isOn ? 'Remove boost?' : 'Boost expert?'}
        </div>
        <div style={{ fontSize: 13, color: '#555', marginBottom: 12 }}>
          Expert: <strong>{boostModal.name}</strong>
        </div>

        {!boostModal.isOn ? (
          <div style={{ display: 'grid', gap: 10 }}>
            <div>
              <div style={{ fontSize: 12, fontWeight: 900, color: '#374151', marginBottom: 6 }}>Reason</div>
              <select value={boostReason} onChange={(e) => onBoostReasonChange(e.target.value)} style={selectStyle}>
                <option value="high_quality">High quality</option>
                <option value="fast_responder">Fast responder</option>
                <option value="trusted">Trusted</option>
                <option value="manual_test">Manual test</option>
                <option value="other">Other</option>
              </select>
            </div>
            <div>
              <div style={{ fontSize: 12, fontWeight: 900, color: '#374151', marginBottom: 6 }}>Notes (optional)</div>
              <textarea
                value={boostNote}
                onChange={(e) => onBoostNoteChange(e.target.value)}
                rows={4}
                placeholder="Optional notes..."
                style={modalTextareaStyle}
              />
            </div>
          </div>
        ) : (
          <div style={{ fontSize: 13, color: '#555' }}>
            This will remove the boost and stop prioritising this expert in invite lists.
          </div>
        )}

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 12 }}>
          <Button variant="secondary" onClick={onCloseBoost} disabled={boostSaving}>
            Cancel
          </Button>
          <Button variant={boostModal.isOn ? 'danger' : 'primary'} onClick={onConfirmBoost} disabled={boostSaving}>
            {boostSaving ? 'Working...' : (boostModal.isOn ? 'Remove boost' : 'Confirm boost')}
          </Button>
        </div>
      </Modal>

      <Modal open={inviteModal.open} onClose={onCloseInvite}>
        <div style={{ fontWeight: 900, fontSize: 16, marginBottom: 6 }}>Invite to a task</div>
        <div style={{ fontSize: 13, color: '#555', marginBottom: 12 }}>
          Expert: <strong>{inviteModal.title}</strong>
        </div>

        <div style={{ fontSize: 12, color: '#6B7280', marginBottom: 8 }}>
          MVP: select an open task to invite this expert. For expertise matching, use the task detail page.
        </div>

        <select value={inviteJobId} onChange={(e) => onInviteJobChange(e.target.value)} style={selectStyle}>
          <option value="">Select an open task...</option>
          {jobs
            .filter((j) => String(j?.status || '').toLowerCase() === 'open')
            .slice(0, 80)
            .map((j) => (
              <option key={j.id} value={j.id}>
                {(j.title || '(Untitled task)')} - {String(j.id || '').slice(0, 8)}...
              </option>
            ))}
        </select>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 12 }}>
          <Button variant="secondary" onClick={onCloseInvite} disabled={inviting}>
            Cancel
          </Button>
          <Button variant="primary" onClick={onInvite} disabled={inviting || !inviteJobId}>
            {inviting ? 'Inviting...' : 'Invite'}
          </Button>
        </div>
      </Modal>
    </>
  );
}
