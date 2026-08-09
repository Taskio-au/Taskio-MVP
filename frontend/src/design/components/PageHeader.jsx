import React from 'react';
import { colors, spacing, typography } from '../tokens';

export default function PageHeader({ eyebrow, title, description, actions, align = 'left', style }) {
  return (
    <div
      style={{
        display: 'flex',
        flexWrap: 'wrap',
        justifyContent: 'space-between',
        alignItems: 'flex-end',
        gap: spacing.lg,
        textAlign: align,
        ...style,
      }}
    >
      <div style={{ maxWidth: 760 }}>
        {eyebrow ? (
          <div
            style={{
              marginBottom: spacing.xs,
              fontSize: typography.sizeXs,
              fontWeight: typography.weightBlack,
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              color: colors.primaryHover,
            }}
          >
            {eyebrow}
          </div>
        ) : null}
        <h1
          style={{
            marginBottom: spacing.sm,
            fontSize: typography.size2xl,
            fontWeight: typography.weightBold,
            color: colors.text,
          }}
        >
          {title}
        </h1>
        {description ? (
          <p
            style={{
              marginBottom: 0,
              fontSize: typography.sizeMd,
              lineHeight: 1.65,
              color: colors.textMuted,
            }}
          >
            {description}
          </p>
        ) : null}
      </div>
      {actions ? <div>{actions}</div> : null}
    </div>
  );
}
