import React from 'react';

export default function VariationsSection({ variations, styles }) {
  return (
    <details open={variations.length > 0} style={styles.detailsWrap}>
      <summary style={styles.detailsSummary}>Variations</summary>
      <div style={{ marginTop: 12 }}>
        {variations.length === 0 ? (
          <div style={{ fontSize: 13, color: '#666' }}>No variations.</div>
        ) : (
          <div style={{ display: 'grid', gap: 10 }}>
            {variations.map((v) => (
              <div key={v.id} style={{ border: '1px solid #E0E0E0', borderRadius: 12, padding: 12, background: '#fff' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'center' }}>
                  <div style={{ fontWeight: 900 }}>{v.title}</div>
                  <div style={{ ...styles.dangerZoneLabel, backgroundColor: '#F7F9FA', borderColor: '#E0E0E0', color: '#555', textTransform: 'capitalize' }}>
                    {v.status || '—'}
                  </div>
                </div>
                <div style={{ marginTop: 8, fontSize: 13, color: '#333', whiteSpace: 'pre-wrap' }}>
                  {v.description}
                </div>
                <div style={{ marginTop: 8, fontSize: 12, color: '#666' }}>
                  Price change: {Number.isFinite(v.priceChangeCents) ? `$${(Number(v.priceChangeCents) / 100).toFixed(2)}` : '—'} • Time: {v.timeImpact || '—'}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </details>
  );
}
