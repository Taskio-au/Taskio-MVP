import React from 'react';
import { radii, spacing, statusTones, typography } from '../tokens';

function formatStatusLabel(status) {
  if (status === 'awaiting_funding') return 'Pending payment';
  return String(status || 'unknown').replace(/_/g, ' ');
}

export default function StatusPill({ status, label, style }) {
  const tone = statusTones[status] || statusTones.default;

  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        minWidth: 104,
        padding: `${spacing.xs}px ${spacing.md}px`,
        borderRadius: radii.pill,
        border: `1px solid ${tone.border}`,
        backgroundColor: tone.background,
        color: tone.text,
        fontSize: typography.sizeXs,
        fontWeight: typography.weightBlack,
        textTransform: 'capitalize',
        whiteSpace: 'nowrap',
        ...style,
      }}
    >
      {label || formatStatusLabel(status)}
    </span>
  );
}
