import React, { useCallback, useEffect, useState } from 'react';
import StatusTag from '../../../StatusTag';
import AdminJobEventLog from '../job-detail/AdminJobEventLog';
import ExpertTrustChips from '../components/ExpertTrustChips';
import AdminEntityNotesSection from '../components/AdminEntityNotesSection';
import AdminWorkflowSection from '../components/AdminWorkflowSection';
import { JOB_STATUSES, normalizeStatus } from '../../../constants/jobStatuses';
import { getTaskReferenceCode } from '../../../utils/taskReference';
import {
  hasAdminPaymentIssue,
  healthLabelForTask,
  getTaskCreatedAtMs as getCreatedAtMsFallback,
} from '../../../utils/adminOps';
import { fullTaskDisplayTitle, getJobDisplayLayers } from '../../../utils/jobDisplayFromJob';
import { dashboardStyles } from '../../../styles/dashboardStyles';
import { adminReleaseStatusLabel } from '../job-detail/PaymentFeeBreakdownPanel';

function formatMoneyCents(cents) {
  if (cents == null || !Number.isFinite(Number(cents))) return '—';
  return new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD' }).format(Number(cents) / 100);
}

function fmtTime(ts) {
  if (!ts) return '—';
  const d = ts._seconds != null ? new Date(ts._seconds * 1000) : new Date(ts);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString();
}

export default function TaskDetailsDrawer({
  open,
  onClose,
  drawerTask,
  drawerJobId,
  quoteMeta,
  users,
  styles = dashboardStyles,
  formatAgeShort,
  getTaskCreatedAtMs,
  healthLabelForTask: healthFn,
  onInviteExperts,
  onViewTask,
  onAddInternalNote,
  api,
  isSuperAdmin,
  onAfterAction,
  currentUserUid,
}) {
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');
  const [bundle, setBundle] = useState(null);
  const [actionBusy, setActionBusy] = useState(false);

  const load = useCallback(async () => {
    const id = String(drawerJobId || '').trim();
    if (!id || !api) return;
    setLoading(true);
    setErr('');
    try {
      const res = await api.get(`/api/admin/jobs/${id}`);
      setBundle(res.data || null);
    } catch (e) {
      setBundle(null);
      setErr(e?.response?.data?.message || e?.message || 'Failed to load task.');
    } finally {
      setLoading(false);
    }
  }, [api, drawerJobId]);

  useEffect(() => {
    if (open && drawerJobId) load();
  }, [open, drawerJobId, load]);

  if (!open) return null;

  const drawerId = String(drawerJobId || '').trim();
  const bundleMatchesDrawer =
    !!(bundle?.job && String(bundle.job.id || '') !== '' && String(bundle.job.id) === drawerId);

  /** Ignore stale bundles from another task until GET /api/admin/jobs/:id returns for this drawer. */
  const job = bundleMatchesDrawer ? bundle.job : drawerTask;
  const events = bundleMatchesDrawer ? [...(bundle.events || [])].reverse() : [];
  const homeownerName = bundleMatchesDrawer ? bundle.homeownerName : undefined;
  const expertName = bundleMatchesDrawer ? bundle.expertName : undefined;
  const riskSignals = bundleMatchesDrawer && Array.isArray(bundle.riskSignals) ? bundle.riskSignals : [];
  const riskScore = bundleMatchesDrawer ? bundle.riskScore || null : null;
  const expertTrust = bundleMatchesDrawer ? bundle.expertTrust || null : null;
  const paymentFeeSummary = bundleMatchesDrawer ? bundle.paymentFeeSummary || null : null;
  const taxonomy = job ? getJobDisplayLayers(job) : { categoryDisplayLabel: '', taskTypeDisplayLabel: '', fullTaskDisplayTitle: '' };

  const runAction = async (fn) => {
    const id = String(drawerJobId || job?.id || '').trim();
    if (!id) return;
    setActionBusy(true);
    try {
      await fn(id);
      await load();
      if (onAfterAction) await onAfterAction();
    } catch (e) {
      window.alert(e?.response?.data?.message || e?.message || 'Action failed.');
    } finally {
      setActionBusy(false);
    }
  };

  const canRetry =
    job &&
    (String(job.paymentState || '').toLowerCase() === 'payment_failed'
      || String(job.paymentState || '').toLowerCase() === 'refund_failed');

  const showResolve =
    job && normalizeStatus(job.status) === JOB_STATUSES.DISPUTED && isSuperAdmin;

  const showStatusOverride = isSuperAdmin;

  const hasFin =
    job &&
    (paymentFeeSummary?.available === true ||
      job.paymentAmountCents != null ||
      job.platformFeeAmount != null ||
      job.providerAmount != null ||
      job.paymentState);

  const compactOps = job ? (() => {
    const nowMs = Date.now();
    const createdMs = (getTaskCreatedAtMs || getCreatedAtMsFallback)(job);
    const ageH = createdMs ? Math.round((nowMs - createdMs) / (1000 * 60 * 60)) : null;
    const known = new Set(Array.isArray(quoteMeta?.knownJobIds) ? quoteMeta.knownJobIds : []);
    const hasAny = quoteMeta?.hasAnyByJobId || {};
    const hasOffer = known.has(String(job.id)) ? (hasAny[String(job.id)] === true) : true;
    const health = healthFn ? healthFn({ job, hasOffer, nowMs }) : healthLabelForTask({ job, hasOffer, nowMs });
    const invites = Array.isArray(job.invitedTradieUids) ? job.invitedTradieUids.length : 0;
    const offers = typeof job.offersCount === 'number' ? job.offersCount : (hasOffer ? '1+' : 0);
    return { ageH, health, invites, offers };
  })() : null;

  return (
    <div style={styles.drawerOverlay} onMouseDown={onClose}>
      <div style={styles.drawerPanel} onMouseDown={(e) => e.stopPropagation()}>
        <div style={styles.drawerHeader}>
          <div style={{ minWidth: 0 }}>
            <div style={styles.drawerTitle}>Task details</div>
            <div style={styles.drawerSubtitle}>
              {job ? fullTaskDisplayTitle(job) : drawerJobId}
            </div>
          </div>
          <button type="button" onClick={onClose} style={styles.drawerCloseBtn} aria-label="Close">×</button>
        </div>

        {loading && !bundle ? (
          <div style={{ padding: 14, fontSize: 13, color: '#6B7280' }}>Loading…</div>
        ) : null}
        {err ? (
          <div style={{ padding: 14, fontSize: 13, color: '#b91c1c' }}>{err}</div>
        ) : null}

        {!loading && !job ? (
          <div style={{ padding: 14, fontSize: 13, color: '#6B7280' }}>Details unavailable.</div>
        ) : null}

        {job ? (
          <div style={{ padding: 14, overflowY: 'auto', maxHeight: 'calc(100vh - 120px)' }}>
            <div style={styles.drawerSection}>
              <div style={styles.drawerSectionTitle}>Overview</div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 8 }}>
                <StatusTag status={job.status} />
                {compactOps ? (
                  <span
                    style={{
                      ...styles.healthBadge,
                      ...(compactOps.health.tone === 'danger' ? styles.healthDanger : null),
                      ...(compactOps.health.tone === 'warning' ? styles.healthWarning : null),
                      ...(compactOps.health.tone === 'info' ? styles.healthInfo : null),
                      ...(compactOps.health.tone === 'success' ? styles.healthSuccess : null),
                    }}
                  >
                    {compactOps.health.label}
                  </span>
                ) : null}
              </div>
              <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 10 }}>
                {compactOps ? (
                  <>
                    Posted {compactOps.ageH != null ? `${compactOps.ageH}h ago` : '—'}
                    {' · '}Offers {compactOps.offers} · Invited {compactOps.invites}
                    {' · '}Admin {formatAgeShort(job.lastAdminActionAt)}
                  </>
                ) : null}
              </div>
              <div style={styles.drawerGrid}>
                <div style={styles.drawerItem}>
                  <span style={styles.drawerKey}>Reference</span>
                  <span style={styles.drawerVal}>{getTaskReferenceCode(String(job.id || ''))}</span>
                </div>
                <div style={styles.drawerItem}>
                  <span style={styles.drawerKey}>Created</span>
                  <span style={styles.drawerVal}>{fmtTime(job.createdAt)}</span>
                </div>
                <div style={styles.drawerItem}>
                  <span style={styles.drawerKey}>Updated</span>
                  <span style={styles.drawerVal}>{fmtTime(job.updatedAt)}</span>
                </div>
                <div style={styles.drawerItem}>
                  <span style={styles.drawerKey}>Client</span>
                  <span style={styles.drawerVal}>{homeownerName || '—'}</span>
                </div>
                <div style={styles.drawerItem}>
                  <span style={styles.drawerKey}>Expert</span>
                  <span style={styles.drawerVal}>{expertName || '—'}</span>
                </div>
                <div style={styles.drawerItem}>
                  <span style={styles.drawerKey}>Task</span>
                  <span style={styles.drawerVal}>{taxonomy.categoryDisplayLabel || '—'}</span>
                </div>
                <div style={styles.drawerItem}>
                  <span style={styles.drawerKey}>Job type</span>
                  <span style={styles.drawerVal}>{taxonomy.taskTypeDisplayLabel || '—'}</span>
                </div>
              </div>
            </div>

            {hasFin ? (
              <div style={styles.drawerSection}>
                <div style={styles.drawerSectionTitle}>Financials</div>
                {paymentFeeSummary?.available === true ? (
                  <div style={styles.drawerGrid}>
                    <div style={styles.drawerItem}>
                      <span style={styles.drawerKey}>Client paid</span>
                      <span style={styles.drawerVal}>{formatMoneyCents(paymentFeeSummary.clientPaidCents)}</span>
                    </div>
                    <div style={styles.drawerItem}>
                      <span style={styles.drawerKey}>Base task amount</span>
                      <span style={styles.drawerVal}>{formatMoneyCents(paymentFeeSummary.baseClientPaidCents)}</span>
                    </div>
                    <div style={styles.drawerItem}>
                      <span style={styles.drawerKey}>Approved paid variations</span>
                      <span style={styles.drawerVal}>
                        {Number(paymentFeeSummary.variationClientPaidCents) > 0
                          ? formatMoneyCents(paymentFeeSummary.variationClientPaidCents)
                          : '—'}
                      </span>
                    </div>
                    <div style={styles.drawerItem}>
                      <span style={styles.drawerKey}>Taskio fee</span>
                      <span style={styles.drawerVal}>{formatMoneyCents(paymentFeeSummary.taskioFeeCents)}</span>
                    </div>
                    <div style={styles.drawerItem}>
                      <span style={styles.drawerKey}>Expert released amount</span>
                      <span style={styles.drawerVal}>{formatMoneyCents(paymentFeeSummary.expertReleasedCents)}</span>
                    </div>
                    <div style={styles.drawerItem}>
                      <span style={styles.drawerKey}>Release status</span>
                      <span style={styles.drawerVal}>{adminReleaseStatusLabel(paymentFeeSummary)}</span>
                    </div>
                  </div>
                ) : (
                  <div style={styles.drawerGrid}>
                    <div style={styles.drawerItem}>
                      <span style={styles.drawerKey}>Total</span>
                      <span style={styles.drawerVal}>{formatMoneyCents(job.paymentAmountCents)}</span>
                    </div>
                    <div style={styles.drawerItem}>
                      <span style={styles.drawerKey}>Platform fee</span>
                      <span style={styles.drawerVal}>{formatMoneyCents(job.platformFeeAmount)}</span>
                    </div>
                    {(job.stripeFeeAmountCents != null && Number.isFinite(Number(job.stripeFeeAmountCents))) ? (
                      <div style={styles.drawerItem}>
                        <span style={styles.drawerKey}>Stripe fee</span>
                        <span style={styles.drawerVal}>{formatMoneyCents(job.stripeFeeAmountCents)}</span>
                      </div>
                    ) : null}
                    <div style={styles.drawerItem}>
                      <span style={styles.drawerKey}>Expert payout</span>
                      <span style={styles.drawerVal}>{formatMoneyCents(job.providerAmount)}</span>
                    </div>
                    <div style={styles.drawerItem}>
                      <span style={styles.drawerKey}>Refund</span>
                      <span style={styles.drawerVal}>{job.refundAmountCents != null ? formatMoneyCents(job.refundAmountCents) : '—'}</span>
                    </div>
                    <div style={styles.drawerItem}>
                      <span style={styles.drawerKey}>Payment state</span>
                      <span style={styles.drawerVal}>
                        {adminReleaseStatusLabel({
                          releasedToStripe: String(job.paymentState || '').toLowerCase() === 'released',
                          paymentState: job.paymentState,
                          paymentStatus: job.paymentStatus,
                        })}
                      </span>
                    </div>
                  </div>
                )}
                {bundleMatchesDrawer ? (
                  <p style={{ fontSize: 11, color: '#64748b', marginTop: 10, marginBottom: 0 }}>
                    Open full page from the footer for Payment &amp; fee breakdown detail.
                  </p>
                ) : null}
              </div>
            ) : null}

            {(riskSignals.length > 0 || expertTrust || riskScore) ? (
              <div style={styles.drawerSection}>
                <div style={styles.drawerSectionTitle}>Risk &amp; trust</div>
                {riskScore && riskScore.score != null ? (
                  <div style={{ fontSize: 12, color: '#374151', marginBottom: riskSignals.length > 0 ? 8 : 10, fontWeight: 700 }}>
                    Score {riskScore.score}
                    {riskScore.level ? ` · ${riskScore.level}` : ''}
                    {Array.isArray(riskScore.topFactors) && riskScore.topFactors.length > 0
                      ? ` · ${riskScore.topFactors.slice(0, 3).map((f) => f.label || f.code).join(' · ')}`
                      : ''}
                  </div>
                ) : null}
                {riskSignals.length > 0 && !(riskScore && riskScore.score != null) ? (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: expertTrust ? 10 : 0 }}>
                    {riskSignals.map((s) => (
                      <span
                        key={`${s.type}-${s.label}`}
                        style={{
                          fontSize: 10,
                          fontWeight: 900,
                          padding: '4px 8px',
                          borderRadius: 999,
                          border: s.severity === 'HIGH' ? '1px solid #fecdd3' : '1px solid #fed7aa',
                          background: s.severity === 'HIGH' ? '#fff1f2' : '#fffbeb',
                          color: s.severity === 'HIGH' ? '#9f1239' : '#92400e',
                        }}
                      >
                        {s.label}
                      </span>
                    ))}
                  </div>
                ) : null}
                {job.acceptedTradieUid && expertTrust ? (
                  <ExpertTrustChips trust={expertTrust} />
                ) : null}
              </div>
            ) : null}

            {drawerJobId && api ? (
              <AdminWorkflowSection
                api={api}
                entityType="job"
                entityId={drawerJobId}
                currentUid={currentUserUid}
                styles={styles}
              />
            ) : null}

            <div style={styles.drawerSection}>
              <div style={styles.drawerSectionTitle}>Timeline</div>
              <AdminJobEventLog events={events} styles={styles} />
            </div>

            {api && drawerJobId ? (
              <AdminEntityNotesSection
                api={api}
                entityType="job"
                entityId={drawerJobId}
                styles={styles}
              />
            ) : null}

            <div style={{ ...styles.drawerSection, marginTop: 8 }}>
              <div style={styles.drawerSectionTitle}>Actions</div>
              {hasAdminPaymentIssue(job) && (
                <div style={{ fontSize: 12, color: '#9f1239', marginBottom: 8 }}>Payment issue — review Stripe state before acting.</div>
              )}
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {canRetry && isSuperAdmin ? (
                  <button
                    type="button"
                    style={styles.button}
                    disabled={actionBusy}
                    onClick={() => runAction((id) => api.post(`/api/admin/jobs/${id}/retry-payment`, {}))}
                  >
                    {actionBusy ? 'Working…' : 'Retry payment'}
                  </button>
                ) : null}
                {showResolve ? (
                  <>
                    <button
                      type="button"
                      style={styles.button}
                      disabled={actionBusy}
                      onClick={() => {
                        if (!window.confirm('Release payment to the expert?')) return;
                        runAction((id) => api.post(`/api/admin/jobs/${id}/resolve-dispute`, { resolution: 'expert' }));
                      }}
                    >
                      Resolve dispute → Pay expert
                    </button>
                    <button
                      type="button"
                      style={{ ...styles.buttonSecondary, borderColor: '#fecdd3', color: '#9f1239' }}
                      disabled={actionBusy}
                      onClick={() => {
                        if (!window.confirm('Issue full refund to the client?')) return;
                        runAction((id) => api.post(`/api/admin/jobs/${id}/resolve-dispute`, { resolution: 'refund' }));
                      }}
                    >
                      Resolve dispute → Refund client
                    </button>
                  </>
                ) : null}
                {showStatusOverride ? (
                  <button
                    type="button"
                    style={styles.buttonSecondary}
                    disabled={actionBusy}
                    onClick={() => {
                      const next = window.prompt('Override status (canonical enum, e.g. FUNDED):', normalizeStatus(job.status));
                      if (!next) return;
                      runAction((id) => api.put(`/api/admin/jobs/${id}/status`, { status: next.trim() }));
                    }}
                  >
                    Override status
                  </button>
                ) : null}
              </div>
              {!isSuperAdmin && (showResolve || canRetry) ? (
                <p style={{ fontSize: 12, color: '#6b7280', marginTop: 8 }}>
                  Dispute resolution and payment retries require super admin.
                </p>
              ) : null}
            </div>

            <div style={styles.drawerFooter}>
              <button type="button" style={styles.button} onClick={() => onInviteExperts(job)}>
                Invite experts
              </button>
              <button type="button" style={styles.buttonSecondary} onClick={() => onViewTask(job)}>
                Open full page
              </button>
              <button type="button" style={styles.buttonSecondary} onClick={() => onAddInternalNote(job)}>
                Legacy Firestore note
              </button>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
