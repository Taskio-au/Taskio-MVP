import React from 'react';
import { Link } from 'react-router-dom';
import VerificationBadge from '../../../VerificationBadge';

export default function SelectedExpertSection({
  job,
  selectedTradie,
  styles,
}) {
  return (
    <details open={!!job.acceptedTradieUid} style={styles.detailsWrap}>
      <summary style={styles.detailsSummary}>Selected Expert (accepted quote)</summary>
      <div style={{ marginTop: 12 }}>
        {!job.acceptedTradieUid ? (
          <div style={{ fontSize: 13, color: '#666' }}>
            No expert selected yet. This appears after the Client accepts a quote and secures payment.
          </div>
        ) : selectedTradie ? (
          <div style={styles.listItem}>
            <div style={styles.userCell}>
              <div style={{ fontWeight: 600 }}>
                {selectedTradie.displayName || selectedTradie.emailMasked || selectedTradie.uid}
              </div>
              <div style={styles.userMeta}>
                <span>{selectedTradie.emailMasked}</span>
                <span>•</span>
                <VerificationBadge verified={selectedTradie.verified} />
                <span>•</span>
                <span>Stripe: {selectedTradie.stripeOnboardingStatus || 'n/a'}</span>
                <span>•</span>
                <Link to={`/admin/user/${selectedTradie.uid}`} style={styles.viewUserLink}>View details</Link>
              </div>
            </div>
            <div style={{ fontSize: 12, color: '#666', textAlign: 'right' }}>
              <div><strong>Payment:</strong> {job.paymentState || '—'}</div>
              <div><strong>Status:</strong> {job.status}</div>
            </div>
          </div>
        ) : (
          <div style={{ fontSize: 13, color: '#666' }}>
            Selected expert UID: <span style={{ fontFamily: 'monospace' }}>{job.acceptedTradieUid}</span>
          </div>
        )}
      </div>
    </details>
  );
}
