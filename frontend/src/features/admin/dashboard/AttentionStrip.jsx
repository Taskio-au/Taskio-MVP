import React from 'react';
import { ATTENTION_NO_OFFER_HOURS, PROFILE_REQUEST_STALE_HOURS, STALE_OPEN_HOURS } from '../../../utils/adminOps';

/**
 * Today's Attention strip - clickable cards for operational triage.
 * Extracted from Dashboard.js to reduce maintainability debt.
 */
export default function AttentionStrip({
  attention,
  opsSummary,
  onGoAttention,
  onGoStaleProfileRequests,
  styles,
}) {
  return (
    <div style={styles.attentionStrip}>
      <button type="button" onClick={() => onGoAttention('no_offer_6h')} style={styles.attentionCard}>
        <div style={styles.attentionValue}>{attention.loading ? '—' : attention.noOffer6h}</div>
        <div style={styles.attentionLabel}>Tasks with 0 offers (after {ATTENTION_NO_OFFER_HOURS}h)</div>
      </button>
      <button type="button" onClick={() => onGoAttention('stale_open_24h')} style={styles.attentionCard}>
        <div style={styles.attentionValue}>{attention.loading ? '—' : attention.staleOpen24h}</div>
        <div style={styles.attentionLabel}>Tasks open &gt; {STALE_OPEN_HOURS}h</div>
      </button>
      <button type="button" onClick={() => onGoAttention('disputes_unreviewed')} style={styles.attentionCard}>
        <div style={styles.attentionValue}>{attention.loading ? '—' : attention.disputesUnreviewed}</div>
        <div style={styles.attentionLabel}>Open disputes (unreviewed)</div>
      </button>
      <button type="button" onClick={() => onGoAttention('failed_payments')} style={styles.attentionCard}>
        <div style={styles.attentionValue}>{opsSummary?.loading ? '—' : (opsSummary?.failedPayments ?? '—')}</div>
        <div style={styles.attentionLabel}>Failed payments to review</div>
      </button>
      <button type="button" onClick={() => onGoAttention('disputes_stale_24h')} style={styles.attentionCard}>
        <div style={styles.attentionValue}>{opsSummary?.loading ? '—' : (opsSummary?.disputesStale24h ?? '—')}</div>
        <div style={styles.attentionLabel}>Disputes unresolved &gt;24h</div>
      </button>
      <button type="button" onClick={onGoStaleProfileRequests} style={styles.attentionCard}>
        <div style={styles.attentionValue}>{attention.loading ? '—' : attention.profileRequests48h}</div>
        <div style={styles.attentionLabel}>Profile change requests &gt; {PROFILE_REQUEST_STALE_HOURS}h</div>
      </button>
    </div>
  );
}
