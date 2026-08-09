import React from 'react';
import { colors, radii, shadows, spacing } from '../tokens';

export default function DrawerShell({
  open,
  onClose,
  title,
  subtitle,
  width = 440,
  footer,
  children,
}) {
  if (!open) return null;

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 1200,
        display: 'flex',
        justifyContent: 'flex-end',
        backgroundColor: colors.overlay,
      }}
      onMouseDown={onClose}
    >
      <aside
        aria-modal="true"
        role="dialog"
        style={{
          width: '100%',
          maxWidth: width,
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          backgroundColor: colors.surface,
          boxShadow: shadows.lg,
          borderTopLeftRadius: radii.xl,
          borderBottomLeftRadius: radii.xl,
        }}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div style={{ padding: spacing.xl, borderBottom: `1px solid ${colors.border}` }}>
          {title ? <div style={{ fontWeight: 900, fontSize: 20, marginBottom: subtitle ? 6 : 0 }}>{title}</div> : null}
          {subtitle ? <div style={{ fontSize: 13, lineHeight: 1.5, color: colors.textSubtle }}>{subtitle}</div> : null}
        </div>
        <div style={{ flex: 1, overflowY: 'auto', padding: spacing.xl }}>{children}</div>
        {footer ? (
          <div style={{ padding: spacing.xl, borderTop: `1px solid ${colors.border}`, backgroundColor: colors.surfaceMuted }}>
            {footer}
          </div>
        ) : null}
      </aside>
    </div>
  );
}
