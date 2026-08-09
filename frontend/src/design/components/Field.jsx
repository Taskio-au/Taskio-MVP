import React from 'react';
import { colors, controls, radii, spacing, typography } from '../tokens';

export const controlStyle = {
  width: '100%',
  minHeight: controls.heightMd,
  borderRadius: radii.md,
  border: `1px solid ${colors.border}`,
  backgroundColor: colors.surface,
  color: colors.text,
  padding: `${spacing.sm}px ${spacing.md}px`,
  fontSize: typography.sizeSm,
  lineHeight: 1.4,
};

export function textareaStyle(rows = 4) {
  return {
    ...controlStyle,
    minHeight: Math.max(controls.heightLg, rows * 26),
    resize: 'vertical',
  };
}

export default function Field({ label, hint, error, children, style }) {
  return (
    <label style={{ display: 'grid', gap: spacing.xs, ...style }}>
      {label ? (
        <span style={{ fontSize: typography.sizeXs, fontWeight: typography.weightBlack, color: colors.text }}>
          {label}
        </span>
      ) : null}
      {children}
      {hint ? (
        <span style={{ fontSize: typography.sizeXs, color: colors.textSubtle }}>{hint}</span>
      ) : null}
      {error ? (
        <span role="alert" style={{ fontSize: typography.sizeXs, color: colors.danger }}>
          {error}
        </span>
      ) : null}
    </label>
  );
}
