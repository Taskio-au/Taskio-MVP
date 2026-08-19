import React from 'react';
import StatusTag from '../../../StatusTag';
import ExpertiseChips from '../../../components/ExpertiseChips';
import { canonicalExpertiseLabelMap } from '../../../constants/taskTaxonomy';
import { formatAgeShort } from '../../../utils/adminOps';
import { isAbnRequirementSatisfied } from '../../../utils/profileCompliance';

function trustChip(label, ok) {
  return (
    <span
      style={{
        fontSize: 10,
        fontWeight: 900,
        padding: '2px 8px',
        borderRadius: 999,
        border: ok ? '1px solid #a7f3d0' : '1px solid #fecdd3',
        background: ok ? '#ecfdf5' : '#fff1f2',
        color: ok ? '#065f46' : '#9f1239',
      }}
    >
      {label}
    </span>
  );
}

export default function TradiesTab({
  tradieOpenTasks = {},
  filteredTradies,
  tradieSearchTerm,
  setTradieSearchTerm,
  tradieQuickFilter,
  setTradieQuickFilter,
  expertiseFilter,
  setExpertiseFilter,
  expertiseOptions,
  styles,
  navigate,
  openTradieDrawer,
  openUserOpsModal,
}) {
  return (
    <div style={styles.card}>
      <div style={styles.cardHeader}>
        <h2 style={styles.sectionTitle}>Experts ({filteredTradies.length})</h2>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
          <input
            type="text"
            placeholder="Search experts..."
            value={tradieSearchTerm}
            onChange={(e) => setTradieSearchTerm(e.target.value)}
            style={styles.searchInput}
          />
          <select value={tradieQuickFilter} onChange={(e) => setTradieQuickFilter(e.target.value)} style={styles.select}>
            <option value="">All</option>
            <option value="ready_now">Ready now (eligible to quote)</option>
            <option value="verified_stripe">Verified + Stripe complete</option>
            <option value="active_7d">Active in last 7 days (beta)</option>
            <option value="boosted">Boosted</option>
          </select>
          <select
            value={expertiseFilter}
            onChange={(e) => setExpertiseFilter(e.target.value)}
            style={styles.select}
          >
            {expertiseOptions.map((opt) => (
              <option key={opt} value={opt}>
                {opt === 'all' ? 'All task types' : (canonicalExpertiseLabelMap[opt] || opt)}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div style={styles.scrollableList}>
        {filteredTradies.length > 0 ? (
          <ul style={styles.list}>
            {filteredTradies.map((u) => (
              <li key={u.uid} style={styles.userRow} onClick={() => navigate(`/admin/user/${u.uid}`)}>
                <div>
                  <div style={{ fontWeight: 600 }}>
                    {u.displayName || u.emailMasked || '(No name)'}
                  </div>
                  <div style={styles.smallText}>{u.emailMasked}</div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center', marginTop: 6 }}>
                    {trustChip('Trust', !!u.verified)}
                    {trustChip('Stripe', u.stripeOnboardingComplete === true || u.stripeOnboardingStatus === 'completed')}
                    {trustChip('ABN', isAbnRequirementSatisfied(u))}
                    {u.verificationReviewRequired === true ? (
                      <span style={{ fontSize: 10, fontWeight: 900, padding: '2px 8px', borderRadius: 999, border: '1px solid #fde68a', background: '#fffbeb', color: '#92400e' }}>Review</span>
                    ) : null}
                  </div>
                  <div style={styles.smallText}>
                    {Array.isArray(u?.expertiseApproved) && u.expertiseApproved.length > 0 ? (<><ExpertiseChips user={u} styles={styles} /> <span style={styles.smallDot}>•</span> </>) : null}
                    Open tasks: <strong>{tradieOpenTasks[u.uid] || 0}</strong>
                    {' '}• Status: <StatusTag status={u.status} />
                    {' '}• Last active: {formatAgeShort(u.updatedAtMs)} <span style={styles.betaTiny}>beta</span>
                    {' '}• Last quote: {formatAgeShort(u.lastQuoteSubmittedAtMs)} <span style={styles.betaTiny}>beta</span>
                  </div>
                  {!!u.adminNote && (
                    <div style={{ marginTop: 6, fontSize: 12, color: '#6B7280' }}>
                      Note: {u.adminNote}
                    </div>
                  )}
                </div>

                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                  <button style={styles.buttonSecondary} onClick={(e) => openTradieDrawer(e, u)}>
                    Details
                  </button>
                  <button style={styles.buttonSecondary} onClick={(e) => openUserOpsModal(e, u)}>
                    Ops note
                  </button>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p style={{ padding: 16, textAlign: 'center', opacity: 0.6 }}>
            {tradieSearchTerm || expertiseFilter !== 'all' ? 'No experts match your filters.' : 'No experts found.'}
          </p>
        )}
      </div>
    </div>
  );
}
