import React from 'react';
import { tradieDangerStyles as styles } from './tradieAccountDangerStyles';

/**
 * Destructive account actions for experts (tradies). Presentation only; handlers come from useAccountDangerActions.
 */
export default function TradieAccountDangerZone({
  profile,
  deactivateBusy,
  deleteBusy,
  onDeactivate,
  onStartDeletion,
  onCancelDeletion,
}) {
  return (
    <div style={styles.dangerCard}>
      <div style={styles.dangerHeader}>
        <span style={styles.dangerIcon} aria-hidden="true">⚠️</span>
        <div>
          <div style={styles.dangerTitle}>Need to step away?</div>
          <div className="pp-danger-block-top">
            <div style={styles.dangerSubtitleBold}>Deactivate your account</div>
            <div style={styles.dangerSubtitle}>
              This hides your account right away without deleting your data. You can reactivate it later by contacting support.
            </div>
          </div>
          <div className="pp-danger-block">
            <div style={styles.dangerSubtitleBold}>Request permanent deletion</div>
            <div style={styles.dangerSubtitle}>
              This permanently removes your public profile and anonymises personal data. Some financial and legal records are kept when required by law, and the request may be paused if you still have active work or pending payouts.
            </div>
          </div>
        </div>
      </div>

      <div style={styles.dangerActions}>
        <button
          type="button"
          style={styles.deactivateButton}
          onClick={onDeactivate}
          disabled={deactivateBusy}
        >
          {deactivateBusy ? 'Deactivating…' : 'Deactivate account'}
        </button>
        <button type="button" style={styles.deleteButton} onClick={onStartDeletion}>
          Request permanent deletion
        </button>
        {profile?.status === 'pending_deletion' && (
          <button
            type="button"
            style={styles.cancelDeleteButton}
            onClick={onCancelDeletion}
            disabled={deleteBusy}
          >
            {deleteBusy ? 'Cancelling…' : 'Cancel deletion'}
          </button>
        )}
      </div>
    </div>
  );
}
