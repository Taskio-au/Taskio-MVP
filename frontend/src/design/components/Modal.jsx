import React, { useEffect, useRef } from 'react';
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
  const dialogRef = useRef(null);
  const restoreFocusRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    restoreFocusRef.current = document.activeElement;
    const dialog = dialogRef.current;
    const focusable = dialog?.querySelector(
      'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
    );
    (focusable || dialog)?.focus();
    const onKey = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose?.();
        return;
      }
      if (e.key !== 'Tab' || !dialog) return;
      const nodes = Array.from(dialog.querySelectorAll(
        'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
      ));
      if (!nodes.length) {
        e.preventDefault();
        dialog.focus();
        return;
      }
      const first = nodes[0];
      const last = nodes[nodes.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      restoreFocusRef.current?.focus?.();
    };
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
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label={dialogAriaLabel}
        aria-labelledby={ariaLabelledBy || undefined}
        tabIndex={-1}
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
