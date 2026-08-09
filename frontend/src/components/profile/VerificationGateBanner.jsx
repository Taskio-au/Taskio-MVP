import React from 'react';
import { Link } from 'react-router-dom';
import { CLIENT_PHONE_GATE_BANNER } from '../../constants/blockedFlowCopy';

export default function VerificationGateBanner({
  dismissed,
  gate,
  reason,
  next,
  onDismiss,
}) {
  if (dismissed || gate !== 'phone') return null;

  return (
    <div className="pp-gate-banner">
      <div className="pp-gate-banner-inner">
        <div className="pp-gate-banner-left">
          <div className="pp-gate-banner-icon">📱</div>
          <div style={{ flex: '1 1 280px', minWidth: 0 }}>
            <div className="pp-gate-banner-title">{CLIENT_PHONE_GATE_BANNER.title}</div>
            <div className="pp-gate-banner-copy">
              {reason || 'Verify your phone in Account settings to continue.'}
              {next ? <span className="pp-gate-banner-copy-note"> You’ll return here after verification.</span> : null}
            </div>
          </div>
        </div>
        <div className="pp-gate-banner-actions">
          <Link to="/settings" className="pp-gate-banner-primary">
            {CLIENT_PHONE_GATE_BANNER.primaryCta}
          </Link>
          <button
            type="button"
            onClick={onDismiss}
            className="pp-gate-banner-dismiss"
            aria-label={CLIENT_PHONE_GATE_BANNER.dismiss}
          >
            {CLIENT_PHONE_GATE_BANNER.dismiss}
          </button>
        </div>
      </div>
    </div>
  );
}
