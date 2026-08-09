import React, { useEffect, useState } from 'react';
import { JOB_STATUSES, normalizeStatus } from '../../../constants/jobStatuses';

const STATUS_OPTIONS = [
  JOB_STATUSES.OPEN,
  JOB_STATUSES.QUOTED,
  JOB_STATUSES.ASSIGNED,
  JOB_STATUSES.AWAITING_FUNDING,
  JOB_STATUSES.FUNDED,
  JOB_STATUSES.IN_PROGRESS,
  JOB_STATUSES.COMPLETED,
  JOB_STATUSES.PAID,
  JOB_STATUSES.DISPUTED,
  JOB_STATUSES.CANCELLED,
  JOB_STATUSES.REFUND_PENDING,
  JOB_STATUSES.REFUNDED,
];

export default function AdminJobOpsExtras({
  job,
  styles: S,
  onResolveDispute,
  onMarkRefunded,
  onStatusOverride,
  busy,
  canResolveDispute = true,
}) {
  const [statusPick, setStatusPick] = useState(JOB_STATUSES.OPEN);

  useEffect(() => {
    if (job?.status) setStatusPick(normalizeStatus(job.status));
  }, [job?.status, job?.id]);

  if (!job) return null;

  const n = normalizeStatus(job.status);
  const isDisputed = n === JOB_STATUSES.DISPUTED;

  return (
    <>
      {(n === JOB_STATUSES.REFUND_PENDING || n === JOB_STATUSES.REFUNDED) && (
        <div style={S.card}>
          <h2 style={S.sectionTitle}>Refund</h2>
          {busy && (
            <p style={{ margin: '0 0 10px', fontSize: 13, color: '#6B7280' }}>Processing...</p>
          )}
          {n === JOB_STATUSES.REFUND_PENDING && (
            <p style={{ margin: '0 0 10px', fontSize: 14, color: '#0F766E' }}>Refund processing…</p>
          )}
          {n === JOB_STATUSES.REFUNDED && (
            <p style={{ margin: '0 0 10px', fontSize: 14, color: '#475569' }}>Refund completed</p>
          )}
          {n === JOB_STATUSES.REFUND_PENDING && (
            <button
              type="button"
              style={S.buttonSecondary}
              disabled={busy}
              onClick={() => {
                if (!window.confirm('Mark as REFUNDED without a new Stripe call? Only if webhook failed but funds already refunded.')) return;
                onMarkRefunded();
              }}
            >
              {busy ? 'Processing...' : 'Mark refunded (fallback)'}
            </button>
          )}
        </div>
      )}

      {isDisputed && (
        <div style={S.card}>
          <h2 style={S.sectionTitle}>Dispute</h2>
          {busy && (
            <p style={{ margin: '0 0 10px', fontSize: 13, color: '#6B7280' }}>Processing...</p>
          )}
          <div style={{ fontSize: 13, color: '#374151', marginBottom: 8 }}>
            <div><strong>Client reason:</strong> {job.clientDisputeReason || '—'}</div>
            <div style={{ marginTop: 6 }}><strong>Payment state:</strong> {job.paymentState || '—'}</div>
            <div style={{ marginTop: 6 }}><strong>Disputed at:</strong> {job.disputedAt?._seconds ? new Date(job.disputedAt._seconds * 1000).toLocaleString() : '—'}</div>
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', flexDirection: 'column', alignItems: 'flex-start' }}>
            {canResolveDispute ? (
              <>
                <button
                  type="button"
                  style={S.primaryButton}
                  disabled={busy}
                  onClick={() => {
                    if (!window.confirm('Release payment to the expert and close dispute?')) return;
                    onResolveDispute('expert');
                  }}
                >
                  {busy ? 'Processing...' : 'Resolve in favour of expert'}
                </button>
                <button
                  type="button"
                  style={S.dangerButton}
                  disabled={busy}
                  onClick={() => {
                    if (!window.confirm('Issue full refund to the client?')) return;
                    onResolveDispute('refund');
                  }}
                >
                  {busy ? 'Processing...' : 'Refund client'}
                </button>
              </>
            ) : (
              <p style={{ margin: 0, fontSize: 13, color: '#6b7280' }}>
                Dispute payout/refund actions require super admin.
              </p>
            )}
          </div>
        </div>
      )}

      <div style={S.card}>
        <h2 style={S.sectionTitle}>Force status</h2>
        {busy && (
          <p style={{ margin: '0 0 8px', fontSize: 13, color: '#6B7280' }}>Processing...</p>
        )}
        <p style={{ fontSize: 12, color: '#6B7280', marginTop: 0 }}>
          Server validates against allowed transitions.
        </p>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <select
            value={statusPick}
            onChange={(e) => setStatusPick(e.target.value)}
            disabled={busy}
            style={S.filterSelect}
          >
            {STATUS_OPTIONS.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
          <button
            type="button"
            style={S.buttonSecondary}
            disabled={busy || statusPick === n}
            onClick={() => {
              if (!window.confirm(`Set task status to ${statusPick}?`)) return;
              onStatusOverride(statusPick);
            }}
          >
            {busy ? 'Processing...' : 'Apply'}
          </button>
        </div>
      </div>
    </>
  );
}
