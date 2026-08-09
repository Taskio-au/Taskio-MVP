import React, { memo, useMemo, useRef, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { CLIENT_LABEL } from '../../utils/roleLabels';
import { EXPERT_QUOTE_READINESS, EXPERT_QUOTE_READINESS_PENDING_ADMIN, EXPERT_STRIPE_GATE } from '../../constants/blockedFlowCopy';
import { isExpertQuoteReadinessAwaitingAdminOnly } from '../../utils/taskExpertEligibility';

/** Expert quote card — narrow screens: less dense stacks, full-width CTAs, wrapping copy */
const EXPERT_QUOTE_MOBILE_CSS = `
  .tradie-quote-card-inner {
    min-width: 0;
  }
  @media (max-width: 480px) {
    .tradie-quote-card-root.tradie-expert-quote-card {
      padding: 16px !important;
      box-sizing: border-box !important;
    }
    .tradie-quote-card-root h2 {
      font-size: 16px !important;
      line-height: 1.3 !important;
      word-break: break-word;
      margin-bottom: 12px !important;
      padding-bottom: 8px !important;
    }
    .tradie-quote-quoted-meta {
      display: flex !important;
      flex-wrap: wrap !important;
      gap: 4px 8px !important;
      line-height: 1.45 !important;
    }
    .tradie-quote-revision-banner {
      font-size: 13px !important;
      line-height: 1.45 !important;
    }
    .tradie-quote-eligibility-panel {
      padding: 14px !important;
      margin-bottom: 14px !important;
    }
    .tradie-quote-eligibility-head {
      flex-direction: column !important;
      align-items: stretch !important;
      gap: 10px !important;
    }
    .tradie-quote-profile-cta {
      white-space: normal !important;
      text-align: center !important;
      width: 100% !important;
      box-sizing: border-box !important;
      min-height: 44px !important;
      display: flex !important;
      align-items: center !important;
      justify-content: center !important;
    }
    .tradie-quote-checklist-label {
      word-break: break-word;
    }
    .tradie-quote-stripe-panel {
      padding: 14px !important;
      margin-bottom: 14px !important;
    }
    .tradie-quote-stripe-btns {
      flex-direction: column !important;
      align-items: stretch !important;
      gap: 10px !important;
    }
    .tradie-quote-stripe-btns button {
      width: 100% !important;
      min-height: 44px !important;
      box-sizing: border-box !important;
    }
    .tradie-quote-ai-box {
      padding: 12px !important;
      margin-bottom: 12px !important;
    }
    .tradie-quote-ai-box .tradie-ai-btn {
      width: 100% !important;
      min-height: 44px !important;
      box-sizing: border-box !important;
    }
    .tradie-quote-form .tradie-quote-helper-ai {
      font-size: 12px !important;
      line-height: 1.45 !important;
      overflow-wrap: anywhere;
    }
    .tradie-quote-form label {
      line-height: 1.35 !important;
      word-break: break-word;
    }
    .tradie-quote-form input[type="number"],
    .tradie-quote-form input {
      font-size: 16px !important;
      min-height: 48px !important;
    }
    .tradie-quote-form textarea {
      font-size: 16px !important;
      line-height: 1.45 !important;
    }
    .tradie-submit-quote-btn {
      min-height: 48px !important;
      margin-top: 4px !important;
    }
    .tradie-quote-withdraw-btn {
      min-height: 48px !important;
    }
    .tradie-quote-inline-error {
      overflow-wrap: anywhere;
    }
    .tradie-quote-eligibility-note {
      overflow-wrap: anywhere;
      font-size: 12px !important;
    }
  }
`;

/** Debounce delay for POST /api/tradie/fee-estimate (matches test advancement). */
export const FEE_ESTIMATE_DEBOUNCE_MS = 400;

function formatAudFromCents(cents) {
  const n = Number(cents);
  if (!Number.isFinite(n)) return '$0.00';
  try {
    return new Intl.NumberFormat('en-AU', {
      style: 'currency',
      currency: 'AUD',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(n / 100);
  } catch {
    return `$${(n / 100).toFixed(2)}`;
  }
}

function formatAuDateMedium(ms) {
  if (ms == null || !Number.isFinite(Number(ms))) return '';
  try {
    return new Intl.DateTimeFormat('en-AU', { dateStyle: 'medium' }).format(new Date(Number(ms)));
  } catch {
    return '';
  }
}

function parsePositiveAudCents(amountStr) {
  if (amountStr === '' || amountStr == null) return null;
  const num = typeof amountStr === 'number' ? amountStr : parseFloat(String(amountStr).trim());
  if (!Number.isFinite(num) || num <= 0) return null;
  const cents = Math.round(num * 100);
  if (!Number.isFinite(cents) || cents <= 0) return null;
  return cents;
}

function QuoteSubmissionCard({
  className = '',
  styles,
  revisionRequest,
  success,
  myQuote,
  withdrawing,
  onWithdrawQuote,
  stripeStatus,
  onStartStripeOnboarding,
  onRefreshStripeStatus,
  refreshingStripe,
  eligibilityLoading,
  eligibility,
  aiBusy,
  onRunAiQuoteAssistant,
  aiError,
  aiAssumptions,
  quoteData,
  onQuoteChange,
  aiSuggestedRange,
  error,
  submitting,
  onQuoteSubmit,
  jobId,
  foundingExpertFeeProfile = null,
  fetchFeeEstimate = null,
}) {
  const awaitingAdminOnly = useMemo(
    () => isExpertQuoteReadinessAwaitingAdminOnly(eligibility?.items || []),
    [eligibility?.items]
  );

  const readinessTitle = awaitingAdminOnly
    ? EXPERT_QUOTE_READINESS_PENDING_ADMIN.title
    : EXPERT_QUOTE_READINESS.title;

  const [feeEstimate, setFeeEstimate] = useState(null);
  const [feeEstimateLoading, setFeeEstimateLoading] = useState(false);
  const [feeEstimateError, setFeeEstimateError] = useState(false);

  const feeReqSeqRef = useRef(0);

  useEffect(() => {
    const bumpSeq = () => {
      feeReqSeqRef.current += 1;
    };

    const resetFeeState = ({ markUnavailable }) => {
      bumpSeq();
      setFeeEstimate(null);
      setFeeEstimateLoading(false);
      setFeeEstimateError(!!markUnavailable);
    };

    if (eligibilityLoading || !eligibility?.eligible) {
      resetFeeState({ markUnavailable: false });
      return undefined;
    }

    const grossCents = parsePositiveAudCents(quoteData?.amount);

    if (grossCents == null) {
      resetFeeState({ markUnavailable: false });
      return undefined;
    }

    if (!jobId || typeof fetchFeeEstimate !== 'function') {
      resetFeeState({ markUnavailable: true });
      return undefined;
    }

    const mySeq = ++feeReqSeqRef.current;
    let timeoutId = setTimeout(() => {
      setFeeEstimateLoading(true);
      setFeeEstimateError(false);
      fetchFeeEstimate({ grossAmountCents: grossCents, jobId })
        .then((data) => {
          if (feeReqSeqRef.current !== mySeq) return;
          setFeeEstimate(data || null);
          setFeeEstimateError(false);
        })
        .catch(() => {
          if (feeReqSeqRef.current !== mySeq) return;
          setFeeEstimate(null);
          setFeeEstimateError(true);
        })
        .finally(() => {
          if (feeReqSeqRef.current !== mySeq) return;
          setFeeEstimateLoading(false);
        });
    }, FEE_ESTIMATE_DEBOUNCE_MS);

    return () => {
      clearTimeout(timeoutId);
      bumpSeq();
    };
  }, [quoteData?.amount, jobId, fetchFeeEstimate, eligibilityLoading, eligibility?.eligible]);

  const grossCentsForDisplay = parsePositiveAudCents(quoteData?.amount);
  const showFeeRegion = grossCentsForDisplay != null && eligibility.eligible;
  const showFeeBadge =
    !!feeEstimate
    && ['founding_first_three', 'founding_reduced'].includes(feeEstimate.stage);
  const zeroRemaining = foundingExpertFeeProfile?.zeroFeeSlotsRemaining;
  const showZeroSlotsHint = Number(zeroRemaining) > 0;
  const reducedEndMs = foundingExpertFeeProfile?.reducedFeeEndsAtMs;
  const reducedEndLabel = formatAuDateMedium(reducedEndMs);

  const feeEstimateNote = 'Final fee is locked when the Client funds the task.';

  return (
    <>
      <style>{EXPERT_QUOTE_MOBILE_CSS}</style>
      <div style={styles.quoteCard} className={`${className} tradie-quote-card-root`}>
      <h2 style={styles.sectionTitle}>
        {revisionRequest ? 'Submit a revised quote' : 'Submit your quote'}
      </h2>
      {success ? (
        <div className="quote-success-animation" style={styles.successMessage}>
          <div style={{ fontSize: '24px', marginBottom: '12px' }}>✓</div>
          <div style={{ fontWeight: '600', marginBottom: '8px' }}>Quote Submitted Successfully!</div>
          <div style={{ fontSize: '14px', fontWeight: '400', color: '#52d68a' }}>
            The {CLIENT_LABEL.toLowerCase()} will review your quote and get back to you. We&apos;ll notify you by email when they respond.
          </div>
        </div>
      ) : (
        <>
          {myQuote?.status === 'submitted' && !revisionRequest && (
            <div style={styles.quotedBanner} className="tradie-quote-card-inner">
              <div style={{ fontWeight: 800, marginBottom: 6 }}>Quote submitted</div>
              <div className="tradie-quote-quoted-meta" style={{ fontSize: 14, color: '#555', marginBottom: 10 }}>
                <span>Amount: <strong style={{ fontVariantNumeric: 'tabular-nums' }}>${myQuote.amount}</strong></span>
                <span aria-hidden="true"> · </span>
                <span>Version: <strong>{myQuote.version || 1}</strong></span>
              </div>
              <div style={{ fontSize: 13, color: '#555', whiteSpace: 'pre-wrap' }}>
                {myQuote.message}
              </div>
              <button
                type="button"
                className="tradie-quote-withdraw-btn"
                style={styles.withdrawButton}
                onClick={onWithdrawQuote}
                disabled={withdrawing}
              >
                {withdrawing ? 'Withdrawing…' : 'Withdraw quote'}
              </button>
            </div>
          )}

          {revisionRequest && (
            <div style={styles.revisionBanner} className="tradie-quote-revision-banner">
              <div style={{ fontWeight: 800, marginBottom: 6 }}>Client requested a revised quote</div>
              <div style={{ fontSize: 13, color: '#555' }}>
                {revisionRequest.message || 'No message provided.'}
              </div>
            </div>
          )}

          {!eligibilityLoading && !eligibility.eligible && (
            <div style={styles.eligibilityPanel} className="tradie-quote-eligibility-panel">
              <div
                className="tradie-quote-eligibility-head"
                style={{ display: 'flex', alignItems: 'center', marginBottom: 12, flexWrap: 'wrap', gap: 10 }}
              >
                <div style={{ flex: '1 1 200px', minWidth: 0 }}>
                  <div style={{ fontWeight: 700, fontSize: 16, color: '#222', marginBottom: 4 }}>
                    {readinessTitle}
                  </div>
                  <div style={{ fontSize: 13, color: '#666' }}>
                    {EXPERT_QUOTE_READINESS.scoreLabel}: {eligibility.score}%
                  </div>
                </div>
                {!awaitingAdminOnly && (
                <Link
                  to="/profile"
                  className="tradie-quote-profile-cta"
                  style={styles.completeProfileButton}
                  title="Go to your profile to complete missing items"
                >
                  {EXPERT_QUOTE_READINESS.primaryCta}
                </Link>
                )}
              </div>

              <div style={styles.progressBar}>
                <div style={{ ...styles.progressFill, width: `${eligibility.score}%` }} />
              </div>

              <div style={styles.checklistTitle} className="tradie-quote-checklist-label">
                {awaitingAdminOnly ? 'Quote readiness status' : EXPERT_QUOTE_READINESS.checklistHeading}
              </div>
              <div style={styles.checklist}>
                {(eligibility.items || []).map((item) => (
                  <div key={item.key} style={styles.checklistItem}>
                    <span style={item.done ? styles.checkIcon : styles.crossIcon}>
                      {item.done ? '✓' : '✗'}
                    </span>
                    <span
                      style={item.done ? styles.checklistTextDone : styles.checklistTextMissing}
                      className="tradie-quote-checklist-label"
                    >
                      {item.label}
                    </span>
                  </div>
                ))}
              </div>

              <div style={styles.eligibilityNote} className="tradie-quote-eligibility-note">
                {awaitingAdminOnly ? (
                  <>
                    <strong>What happens next:</strong> {EXPERT_QUOTE_READINESS_PENDING_ADMIN.body}
                  </>
                ) : (
                  <>
                    <strong>{EXPERT_QUOTE_READINESS.whyLabel}:</strong> {EXPERT_QUOTE_READINESS.whyBody}
                  </>
                )}
              </div>
            </div>
          )}

          {stripeStatus.enabled && stripeStatus.onboardingStatus !== 'completed' && (
            <div style={styles.onboardingWarning} className="tradie-quote-stripe-panel">
              <div style={{ fontWeight: 700, marginBottom: 6 }}>{EXPERT_STRIPE_GATE.title}</div>
              <div style={{ fontSize: 14, marginBottom: 10, lineHeight: 1.45 }}>
                {EXPERT_STRIPE_GATE.body}
              </div>
              <div className="tradie-quote-stripe-btns" style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
                <button type="button" style={styles.onboardingButton} onClick={onStartStripeOnboarding}>
                  {stripeStatus.onboardingStatus === 'pending' ? EXPERT_STRIPE_GATE.primaryCtaStart : EXPERT_STRIPE_GATE.primaryCtaContinue}
                </button>
                <button type="button" style={styles.onboardingButtonSecondary} onClick={onRefreshStripeStatus}>
                  {refreshingStripe ? 'Refreshing…' : EXPERT_STRIPE_GATE.secondaryRefresh}
                </button>
              </div>
            </div>
          )}

          <div style={styles.aiBox} className="tradie-quote-ai-box">
            <div style={{ fontWeight: 800, marginBottom: 6 }}>AI Quote Assistant</div>
            <div style={{ fontSize: 13, color: '#555', marginBottom: 10 }}>
              Draft a clear message based on the task details. You choose the final price.
            </div>
            <button
              type="button"
              onClick={onRunAiQuoteAssistant}
              disabled={aiBusy || !eligibility.eligible}
              className="tradie-ai-btn"
              style={{
                ...styles.aiButton,
                ...(!eligibility.eligible ? { opacity: 0.5, cursor: 'not-allowed' } : {}),
              }}
              title={
                !eligibility.eligible ? `${readinessTitle} to use the AI assistant` : ''
              }
            >
              {aiBusy ? '⏳ Drafting…' : '✨ Draft quote message'}
            </button>
            <div style={styles.aiDisclaimer}>
              AI-assisted draft only. You review and edit before sending. You choose the final price.
            </div>
            {aiError && <div style={{ marginTop: 10, color: '#DC3545', fontSize: 13 }}>{aiError}</div>}
            {aiAssumptions.length > 0 && (
              <div style={{ marginTop: 10, fontSize: 13, color: '#555' }}>
                <div style={{ fontWeight: 700, marginBottom: 4 }}>Notes from the draft</div>
                <ul style={{ margin: 0, paddingLeft: 18 }}>
                  {aiAssumptions.map((a, idx) => <li key={idx}>{a}</li>)}
                </ul>
              </div>
            )}
          </div>

          {(!myQuote || myQuote.status !== 'submitted' || revisionRequest) && (
            <form onSubmit={onQuoteSubmit} style={{ marginTop: 0 }} className="tradie-quote-form">
              <label htmlFor="amount" style={{ ...styles.label, marginTop: 0 }}>Your Quote Amount (AUD, GST included where applicable)</label>
              <input
                id="amount"
                name="amount"
                type="number"
                placeholder="e.g., 450.00"
                value={quoteData.amount}
                onChange={onQuoteChange}
                required
                style={styles.input}
                disabled={!eligibility.eligible}
              />

              {showFeeRegion && (
                <div
                  className="tradie-quote-fee-estimate"
                  data-testid="quote-fee-estimate-block"
                  aria-live="polite"
                  style={{
                    marginTop: -8,
                    marginBottom: 16,
                    padding: '12px 14px',
                    borderRadius: 8,
                    border: '1px solid #E5E7EB',
                    background: '#F8FAFC',
                    fontSize: 13,
                    lineHeight: 1.45,
                    color: '#374151',
                  }}
                >
                  {feeEstimateLoading || (feeEstimate == null && !feeEstimateError) ? (
                    <div style={{ color: '#6B7280', fontSize: 13 }}>Calculating fee estimate…</div>
                  ) : null}
                  {!feeEstimateLoading && feeEstimateError && (
                    <div style={{ color: '#6B7280', fontSize: 13 }}>
                      Fee estimate unavailable. Final fee is calculated when the Client funds the task.
                    </div>
                  )}
                  {!feeEstimateLoading && !feeEstimateError && feeEstimate ? (
                    <>
                      {showFeeBadge && (
                        <div
                          style={{
                            display: 'inline-block',
                            marginBottom: 8,
                            padding: '2px 8px',
                            borderRadius: 6,
                            fontSize: 11,
                            fontWeight: 700,
                            letterSpacing: 0.02,
                            color: '#0F766E',
                            background: '#CCFBF1',
                            border: '1px solid #99F6E4',
                          }}
                        >
                          Founding Expert
                        </div>
                      )}
                      <div style={{ fontVariantNumeric: 'tabular-nums' }}>
                        Taskio fee: {formatAudFromCents(feeEstimate.taskioFeeCents)} — {feeEstimate.benefitLabel}
                      </div>
                      <div style={{ fontVariantNumeric: 'tabular-nums', marginTop: 4, fontWeight: 600 }}>
                        You receive: {formatAudFromCents(feeEstimate.expertReceivesCents)}
                      </div>
                      {showZeroSlotsHint && (
                        <div style={{ marginTop: 8, fontSize: 12, color: '#6B7280' }}>
                          0% Taskio fee on your first 3 funded tasks. {zeroRemaining} remaining.
                        </div>
                      )}
                      {reducedEndLabel ? (
                        <div style={{ marginTop: 6, fontSize: 12, color: '#6B7280' }}>
                          Reduced fee active until {reducedEndLabel}.
                        </div>
                      ) : null}
                      <div style={{ marginTop: 10, fontSize: 12, color: '#6B7280' }}>
                        Note: {feeEstimateNote}
                      </div>
                    </>
                  ) : null}
                </div>
              )}

              <label htmlFor="message" style={styles.label}>Message to Client</label>
              <div style={{ fontSize: 12, color: '#666', marginBottom: 8, lineHeight: 1.4 }}>
                Include what&apos;s covered, any exclusions, timing, and your availability.
              </div>
              <textarea
                id="message"
                name="message"
                placeholder="Write your quote message to the client…"
                value={quoteData.message}
                onChange={onQuoteChange}
                required
                style={styles.textarea}
                disabled={!eligibility.eligible}
              />
              <div style={{ fontSize: 12, color: '#999', marginTop: -4, marginBottom: 16, lineHeight: 1.4 }}>
                Example: Include scope, inclusions, exclusions, and timing.
              </div>

              {error && <p style={styles.errorMessage} className="tradie-quote-inline-error">{error}</p>}

              <button
                type="submit"
                disabled={submitting || !eligibility.eligible}
                className="tradie-submit-quote-btn"
                style={{
                  ...styles.submitButton,
                  ...(!eligibility.eligible ? { opacity: 0.5, cursor: 'not-allowed' } : {}),
                }}
                title={!eligibility.eligible ? `${readinessTitle} to submit a quote` : ''}
              >
                {submitting ? '⏳ Submitting...' : (revisionRequest ? 'Submit Revised Quote' : 'Submit Quote')}
              </button>
            </form>
          )}
        </>
      )}
    </div>
    </>
  );
}

export default memo(QuoteSubmissionCard);
