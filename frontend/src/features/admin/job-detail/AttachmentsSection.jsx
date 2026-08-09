import React from 'react';

export default function AttachmentsSection({ attachments, styles }) {
  return (
    <details open={attachments.length > 0} style={styles.detailsWrap}>
      <summary style={styles.detailsSummary}>Attachments</summary>
      <div style={{ marginTop: 12 }}>
        {attachments.length === 0 ? (
          <div style={{ fontSize: 13, color: '#666' }}>No attachments yet.</div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12 }}>
            {attachments.slice(0, 24).map((a) => (
              <a
                key={a.id}
                href={a.url}
                target="_blank"
                rel="noreferrer"
                style={{ textDecoration: 'none', color: '#111', border: '1px solid #E0E0E0', borderRadius: 12, padding: 10, background: '#fff' }}
              >
                {String(a.mimeType || '').startsWith('image/') ? (
                  <img src={a.url} alt={a.fileName} style={{ width: '100%', height: 120, objectFit: 'cover', borderRadius: 10, border: '1px solid #F0F0F0' }} />
                ) : (
                  <div style={{ height: 120, borderRadius: 10, border: '1px solid #F0F0F0', background: '#fff1f2', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 900, color: '#9f1239' }}>
                    PDF
                  </div>
                )}
                <div style={{ marginTop: 8, fontSize: 12, fontWeight: 800, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {a.fileName}
                </div>
              </a>
            ))}
          </div>
        )}
      </div>
    </details>
  );
}
