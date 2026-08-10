import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuthState } from 'react-firebase-hooks/auth';
import { auth, db } from '../firebase';
import AppHeader from './AppHeader';
import { doc, getDoc } from 'firebase/firestore';
import { createApiClient } from '../api/createApiClient';
import { getShortJobRef } from '../utils/taskReference';
import { getReleasedDisplayTitle } from '../utils/paymentDisplayTaskTitle';
import { formatTaskioFeeWithBenefitLine } from '../utils/paymentReleasedFeeCopy';
import { expertFeeProgramPaymentsBlurb } from './expert/ExpertFeeProgramCard';
import './expert/ExpertFeeProgramCard.css';
import './PaymentsPage.css';
import { PageLoadingShell } from './ui/AsyncPageStates';
import PageMain from './ui/PageMain';

const api = createApiClient();

/** Table / list status — concise dashboard wording */
const STATUS_RELEASED_SHORT = 'Released to Stripe';
/** Modal payout line matches table status copy */
const STATUS_RELEASED_DETAIL = 'Released to Stripe';

function expertTaskioFeeCents(row) {
  if (!row || typeof row !== 'object') return 0;
  if (typeof row.taskioFeeCents === 'number' && Number.isFinite(row.taskioFeeCents)) return row.taskioFeeCents;
  if (typeof row.feesTotalCents === 'number' && Number.isFinite(row.feesTotalCents)) return row.feesTotalCents;
  if (typeof row.platformFeeAmountCents === 'number' && Number.isFinite(row.platformFeeAmountCents)) {
    return row.platformFeeAmountCents;
  }
  return 0;
}

function formatAud(amount) {
  const n = typeof amount === 'number' && Number.isFinite(amount) ? amount : 0;
  return new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD' }).format(n);
}

/** True when profile from /api/me indicates Stripe payout setup is complete (no invented logic). */
function isStripePayoutReady(profile) {
  if (!profile || typeof profile !== 'object') return false;
  if (profile.stripe?.onboardingComplete === true) return true;
  if (String(profile.stripeOnboardingStatus || '').toLowerCase() === 'completed') return true;
  return false;
}

function formatActivityDate(releasedAtMs) {
  if (releasedAtMs == null || !Number.isFinite(releasedAtMs)) return '—';
  try {
    return new Intl.DateTimeFormat('en-AU', { dateStyle: 'medium' }).format(new Date(releasedAtMs));
  } catch {
    return '—';
  }
}

function getRowDisplayReference(row) {
  if (!row || typeof row !== 'object') return 'TSK-0000';
  if (row.displayReference && String(row.displayReference).trim()) return String(row.displayReference).trim();
  return getShortJobRef({ id: row.jobId, taskNumber: row.taskNumber, referenceNumber: row.referenceNumber });
}

function exportActivityToCsv({ released }) {
  if (!Array.isArray(released) || released.length === 0) return;
  const escape = (s) => {
    const t = String(s ?? '');
    if (/[",\n]/.test(t)) return `"${t.replace(/"/g, '""')}"`;
    return t;
  };
  const lines = [
    ['date', 'task_title', 'task_reference', 'client_paid_aud', 'taskio_fee_aud', 'expert_released_aud', 'status'].join(','),
  ];
  for (const row of released) {
    const dateStr = formatActivityDate(row.releasedAtMs);
    const title = getReleasedDisplayTitle(row);
    const ref = getRowDisplayReference(row);
    const clientPaid = ((row.clientPaidCents ?? row.totalGrossReleasedCents ?? 0) / 100).toFixed(2);
    const fees = (expertTaskioFeeCents(row) / 100).toFixed(2);
    const yours = ((row.providerAmountCents ?? row.expertReleasedCents ?? 0) / 100).toFixed(2);
    const status = STATUS_RELEASED_SHORT;
    lines.push(
      [
        escape(dateStr),
        escape(title),
        escape(ref),
        clientPaid,
        escape(fees),
        yours,
        escape(status),
      ].join(',')
    );
  }
  const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `taskio-payment-activity-${new Date().toISOString().slice(0, 10)}.csv`;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function ModalKvRow({ label, children, emphasis }) {
  return (
    <div
      className={`pp-pay-modal-kv-row${emphasis ? ' pp-pay-modal-kv-row--emphasis' : ''}`.trim()}
    >
      <span className="pp-pay-modal-kv-label">{label}</span>
      <span className="pp-pay-modal-kv-value">{children}</span>
    </div>
  );
}

function PaymentBreakdownModal({ row, onClose }) {
  const b = row?.breakdown;
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  if (!b) return null;

  const varIds = b.variationTransferIds && typeof b.variationTransferIds === 'object' ? b.variationTransferIds : {};
  const refDisplay = b.taskDisplayReference || getRowDisplayReference(row);
  const variationAud = (b.variationClientPaidCents ?? 0) / 100;
  const showVariationRow = variationAud > 0;
  const releasedAud = (b.expertReleasedCents ?? row?.expertReleasedCents ?? 0) / 100;

  const baseTfCents = typeof b.baseTaskioFeeCents === 'number' ? b.baseTaskioFeeCents : null;
  const varTfCents = typeof b.variationTaskioFeeCents === 'number' ? b.variationTaskioFeeCents : null;
  const totalTfCents =
    typeof b.taskioPlatformFeeCents === 'number'
      ? b.taskioPlatformFeeCents
      : typeof row?.taskioFeeCents === 'number'
        ? row.taskioFeeCents
        : (baseTfCents != null || varTfCents != null
          ? (baseTfCents ?? 0) + (varTfCents ?? 0)
          : expertTaskioFeeCents(row));

  const baseResolvedTf = baseTfCents != null ? baseTfCents : Math.max(0, totalTfCents - (varTfCents ?? 0));
  const varResolvedTf = varTfCents != null ? varTfCents : Math.max(0, totalTfCents - baseResolvedTf);

  const feeBenefitRaw = typeof b.feeBenefitLabel === 'string' ? b.feeBenefitLabel.trim() : '';
  const feeBenefit =
    feeBenefitRaw ||
    (typeof row?.feeBenefitLabel === 'string' ? String(row.feeBenefitLabel).trim() : '');

  const baseExpertReleasedCents =
    typeof b.baseExpertReleasedCents === 'number'
      ? b.baseExpertReleasedCents
      : typeof row?.baseProviderReleasedCents === 'number'
        ? row.baseProviderReleasedCents
        : Math.max(0, Math.round(row?.providerAmountCents ?? 0) - (typeof row?.variationProviderReleasedCents === 'number' ? row.variationProviderReleasedCents : 0));
  const variationExpertReleasedCents =
    typeof b.variationExpertReleasedCents === 'number'
      ? b.variationExpertReleasedCents
      : typeof row?.variationProviderReleasedCents === 'number'
        ? row.variationProviderReleasedCents
        : Math.max(0, Math.round(row?.providerAmountCents ?? 0) - baseExpertReleasedCents);

  const hasSupportRefs = Boolean(b.baseTransferId) || Object.keys(varIds).length > 0;

  return (
    <div className="pp-pay-modal-backdrop" role="presentation" onClick={onClose}>
      <div
        className="pp-pay-modal-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="pp-pay-modal-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="pp-pay-modal-header">
          <h2 id="pp-pay-modal-title" className="pp-pay-modal-title">
            Payment details
          </h2>
          <button type="button" className="pp-pay-modal-close" onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>
        <div className="pp-pay-modal-body">
          <div className="pp-pay-modal-summary">
            <div className="pp-pay-modal-summary-main">
              <span className="pp-pay-modal-summary-amount">{formatAud(releasedAud)}</span>
              <span className="pp-pay-modal-summary-amount-caption"> released to Stripe</span>
            </div>
            <div className="pp-pay-modal-summary-meta">
              <div className="pp-pay-modal-summary-line">
                <span className="pp-pay-modal-summary-k">Task</span>
                <span className="pp-pay-modal-summary-v">{getReleasedDisplayTitle(row) || '—'}</span>
              </div>
              <div className="pp-pay-modal-summary-line">
                <span className="pp-pay-modal-summary-k">Task reference</span>
                <span className="pp-pay-modal-summary-v">{refDisplay}</span>
              </div>
              <div className="pp-pay-modal-summary-line">
                <span className="pp-pay-modal-summary-k">Release date</span>
                <span className="pp-pay-modal-summary-v">{formatActivityDate(b.releasedAtMs)}</span>
              </div>
            </div>
          </div>

          <section className="pp-pay-modal-section" aria-labelledby="pp-pay-modal-h-client-paid">
            <h3 id="pp-pay-modal-h-client-paid" className="pp-pay-modal-section-title">
              Client paid
            </h3>
            <ModalKvRow label="Base task amount">{formatAud((b.baseJobClientPaidCents ?? 0) / 100)}</ModalKvRow>
            {showVariationRow ? (
              <ModalKvRow label="Approved paid variations">{formatAud(variationAud)}</ModalKvRow>
            ) : null}
            <ModalKvRow label="Total Client paid" emphasis>
              {formatAud((b.totalClientPaidCents ?? 0) / 100)}
            </ModalKvRow>
          </section>

          <section className="pp-pay-modal-section" aria-labelledby="pp-pay-modal-h-taskio">
            <h3 id="pp-pay-modal-h-taskio" className="pp-pay-modal-section-title">
              Taskio fee
            </h3>
            <ModalKvRow label="Base Taskio fee">{formatAud(baseResolvedTf / 100)}</ModalKvRow>
            <ModalKvRow label="Variation Taskio fee">{formatAud(varResolvedTf / 100)}</ModalKvRow>
            <ModalKvRow label="Total Taskio fee" emphasis>{formatAud(totalTfCents / 100)}</ModalKvRow>
            <div className="pp-pay-modal-kv-row pp-pay-modal-kv-row--block">
              <span className="pp-pay-modal-kv-value pp-pay-modal-kv-value--block" style={{ fontWeight: 600 }}>
                {formatTaskioFeeWithBenefitLine(totalTfCents, feeBenefit || null, formatAud)}
              </span>
            </div>
            <ModalKvRow label="Stripe charges">
              <span className="pp-pay-muted">See your Stripe Dashboard for card processing.</span>
            </ModalKvRow>
          </section>

          <section className="pp-pay-modal-section" aria-labelledby="pp-pay-modal-h-payout">
            <h3 id="pp-pay-modal-h-payout" className="pp-pay-modal-section-title">
              Your payout
            </h3>
            <ModalKvRow label="Base released amount">{formatAud(baseExpertReleasedCents / 100)}</ModalKvRow>
            <ModalKvRow label="Variation released amount">
              {formatAud(variationExpertReleasedCents / 100)}
            </ModalKvRow>
            <ModalKvRow label="Your released amount" emphasis>
              {formatAud(releasedAud)}
            </ModalKvRow>
            <ModalKvRow label="Release status">{STATUS_RELEASED_DETAIL}</ModalKvRow>
            <ModalKvRow label="Bank payout">
              <span className="pp-pay-muted">Bank payout timing is managed by Stripe.</span>
            </ModalKvRow>
          </section>

          {hasSupportRefs ? (
            <details className="pp-pay-modal-support-ref">
              <summary className="pp-pay-modal-support-summary">Support reference</summary>
              <p className="pp-pay-modal-support-helper">Use these references only if Support asks for them.</p>
              <div className="pp-pay-modal-support-ids">
                {b.baseTransferId ? (
                  <div className="pp-pay-modal-mono-line">Base transfer: {b.baseTransferId}</div>
                ) : null}
                {Object.keys(varIds).length > 0 ? (
                  <div className="pp-pay-modal-mono-line">
                    Variation transfers:{' '}
                    {Object.entries(varIds)
                      .map(([vid, tid]) => `${vid}: ${tid}`)
                      .join('; ')}
                  </div>
                ) : null}
              </div>
            </details>
          ) : null}
        </div>
        <div className="pp-pay-modal-footer">
          <button type="button" className="pp-pay-btn pp-pay-btn--ghost" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

function ExpertPaymentsContent({
  user,
  meProfile,
  meLoading,
  meError,
  foundingExpertFeeProfile,
}) {
  const payoutReady = isStripePayoutReady(meProfile);
  const [activity, setActivity] = useState(null);
  const [activityLoading, setActivityLoading] = useState(true);
  const [activityError, setActivityError] = useState(false);
  const [detailRow, setDetailRow] = useState(null);
  const [dashboardLoading, setDashboardLoading] = useState(false);
  const [dashboardError, setDashboardError] = useState(null);

  const paymentsFeeBlurb = useMemo(() => {
    if (meLoading || meError || !foundingExpertFeeProfile) return null;
    return expertFeeProgramPaymentsBlurb(foundingExpertFeeProfile);
  }, [meLoading, meError, foundingExpertFeeProfile]);

  useEffect(() => {
    if (!user) return undefined;
    let cancelled = false;
    setActivityLoading(true);
    setActivityError(false);
    (async () => {
      try {
        const token = await user.getIdToken();
        const res = await api.get('/api/tradie/payment-activity', {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!cancelled) setActivity(res.data);
      } catch (e) {
        console.error('Payments page /api/tradie/payment-activity failed:', e);
        if (!cancelled) {
          setActivity(null);
          setActivityError(true);
        }
      } finally {
        if (!cancelled) setActivityLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user]);

  const released = activity?.released;
  const summary = activity?.summary;
  const releasedAud = (summary?.totalReleasedToStripeCents ?? 0) / 100;
  const securedAud = (summary?.totalSecuredInEscrowCents ?? 0) / 100;
  const hasReleased = Array.isArray(released) && released.length > 0;
  const summaryReady = !activityLoading && !activityError && activity != null;
  const sb = summary?.stripeBalance;
  const stripeDataOk = sb?.dataAvailable === true;
  const availableAud = stripeDataOk ? (sb.availableCents ?? 0) / 100 : null;
  const pendingCents = stripeDataOk ? (sb.pendingCents ?? 0) : null;
  const hasStripeConnected = summary?.hasStripeConnectedAccount === true;

  const closeModal = useCallback(() => setDetailRow(null), []);

  const openStripeDashboard = useCallback(async () => {
    if (!user) return;
    setDashboardError(null);
    setDashboardLoading(true);
    try {
      const token = await user.getIdToken();
      const res = await api.post(
        '/api/tradie/stripe-dashboard-link',
        {},
        { headers: { Authorization: `Bearer ${token}` } }
      );
      const url = res?.data?.url;
      if (url && typeof url === 'string') {
        window.location.assign(url);
      } else {
        setDashboardError('Could not get dashboard link.');
      }
    } catch (e) {
      const msg = e?.response?.data?.message || e?.message || 'Could not open Stripe.';
      setDashboardError(String(msg));
    } finally {
      setDashboardLoading(false);
    }
  }, [user]);

  const totalReleasedCents = summary?.totalReleasedToStripeCents ?? 0;

  const summaryCards = useMemo(() => {
    const pendingCard =
      !stripeDataOk
        ? {
            key: 'pending',
            label: 'Pending in Stripe',
            mode: 'text',
            text: 'Unavailable',
            hint: 'Processing before it becomes available.',
          }
        : {
            key: 'pending',
            label: 'Pending in Stripe',
            mode: 'money',
            value: (pendingCents ?? 0) / 100,
            hint: 'Processing before it becomes available.',
          };

    return [
      {
        key: 'available',
        label: 'Available now',
        mode: stripeDataOk ? 'money' : 'text',
        value: stripeDataOk ? availableAud : 0,
        text: stripeDataOk ? null : 'Live Stripe balance unavailable',
        hint: 'Available in your Stripe account.',
      },
      pendingCard,
      {
        key: 'secured',
        label: 'Secured client payments',
        mode: 'money',
        value: securedAud,
        hint: 'Active task payments not yet released.',
      },
      {
        key: 'totalReleased',
        label: 'Total released',
        mode: 'money',
        value: releasedAud,
        hint: 'Released by Taskio to Stripe.',
      },
    ];
  }, [stripeDataOk, availableAud, pendingCents, securedAud, releasedAud]);

  const heroPrimary = useMemo(() => {
    if (!summaryReady || activityLoading || activityError) return null;
    const tr = totalReleasedCents;
    const avCent = stripeDataOk ? (sb?.availableCents ?? 0) : null;
    const peCent = stripeDataOk ? (sb?.pendingCents ?? 0) : null;
    if (tr > 0) {
      return { kind: 'released', amountAud: tr / 100, label: 'Released to Stripe' };
    }
    if (stripeDataOk && peCent > 0) {
      return { kind: 'pending', amountAud: peCent / 100, label: 'Pending in Stripe' };
    }
    if (stripeDataOk && avCent > 0) {
      return { kind: 'available', amountAud: avCent / 100, label: 'Available in Stripe' };
    }
    return { kind: 'empty', amountAud: 0, label: 'No released balance yet' };
  }, [summaryReady, activityLoading, activityError, totalReleasedCents, stripeDataOk, sb]);

  const summaryCardsSafe = useMemo(() => {
    if (!summaryReady) return [];
    return summaryCards;
  }, [summaryReady, summaryCards]);

  const stripeCompactSummary =
    stripeDataOk && availableAud != null && pendingCents != null
      ? `${formatAud(availableAud)} available now · ${formatAud(pendingCents / 100)} pending in Stripe`
      : null;

  const [activitySearch, setActivitySearch] = useState('');
  const releasedCount =
    summary?.releasedJobCount ?? (Array.isArray(released) ? released.length : 0);

  const filteredReleased = useMemo(() => {
    if (!Array.isArray(released)) return [];
    const q = activitySearch.trim().toLowerCase();
    if (!q) return released;
    return released.filter((row) => {
      const title = String(getReleasedDisplayTitle(row) || '').toLowerCase();
      const ref = getRowDisplayReference(row).toLowerCase();
      return title.includes(q) || ref.includes(q);
    });
  }, [released, activitySearch]);

  const searchActive = activitySearch.trim().length > 0;

  const payoutSetupHeadline = useMemo(() => {
    if (meLoading) return 'Checking payout setup…';
    if (!hasStripeConnected) return 'Connect Stripe to receive payments';
    if (payoutReady) return 'Ready to receive released payments';
    return 'Finish payout setup to receive payments';
  }, [meLoading, hasStripeConnected, payoutReady]);

  return (
    <div className="pp-pay-expert">
      <section className="pp-pay-payout-status-card" aria-labelledby="pp-pay-payout-status-heading">
        {activityLoading ? (
          <>
            <h2 id="pp-pay-payout-status-heading" className="pp-pay-payout-status-title">
              Payout overview
            </h2>
            <div className="pp-pay-payout-status-loading" aria-busy="true">
              <div className="pp-pay-skeleton pp-pay-skeleton--title" />
              <div className="pp-pay-skeleton pp-pay-skeleton--line" />
              <div className="pp-pay-skeleton pp-pay-skeleton--line-short" />
            </div>
          </>
        ) : activityError ? (
          <>
            <h2 id="pp-pay-payout-status-heading" className="pp-pay-payout-status-title">
              Payout overview
            </h2>
            <p className="pp-pay-payout-status-message">We couldn&apos;t load balance summary. Check activity below.</p>
          </>
        ) : !hasStripeConnected ? (
          <>
            <h2 id="pp-pay-payout-status-heading" className="pp-pay-payout-status-title">
              Payout overview
            </h2>
            <p className="pp-pay-payout-status-lede">
              Connect your Stripe account to receive released payments.
            </p>
            <Link to="/profile" className="pp-pay-btn pp-pay-btn--primary pp-pay-payout-status-cta">
              Finish payout setup in profile
            </Link>
          </>
        ) : heroPrimary ? (
          <div className="pp-pay-payout-status-grid">
            <div className="pp-pay-payout-status-col pp-pay-payout-status-col--left">
              <h2 id="pp-pay-payout-status-heading" className="pp-pay-payout-status-title">
                Payout overview
              </h2>
              <div className="pp-pay-payout-status-balance" aria-live="polite">
                {formatAud(heroPrimary.amountAud)}
                <span className="pp-pay-payout-status-balance-label">{heroPrimary.label}</span>
              </div>
              {stripeCompactSummary ? (
                <p className="pp-pay-payout-status-compact">{stripeCompactSummary}</p>
              ) : (
                <p className="pp-pay-payout-status-compact pp-pay-payout-status-compact--muted">
                  Open Stripe dashboard for live balance and payout timing.
                </p>
              )}
              <p className="pp-pay-payout-status-tagline">Bank payout timing is managed by Stripe.</p>
              {paymentsFeeBlurb ? (
                <p className="pp-pay-fee-program-blurb">{paymentsFeeBlurb}</p>
              ) : null}
            </div>
            <div className="pp-pay-payout-status-col pp-pay-payout-status-col--right">
              <button
                type="button"
                className="pp-pay-btn pp-pay-btn--primary pp-pay-payout-hero-dash-btn"
                onClick={openStripeDashboard}
                disabled={dashboardLoading}
              >
                {dashboardLoading ? 'Opening…' : 'Open Stripe dashboard'}
              </button>
              {dashboardError ? (
                <p className="pp-pay-card-muted pp-pay-dashboard-error" role="alert">
                  {dashboardError}
                </p>
              ) : null}
            </div>
          </div>
        ) : null}
      </section>

      <div className={`pp-pay-summary-grid ${activityLoading ? 'pp-pay-summary-grid--loading' : ''}`}>
        {activityLoading ? (
          <>
            {[1, 2, 3, 4].map((k) => (
              <div key={k} className="pp-pay-summary-card pp-pay-summary-card--skeleton">
                <div className="pp-pay-skeleton pp-pay-skeleton--label" />
                <div className="pp-pay-skeleton pp-pay-skeleton--value" />
                <div className="pp-pay-skeleton pp-pay-skeleton--hint" />
              </div>
            ))}
          </>
        ) : activityError ? (
          <div className="pp-pay-summary-error" role="alert">
            <div className="pp-pay-summary-error-title">Could not load payment summary</div>
            <p className="pp-pay-summary-error-body">
              We couldn&apos;t load your payment activity. Please try again. Amounts are hidden so nothing misleading is
              shown.
            </p>
          </div>
        ) : (
          summaryCardsSafe.map((s) => (
            <div key={s.key} className="pp-pay-summary-card">
              <div className="pp-pay-summary-label">{s.label}</div>
              {s.mode === 'money' ? (
                <div className="pp-pay-summary-value">{formatAud(s.value)}</div>
              ) : (
                <div className="pp-pay-summary-value pp-pay-summary-value--text">{s.text}</div>
              )}
              {s.hint ? <div className="pp-pay-summary-hint">{s.hint}</div> : null}
            </div>
          ))
        )}
      </div>

      <div className="pp-pay-card pp-pay-card--activity pp-pay-card--ledger">
            <div className="pp-pay-ledger-toolbar">
              <div className="pp-pay-ledger-head">
                <div className="pp-pay-ledger-title-row">
                  <h2 id="pp-pay-recent-activity-heading" className="pp-pay-ledger-title">
                    Recent activity
                  </h2>
                  {summaryReady && !activityLoading && !activityError ? (
                    <span
                      className="pp-pay-ledger-released-meta"
                      aria-label={
                        releasedCount === 1 ? '1 released payment' : `${releasedCount} released payments`
                      }
                    >
                      {releasedCount === 1 ? '1 released payment' : `${releasedCount} released payments`}
                    </span>
                  ) : null}
                </div>
                <p className="pp-pay-ledger-subtitle">Released payments from completed tasks.</p>
              </div>
              {!activityLoading && !activityError && hasReleased ? (
                <div className="pp-pay-ledger-actions">
                  <input
                    type="search"
                    className="pp-pay-ledger-search"
                    placeholder="Search task or reference"
                    value={activitySearch}
                    onChange={(e) => setActivitySearch(e.target.value)}
                    aria-label="Search task or reference"
                  />
                  <button
                    type="button"
                    className="pp-pay-btn pp-pay-btn--secondary pp-pay-ledger-export-btn"
                    onClick={() => exportActivityToCsv({ released })}
                    aria-label="Export current payment activity as CSV"
                  >
                    Export CSV
                  </button>
                </div>
              ) : null}
            </div>

            {searchActive && hasReleased && !activityLoading && !activityError ? (
              <p className="pp-pay-ledger-filter-note" aria-live="polite">
                Showing {filteredReleased.length} of {released.length} released payments
              </p>
            ) : null}

            <div
              className={`pp-pay-table-wrap ${!hasReleased && !activityLoading ? 'pp-pay-table-wrap--empty-state' : ''}`}
              role="region"
              aria-labelledby="pp-pay-recent-activity-heading"
            >
              {activityLoading ? (
                <div className="pp-pay-table-empty pp-pay-table-loading">
                  <div className="pp-pay-empty-title">Loading activity…</div>
                </div>
              ) : activityError ? (
                <div className="pp-pay-table-empty pp-pay-table-empty--error">
                  <div className="pp-pay-empty-title">Activity unavailable</div>
                  <div className="pp-pay-empty-body">
                    We couldn&apos;t load your payment activity. Please try again.
                  </div>
                </div>
              ) : !hasReleased ? (
                <div className="pp-pay-table-empty">
                  <div className="pp-pay-empty-title">No released payments yet</div>
                  <div className="pp-pay-empty-body">
                    Once a Client approves completed work, your released payments will appear here.
                  </div>
                  <div className="pp-pay-empty-actions">
                    <Link to="/tradie/jobs" className="pp-pay-btn pp-pay-btn--primary">
                      View tasks
                    </Link>
                    <Link to="/tradie/dashboard" className="pp-pay-btn pp-pay-btn--ghost">
                      Go to dashboard
                    </Link>
                    <a href="#how-payouts-work" className="pp-pay-btn pp-pay-btn--link">
                      How payouts work
                    </a>
                  </div>
                </div>
              ) : filteredReleased.length === 0 && searchActive ? (
                <div className="pp-pay-table-empty pp-pay-table-empty--filtered">
                  <div className="pp-pay-empty-title">No matching payments</div>
                  <div className="pp-pay-empty-body">Try another task title or TSK reference.</div>
                </div>
              ) : (
                <>
                  <div className="pp-pay-table-head pp-pay-table-head--expert">
                    <div className="pp-pay-th pp-pay-col-date">Date</div>
                    <div className="pp-pay-th pp-pay-col-task-title">Task</div>
                    <div className="pp-pay-th pp-pay-col-ref">Reference</div>
                    <div className="pp-pay-th pp-pay-col-client">Client paid</div>
                    <div className="pp-pay-th pp-pay-col-fees">Taskio fee</div>
                    <div className="pp-pay-th pp-pay-col-your">Your released amount</div>
                    <div className="pp-pay-th pp-pay-col-status">Status</div>
                    <div className="pp-pay-th pp-pay-col-action">Action</div>
                  </div>
                  <div className="pp-pay-table-body pp-pay-table-body--expert">
                    {filteredReleased.map((row) => (
                      <div key={row.jobId} className="pp-pay-table-row pp-pay-table-row--expert">
                        <div className="pp-pay-td pp-pay-col-date">{formatActivityDate(row.releasedAtMs)}</div>
                        <div className="pp-pay-td pp-pay-col-task-title">
                          <span className="pp-pay-task-title">{getReleasedDisplayTitle(row)}</span>
                        </div>
                        <div className="pp-pay-td pp-pay-col-ref">{getRowDisplayReference(row)}</div>
                        <div className="pp-pay-td pp-pay-col-client">
                          {formatAud((row.clientPaidCents ?? row.totalGrossReleasedCents ?? 0) / 100)}
                        </div>
                        <div className="pp-pay-td pp-pay-col-fees">
                          {formatAud(expertTaskioFeeCents(row) / 100)}
                        </div>
                        <div className="pp-pay-td pp-pay-col-your">
                          <span className="pp-pay-amount-main">
                            {formatAud(((row.providerAmountCents ?? row.expertReleasedCents) ?? 0) / 100)}
                          </span>
                        </div>
                        <div className="pp-pay-td pp-pay-col-status">
                          <span className="pp-pay-status-cell">{STATUS_RELEASED_SHORT}</span>
                        </div>
                        <div className="pp-pay-td pp-pay-col-action">
                          <button type="button" className="pp-pay-link-btn" onClick={() => setDetailRow(row)}>
                            View details
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                  <div className="pp-pay-activity-cards" aria-label="Payment activity cards">
                    {filteredReleased.map((row) => (
                      <div key={`${row.jobId}-card`} className="pp-pay-activity-card">
                        <div className="pp-pay-activity-card-row">
                          <span className="pp-pay-activity-card-label">Date</span>
                          <span>{formatActivityDate(row.releasedAtMs)}</span>
                        </div>
                        <div className="pp-pay-activity-card-row">
                          <span className="pp-pay-activity-card-label">Task</span>
                          <span>{getReleasedDisplayTitle(row)}</span>
                        </div>
                        <div className="pp-pay-activity-card-row">
                          <span className="pp-pay-activity-card-label">Reference</span>
                          <span className="pp-pay-activity-card-strong">{getRowDisplayReference(row)}</span>
                        </div>
                        <div className="pp-pay-activity-card-row">
                          <span className="pp-pay-activity-card-label">Client paid</span>
                          <span>{formatAud((row.clientPaidCents ?? row.totalGrossReleasedCents ?? 0) / 100)}</span>
                        </div>
                        <div className="pp-pay-activity-card-row">
                          <span className="pp-pay-activity-card-label">Taskio fee</span>
                          <span>{formatAud(expertTaskioFeeCents(row) / 100)}</span>
                        </div>
                        <div className="pp-pay-activity-card-row">
                          <span className="pp-pay-activity-card-label">Your released amount</span>
                          <span className="pp-pay-activity-card-strong">
                            {formatAud(((row.providerAmountCents ?? row.expertReleasedCents) ?? 0) / 100)}
                          </span>
                        </div>
                        <div className="pp-pay-activity-card-row pp-pay-activity-card-row--status">
                          <span className="pp-pay-activity-card-label">Status</span>
                          <span className="pp-pay-activity-card-strong">{STATUS_RELEASED_SHORT}</span>
                        </div>
                        <button
                          type="button"
                          className="pp-pay-btn pp-pay-btn--ghost pp-pay-activity-card-cta"
                          onClick={() => setDetailRow(row)}
                        >
                          View details
                        </button>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>

            {!activityLoading && !activityError && hasReleased ? (
              <p className="pp-pay-ledger-export-note">
                CSV includes task reference, release date, Client paid, Taskio fee, and your released amount. For formal tax
                advice, speak with your accountant.
              </p>
            ) : null}
      </div>

      <div className="pp-pay-payout-setup-wrap" aria-label="Payout setup status">
        <section className="pp-pay-card pp-pay-card--setup pp-pay-setup-strip pp-pay-secondary-fin">
          <header className="pp-pay-setup-strip-header">
            <h3 className="pp-pay-secondary-fin-title">Payout setup</h3>
            <p className="pp-pay-setup-strip-subline">{payoutSetupHeadline}</p>
          </header>
          <ul className="pp-pay-setup-strip-items">
            <li className="pp-pay-setup-strip-cell">
              <span className="pp-pay-setup-strip-label">Stripe account</span>
              <span
                className={`pp-pay-setup-pill pp-pay-setup-pill--strip ${hasStripeConnected ? 'pp-pay-setup-pill--ok' : 'pp-pay-setup-pill--warn'}`}
              >
                {hasStripeConnected ? 'Connected' : 'Action required'}
              </span>
            </li>
            <li className="pp-pay-setup-strip-cell">
              <span className="pp-pay-setup-strip-label">Payout setup</span>
              <span
                className={`pp-pay-setup-pill pp-pay-setup-pill--strip ${
                  meLoading ? 'pp-pay-setup-pill--muted' : payoutReady ? 'pp-pay-setup-pill--ok' : 'pp-pay-setup-pill--warn'
                }`}
              >
                {meLoading ? 'Checking…' : payoutReady ? 'Complete' : 'Incomplete'}
              </span>
            </li>
            <li className="pp-pay-setup-strip-cell">
              <span className="pp-pay-setup-strip-label">Bank payout timing</span>
              <span className="pp-pay-setup-pill pp-pay-setup-pill--strip pp-pay-setup-pill--neutral">
                Managed by Stripe
              </span>
            </li>
          </ul>
          {!meLoading && !payoutReady ? (
            <div className="pp-pay-setup-profile-action">
              <Link to="/profile" className="pp-pay-btn pp-pay-btn--secondary pp-pay-setup-profile-link">
                Complete payout setup in profile
              </Link>
            </div>
          ) : null}
          <p className="pp-pay-setup-copy pp-pay-setup-copy--subtle">
            Stripe shows live balance, payout schedule, fees, and bank payout details.
          </p>
          {meError ? (
            <p className="pp-pay-card-muted" role="alert">
              We couldn&apos;t load payout setup status. You can continue from your profile.
            </p>
          ) : null}
        </section>
      </div>

      <details className="pp-pay-help-accordion" id="how-payouts-work">
        <summary className="pp-pay-help-accordion-summary">
          <span className="pp-pay-help-accordion-summary-main">
            <span className="pp-pay-help-accordion-heading">How payouts work</span>
            <span className="pp-pay-help-accordion-preview">
              Client approval → Taskio release → Stripe bank payout timing
            </span>
          </span>
          <span className="pp-pay-help-accordion-chevron" aria-hidden="true" />
        </summary>
        <div className="pp-pay-help-accordion-body">
          <ol className="pp-pay-steps pp-pay-steps--compact">
            <li>
              <strong>Client approves completion</strong>
            </li>
            <li>
              <strong>Taskio releases your share to Stripe</strong>
            </li>
            <li>
              <strong>Stripe manages bank payout timing</strong>
            </li>
          </ol>
          <p className="pp-pay-card-muted pp-pay-help-accordion-support">
            Use{' '}
            <Link to="/support" className="pp-pay-support-link">
              Support
            </Link>{' '}
            if you need help with a payment. Include the task reference.
          </p>
        </div>
      </details>

      {detailRow ? (
        <PaymentBreakdownModal row={detailRow} onClose={closeModal} />
      ) : null}
    </div>
  );
}

export default function PaymentsPage() {
  const navigate = useNavigate();
  const [user, loading] = useAuthState(auth);
  const [profile, setProfile] = useState(null);
  const [meProfile, setMeProfile] = useState(null);
  const [foundingExpertFeeProfile, setFoundingExpertFeeProfile] = useState(null);
  const [meLoading, setMeLoading] = useState(false);
  const [meError, setMeError] = useState(false);

  useEffect(() => {
    if (!loading && !user) navigate('/login');
  }, [loading, user, navigate]);

  useEffect(() => {
    const run = async () => {
      if (!user) return;
      try {
        const snap = await getDoc(doc(db, 'users', user.uid));
        setProfile(snap.exists() ? snap.data() : { role: 'homeowner' });
      } catch (e) {
        console.error('Profile read failed:', e);
        setProfile({ role: 'homeowner' });
      }
    };
    run();
  }, [user]);

  const role = useMemo(() => {
    const r = profile?.role;
    if (r === 'tradie' || r === 'homeowner' || r === 'admin') return r;
    return 'homeowner';
  }, [profile]);

  useEffect(() => {
    if (!user || role !== 'tradie') {
      setMeProfile(null);
      setFoundingExpertFeeProfile(null);
      setMeError(false);
      setMeLoading(false);
      return;
    }
    let cancelled = false;
    setMeLoading(true);
    setMeError(false);
    (async () => {
      try {
        const token = await user.getIdToken();
        const config = { headers: { Authorization: `Bearer ${token}` } };
        const res = await api.get('/api/me', config);
        const p = res?.data?.profile ?? null;
        const fep = res?.data?.foundingExpertFeeProfile ?? null;
        if (!cancelled) setMeProfile(p);
        if (!cancelled) setFoundingExpertFeeProfile(fep);
      } catch (e) {
        console.error('Payments page /api/me failed:', e);
        if (!cancelled) {
          setMeProfile(null);
          setFoundingExpertFeeProfile(null);
          setMeError(true);
        }
      } finally {
        if (!cancelled) setMeLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user, role]);

  const headerName = profile?.name || user?.displayName || '';
  const headerEmail = profile?.email || user?.email || '';

  if (loading || !user) {
    return <PageLoadingShell message="Loading payments…" detail="Getting your billing and activity context." />;
  }

  const isExpert = role === 'tradie';

  return (
    <>
      <AppHeader userRole={role} userName={headerName} userEmail={headerEmail} />
      <PageMain label="Payments and billing">
      <div style={styles.page}>
        <div
          style={styles.container}
          className={isExpert ? 'pp-pay-container pp-pay-container--expert' : 'pp-pay-container pp-pay-container--client'}
        >
          <div style={styles.headerRow} className={isExpert ? 'pp-pay-header' : undefined}>
            <div className={isExpert ? 'pp-pay-page-head' : undefined}>
              <h1 style={{ ...styles.title, margin: 0 }} className={isExpert ? 'pp-pay-page-title' : undefined}>
                Payments & Billing
              </h1>
              <div style={styles.subTitle} className={isExpert ? 'pp-pay-page-subtitle' : undefined}>
                {isExpert ? (
                  <>
                    <span className="pp-pay-subtitle-desktop">
                      Payments, payouts, and activity in one place.
                    </span>
                    <span className="pp-pay-subtitle-mobile">Payments and activity in one place.</span>
                  </>
                ) : (
                  'Pay securely on tasks, approve completion to release payment, and track receipts — all in one place.'
                )}
              </div>
            </div>
          </div>

          {isExpert ? (
            <ExpertPaymentsContent
              user={user}
              meProfile={meProfile}
              meLoading={meLoading}
              meError={meError}
              foundingExpertFeeProfile={foundingExpertFeeProfile}
            />
          ) : (
            <>
              <div style={styles.card}>
                <div style={{ fontWeight: 900, marginBottom: 6 }}>What you&apos;ll see here</div>
                {role === 'homeowner' ? (
                  <div style={{ fontSize: 13, color: '#666', lineHeight: 1.5 }}>
                    You pay securely when you fund an accepted quote. Payment is not released to the Expert until you approve
                    completed work; then it is released for the Expert&apos;s payout. History and receipts will show here as they
                    become available.{' '}
                    <Link to="/terms" style={{ color: '#14C5C5', fontWeight: 800, textDecoration: 'none' }}>
                      Terms of Use
                    </Link>{' '}
                    set out how payment release, refunds, and disputes work.
                  </div>
                ) : (
                  <div style={{ fontSize: 13, color: '#666' }}>Admin payment overview.</div>
                )}
              </div>

              <div style={styles.card}>
                <div style={{ fontWeight: 900, marginBottom: 10 }}>Recent activity</div>
                <div style={styles.empty}>
                  <div style={{ fontWeight: 900, marginBottom: 6 }}>
                    {role === 'homeowner' ? 'No payments yet' : 'No activity yet'}
                  </div>
                  <div style={{ color: '#666', fontSize: 13, lineHeight: 1.5 }}>
                    {role === 'homeowner'
                      ? 'Receipts and activity will appear here after you pay securely for a task.'
                      : 'Payment records will appear here when available.'}
                  </div>
                  <div style={{ marginTop: 10 }}>
                    <Link to={role === 'homeowner' ? '/dashboard' : '/admin/dashboard'} style={styles.link}>
                      Back to dashboard
                    </Link>
                  </div>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
      </PageMain>
    </>
  );
}

const styles = {
  page: { background: '#F7F9FA', minHeight: 'calc(100vh - 64px)' },
  container: { maxWidth: 1160, margin: '0 auto', padding: '28px clamp(16px, 4vw, 36px) 40px' },
  headerRow: { display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start', marginBottom: 24 },
  title: { fontFamily: 'Poppins, sans-serif', fontSize: 26, fontWeight: 900, color: '#0f172a', letterSpacing: '-0.03em' },
  subTitle: { fontSize: 14, color: '#64748b', marginTop: 8, lineHeight: 1.55, maxWidth: '56ch' },
  card: { background: '#fff', border: '1px solid #E0E0E0', borderRadius: 12, padding: 16, boxShadow: '0 2px 8px rgba(0,0,0,0.06)', marginTop: 12 },
  empty: { padding: 14, borderRadius: 12, border: '1px dashed #E0E0E0', background: '#F7F9FA' },
  link: { color: '#14C5C5', textDecoration: 'none', fontWeight: 900 },
};
