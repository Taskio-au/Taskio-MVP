import React from 'react';

const chip = {
  display: 'inline-flex',
  alignItems: 'center',
  padding: '2px 8px',
  borderRadius: 999,
  fontSize: 10,
  fontWeight: 800,
  border: '1px solid #e5e7eb',
  background: '#f9fafb',
  color: '#374151',
};

export default function ExpertTrustChips({ trust, title = 'Expert trust' }) {
  if (!trust) return null;
  const vf = String(trust.verificationStatus || '');
  const flags = Array.isArray(trust.trustFlags) ? trust.trustFlags : [];
  return (
    <div style={{ marginTop: 6 }}>
      <div style={{ fontSize: 11, fontWeight: 800, color: '#6b7280', marginBottom: 4 }}>{title}</div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
        <span style={chip} title="Verification bucket">{vf || '—'}</span>
        <span style={chip}>ABN: {String(trust.abnStatus || '—')}</span>
        <span style={chip}>Stripe: {String(trust.stripeStatus || '—')}</span>
        <span style={chip}>Profile: {trust.profileCompleteness === 'complete' ? 'OK' : 'Incomplete'}</span>
        {flags.slice(0, 3).map((f) => (
          <span key={f} style={{ ...chip, borderColor: '#fecdd3', background: '#fff1f2', color: '#9f1239' }}>{f}</span>
        ))}
      </div>
    </div>
  );
}
