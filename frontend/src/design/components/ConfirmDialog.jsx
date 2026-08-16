import React, { useId } from 'react';
import Modal from './Modal';
import { colors, spacing } from '../tokens';

export default function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  danger = false,
  busy = false,
  onConfirm,
  onCancel,
  children,
}) {
  const titleId = useId();
  return (
    <Modal open={open} onClose={busy ? undefined : onCancel} ariaLabelledBy={titleId} maxWidth={500}>
      <h2 id={titleId} style={{ margin: 0, fontSize: 22 }}>{title}</h2>
      {message ? <p style={{ color: colors.textMuted, lineHeight: 1.55 }}>{message}</p> : null}
      {children}
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: spacing.sm, marginTop: spacing.lg, flexWrap: 'wrap' }}>
        <button type="button" onClick={onCancel} disabled={busy} style={{ minHeight: 44, padding: '0 16px' }}>
          {cancelLabel}
        </button>
        <button
          type="button"
          onClick={onConfirm}
          disabled={busy}
          style={{
            minHeight: 44,
            padding: '0 16px',
            border: 0,
            borderRadius: 8,
            background: danger ? '#b91c1c' : colors.primary,
            color: '#fff',
            fontWeight: 700,
          }}
        >
          {busy ? 'Working…' : confirmLabel}
        </button>
      </div>
    </Modal>
  );
}
