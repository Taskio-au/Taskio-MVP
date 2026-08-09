import React from 'react';
import { colors, radii, spacing, typography } from '../tokens';

const tones = {
  info: { backgroundColor: colors.infoSoft, borderColor: '#BFDBFE', color: '#1D4ED8' },
  success: { backgroundColor: colors.successSoft, borderColor: '#A7F3D0', color: '#047857' },
  warning: { backgroundColor: '#FFF7ED', borderColor: '#FED7AA', color: '#9A3412' },
  danger: { backgroundColor: colors.dangerSoft, borderColor: '#FECACA', color: '#B91C1C' },
};

export default function Banner({
  tone = 'info',
  title,
  message,
  action,
  style,
  children,
}) {
  const toneStyle = tones[tone] || tones.info;

  return (
    <div
      role={tone === 'danger' ? 'alert' : 'status'}
      style={{
        display: 'grid',
        gap: spacing.xs,
        padding: spacing.lg,
        borderRadius: radii.lg,
        border: `1px solid ${toneStyle.borderColor}`,
        backgroundColor: toneStyle.backgroundColor,
        color: toneStyle.color,
        ...style,
      }}
    >
      {title ? (
        <div style={{ fontWeight: typography.weightBlack, fontSize: typography.sizeSm }}>
          {title}
        </div>
      ) : null}
      {message ? (
        <div style={{ fontSize: typography.sizeSm, lineHeight: 1.5 }}>{message}</div>
      ) : null}
      {children}
      {action ? <div>{action}</div> : null}
    </div>
  );
}
