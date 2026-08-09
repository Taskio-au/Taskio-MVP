import React from 'react';
import Button from '../../../design/components/Button';
import Modal from '../../../design/components/Modal';
import { colors } from '../../../design/tokens';

export default function FreezeChatModal({
  open,
  reason,
  busy,
  onChangeReason,
  onClose,
  onConfirm,
}) {
  return (
    <Modal open={open} onClose={onClose}>
      <div style={{ fontWeight: 700, fontSize: 18, marginBottom: 10, color: colors.text }}>
        Freeze chat
      </div>
      <div style={{ marginBottom: 8, fontSize: 13, color: '#555' }}>
        Provide a reason (required). This is stored for audit.
      </div>
      <textarea
        value={reason}
        onChange={(e) => onChangeReason(e.target.value)}
        rows={4}
        style={{
          width: '100%',
          borderRadius: 10,
          border: `1px solid ${colors.border}`,
          padding: 10,
          fontFamily: 'Inter, sans-serif',
          fontSize: 14,
          resize: 'vertical',
          boxSizing: 'border-box',
        }}
        placeholder="Why are you freezing chat?"
      />
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 12 }}>
        <Button variant="secondary" onClick={onClose} disabled={busy}>
          Cancel
        </Button>
        <Button variant="danger" onClick={onConfirm} disabled={busy}>
          {busy ? 'Working...' : 'Freeze chat'}
        </Button>
      </div>
    </Modal>
  );
}
