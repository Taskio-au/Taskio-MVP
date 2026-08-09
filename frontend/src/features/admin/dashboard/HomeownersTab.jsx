import React from 'react';
import StatusTag from '../../../StatusTag';
import VerificationBadge from '../../../VerificationBadge';
import { formatAgeShort } from '../../../utils/adminOps';

export default function ClientsTab({
  filteredHomeowners,
  homeownerSearchTerm,
  setHomeownerSearchTerm,
  homeownerQuickFilter,
  setHomeownerQuickFilter,
  styles,
  navigate,
  countsByClientUid,
  openClientDrawer,
  openClientDrawerToNote,
}) {
  return (
    <div style={styles.card}>
      <div style={styles.cardHeader}>
        <h2 style={styles.sectionTitle}>Clients ({filteredHomeowners.length})</h2>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
          <input
            type="text"
            placeholder="Search clients..."
            value={homeownerSearchTerm}
            onChange={(e) => setHomeownerSearchTerm(e.target.value)}
            style={styles.searchInput}
          />
          <select value={homeownerQuickFilter} onChange={(e) => setHomeownerQuickFilter(e.target.value)} style={styles.select}>
            <option value="">All</option>
            <option value="new">New (≤1 task)</option>
            <option value="repeat">Repeat (2+ tasks)</option>
            <option value="inactive">Inactive 30d (beta)</option>
          </select>
        </div>
      </div>

      <div style={styles.scrollableList}>
        {filteredHomeowners.length > 0 ? (
          <ul style={styles.list}>
            {filteredHomeowners.map((u) => (
              <li key={u.uid} style={styles.userRow} onClick={() => navigate(`/admin/user/${u.uid}`)}>
                <div>
                  <div style={{ fontWeight: 600 }}>
                    {u.displayName || u.emailMasked || '(No name)'}
                  </div>
                  <div style={styles.smallText}>{u.emailMasked}</div>
                  <div style={styles.smallText}>
                    {(() => {
                      const posted = countsByClientUid[u.uid]?.posted || 0;
                      const completed = countsByClientUid[u.uid]?.completed || 0;
                      return (
                        <>
                          Status: <StatusTag status={u.status} /> • Verified: <VerificationBadge verified={u.verified} />
                          {' '}• Tasks: <span style={{ fontWeight: 800 }}>{posted}</span> • Completed: <span style={{ fontWeight: 800 }}>{completed}</span>
                          {' '}• Last active: <span style={{ fontWeight: 800 }}>{formatAgeShort(u.updatedAtMs)} <span style={styles.betaTiny}>beta</span></span>
                        </>
                      );
                    })()}
                  </div>
                  {!!u.adminNote && (
                    <div style={{ marginTop: 6, fontSize: 12, color: '#6B7280', display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                      <span style={{ fontWeight: 900 }}>Admin&apos;s Note:</span>
                      <span style={{ maxWidth: 520, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {u.adminNote}
                      </span>
                      <button type="button" style={styles.inlineLinkBtn} onClick={(e) => openClientDrawerToNote(e, u)}>Edit</button>
                    </div>
                  )}
                  {!u.adminNote && (
                    <div style={{ marginTop: 6, fontSize: 12, color: '#6B7280', display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                      <span style={{ fontWeight: 900 }}>Admin&apos;s Note:</span>
                      <span>—</span>
                      <button type="button" style={styles.inlineLinkBtn} onClick={(e) => openClientDrawerToNote(e, u)}>Add note</button>
                    </div>
                  )}
                </div>

                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                  <button style={styles.buttonSecondary} onClick={(e) => openClientDrawer(e, u)}>
                    Details
                  </button>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p style={{ padding: 16, textAlign: 'center', opacity: 0.6 }}>
            {homeownerSearchTerm ? 'No clients match your search.' : 'No clients found.'}
          </p>
        )}
      </div>
    </div>
  );
}
