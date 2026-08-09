import React from 'react';
import { Link } from 'react-router-dom';

import { JOB_STATUSES, normalizeStatus } from '../../../constants/jobStatuses';
import { CLIENT_QUOTES_LOCKED } from '../../../constants/blockedFlowCopy';
import {
  hasExpertRatingRow,
  expertTrustBadgeLabel,
  formatAssignedExpertLine,
} from '../../../utils/clientDashboardTrustSignals';
import { getUserInitials } from '../../../utils/publicProfile';

/** Client quote list — narrow screens: wrap amounts/badges, comfortable taps, no horizontal squeeze */
const HOMEOWNER_QUOTES_MOBILE_CSS = `
  .homeowner-quotes-list {
    min-width: 0;
  }
  @media (max-width: 480px) {
    .homeowner-quotes-section {
      min-width: 0 !important;
      box-sizing: border-box !important;
    }
    .homeowner-quotes-section-title {
      font-size: 17px !important;
      line-height: 1.35 !important;
      word-break: break-word;
    }
    .homeowner-quotes-list {
      gap: 12px !important;
    }
    .homeowner-quote-card {
      padding: 16px !important;
    }
    .homeowner-quote-card-header {
      display: flex !important;
      flex-wrap: wrap !important;
      align-items: flex-start !important;
      justify-content: space-between !important;
      gap: 8px 10px !important;
      margin-bottom: 12px !important;
    }
    .homeowner-quote-amount {
      font-variant-numeric: tabular-nums !important;
      min-width: 0 !important;
      flex: 1 1 12rem !important;
      line-height: 1.15 !important;
      overflow-wrap: anywhere !important;
      word-break: normal !important;
      font-size: clamp(1.35rem, 5.5vw, 1.65rem) !important;
    }
    .homeowner-quote-badges {
      display: flex !important;
      flex-wrap: wrap !important;
      gap: 6px !important;
      justify-content: flex-end !important;
      flex: 0 1 auto !important;
      max-width: 100% !important;
    }
    .homeowner-quote-accepted-badge {
      max-width: 100% !important;
      text-align: center !important;
      box-sizing: border-box !important;
    }
    .homeowner-quote-message {
      overflow-wrap: anywhere;
      word-break: break-word;
      margin-bottom: 12px !important;
    }
    .homeowner-quote-revision-pill {
      margin-bottom: 10px !important;
      align-self: stretch !important;
      text-align: center !important;
    }
    .homeowner-quote-actions {
      gap: 10px !important;
    }
    .homeowner-quote-actions .homeowner-accept-btn,
    .homeowner-quote-actions .homeowner-revision-btn {
      min-height: 48px !important;
      box-sizing: border-box !important;
    }
    .homeowner-quotes-locked-gate {
      padding: 16px !important;
    }
    .homeowner-quotes-locked-actions {
      gap: 10px !important;
    }
    .homeowner-quotes-locked-actions a {
      min-height: 48px !important;
    }
    .homeowner-expert-summary {
      flex-direction: column !important;
      align-items: flex-start !important;
      gap: 8px !important;
    }
    .homeowner-expert-avatar {
      width: 40px !important;
      height: 40px !important;
      font-size: 14px !important;
      flex-shrink: 0 !important;
    }
    .homeowner-expert-badges-row {
      flex-wrap: wrap !important;
      gap: 5px !important;
    }
    .homeowner-stripe-hint {
      font-size: 11px !important;
    }
  }
`;

function formatQuoteAmount(amount) {
  const value = Number(amount);
  if (!Number.isFinite(value)) return '$—';
  return new Intl.NumberFormat('en-AU', {
    style: 'currency',
    currency: 'AUD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

function StarRow({ rating, size = 15 }) {
  const full = Math.round(rating || 0);
  return (
    <span aria-label={`${rating} out of 5 stars`} style={{ display: 'inline-flex', gap: 1 }}>
      {[1, 2, 3, 4, 5].map((n) => (
        <span
          key={n}
          style={{ fontSize: size, color: n <= full ? '#F59E0B' : '#D1D5DB', lineHeight: 1 }}
          aria-hidden="true"
        >
          ★
        </span>
      ))}
    </span>
  );
}

function ExpertSummary({ expert, styles }) {
  if (!expert) return null;

  const displayName = expert.businessName || formatAssignedExpertLine(expert)?.replace('Assigned to ', '') || 'Expert';
  const hasRating = hasExpertRatingRow(expert);
  const badgeLabel = expertTrustBadgeLabel(expert.rating);
  const initials = getUserInitials({ displayName });

  return (
    <div
      className="homeowner-expert-summary"
      style={styles.expertSummary}
    >
      {/* Avatar */}
      {expert.photoURL ? (
        <img
          src={expert.photoURL}
          alt={displayName}
          className="homeowner-expert-avatar"
          style={styles.expertAvatar}
        />
      ) : (
        <div
          className="homeowner-expert-avatar"
          style={styles.expertAvatarFallback}
          aria-hidden="true"
        >
          {initials}
        </div>
      )}

      {/* Name + meta column */}
      <div style={styles.expertInfo}>
        <div style={styles.expertName}>{displayName}</div>

        {hasRating ? (
          <div style={styles.expertMeta}>
            <StarRow rating={expert.rating} size={14} />
            <span style={styles.expertMetaText}>
              {expert.rating} ({expert.reviewsCount} {expert.reviewsCount === 1 ? 'review' : 'reviews'})
            </span>
          </div>
        ) : (
          <div style={styles.expertMetaEmpty}>No reviews yet</div>
        )}

        {expert.bio ? (
          <div style={styles.expertBio}>{expert.bio}</div>
        ) : null}
      </div>

      {/* Badges (right-aligned) */}
      <div className="homeowner-expert-badges-row" style={styles.expertBadgesRow}>
        {expert.verified && (
          <span style={styles.expertVerifiedBadge}>Verified Expert</span>
        )}
        {badgeLabel && (
          <span style={styles.expertRatingBadge}>{badgeLabel}</span>
        )}
      </div>
    </div>
  );
}

export default function QuotesSection({
  quotesLocked,
  quotes,
  quotesLockReason,
  job,
  revisionRequests,
  requestingRevisionFor,
  paymentConfirmationInProgress = false,
  onAcceptQuote,
  onOpenRevisionModal,
  styles,
}) {
  const normalizedJobStatus = normalizeStatus(job?.status);

  if (quotesLocked) {
    return (
      <>
        <style>{HOMEOWNER_QUOTES_MOBILE_CSS}</style>
        <div style={styles.rhsSectionTitle}>Expert quotes</div>
        <div style={styles.gateCard} className="homeowner-quotes-locked-gate">
          <div style={styles.gateHeader}>
            <div style={styles.gateIconWrap} aria-hidden="true">
              📋
            </div>
            <div>
              <div style={styles.gateTitle}>{CLIENT_QUOTES_LOCKED.title}</div>
              <div style={styles.gateText}>
                {quotesLockReason || CLIENT_QUOTES_LOCKED.bodyFallback}
              </div>
            </div>
          </div>
          <div style={{ ...styles.gateActions, flexDirection: 'column', alignItems: 'stretch' }} className="homeowner-quotes-locked-actions">
            <Link
              to="/settings"
              style={{
                ...styles.gatePrimaryBtn,
                textAlign: 'center',
                textDecoration: 'none',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                boxSizing: 'border-box',
                flex: '1 1 auto',
              }}
            >
              {CLIENT_QUOTES_LOCKED.primaryCta}
            </Link>
            <Link
              to="/support"
              style={{
                ...styles.gateSecondaryBtn,
                textAlign: 'center',
                textDecoration: 'none',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                boxSizing: 'border-box',
                flex: '1 1 auto',
              }}
            >
              {CLIENT_QUOTES_LOCKED.help}
            </Link>
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <style>{HOMEOWNER_QUOTES_MOBILE_CSS}</style>
      <div style={styles.section} className="homeowner-quotes-section">
      <h2 style={styles.sectionTitle} className="homeowner-quotes-section-title">Received Quotes ({quotes.length})</h2>
      {quotes.length > 0 ? (
        <div style={styles.quotesContainer} className="homeowner-quotes-list">
          {quotes.map((quote) => {
            const isAcceptedQuote = job.acceptedQuoteId === quote.id;
            const canContinuePayment = isAcceptedQuote && normalizedJobStatus === JOB_STATUSES.AWAITING_FUNDING;
            const canAcceptQuote = !job.acceptedQuoteId || canContinuePayment;

            return (
              <div key={quote.id} className="homeowner-quote-card" style={styles.quoteCard}>
                {/* Expert trust summary — rendered above the quote amount */}
                <ExpertSummary expert={quote.expert} styles={styles} />

                <div style={styles.quoteDivider} />

                <div style={styles.quoteHeader} className="homeowner-quote-card-header">
                  <div style={styles.quoteAmount} className="homeowner-quote-amount">{formatQuoteAmount(quote.amount)}</div>
                  {isAcceptedQuote && (
                  <div className="homeowner-quote-badges">
                    <div style={styles.acceptedBadge} className="homeowner-quote-accepted-badge">Accepted</div>
                  </div>
                  )}
                </div>
                <p style={styles.quoteMessage} className="homeowner-quote-message">{quote.message}</p>
                {revisionRequests.some((r) => r.id === quote.tradieUid && r.status === 'open') && (
                  <div style={styles.revisionPill} className="homeowner-quote-revision-pill">Revision requested</div>
                )}
                {/* Stripe payment protection line — shown only when action buttons are available */}
                {canAcceptQuote && (
                  <div className="homeowner-stripe-hint" style={styles.stripeHint}>
                    Payment is secured through Stripe and released after you approve completion.
                  </div>
                )}
                <div style={styles.quoteActions} className="homeowner-quote-actions">
                  {canAcceptQuote && (
                    <button
                      onClick={() => onAcceptQuote(quote.id)}
                      className="homeowner-accept-btn"
                      style={styles.acceptButton}
                      disabled={
                        paymentConfirmationInProgress
                        || (!canContinuePayment && !!job.acceptedQuoteId && job.acceptedQuoteId !== quote.id)
                      }
                    >
                      {paymentConfirmationInProgress
                        ? 'Confirming your payment…'
                        : canContinuePayment
                          ? 'Continue to Payment'
                          : 'Accept & fund task'}
                    </button>
                  )}
                  {!job.acceptedQuoteId && job.status === 'assigned' && quote.status === 'submitted' && (
                    <button
                      onClick={() => onOpenRevisionModal(quote.tradieUid)}
                      className="homeowner-revision-btn"
                      style={styles.revisionButton}
                      disabled={requestingRevisionFor === quote.tradieUid}
                    >
                      {requestingRevisionFor === quote.tradieUid ? 'Requesting…' : 'Request Revision'}
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div style={styles.emptyQuotes}>
          <div style={styles.emptyIcon}>📬</div>
          <div style={styles.emptyTitle}>No quotes yet</div>
          <div style={styles.emptyText}>Experts will submit quotes soon. You will be notified when they arrive.</div>
        </div>
      )}
    </div>
    </>
  );
}
