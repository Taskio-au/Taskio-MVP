import React from 'react';

export default function ChangeRequestHistory({
  visible,
  loading,
  items,
  styles,
}) {
  if (!visible) return null;

  return (
    <div className="pp-change-history-wrap pp-change-history-expert">
      <details style={styles.historyDetails} className="change-req-history">
        <summary style={styles.historySummary}>
          Name & business updates
          {loading ? <span className="pp-change-history-loading">Loading…</span> : null}
          {!loading && items.length > 0 ? (
            <span style={styles.historyCountPill}>{items.length}</span>
          ) : null}
        </summary>

        {items.length === 0 ? (
          <div style={styles.historyEmpty}>
            No updates submitted yet.
          </div>
        ) : (
          <div style={styles.historyList}>
            {items.map((r) => (
              <div key={r.id} style={styles.historyRow}>
                <div className="pp-history-row-head">
                  <div>
                    <div className="pp-history-field">
                      {r.field === 'firstName' ? 'First name' : r.field === 'lastName' ? 'Last name' : 'Business name'}
                    </div>
                    <div className="pp-history-requested">
                      Requested: <span className="pp-history-requested-value">{r.requestedValue || '—'}</span>
                    </div>
                  </div>
                  <div className="pp-history-meta">
                    <span style={{
                      ...styles.historyStatusPill,
                      ...(r.status === 'approved'
                        ? styles.historyStatusApproved
                        : r.status === 'rejected'
                          ? styles.historyStatusRejected
                          : styles.historyStatusPending),
                    }}>
                      {(r.status || 'pending').toUpperCase()}
                    </span>
                    <div className="pp-history-date">
                      {r.createdAtMs ? new Date(r.createdAtMs).toLocaleString('en-AU') : '—'}
                    </div>
                  </div>
                </div>

                {r.adminNote ? (
                  <div style={styles.historyAdminNote}>
                    Admin note: {r.adminNote}
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        )}
      </details>
    </div>
  );
}
