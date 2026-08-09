import React, { useEffect } from 'react';
import { colors, radii, shadows, spacing } from '../tokens';

/**
 * Accessible modal: Escape closes; dialog exposes role and naming for assistive tech.
 */
export default function Modal({
  open,
  onClose,
  children,
  maxWidth = 560,
  ariaLabel,
  ariaLabelledBy,
}) {
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => {
      if (e.key === 'Escape') onClose?.();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  const dialogAriaLabel = ariaLabelledBy ? undefined : (ariaLabel || 'Dialog');

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: colors.overlay,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1200,
        padding: spacing.lg,
      }}
      onMouseDown={onClose}
      role="presentation"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={dialogAriaLabel}
        aria-labelledby={ariaLabelledBy || undefined}
        style={{
          width: '100%',
          maxWidth,
          backgroundColor: colors.surface,
          borderRadius: radii.xl,
          boxShadow: shadows.modal,
          border: `1px solid ${colors.border}`,
          padding: spacing.xl,
        }}
        onMouseDown={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </div>
  );
}
