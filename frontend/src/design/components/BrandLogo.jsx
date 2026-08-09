import React from 'react';
import { Link } from 'react-router-dom';

/** Full horizontal Taskio lockup (mark + wordmark in one asset). */
function taskioLogoLockupUrl() {
  const base = process.env.PUBLIC_URL || '';
  return `${base}/images/taskio-logo.png`;
}

/** `inverse` is accepted on BrandLogo for API stability; full-color PNG has no separate inverse variant yet. */
function BrandLogoContent({ compact = false }) {
  // Heights tuned for AppHeader (~70px), auth shells, and landing — width follows asset aspect ratio.
  const height = compact ? 32 : 40;
  const maxWidth = compact ? 168 : 220;

  return (
    <img
      src={taskioLogoLockupUrl()}
      height={height}
      width={undefined}
      alt=""
      aria-hidden
      style={{
        display: 'block',
        width: 'auto',
        maxWidth,
        height,
        objectFit: 'contain',
        objectPosition: 'left center',
        flexShrink: 0,
      }}
    />
  );
}

export default function BrandLogo({
  to,
  inverse = false,
  compact = false,
  ariaLabel = 'Taskio home',
  style,
}) {
  const content = <BrandLogoContent compact={compact} />;

  if (to) {
    return (
      <Link
        to={to}
        aria-label={ariaLabel}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'flex-start',
          lineHeight: 0,
          textDecoration: 'none',
          ...style,
        }}
      >
        {content}
      </Link>
    );
  }

  return (
    <div style={{ display: 'inline-flex', alignItems: 'center', lineHeight: 0, ...style }}>{content}</div>
  );
}
