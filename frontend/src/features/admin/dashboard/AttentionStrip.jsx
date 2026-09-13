import React from 'react';
import { ATTENTION_ONE_QUOTE_HOURS, ATTENTION_ZERO_QUOTES_MINUTES, PROFILE_REQUEST_STALE_HOURS } from '../../../utils/adminOps';

/**
 * Today's Attention strip - clickable cards for operational triage.
 * Extracted from Dashboard.js to reduce maintainability debt.
 */
export default function AttentionStrip({
  attention,
  opsSummary,
  jobAttention,
  jobAttentionLoadState,
  onGoAttention,
  onGoStaleProfileRequests,
  styles,
}) {
  const quoteCountsLoading = jobAttentionLoadState === 'loading' || attention.loading;
  const zeroQuotes = jobAttentionLoadState === 'error' || !jobAttention
    ? '—'
    : (jobAttention.summary?.zeroQuotes60m ?? 0);
  const oneQuote = jobAttentionLoadState === 'error' || !jobAttention
    ? '—'
    : (jobAttention.summary?.oneQuote3h ?? 0);
  return (
    <div style={styles.attentionStrip}>
      <button type="button" onClick={() => onGoAttention('no_quotes_60m')} style={styles.attentionCard}>
        <div style={styles.attentionValue}>{quoteCountsLoading ? '—' : zeroQuotes}</div>
        <div style={styles.attentionLabel}>0 quotes after {ATTENTION_ZERO_QUOTES_MINUTES}m</div>
      </button>
      <button type="button" onClick={() => onGoAttention('one_quote_3h')} style={styles.attentionCard}>
        <div style={styles.attentionValue}>{quoteCountsLoading ? '—' : oneQuote}</div>
        <div style={styles.attentionLabel}>1 quote after {ATTENTION_ONE_QUOTE_HOURS}h</div>
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
