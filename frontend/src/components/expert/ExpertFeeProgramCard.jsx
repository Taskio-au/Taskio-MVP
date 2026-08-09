import React, { useId } from 'react';
import { Link } from 'react-router-dom';
import './ExpertFeeProgramCard.css';

/** @param {number | null | undefined} bps basis points */
function bpsToPercentLabel(bps) {
  const n = typeof bps === 'number' && Number.isFinite(bps) ? bps : null;
  if (n === null) return '—';
  const pct = n / 100;
  const decimals = n % 100 === 0 ? 0 : n % 10 === 0 ? 1 : 2;
  return `${pct.toFixed(decimals)}%`;
}

function formatEndDate(ms) {
  if (typeof ms !== 'number' || !Number.isFinite(ms)) return null;
  try {
    return new Intl.DateTimeFormat('en-AU', {
      dateStyle: 'medium',
    }).format(new Date(ms));
  } catch {
    return null;
  }
}

/** One-line summary for Payments hero (no duplicate long copy). */
export function expertFeeProgramPaymentsBlurb(foundingExpertFeeProfile) {
  const f = foundingExpertFeeProfile && typeof foundingExpertFeeProfile === 'object'
    ? foundingExpertFeeProfile
    : null;
  if (!f) return null;
  const stage = String(f.stage || '');
  const rem =
    typeof f.zeroFeeSlotsRemaining === 'number' && Number.isFinite(f.zeroFeeSlotsRemaining)
      ? Math.max(0, Math.round(f.zeroFeeSlotsRemaining))
      : null;
  const endMs = typeof f.reducedFeeEndsAtMs === 'number' ? f.reducedFeeEndsAtMs : null;

  if (stage === 'founding_first_three' && rem != null) {
    return rem === 1
      ? `Founding Expert: 0% Taskio fee — 1 zero-fee funded task remaining`
      : `Founding Expert: 0% Taskio fee — ${rem} zero-fee funded tasks remaining`;
  }
  if (stage === 'founding_reduced') {
    const end = formatEndDate(endMs);
    if (end) return `Reduced Founding Expert fee — 7.5% Taskio fee until ${end}`;
    return `Reduced Founding Expert fee — 7.5% Taskio fee`;
  }
  if (stage === 'standard_launch') {
    return `Standard launch fee — 10% Taskio fee on completed paid tasks`;
  }
  return null;
}

/**
 * Expert-facing Fee programme visibility (foundingExpertFeeProfile from GET /api/me).
 *
 * @param {{
 *   foundingExpertFeeProfile: object | null | undefined,
 *   compact?: boolean,
 *   apiUnavailable?: boolean,
 * }} props
 */
export default function ExpertFeeProgramCard({
  foundingExpertFeeProfile,
  compact = false,
  apiUnavailable = false,
}) {
  const headlineId = useId();

  if (apiUnavailable) {
    return (
      <div
        aria-label="Fee programme"
        className={`efp-card efp-card--unavailable ${compact ? 'efp-card--compact' : ''}`.trim()}
        role="status"
        aria-live="polite"
      >
        <div className="efp-muted">Fee programme unavailable</div>
      </div>
    );
  }

  const f = foundingExpertFeeProfile && typeof foundingExpertFeeProfile === 'object'
    ? foundingExpertFeeProfile
    : null;
  if (!f) return null;

  const stage = String(f.stage || 'standard_launch');
  const enrolled = Boolean(f.enrolled);
  const badgeLabel = typeof f.badgeLabel === 'string' && f.badgeLabel.trim() ? f.badgeLabel.trim() : null;
  const showFoundingBadge =
    Boolean(badgeLabel) &&
    enrolled &&
    (stage === 'founding_first_three' || stage === 'founding_reduced');

  const limit =
    typeof f.zeroFeeTaskLimit === 'number' && Number.isFinite(f.zeroFeeTaskLimit)
      ? Math.max(0, Math.round(f.zeroFeeTaskLimit))
      : 3;
  const used =
    typeof f.zeroFeeSlotsUsed === 'number' && Number.isFinite(f.zeroFeeSlotsUsed)
      ? Math.max(0, Math.round(f.zeroFeeSlotsUsed))
      : null;
  const remaining =
    typeof f.zeroFeeSlotsRemaining === 'number' && Number.isFinite(f.zeroFeeSlotsRemaining)
      ? Math.max(0, Math.round(f.zeroFeeSlotsRemaining))
      : used != null
        ? Math.max(0, limit - used)
        : null;

  const expertFeeBps = typeof f.expertFeeBps === 'number' && Number.isFinite(f.expertFeeBps) ? f.expertFeeBps : null;
  const feeLine = expertFeeBps != null ? bpsToPercentLabel(expertFeeBps) : '—';

  let headline;
  let subline;

  if (stage === 'founding_first_three') {
    headline = '0% Taskio fee on your first 3 funded tasks';
    if (used != null && remaining != null) {
      subline = `${used} of ${limit} zero-fee tasks used / ${remaining} remaining`;
    } else if (remaining != null) {
      subline = `${remaining} zero-fee funded ${remaining === 1 ? 'task' : 'tasks'} remaining`;
    } else {
      subline = 'Zero-fee funded tasks are tracked when you quote on funded tasks.';
    }
  } else if (stage === 'founding_reduced') {
    headline = 'Reduced Founding Expert fee';
    const end = formatEndDate(f.reducedFeeEndsAtMs);
    subline = end ? `7.5% Taskio fee until ${end}` : '7.5% Taskio fee on completed paid tasks';
  } else {
    headline = 'Standard launch fee';
    subline = '10% Taskio fee on completed paid tasks';
  }

  return (
    <section
      aria-label="Fee programme"
      className={`efp-card ${compact ? 'efp-card--compact' : ''} ${showFoundingBadge ? 'efp-card--founding' : 'efp-card--standard'}`.trim()}
    >
      <div className="efp-card-header">
        {showFoundingBadge ? (
          <span className="efp-badge" aria-label="Fee programme tier">
            {badgeLabel || 'Founding Expert'}
          </span>
        ) : null}
        <h2 id={headlineId} className="efp-headline">
          {headline}
        </h2>
      </div>
      {subline ? <p className="efp-subline">{subline}</p> : null}
      <div className="efp-current">
        <span className="efp-current-label">Current fee</span>
        <span className="efp-current-value">{feeLine}</span>
      </div>
      <div className="efp-actions">
        <Link to="/payments" className="efp-link-btn">
          View payments
        </Link>
      </div>
    </section>
  );
}
