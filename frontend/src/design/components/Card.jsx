import React from 'react';
import { colors, radii, shadows, spacing } from '../tokens';

const tones = {
  default: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    boxShadow: shadows.sm,
  },
  muted: {
    backgroundColor: colors.surfaceMuted,
    borderColor: '#E5E7EB',
    boxShadow: 'none',
  },
  elevated: {
    backgroundColor: colors.surface,
    borderColor: 'rgba(255,255,255,0.55)',
    boxShadow: shadows.md,
  },
};

export default function Card({
  as: Component = 'div',
  tone = 'default',
  padding = spacing.xl,
  style,
  children,
  ...rest
}) {
  const toneStyle = tones[tone] || tones.default;

  return (
    <Component
      style={{
        borderRadius: radii.lg,
        border: `1px solid ${toneStyle.borderColor}`,
        backgroundColor: toneStyle.backgroundColor,
        boxShadow: toneStyle.boxShadow,
        padding,
        ...style,
      }}
      {...rest}
    >
      {children}
    </Component>
  );
}
