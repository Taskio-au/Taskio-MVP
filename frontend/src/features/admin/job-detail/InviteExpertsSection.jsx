import React from 'react';
import VerificationBadge from '../../../VerificationBadge';
import { canonicalExpertiseLabelMap } from '../../../constants/taskTaxonomy';
import { NUDGE_COOLDOWN_HOURS, toMillis } from '../../../utils/adminOps';

export default function InviteExpertsSection({
  isMonitoringView,
  styles,
  expertiseFilter,
  onExpertiseFilterChange,
  expertiseOptions,
  onInviteSelected,
  selectedInviteUids,
  bulkInviting,
  filteredAvailableTradies,
  onToggleInviteSelection,
  onOpenExpertDrawer,
  invitedTradies,
  invitesMap,
  nowMs,
  nudgingUid,
  onNudgeExpert,
  unassigning,
  onUnassign,
}) {
  if (isMonitoringView) return null;

  return (
    <div style={styles.card} id="invite">
      <div style={{ ...styles.cardHeader, marginBottom: 10 }}>
        <h2 style={styles.sectionTitle}>Invite Experts</h2>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <select value={expertiseFilter} onChange={(e) => onExpertiseFilterChange(e.target.value)} style={styles.filterSelect}>
            {expertiseOptions.map((opt) => (
              <option key={opt} value={opt}>
                {opt === 'all' ? 'All task types' : (canonicalExpertiseLabelMap[opt] || opt)}
              </option>
            ))}
          </select>
          <button
            type="button"
            style={styles.primaryButton}
            onClick={onInviteSelected}
            disabled={bulkInviting || selectedInviteUids.length === 0}
            title={selectedInviteUids.length === 0 ? 'Select at least one expert' : ''}
          >
            {bulkInviting ? 'Inviting…' : `Invite selected (${selectedInviteUids.length})`}
          </button>
        </div>
      </div>

      {filteredAvailableTradies.length > 0 ? (
        <ul style={styles.list}>
          {filteredAvailableTradies.map((t) => (
            <li key={t.uid} style={styles.listItem}>
              <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                <input
                  type="checkbox"
                  checked={selectedInviteUids.includes(t.uid)}
                  onChange={() => onToggleInviteSelection(t.uid)}
                  style={{ marginTop: 4 }}
                />
                <div style={styles.userCell}>
                  <div style={{ fontWeight: 900 }}>{t.displayName || t.emailMasked || t.uid}</div>
                  <div style={styles.userMeta}>
                    <span>{t.emailMasked}</span>
                    <span>•</span>
                    <VerificationBadge verified={t.verified} />
                    <span>•</span>
                    <span>Stripe: {t.stripeOnboardingStatus || 'n/a'}</span>
                    <span>•</span>
                    <button
                      type="button"
                      onClick={() => onOpenExpertDrawer(t.uid)}
                      style={styles.inlineLinkBtn}
                      title="Quick view"
                    >
                      Details
                    </button>
                  </div>
                  {Array.isArray(t.expertiseApproved) && t.expertiseApproved.length > 0 ? (
                    <div style={{ marginTop: 6, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                      {t.expertiseApproved.slice(0, 4).map((k) => (
                        <span key={k} style={styles.matchChip}>{canonicalExpertiseLabelMap[k] || k}</span>
                      ))}
                      {t.expertiseApproved.length > 4 ? <span style={styles.betaTiny}>+{t.expertiseApproved.length - 4} more</span> : null}
                    </div>
                  ) : null}
                </div>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <div style={{ fontSize: 13, color: '#666' }}>No available experts match the criteria.</div>
      )}

      <div style={{ marginTop: 14 }}>
        <div style={{ fontWeight: 900, marginBottom: 8 }}>Invited experts ({invitedTradies.length})</div>
        {invitedTradies.length === 0 ? (
          <div style={{ fontSize: 13, color: '#666' }}>No invites yet.</div>
        ) : (
          <ul style={styles.list}>
            {invitedTradies.map((t) => {
              const inv = invitesMap?.[t.uid] || {};
              const invitedAtMs = toMillis(inv.invitedAt);
              const nudgedAtMs = toMillis(inv.lastNudgedAt);
              const canNudge = !nudgedAtMs || ((nowMs - nudgedAtMs) / (1000 * 60 * 60) >= NUDGE_COOLDOWN_HOURS);
              return (
                <li key={t.uid} style={styles.listItem}>
                  <div style={styles.userCell}>
                    <div style={{ fontWeight: 900 }}>{t.displayName || t.emailMasked || t.uid}</div>
                    <div style={styles.userMeta}>
                      <span>{t.emailMasked}</span>
                      <span>•</span>
                      <VerificationBadge verified={t.verified} />
                      <span>•</span>
                      <span>Stripe: {t.stripeOnboardingStatus || 'n/a'}</span>
                      <span>•</span>
                      <span>Invited: {invitedAtMs ? new Date(invitedAtMs).toLocaleString('en-AU') : '—'}</span>
                      <span>•</span>
                      <span>Last nudge: {nudgedAtMs ? new Date(nudgedAtMs).toLocaleString('en-AU') : '—'}</span>
                      <span>•</span>
                      <button
                        type="button"
                        onClick={() => onOpenExpertDrawer(t.uid)}
                        style={styles.inlineLinkBtn}
                        title="Quick view"
                      >
                        Details
                      </button>
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <button
                      type="button"
                      style={styles.buttonSecondary}
                      onClick={() => onNudgeExpert(t.uid)}
                      disabled={nudgingUid === t.uid || !canNudge}
                      title={!canNudge ? `Nudge available after ${NUDGE_COOLDOWN_HOURS}h cooldown` : ''}
                    >
                      {nudgingUid === t.uid ? 'Nudging…' : 'Nudge again'}
                    </button>
                    <button
                      onClick={() => onUnassign(t.uid)}
                      disabled={unassigning === t.uid}
                      style={styles.buttonSecondary}
                    >
                      {unassigning === t.uid ? 'Removing…' : 'Remove'}
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
