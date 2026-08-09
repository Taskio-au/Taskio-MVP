import React from 'react';
import { Link } from 'react-router-dom';
import VerificationBadge from '../../../VerificationBadge';
import { canonicalExpertiseLabelMap } from '../../../constants/taskTaxonomy';
import { formatAgeShort } from '../../../utils/adminOps';

export default function ExpertDetailsDrawer({
  open,
  onClose,
  styles,
  drawerExpert,
  expertUid,
  selectedInviteUids,
  invitedTradieUids,
  onToggleInviteSelection,
  onInviteNow,
  bulkInviting,
}) {
  if (!open) return null;

  return (
    <div style={styles.drawerOverlay} onMouseDown={onClose}>
      <div style={styles.drawerPanel} onMouseDown={(e) => e.stopPropagation()}>
        <div style={styles.drawerHeader}>
          <div style={{ minWidth: 0 }}>
            <div style={styles.drawerTitle}>Expert details</div>
            <div style={styles.drawerSubtitle}>
              {drawerExpert?.displayName || drawerExpert?.emailMasked || drawerExpert?.uid || expertUid}
            </div>
          </div>
          <button type="button" onClick={onClose} style={styles.drawerCloseBtn} aria-label="Close">
            ×
          </button>
        </div>

        {!drawerExpert ? (
          <div style={{ padding: 14, fontSize: 13, color: '#6B7280' }}>
            Details unavailable.
          </div>
        ) : (
          <div style={{ padding: 14, overflowY: 'auto' }}>
            <div style={styles.drawerSection}>
              <div style={styles.drawerSectionTitle}>Readiness</div>
              <div style={styles.drawerGrid}>
                <div style={styles.drawerItem}><span style={styles.drawerKey}>Verified</span><span style={styles.drawerVal}><VerificationBadge verified={drawerExpert.verified} /></span></div>
                <div style={styles.drawerItem}><span style={styles.drawerKey}>Stripe</span><span style={styles.drawerVal}>{drawerExpert.stripeOnboardingStatus || 'n/a'}</span></div>
                <div style={styles.drawerItem}><span style={styles.drawerKey}>Phone verified</span><span style={styles.drawerVal}>{drawerExpert.phoneVerified === true ? 'Yes' : 'No'}</span></div>
                <div style={styles.drawerItem}><span style={styles.drawerKey}>ABN verified</span><span style={styles.drawerVal}>{drawerExpert.abnVerified === true ? 'Yes' : 'No'}</span></div>
                <div style={styles.drawerItem}><span style={styles.drawerKey}>Profile complete</span><span style={styles.drawerVal}>{drawerExpert.profileCompleted === true ? 'Yes' : 'No'}</span></div>
              </div>
            </div>

            <div style={styles.drawerSection}>
              <div style={styles.drawerSectionTitle}>Activity</div>
              <div style={styles.drawerGrid}>
                <div style={styles.drawerItem}><span style={styles.drawerKey}>Last active</span><span style={styles.drawerVal}>{formatAgeShort(drawerExpert.updatedAtMs)} <span style={styles.betaTiny}>beta</span></span></div>
                <div style={styles.drawerItem}><span style={styles.drawerKey}>Last quote</span><span style={styles.drawerVal}>{formatAgeShort(drawerExpert.lastQuoteSubmittedAtMs)} <span style={styles.betaTiny}>beta</span></span></div>
              </div>
            </div>

            <div style={styles.drawerSection}>
              <div style={styles.drawerSectionTitle}>Expertise</div>
              {Array.isArray(drawerExpert.expertiseApproved) && drawerExpert.expertiseApproved.length > 0 ? (
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {drawerExpert.expertiseApproved.slice(0, 12).map((k) => (
                    <span key={k} style={styles.matchChip}>{canonicalExpertiseLabelMap[k] || k}</span>
                  ))}
                  {drawerExpert.expertiseApproved.length > 12 ? (
                    <span style={styles.betaTiny}>+{drawerExpert.expertiseApproved.length - 12} more</span>
                  ) : null}
                </div>
              ) : (
                <div style={{ fontSize: 13, color: '#6B7280' }}>No expertise selected.</div>
              )}
            </div>

            {!!drawerExpert.adminNote && (
              <div style={styles.drawerSection}>
                <div style={styles.drawerSectionTitle}>Admin note</div>
                <div style={styles.drawerNoteBox}>{drawerExpert.adminNote}</div>
              </div>
            )}

            <div style={styles.drawerFooter}>
              <button
                type="button"
                style={selectedInviteUids.includes(drawerExpert.uid) ? styles.drawerBtnActive : styles.drawerBtn}
                onClick={() => onToggleInviteSelection(drawerExpert.uid)}
                disabled={(invitedTradieUids || []).includes(drawerExpert.uid)}
                title={(invitedTradieUids || []).includes(drawerExpert.uid) ? 'Already invited' : 'Toggle selection'}
              >
                {((invitedTradieUids || []).includes(drawerExpert.uid))
                  ? 'Already invited'
                  : (selectedInviteUids.includes(drawerExpert.uid) ? 'Selected for invite' : 'Select for invite')}
              </button>

              <button
                type="button"
                style={styles.primaryButton}
                onClick={() => onInviteNow(drawerExpert.uid)}
                disabled={bulkInviting || (invitedTradieUids || []).includes(drawerExpert.uid)}
                title={(invitedTradieUids || []).includes(drawerExpert.uid) ? 'Already invited' : 'Send invite now'}
              >
                {bulkInviting ? 'Inviting…' : 'Invite now'}
              </button>

              <Link to={`/admin/user/${drawerExpert.uid}`} style={styles.drawerLinkBtn} onClick={onClose}>
                View full details
              </Link>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
