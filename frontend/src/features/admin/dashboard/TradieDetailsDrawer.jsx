import React, { memo } from 'react';
import { useNavigate } from 'react-router-dom';
import VerificationBadge from '../../../VerificationBadge';
import ExpertiseChips from '../../../components/ExpertiseChips';
import { getReadiness } from '../../../utils/adminDashboardUtils';

function TradieDetailsDrawer({
  open,
  styles,
  closeDrawer,
  drawerTradie,
  drawerUid,
  tradieNoteRef,
  userOpsNote,
  onUserOpsNoteChange,
  tradieNoteErr,
  tradieNoteUpdatedAtMs,
  tradieNoteUpdatedByName,
  formatAgeShort,
  saveTradieNote,
  tradieNoteSaving,
  tradieNoteInitial,
  onVerify,
  onRequestStatusChange,
  onRequestBoostToggle,
  onOpenInviteModal,
}) {
  const navigate = useNavigate();
  if (!open) return null;

  return (
    <div style={styles.drawerOverlay} onMouseDown={closeDrawer}>
      <div style={styles.drawerPanel} onMouseDown={(e) => e.stopPropagation()}>
        <div style={styles.drawerHeader}>
          <div style={{ minWidth: 0 }}>
            <div style={styles.drawerTitle}>Expert details</div>
            <div style={styles.drawerSubtitle}>
              {drawerTradie?.displayName || drawerTradie?.emailMasked || drawerTradie?.uid || drawerUid}
            </div>
          </div>
          <button type="button" onClick={closeDrawer} style={styles.drawerCloseBtn} aria-label="Close">×</button>
        </div>

        {!drawerTradie ? (
          <div style={{ padding: 14, fontSize: 13, color: '#6B7280' }}>Details unavailable.</div>
        ) : (
          <div style={{ padding: 14, overflowY: 'auto' }}>
            <div style={styles.drawerSection}>
              <div style={styles.drawerSectionTitle}>Readiness</div>
              {(() => {
                const r = getReadiness(drawerTradie);
                return (
                  <>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'center', marginBottom: 10 }}>
                      <div style={{ fontWeight: 900, color: '#111827' }}>Readiness status</div>
                      <span style={{ ...styles.readinessPill, ...(r.tone === 'success' ? styles.readinessOk : styles.readinessWarn) }}>
                        {r.statusLabel}
                      </span>
                    </div>
                    {r.missing.length > 0 ? (
                      <div style={{ marginBottom: 10 }}>
                        <div style={{ fontSize: 12, fontWeight: 900, color: '#6B7280', marginBottom: 6 }}>Missing</div>
                        <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13, color: '#374151' }}>
                          {r.missing.map((m) => <li key={m}>{m}</li>)}
                        </ul>
                      </div>
                    ) : null}

                    <div style={styles.drawerGrid}>
                      <div style={styles.drawerItem}>
                        <span style={styles.drawerKey}>
                          Platform verified
                          <span style={styles.helpDot} title="Reviewed by Taskio admin. This does not confirm trade licensing.">?</span>
                        </span>
                        <span style={styles.drawerVal}><VerificationBadge verified={drawerTradie.verified} /></span>
                      </div>
                      <div style={styles.drawerItem}><span style={styles.drawerKey}>Stripe</span><span style={styles.drawerVal}>{drawerTradie.stripeOnboardingStatus || 'n/a'}</span></div>
                      {drawerTradie.phoneVerified !== undefined ? (
                        <div style={styles.drawerItem}><span style={styles.drawerKey}>Phone verification</span><span style={styles.drawerVal}>{drawerTradie.phoneVerified === true ? 'Yes' : 'No'}</span></div>
                      ) : null}
                      {drawerTradie.abnVerified !== undefined ? (
                        <div style={styles.drawerItem}><span style={styles.drawerKey}>ABN verification</span><span style={styles.drawerVal}>{drawerTradie.abnVerified === true ? 'Yes' : 'No'}</span></div>
                      ) : null}
                      {drawerTradie.is18PlusConfirmed !== undefined ? (
                        <div style={styles.drawerItem}><span style={styles.drawerKey}>18+ confirmed</span><span style={styles.drawerVal}>{drawerTradie.is18PlusConfirmed === true ? 'Yes' : 'No'}</span></div>
                      ) : null}
                      {drawerTradie.profileCompleted !== undefined ? (
                        <div style={styles.drawerItem}><span style={styles.drawerKey}>Profile completion</span><span style={styles.drawerVal}>{drawerTradie.profileCompleted === true ? 'Yes' : 'No'}</span></div>
                      ) : null}
                      <div style={styles.drawerItem}><span style={styles.drawerKey}>Has expertise</span><span style={styles.drawerVal}>{Array.isArray(drawerTradie.expertiseApproved) && drawerTradie.expertiseApproved.length > 0 ? 'Yes' : 'No'}</span></div>
                    </div>
                  </>
                );
              })()}
            </div>

            <div style={styles.drawerSection}>
              <div style={styles.drawerSectionTitle}>Activity</div>
              <div style={styles.drawerGrid}>
                <div style={styles.drawerItem}><span style={styles.drawerKey}>Last active</span><span style={styles.drawerVal}>{formatAgeShort(drawerTradie.updatedAtMs)} <span style={styles.betaTiny}>beta</span></span></div>
                <div style={styles.drawerItem}><span style={styles.drawerKey}>Last quote</span><span style={styles.drawerVal}>{formatAgeShort(drawerTradie.lastQuoteSubmittedAtMs)} <span style={styles.betaTiny}>beta</span></span></div>
              </div>
            </div>

            <div style={styles.drawerSection}>
              <div style={styles.drawerSectionTitle}>Expertise</div>
              {Array.isArray(drawerTradie.expertiseApproved) && drawerTradie.expertiseApproved.length > 0
                ? <ExpertiseChips user={drawerTradie} styles={styles} />
                : <div style={{ fontSize: 13, color: '#6B7280' }}>No expertise selected.</div>}
            </div>

            <div style={styles.drawerSection}>
              <div style={styles.drawerSectionTitle}>Admin note</div>
              <textarea
                ref={tradieNoteRef}
                value={userOpsNote}
                onChange={(e) => onUserOpsNoteChange(e.target.value)}
                rows={4}
                placeholder="Internal admin note…"
                style={styles.drawerTextarea}
              />
              {tradieNoteErr ? (
                <div style={{ marginTop: 8, fontSize: 13, color: '#9f1239', fontWeight: 700 }}>
                  {tradieNoteErr}
                </div>
              ) : null}
              <div style={{ marginTop: 8, fontSize: 12, color: '#6B7280' }}>
                Last updated: <span style={{ fontWeight: 900 }}>{tradieNoteUpdatedAtMs ? formatAgeShort(tradieNoteUpdatedAtMs) : '—'}</span>
                {' '}by <span style={{ fontWeight: 900 }}>{tradieNoteUpdatedByName || '—'}</span>
              </div>
              <div style={{ marginTop: 10, display: 'flex', justifyContent: 'flex-end' }}>
                <button
                  type="button"
                  style={styles.buttonSecondary}
                  onClick={saveTradieNote}
                  disabled={
                    tradieNoteSaving
                    || !drawerTradie.uid
                    || String(userOpsNote || '') === String(tradieNoteInitial || '')
                  }
                  title={String(userOpsNote || '') === String(tradieNoteInitial || '') ? 'No changes to save' : ''}
                >
                  {tradieNoteSaving ? 'Saving…' : 'Save note'}
                </button>
              </div>
            </div>

            <div style={styles.drawerFooter}>
              {!drawerTradie.verified && (
                <button type="button" style={styles.button} onClick={() => onVerify(drawerTradie.uid)}>
                  Verify
                </button>
              )}
              <button type="button" style={styles.buttonSecondary} onClick={() => onRequestStatusChange(null, drawerTradie)}>
                {drawerTradie.status === 'active' ? 'Disable' : 'Activate'}
              </button>
              <button
                type="button"
                style={(drawerTradie?.boost?.isBoosted === true || drawerTradie.boostedVisibility === true) ? styles.boostBtnActive : styles.boostBtn}
                onClick={() => onRequestBoostToggle(drawerTradie)}
                title="Moves this expert to the top of invite lists. MVP feature."
              >
                {(drawerTradie?.boost?.isBoosted === true || drawerTradie.boostedVisibility === true)
                  ? 'Boosted (click to remove)'
                  : 'Boost (prioritise for invites)'}
              </button>
              <div style={{ fontSize: 12, color: '#6B7280' }}>
                Moves this expert to the top of invite lists. MVP feature.
              </div>

              <button type="button" style={styles.button} onClick={() => onOpenInviteModal(drawerTradie)}>
                Invite to task…
              </button>
              <button type="button" style={styles.buttonSecondary} onClick={() => { closeDrawer(); navigate(`/admin/user/${drawerTradie.uid}`); }}>
                View full details
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default memo(TradieDetailsDrawer);
