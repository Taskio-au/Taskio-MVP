import React, { useCallback, useEffect, useState } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { auth } from './firebase';
import AppHeader from './components/AppHeader';
import { createApiClient } from './api/createApiClient';
import { getRoleDisplayLabel } from './utils/roleLabels';
const api = createApiClient({ forceRefreshToken: true });

/** Matches shared/feePlans test program id — only sent when build is non-production. */
const FOUNDING_EXPERT_TEST_PROGRAM_ID = 'melbourne_founding_expert_test_2026';

function formatDate(ms) {
  if (!ms) return 'N/A';
  try {
    return new Date(ms).toLocaleString('en-AU');
  } catch {
    return 'N/A';
  }
}

function roleLabel(role) {
  return getRoleDisplayLabel(role);
}

function statusLabel(status) {
  if (status === 'active') return 'Active';
  if (status === 'suspended') return 'Suspended';
  return status || 'Unknown';
}

function statusTone(status) {
  if (status === 'active') return styles.statusOk;
  if (status === 'suspended') return styles.statusWarn;
  return styles.statusNeutral;
}

function feeStageReadable(stage) {
  if (stage === 'founding_first_three') return 'First 3 jobs — 0%';
  if (stage === 'founding_reduced' || stage === 'founding_reduced_fee') return 'Reduced fee — 7.5%';
  if (stage === 'standard_launch') return 'Standard launch — 10%';
  if (!stage || String(stage).trim() === '') return null;
  return String(stage).replace(/_/g, ' ');
}

function FoundingEligibilityChecklist({ eligibility }) {
  if (!eligibility) return null;
  const rows = [
    {
      pass: eligibility.isExpert && eligibility.isActive,
      ok: 'Active Expert',
      fail: 'Account not active',
    },
    { pass: eligibility.isPlatformVerified, ok: 'Platform verified', fail: 'Platform verification incomplete' },
    { pass: eligibility.isStripePayoutReady, ok: 'Stripe payouts enabled', fail: 'Stripe payouts not ready' },
    {
      pass: eligibility.isMelbournePilotArea,
      ok: 'Melbourne launch area',
      fail: eligibility.hasServiceAreaOnFile === false
        ? 'No service location on file'
        : 'Not in Melbourne launch area',
    },
    { pass: eligibility.hasApprovedExpertise, ok: 'Approved task categories', fail: 'No approved task categories' },
  ];

  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ ...styles.label, marginBottom: 8 }}>Eligibility</div>
      <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'grid', gap: 6 }}>
        {rows.map((r) => (
          <li
            key={r.ok}
            style={r.pass ? styles.eligibilityOkRow : styles.eligibilityWarnRow}
          >
            {r.pass ? '✓ ' : '– '}
            {r.pass ? r.ok : r.fail}
          </li>
        ))}
      </ul>
      {!eligibility.eligible && Array.isArray(eligibility.reasons) && eligibility.reasons.length > 0 ? (
        <div style={styles.eligibilityReasons}>
          {eligibility.reasons.join(' · ')}
        </div>
      ) : null}
    </div>
  );
}

function foundingPanelMessageFromError(error) {
  const status = error?.response?.status;
  const code = error?.response?.data?.code;
  const message = error?.response?.data?.message || '';

  if (status === 403) {
    return 'You do not have permission to modify Founding Expert enrolment.';
  }
  if (code === 'CAP_FULL' || message.toLowerCase().includes('full')) {
    return 'Founding Expert cohort is full.';
  }
  if (code === 'NOT_TRADIE') {
    return 'This account is not an Expert; Founding Expert enrolment only applies to Experts.';
  }
  if (status === 400 && message) return message;
  return message || 'Request failed.';
}

export default function AdminUserDetail() {
  const { uid } = useParams();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [user, setUser] = useState(null);
  const [foundingBusy, setFoundingBusy] = useState(false);
  const [foundingBanner, setFoundingBanner] = useState('');
  const [foundingError, setFoundingError] = useState('');

  const reloadUser = useCallback(async () => {
    const res = await api.get(`/api/admin/users/${uid}`);
    setUser(res.data);
  }, [uid]);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        setError('');
        setLoading(true);
        const res = await api.get(`/api/admin/users/${uid}`);
        if (!cancelled) setUser(res.data);
      } catch (e) {
        if (!cancelled) setError(e?.response?.data?.message || 'Failed to load user details.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [uid]);

  async function handleFoundingEnrol() {
    setFoundingError('');
    setFoundingBanner('');
    setFoundingBusy(true);
    try {
      const useTestProgram = process.env.NODE_ENV !== 'production';
      await api.post(
        `/api/admin/experts/${uid}/founding-expert/approve`,
        useTestProgram ? { programId: FOUNDING_EXPERT_TEST_PROGRAM_ID } : undefined
      );
      await reloadUser();
      setFoundingBanner('Founding Expert enrolment updated.');
    } catch (e) {
      setFoundingError(foundingPanelMessageFromError(e));
    } finally {
      setFoundingBusy(false);
    }
  }

  async function handleFoundingRemove() {
    setFoundingError('');
    setFoundingBanner('');
    setFoundingBusy(true);
    try {
      await api.post(`/api/admin/experts/${uid}/founding-expert/remove`);
      await reloadUser();
      setFoundingBanner('Removed from Founding Expert program.');
    } catch (e) {
      setFoundingError(foundingPanelMessageFromError(e));
    } finally {
      setFoundingBusy(false);
    }
  }

  const currentUser = auth.currentUser;

  if (loading) return (
    <>
      <AppHeader userRole="admin" userName={currentUser?.displayName || ''} userEmail={currentUser?.email || ''} />
      <div style={styles.centered}>Loading user…</div>
    </>
  );
  
  if (error) return (
    <>
      <AppHeader userRole="admin" userName={currentUser?.displayName || ''} userEmail={currentUser?.email || ''} />
      <div style={{ ...styles.centered, color: '#DC3545' }}>{error}</div>
    </>
  );
  
  if (!user) return (
    <>
      <AppHeader userRole="admin" userName={currentUser?.displayName || ''} userEmail={currentUser?.email || ''} />
      <div style={styles.centered}>User not found.</div>
    </>
  );

  return (
    <div style={{ minHeight: '100vh', background: '#F7F9FA' }}>
      <AppHeader 
        userRole="admin" 
        userName={currentUser?.displayName || ''} 
        userEmail={currentUser?.email || ''}
      />
      
      <div style={styles.container}>
        <div style={styles.topBar}>
          <Link to="/admin/dashboard" style={styles.link}>← Back to task queue</Link>
          <button style={styles.buttonSecondary} onClick={() => navigate(-1)}>Back</button>
        </div>

        <div style={styles.headerCard}>
          <div>
            <div style={styles.eyebrow}>Operations</div>
            <h1 style={styles.title}>{roleLabel(user.role)} account</h1>
            <div style={styles.subtitle}>
              PII is shown here for support, safety, and dispute resolution.
            </div>
          </div>
          <div style={styles.badgeRow}>
            <span style={styles.roleBadge}>{roleLabel(user.role)}</span>
            <span style={{ ...styles.statusBadge, ...statusTone(user.status) }}>{statusLabel(user.status)}</span>
          </div>
        </div>

        <div style={styles.grid}>
          <div style={styles.card}>
            <div style={styles.sectionTitle}>Identity</div>
            <div style={styles.infoGrid}>
              <div style={styles.infoItem}>
                <div style={styles.label}>Full name</div>
                <div style={styles.value}>{user.displayName || `${user.firstName || ''} ${user.lastName || ''}`.trim() || 'N/A'}</div>
              </div>
              <div style={styles.infoItem}>
                <div style={styles.label}>Email</div>
                <div style={styles.value}>{user.email || 'N/A'}</div>
              </div>
              <div style={styles.infoItem}>
                <div style={styles.label}>Phone</div>
                <div style={styles.value}>{user.phone || 'N/A'}</div>
              </div>
              <div style={styles.infoItem}>
                <div style={styles.label}>UID</div>
                <div style={styles.codeValue}>{user.uid}</div>
              </div>
            </div>
          </div>

          <div style={styles.card}>
            <div style={styles.sectionTitle}>Account status</div>
            <div style={styles.infoGrid}>
              <div style={styles.infoItem}>
                <div style={styles.label}>Role</div>
                <div style={styles.value}>{roleLabel(user.role)}</div>
              </div>
              <div style={styles.infoItem}>
                <div style={styles.label}>Platform verified</div>
                <div style={styles.value}>{user.verified ? 'Yes' : 'No'}</div>
              </div>
              <div style={styles.infoItem}>
                <div style={styles.label}>Created</div>
                <div style={styles.value}>{formatDate(user.createdAt)}</div>
              </div>
              <div style={styles.infoItem}>
                <div style={styles.label}>Last sign-in</div>
                <div style={styles.value}>{user.lastLogin ? formatDate(user.lastLogin) : 'N/A'}</div>
              </div>
            </div>
          </div>

          {user.role === 'tradie' && (
          <>
          <div style={{ ...styles.card, gridColumn: '1 / -1' }}>
            <div style={styles.sectionTitle}>Melbourne Founding Expert program</div>

            {foundingBanner ? (
              <div style={{ ...styles.banner, ...styles.bannerOk }}>{foundingBanner}</div>
            ) : null}
            {foundingError ? (
              <div style={{ ...styles.banner, ...styles.bannerErr }}>{foundingError}</div>
            ) : null}

            <FoundingEligibilityChecklist eligibility={user.foundingExpertEligibility} />

            {(() => {
              const eligibility = user.foundingExpertEligibility;
              const enrolBlocked = eligibility ? !eligibility.eligible : false;
              const fe = user.foundingExpert;
              const meta = user.foundingExpertProgramMeta;
              const preview = user.foundingExpertFeePreview;
              const cap = meta?.cap ?? 50;

              const st = fe?.status || '';
              const isActive = st === 'active';
              const isRemoved = st === 'removed';
              const isTestReset = st === 'test_reset';

              const showNotEnrolled = !fe || (!isActive && !isRemoved && !isTestReset);

              let body;
              let actions;

              if (isActive) {
                body = (
                  <>
                    <div style={styles.feRow}>
                      <span style={styles.labelInline}>Status</span>
                      <span style={{ ...styles.badgeTiny, ...styles.statusOk }}>Active</span>
                      <span style={{ ...styles.badgeTiny, ...styles.foundingBadge }}>Founding Expert</span>
                    </div>
                    {fe.sequenceNumber != null ? (
                      <div style={styles.feLine}>
                        <span style={styles.labelInline}>Slot</span>
                        <span style={styles.valueInline}>#{fe.sequenceNumber} of {cap}</span>
                      </div>
                    ) : null}
                    <div style={styles.feLine}>
                      <span style={styles.labelInline}>Zero-fee jobs used</span>
                      <span style={styles.valueInline}>
                        {(fe.zeroFeeSlotsUsed ?? 0)} / {fe.zeroFeeTaskLimit ?? meta?.zeroFeeTaskLimit ?? 3} used
                      </span>
                    </div>
                    <div style={styles.feLine}>
                      <span style={styles.labelInline}>Current fee stage</span>
                      <span style={styles.valueInline}>{feeStageReadable(preview?.stage) ?? '—'}</span>
                    </div>
                    {(fe.reducedFeeStartsAtMs || fe.reducedFeeEndsAtMs) ? (
                      <div style={{ marginTop: 10 }}>
                        <div style={{ ...styles.label, marginBottom: 6 }}>Reduced-fee window</div>
                        <div style={styles.feLineMuted}>
                          {fe.reducedFeeStartsAtMs ? formatDate(fe.reducedFeeStartsAtMs) : '—'}
                          {' — '}
                          {fe.reducedFeeEndsAtMs ? formatDate(fe.reducedFeeEndsAtMs) : '—'}
                        </div>
                      </div>
                    ) : null}
                    {preview?.effectiveReducedFeeEndsAtMs ? (
                      <div style={styles.feLineMuted}>
                        Effective reduced fee end: {formatDate(preview.effectiveReducedFeeEndsAtMs)}
                        {preview?.derivedReducedFeeEndsAt ? ' (derived)' : ''}
                      </div>
                    ) : null}
                    <div style={{ ...styles.feMeta, marginTop: 10 }}>
                      Default program (new approvals): {meta?.activeProgramId || '—'}
                      {fe.programId ? ` · This Expert: ${fe.programId}` : ''}
                    </div>
                  </>
                );
                actions = (
                  <button
                    type="button"
                    style={{ ...styles.buttonDanger, opacity: foundingBusy ? 0.6 : 1 }}
                    disabled={foundingBusy}
                    onClick={handleFoundingRemove}
                  >
                    Remove from Founding Expert
                  </button>
                );
              } else if (isRemoved) {
                body = (
                  <>
                    <div style={styles.feRow}>
                      <span style={styles.labelInline}>Status</span>
                      <span style={{ ...styles.badgeTiny, ...styles.statusWarn }}>Removed</span>
                    </div>
                    {fe.removedAtMs ? (
                      <div style={styles.feLineMuted}>Removed at {formatDate(fe.removedAtMs)}</div>
                    ) : null}
                    {fe.programId ? (
                      <div style={styles.feMeta}>Program record: {fe.programId}</div>
                    ) : null}
                  </>
                );
                actions = (
                  <button
                    type="button"
                    style={{
                      ...styles.buttonPrimary,
                      opacity: foundingBusy || enrolBlocked ? 0.55 : 1,
                      cursor: foundingBusy || enrolBlocked ? 'not-allowed' : 'pointer',
                    }}
                    disabled={foundingBusy || enrolBlocked}
                    onClick={handleFoundingEnrol}
                  >
                    Re-enrol as Founding Expert
                  </button>
                );
              } else if (isTestReset) {
                body = (
                  <>
                    <div style={styles.feRow}>
                      <span style={styles.labelInline}>Status</span>
                      <span style={{ ...styles.badgeTiny, ...styles.statusNeutral }}>Test reset</span>
                    </div>
                    <p style={{ margin: '10px 0 0', color: '#374151', fontSize: 14 }}>
                      This test enrolment was reset.
                    </p>
                  </>
                );
                actions = (
                  <button
                    type="button"
                    style={{
                      ...styles.buttonPrimary,
                      opacity: foundingBusy || enrolBlocked ? 0.55 : 1,
                      cursor: foundingBusy || enrolBlocked ? 'not-allowed' : 'pointer',
                    }}
                    disabled={foundingBusy || enrolBlocked}
                    onClick={handleFoundingEnrol}
                  >
                    Enrol as Founding Expert
                  </button>
                );
              } else if (showNotEnrolled) {
                body = (
                  <>
                    <div style={styles.feRow}>
                      <span style={styles.labelInline}>Status</span>
                      <span style={{ ...styles.badgeTiny, ...styles.statusNeutral }}>Not enrolled</span>
                    </div>
                    <p style={{ margin: '10px 0 0', color: '#374151', fontSize: 14 }}>
                      Eligible Experts can be enrolled in the first 50 Melbourne Founding Expert cohort.
                      {' '}
                      <span style={{ color: '#64748b', fontSize: 13 }}>
                        They can also be enrolled automatically when Founding Expert auto-enrolment is enabled server-side.
                      </span>
                    </p>
                  </>
                );
                actions = (
                  <button
                    type="button"
                    style={{
                      ...styles.buttonPrimary,
                      opacity: foundingBusy || enrolBlocked ? 0.55 : 1,
                      cursor: foundingBusy || enrolBlocked ? 'not-allowed' : 'pointer',
                    }}
                    disabled={foundingBusy || enrolBlocked}
                    onClick={handleFoundingEnrol}
                  >
                    Enrol as Founding Expert
                  </button>
                );
              }

              const metaExtras = [];
              if (meta?.testResetAllowed) {
                metaExtras.push('Test program reset is allowed in this environment.');
              }

              return (
                <>
                  {body}
                  {metaExtras.length ? (
                    <div style={{ ...styles.feMeta, marginTop: 8 }}>{metaExtras.join(' ')}</div>
                  ) : null}
                  {actions ? (
                    <div style={{ display: 'flex', gap: 10, marginTop: 16, flexWrap: 'wrap' }}>{actions}</div>
                  ) : null}
                </>
              );
            })()}
          </div>

          <div style={{ ...styles.card, gridColumn: '1 / -1' }}>
            <div style={styles.sectionTitle}>Expert payouts</div>
              <div style={styles.infoGrid}>
                <div style={styles.infoItem}>
                  <div style={styles.label}>Stripe onboarding</div>
                  <div style={styles.value}>{user.stripeOnboardingStatus || 'N/A'}</div>
                </div>
                <div style={styles.infoItem}>
                  <div style={styles.label}>Charges enabled</div>
                  <div style={styles.value}>{user.stripeChargesEnabled ? 'Yes' : 'No'}</div>
                </div>
                <div style={styles.infoItem}>
                  <div style={styles.label}>Payouts enabled</div>
                  <div style={styles.value}>{user.stripePayoutsEnabled ? 'Yes' : 'No'}</div>
                </div>
              </div>
              {user.stripeRequirements ? (
                <details style={styles.details}>
                  <summary style={styles.detailsSummary}>Stripe requirements</summary>
                  <pre style={styles.pre}>{JSON.stringify(user.stripeRequirements, null, 2)}</pre>
                </details>
              ) : null}
          </div>
          </>
          )}
        </div>
      </div>
    </div>
  );
}

const styles = {
  container: { padding: 20, maxWidth: 900, margin: '0 auto' },
  centered: { padding: 40, textAlign: 'center' },
  topBar: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, gap: 12 },
  link: { textDecoration: 'none', color: '#2563eb', fontWeight: 600 },
  headerCard: { backgroundColor: '#fff', border: '1px solid #e5e7eb', borderRadius: 16, padding: 20, marginBottom: 16, display: 'flex', justifyContent: 'space-between', gap: 16, alignItems: 'flex-start', flexWrap: 'wrap' },
  eyebrow: { fontSize: 12, fontWeight: 900, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#0f766e', marginBottom: 6 },
  title: { margin: '0 0 8px 0', fontFamily: 'Poppins, sans-serif', fontSize: 28, fontWeight: 700, color: '#111827' },
  subtitle: { fontSize: 14, color: '#6b7280', lineHeight: 1.6 },
  badgeRow: { display: 'flex', gap: 10, flexWrap: 'wrap' },
  roleBadge: { display: 'inline-flex', alignItems: 'center', padding: '8px 12px', borderRadius: 999, background: '#E0F7F7', color: '#0f766e', fontWeight: 700, fontSize: 13 },
  statusBadge: { display: 'inline-flex', alignItems: 'center', padding: '8px 12px', borderRadius: 999, fontWeight: 700, fontSize: 13 },
  statusOk: { background: '#ecfdf5', color: '#166534' },
  statusWarn: { background: '#fff7ed', color: '#9a3412' },
  statusNeutral: { background: '#f3f4f6', color: '#374151' },
  grid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 16 },
  card: { backgroundColor: '#fff', border: '1px solid #e5e7eb', borderRadius: 16, padding: 20 },
  sectionTitle: { margin: '0 0 16px 0', fontSize: 18, fontWeight: 800, color: '#111827' },
  infoGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 16 },
  infoItem: { display: 'grid', gap: 6 },
  label: { fontSize: 12, fontWeight: 800, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em' },
  value: { fontSize: 15, fontWeight: 600, color: '#111827', lineHeight: 1.5 },
  codeValue: { fontSize: 13, fontWeight: 600, color: '#111827', fontFamily: 'monospace', wordBreak: 'break-all' },
  details: { marginTop: 16 },
  detailsSummary: { cursor: 'pointer', fontWeight: 700, color: '#111827' },
  pre: { background: '#0b1020', color: '#e5e7eb', padding: 12, borderRadius: 8, overflowX: 'auto', fontSize: 12 },
  buttonSecondary: { padding: '8px 16px', cursor: 'pointer', backgroundColor: '#f3f4f6', color: '#374151', border: '1px solid #d1d5db', borderRadius: 6, fontWeight: 500, fontSize: 14 },
  buttonPrimary: { padding: '9px 14px', cursor: 'pointer', backgroundColor: '#0f766e', color: '#fff', border: '1px solid #0d5f59', borderRadius: 8, fontWeight: 700, fontSize: 13 },
  buttonDanger: { padding: '9px 14px', cursor: 'pointer', backgroundColor: '#fff', color: '#991b1b', border: '1px solid #fecaca', borderRadius: 8, fontWeight: 700, fontSize: 13 },
  banner: { marginBottom: 12, padding: '10px 12px', borderRadius: 10, fontSize: 14, fontWeight: 600 },
  bannerOk: { background: '#ecfdf5', color: '#166534', border: '1px solid #bbf7d0' },
  bannerErr: { background: '#fef2f2', color: '#991b1b', border: '1px solid #fecaca' },
  badgeTiny: { display: 'inline-flex', alignItems: 'center', padding: '4px 10px', borderRadius: 999, fontWeight: 700, fontSize: 11 },
  foundingBadge: { background: '#eef2ff', color: '#4338ca', border: '1px solid #c7d2fe' },
  feRow: { display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center', marginBottom: 8 },
  feLine: { display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'baseline', marginBottom: 6 },
  feLineMuted: { fontSize: 13, color: '#6b7280', marginBottom: 4 },
  feMeta: { fontSize: 11, color: '#9ca3af', wordBreak: 'break-all' },
  labelInline: { fontSize: 12, fontWeight: 800, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.04em', minWidth: 120 },
  valueInline: { fontSize: 15, fontWeight: 600, color: '#111827' },
  eligibilityOkRow: { fontSize: 14, fontWeight: 600, color: '#166534' },
  eligibilityWarnRow: { fontSize: 14, fontWeight: 600, color: '#78716c' },
  eligibilityReasons: { marginTop: 10, fontSize: 13, color: '#78716c', lineHeight: 1.5 },
};








