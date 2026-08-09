import React from 'react';
import { Link } from 'react-router-dom';

export default function ClientDetailsDrawer({
  open,
  onClose,
  styles,
  homeownerSummary,
  homeownerUid,
  clientFull,
}) {
  if (!open) return null;

  return (
    <div style={styles.drawerOverlay} onMouseDown={onClose}>
      <div style={styles.drawerPanel} onMouseDown={(e) => e.stopPropagation()}>
        <div style={styles.drawerHeader}>
          <div style={{ minWidth: 0 }}>
            <div style={styles.drawerTitle}>Client details</div>
            <div style={styles.drawerSubtitle}>
              {homeownerSummary?.displayName || homeownerSummary?.emailMasked || homeownerUid}
            </div>
          </div>
          <button type="button" onClick={onClose} style={styles.drawerCloseBtn} aria-label="Close">
            ×
          </button>
        </div>
        <div style={{ padding: 14, overflowY: 'auto' }}>
          {clientFull.error ? <div style={styles.errorBanner}>{clientFull.error}</div> : null}
          <div style={styles.drawerGrid}>
            <div style={styles.drawerItem}><span style={styles.drawerKey}>Name</span><span style={styles.drawerVal}>{clientFull.data?.displayName || homeownerSummary?.displayName || '—'}</span></div>
            <div style={styles.drawerItem}><span style={styles.drawerKey}>Email</span><span style={styles.drawerVal}>{clientFull.loading ? 'Loading…' : (clientFull.data?.email || homeownerSummary?.emailMasked || '—')}</span></div>
            <div style={styles.drawerItem}><span style={styles.drawerKey}>Phone</span><span style={styles.drawerVal}>{clientFull.loading ? 'Loading…' : (clientFull.data?.phone || '—')}</span></div>
            <div style={styles.drawerItem}><span style={styles.drawerKey}>Status</span><span style={styles.drawerVal}>{clientFull.data?.status || homeownerSummary?.status || '—'}</span></div>
            <div style={styles.drawerItem}><span style={styles.drawerKey}>Signup date</span><span style={styles.drawerVal}>{clientFull.data?.createdAt ? new Date(clientFull.data.createdAt).toLocaleDateString('en-AU') : '—'}</span></div>
            <div style={styles.drawerItem}><span style={styles.drawerKey}>Last login</span><span style={styles.drawerVal}>{clientFull.data?.lastLogin ? new Date(clientFull.data.lastLogin).toLocaleString('en-AU') : '—'}</span></div>
          </div>
          <div style={styles.drawerFooter}>
            <Link
              to={`/admin/dashboard?tab=jobs&clientUid=${encodeURIComponent(homeownerUid)}`}
              style={styles.drawerLinkBtn}
              onClick={onClose}
            >
              View this client’s tasks
            </Link>
            <Link to={`/admin/user/${homeownerUid}`} style={styles.drawerLinkBtn} onClick={onClose}>
              View full details
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
