import React from 'react';
import { getCanonicalJobTypeLabel } from '../constants/taskTaxonomy';

/**
 * Renders expertise chips for a user (tradie).
 * Extracted from Dashboard.js to reduce maintainability debt.
 */
export default function ExpertiseChips({ user, styles }) {
  const keys = Array.isArray(user?.expertiseApproved) ? user.expertiseApproved : [];
  if (!keys.length) return null;

  const labels = keys.map((k) => ({ k, label: getCanonicalJobTypeLabel(k) || k }));
  const shown = labels.slice(0, 5);
  const extra = labels.length - shown.length;
  const full = labels.map((x) => x.label).join(', ');

  const chipStyle = {
    display: 'inline-block',
    padding: '4px 10px',
    borderRadius: 999,
    border: '1px solid #E5E7EB',
    background: '#fff',
    fontWeight: 900,
    fontSize: 12,
    color: '#374151',
  };
  const chipMoreStyle = {
    ...chipStyle,
    background: '#F9FAFB',
    color: '#6B7280',
  };

  return (
    <span style={{ display: 'inline-flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }} title={full}>
      {shown.map(({ k, label }) => (
        <span key={k} style={styles?.chip || chipStyle}>{label}</span>
      ))}
      {extra > 0 ? (
        <span style={styles?.chipMore || chipMoreStyle} title={full}>+{extra} more</span>
      ) : null}
    </span>
  );
}
