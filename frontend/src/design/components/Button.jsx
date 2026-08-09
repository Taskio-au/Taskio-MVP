import React from 'react';
import { colors, controls, radii, shadows, spacing, transitions, typography } from '../tokens';

const baseStyle = {
  minHeight: controls.heightMd,
  padding: `${spacing.sm}px ${spacing.lg}px`,
  borderRadius: radii.md,
  fontWeight: typography.weightBold,
  fontSize: typography.sizeSm,
  lineHeight: 1.2,
  border: '1px solid transparent',
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: spacing.xs,
  textDecoration: 'none',
  transition: `transform ${transitions.default}, box-shadow ${transitions.default}, background-color ${transitions.default}, border-color ${transitions.default}, color ${transitions.default}`,
};

const variants = {
  primary: {
    backgroundColor: colors.primary,
    color: '#FFFFFF',
    boxShadow: `0 10px 22px ${colors.shadowTint}`,
  },
  secondary: {
    backgroundColor: colors.surface,
    color: colors.text,
    borderColor: colors.border,
  },
  accent: {
    backgroundColor: colors.accent,
    color: '#FFFFFF',
    boxShadow: `0 10px 22px rgba(255, 145, 0, 0.22)`,
  },
  ghost: {
    backgroundColor: 'transparent',
    color: colors.text,
    borderColor: colors.border,
  },
  danger: {
    backgroundColor: colors.danger,
    color: '#FFFFFF',
    boxShadow: shadows.sm,
  },
};

const sizes = {
  sm: {
    minHeight: controls.heightSm,
    padding: `${spacing.xs}px ${spacing.md}px`,
    fontSize: typography.sizeXs,
  },
  md: {},
  lg: {
    minHeight: controls.heightLg,
    padding: `${spacing.md}px ${spacing.xl}px`,
    borderRadius: radii.lg,
    fontSize: typography.sizeMd,
  },
};

export default function Button({
  type = 'button',
  variant = 'primary',
  size = 'md',
  style,
  disabled,
  children,
  ...rest
}) {
  return (
    <button
      type={type}
      disabled={disabled}
      style={{
        ...baseStyle,
        ...(variants[variant] || variants.primary),
        ...(sizes[size] || sizes.md),
        ...(disabled ? { opacity: 0.58, cursor: 'not-allowed', boxShadow: 'none' } : null),
        ...style,
      }}
      {...rest}
    >
      {children}
    </button>
  );
}
