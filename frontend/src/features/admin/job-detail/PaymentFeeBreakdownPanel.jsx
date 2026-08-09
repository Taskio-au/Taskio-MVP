import React, { useMemo } from 'react';

function formatMoneyCents(cents) {
  if (cents == null || !Number.isFinite(Number(cents))) return '—';
  return new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD' }).format(Number(cents) / 100);
}

function readablePaymentState(paymentStateRaw) {
  const ps = String(paymentStateRaw || '').trim().toLowerCase();
  if (!ps) return '—';
  if (ps === 'payment_failed') return 'Payment failed';
  if (ps === 'refund_pending') return 'Refund pending';
  if (ps === 'refunded') return 'Refunded';
  if (ps === 'disputed') return 'Disputed (payment)';
  return ps.replace(/_/g, ' ');
}

function feeStageDisplay(stage) {
  if (!stage || typeof stage !== 'string') return '—';
  return stage.trim().replace(/_/g, ' ');
}

/** @param {Record<string, string|null|undefined>|null|undefined} obj */
function formatTransferIdsMap(obj) {
  if (!obj || typeof obj !== 'object') return '—';
  const entries = Object.entries(obj).filter(([, v]) => v != null && String(v).trim() !== '');
  if (entries.length === 0) return '—';
  return entries.map(([k, v]) => `${k}: ${String(v).trim()}`).join('; ');
}

/**
 * Compact release message for admins (prefer user-facing copy rules).
 *
 * @param {Record<string, unknown>} s paymentFeeSummary
 */
export function adminReleaseStatusLabel(s) {
  if (!s) return '—';
  if (s.releasedToStripe === true || String(s.paymentState || '').toLowerCase() === 'released')
    return 'Released to Stripe';
  const ps = String(s.paymentState || '').toLowerCase();
  const paySt = String(s.paymentStatus || '').toLowerCase();
  if (ps === 'in_escrow' || paySt === 'succeeded') return 'Payment secured — not released yet';
  return readablePaymentState(s.paymentState);
}

const rowSx = {
  label: { fontSize: 12, color: '#6b7280', fontWeight: 600 },
  value: { fontSize: 14, color: '#0f172a', textAlign: 'right', fontVariantNumeric: 'tabular-nums' },
  row: { display: 'grid', gridTemplateColumns: '1fr auto', gap: 12, alignItems: 'baseline', padding: '6px 0', borderBottom: '1px solid #f1f5f9' },
};

/**
 * Admin/support-only payment & fee readout (`paymentFeeSummary` from GET /api/admin/jobs/:jobId).
 */
export default function PaymentFeeBreakdownPanel({ summary, styles: S }) {
  const cardStyle = useMemo(() => (S?.card ? S.card : { backgroundColor: '#fff', borderRadius: 8, padding: 20 }), [S]);

  const sectionTitle = S?.sectionTitle || { margin: 0, fontSize: 18 };

  if (!summary) {
    return (
      <div style={cardStyle}>
        <h2 style={sectionTitle}>Payment &amp; fee breakdown</h2>
        <p style={{ marginTop: 8, fontSize: 13, color: '#64748b' }}>Financial summary unavailable for this task.</p>
      </div>
    );
  }

  if (!summary.available) {
    return (
      <div style={cardStyle}>
        <h2 style={sectionTitle}>Payment &amp; fee breakdown</h2>
        <p style={{ marginTop: 8, fontSize: 13, color: '#64748b' }}>No payable funding recorded for this task yet.</p>
      </div>
    );
  }

  const variationPaid = summary.variationClientPaidCents != null && Number(summary.variationClientPaidCents) > 0;
  const warnLegacy = !!summary.legacyOrMissingSnapshot || (typeof summary.warning === 'string' && summary.warning.trim());

  return (
    <div style={cardStyle}>
      <h2 style={sectionTitle}>Payment &amp; fee breakdown</h2>

      {warnLegacy ? (
        <div
          style={{
            marginTop: 10,
            padding: '8px 10px',
            borderRadius: 6,
            border: '1px solid #e2e8f0',
            background: '#f8fafc',
            fontSize: 12,
            color: '#475569',
          }}
        >
          {(typeof summary.warning === 'string' && summary.warning.trim()) ||
            'Legacy payment record — some fee details may be estimated from stored release totals.'}
        </div>
      ) : null}

      <div data-testid="payment-fee-breakdown-main" style={{ marginTop: 12 }}>
        <div style={{ ...rowSx.row, borderTop: '1px solid #e2e8f0', paddingTop: 10 }}>
          <span style={rowSx.label}>Client paid</span>
          <span style={rowSx.value}>{formatMoneyCents(summary.clientPaidCents)}</span>
        </div>
        <div style={rowSx.row}>
          <span style={rowSx.label}>Base task amount</span>
          <span style={rowSx.value}>{formatMoneyCents(summary.baseClientPaidCents)}</span>
        </div>
        <div style={rowSx.row}>
          <span style={rowSx.label}>Approved paid variations</span>
          <span style={rowSx.value}>
            {variationPaid ? formatMoneyCents(summary.variationClientPaidCents) : '—'}
          </span>
        </div>
        <div style={rowSx.row}>
          <span style={rowSx.label}>Taskio fee</span>
          <span style={rowSx.value}>{formatMoneyCents(summary.taskioFeeCents)}</span>
        </div>
        {variationPaid ? (
          <>
            <div style={{ ...rowSx.row, opacity: 0.92 }}>
              <span style={rowSx.label}> · Base Taskio fee</span>
              <span style={rowSx.value}>{formatMoneyCents(summary.baseTaskioFeeCents)}</span>
            </div>
            <div style={{ ...rowSx.row, opacity: 0.92 }}>
              <span style={rowSx.label}> · Variation Taskio fee</span>
              <span style={rowSx.value}>{formatMoneyCents(summary.variationTaskioFeeCents)}</span>
            </div>
          </>
        ) : null}
        <div style={rowSx.row}>
          <span style={rowSx.label}>Expert released amount</span>
          <span style={rowSx.value}>{formatMoneyCents(summary.expertReleasedCents)}</span>
        </div>
        {variationPaid ? (
          <>
            <div style={{ ...rowSx.row, opacity: 0.92 }}>
              <span style={rowSx.label}> · Base expert released</span>
              <span style={rowSx.value}>{formatMoneyCents(summary.baseExpertReleasedCents)}</span>
            </div>
            <div style={{ ...rowSx.row, opacity: 0.92 }}>
              <span style={rowSx.label}> · Variation expert released</span>
              <span style={rowSx.value}>{formatMoneyCents(summary.variationExpertReleasedCents)}</span>
            </div>
          </>
        ) : null}
        <div style={rowSx.row}>
          <span style={rowSx.label}>Fee stage</span>
          <span style={rowSx.value}>{feeStageDisplay(summary.feeStage)}</span>
        </div>
        <div style={rowSx.row}>
          <span style={rowSx.label}>Fee programme</span>
          <span style={rowSx.value}>{summary.feeBenefitLabel || '—'}</span>
        </div>
        <div style={rowSx.row}>
          <span style={rowSx.label}>Fee source</span>
          <span style={{ ...rowSx.value, fontSize: 13, maxWidth: 340, whiteSpace: 'normal' }}>
            {variationPaid
              ? `Base: ${summary.baseReleaseFeeSource || '—'} · Variation: ${summary.variationReleaseFeeSource || '—'}`
              : (summary.baseReleaseFeeSource || '—')}
          </span>
        </div>
        <div style={rowSx.row}>
          <span style={rowSx.label}>Zero-fee slot consumed</span>
          <span style={rowSx.value}>{summary.zeroFeeSlotConsumed === true ? 'Yes' : summary.zeroFeeSlotConsumed === false ? 'No' : '—'}</span>
        </div>
        <div style={{ ...rowSx.row, borderBottom: 'none' }}>
          <span style={rowSx.label}>Release status</span>
          <span style={rowSx.value}>{adminReleaseStatusLabel(summary)}</span>
        </div>
      </div>

      <details style={{ marginTop: 14 }}>
        <summary style={{ cursor: 'pointer', fontSize: 13, fontWeight: 700, color: '#0f766e', userSelect: 'none' }}>
          Support &amp; Stripe references
        </summary>
        <div style={{ marginTop: 10, fontSize: 12, color: '#334155', lineHeight: 1.6 }}>
          <div style={{ padding: '6px 0', borderBottom: '1px solid #f1f5f9' }}>
            <div style={{ color: '#64748b', fontWeight: 600 }}>PaymentIntent ID</div>
            <div>{summary.basePaymentIntentId || '—'}</div>
          </div>
          <div style={{ padding: '6px 0', borderBottom: '1px solid #f1f5f9' }}>
            <div style={{ color: '#64748b', fontWeight: 600 }}>Base transfer ID</div>
            <div>{summary.baseTransferId || '—'}</div>
          </div>
          <div style={{ padding: '6px 0', borderBottom: '1px solid #f1f5f9' }}>
            <div style={{ color: '#64748b', fontWeight: 600 }}>Variation transfer IDs</div>
            <div>{formatTransferIdsMap(summary.variationTransferIds)}</div>
          </div>
          <div style={{ padding: '6px 0', borderBottom: '1px solid #f1f5f9' }}>
            <div style={{ color: '#64748b', fontWeight: 600 }}>Base release fee source</div>
            <div>{summary.baseReleaseFeeSource || '—'}</div>
          </div>
          <div style={{ padding: '6px 0', borderBottom: '1px solid #f1f5f9' }}>
            <div style={{ color: '#64748b', fontWeight: 600 }}>Variation release fee source</div>
            <div>{summary.variationReleaseFeeSource || '—'}</div>
          </div>
          <div style={{ padding: '6px 0' }}>
            <div style={{ color: '#64748b', fontWeight: 600 }}>Snapshot locked date</div>
            <div>
              {summary.snapshotLockedAtMs != null && Number.isFinite(Number(summary.snapshotLockedAtMs))
                ? new Date(Number(summary.snapshotLockedAtMs)).toLocaleString()
                : '—'}
            </div>
          </div>
          <div style={{ paddingTop: 8 }}>
            <div style={{ color: '#64748b', fontWeight: 600 }}>paymentState (internal)</div>
            <div style={{ fontFamily: 'monospace' }}>{String(summary.paymentState || '—')}</div>
          </div>
        </div>
      </details>
    </div>
  );
}

export { formatMoneyCents };
