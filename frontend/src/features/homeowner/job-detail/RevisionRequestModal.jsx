import React from 'react';
import Button from '../../../design/components/Button';
import Modal from '../../../design/components/Modal';
import { colors } from '../../../design/tokens';

export default function RevisionRequestModal({
  open,
  message,
  submitting,
  onChangeMessage,
  onClose,
  onSubmit,
}) {
  const fieldId = 'revision-quote-message';

  return (
    <Modal open={open} onClose={onClose} ariaLabelledBy="revision-quote-modal-title">
      <h2
        id="revision-quote-modal-title"
        style={{ margin: '0 0 8px 0', fontSize: 18, fontWeight: 700, color: colors.text }}
      >
        Request revised quote
      </h2>
      <p style={{ margin: '0 0 12px 0', color: colors.textMuted, fontSize: 14 }}>
        Share scope updates so the Expert can adjust pricing and timing.
      </p>
      <label htmlFor={fieldId} style={{ display: 'block', marginBottom: 6, fontWeight: 600, fontSize: 14, color: colors.text }}>
        Message for Expert <span style={{ fontWeight: 400, color: colors.textMuted }}>(optional)</span>
      </label>
      <textarea
        id={fieldId}
        value={message}
        onChange={(e) => onChangeMessage(e.target.value)}
        rows={4}
        style={{
          width: '100%',
          boxSizing: 'border-box',
          borderRadius: 10,
          border: `1px solid ${colors.border}`,
          padding: 10,
          fontFamily: 'Inter, sans-serif',
          fontSize: 14,
          resize: 'vertical',
        }}
        placeholder="Optional details for your Expert…"
      />
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 14 }}>
        <Button variant="secondary" onClick={onClose} disabled={submitting}>
          Cancel
        </Button>
        <Button variant="primary" onClick={onSubmit} disabled={submitting}>
          {submitting ? 'Requesting…' : 'Send request'}
        </Button>
      </div>
    </Modal>
  );
}
