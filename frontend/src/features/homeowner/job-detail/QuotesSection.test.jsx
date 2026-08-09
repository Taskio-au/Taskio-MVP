import React from 'react';
import { render, screen } from '@testing-library/react';

jest.mock(
  'react-router-dom',
  () => ({
    Link: ({ to, children, ...rest }) => (
      <a href={to} {...rest}>
        {children}
      </a>
    ),
  }),
  { virtual: true }
);

jest.mock(
  '../../../utils/clientDashboardTrustSignals',
  () => ({
    hasExpertRatingRow: ({ rating, reviewsCount }) =>
      typeof rating === 'number' && typeof reviewsCount === 'number' && reviewsCount > 0,
    expertTrustBadgeLabel: (rating) => {
      if (rating >= 4.8) return 'Top rated';
      if (rating >= 4.5) return 'Highly rated';
      return null;
    },
    formatAssignedExpertLine: (expert) => {
      if (expert?.firstName && expert?.lastInitial)
        return `Assigned to ${expert.firstName} ${expert.lastInitial}`;
      if (expert?.name) return `Assigned to ${expert.name}`;
      if (expert?.firstName) return `Assigned to ${expert.firstName}`;
      return null;
    },
  }),
  { virtual: true }
);

jest.mock(
  '../../../utils/publicProfile',
  () => ({
    getUserInitials: ({ displayName }) => {
      const parts = String(displayName || '').trim().split(/\s+/);
      if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
      return parts[0]?.[0]?.toUpperCase() || 'U';
    },
  }),
  { virtual: true }
);

import QuotesSection from './QuotesSection';

const styles = {
  section: {},
  sectionTitle: {},
  quotesContainer: {},
  quoteCard: {},
  quoteHeader: {},
  quoteAmount: {},
  acceptedBadge: {},
  quoteMessage: {},
  revisionPill: {},
  quoteActions: {},
  acceptButton: {},
  revisionButton: {},
  emptyQuotes: {},
  emptyIcon: {},
  emptyTitle: {},
  emptyText: {},
  rhsSectionTitle: {},
  urgentActionCard: {},
  urgentHeader: {},
  urgentIcon: {},
  urgentTitle: {},
  urgentText: {},
  gateCard: {},
  gateHeader: {},
  gateIconWrap: {},
  gateTitle: {},
  gateText: {},
  gateActions: {},
  gatePrimaryBtn: {},
  gateSecondaryBtn: {},
  // Phase 5 styles
  expertSummary: {},
  expertAvatar: {},
  expertAvatarFallback: {},
  expertInfo: {},
  expertName: {},
  expertMeta: {},
  expertMetaText: {},
  expertMetaEmpty: {},
  expertBio: {},
  expertBadgesRow: {},
  expertVerifiedBadge: {},
  expertRatingBadge: {},
  quoteDivider: {},
  stripeHint: {},
};

const baseExpert = {
  uid: 'tradie-1',
  firstName: 'Alice',
  lastInitial: 'S.',
  name: 'Alice S.',
  businessName: '',
  bio: '',
  photoURL: null,
  verified: false,
  rating: null,
  reviewsCount: 0,
};

function renderQuotesSection(quoteOverrides = {}, extraProps = {}) {
  const quote = {
    id: 'quote-1',
    amount: 180,
    message: 'I can do this tomorrow.',
    status: 'submitted',
    tradieUid: 'tradie-1',
    expert: baseExpert,
    ...quoteOverrides,
  };
  return render(
    <QuotesSection
      quotesLocked={false}
      quotes={[quote]}
      quotesLockReason=""
      job={{ acceptedQuoteId: null, status: 'QUOTED' }}
      revisionRequests={[]}
      requestingRevisionFor={null}
      onAcceptQuote={jest.fn()}
      onOpenRevisionModal={jest.fn()}
      styles={styles}
      {...extraProps}
    />
  );
}

describe('QuotesSection', () => {
  // -----------------------------------------------------------------------
  // Regression: existing behaviour must not break
  // -----------------------------------------------------------------------
  it('formats quote amounts as currency for homeowners', () => {
    renderQuotesSection({ amount: 180 });
    expect(screen.getByText('$180.00')).toBeInTheDocument();
  });

  it('hides the payment CTA once the accepted quote is already funded', () => {
    render(
      <QuotesSection
        quotesLocked={false}
        quotes={[
          {
            id: 'quote-1',
            amount: 180,
            message: 'I can do this tomorrow.',
            status: 'accepted',
            tradieUid: 'tradie-1',
            expert: baseExpert,
          },
        ]}
        quotesLockReason=""
        job={{ acceptedQuoteId: 'quote-1', status: 'FUNDED', paymentState: 'in_escrow' }}
        revisionRequests={[]}
        requestingRevisionFor={null}
        onAcceptQuote={jest.fn()}
        onOpenRevisionModal={jest.fn()}
        styles={styles}
      />
    );
    expect(screen.getByText(/accepted/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /continue to payment/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /accept & fund task/i })).not.toBeInTheDocument();
  });

  // -----------------------------------------------------------------------
  // Phase 5: Expert summary
  // -----------------------------------------------------------------------
  it('renders expert name above the quote amount', () => {
    renderQuotesSection({ expert: { ...baseExpert, name: 'Alice S.' } });
    expect(screen.getByText('Alice S.')).toBeInTheDocument();
    expect(screen.getByText('$180.00')).toBeInTheDocument();
    // Expert name must appear before (i.e. in the DOM before) the amount
    const nameEl   = screen.getByText('Alice S.');
    const amountEl = screen.getByText('$180.00');
    expect(nameEl.compareDocumentPosition(amountEl) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('renders businessName in place of expert name when set', () => {
    renderQuotesSection({
      expert: { ...baseExpert, businessName: 'Handy Co Pty Ltd', name: 'Alice S.' },
    });
    expect(screen.getByText('Handy Co Pty Ltd')).toBeInTheDocument();
  });

  it('renders star rating and review count when expert has reviews', () => {
    renderQuotesSection({
      expert: { ...baseExpert, rating: 4.5, reviewsCount: 12 },
    });
    expect(screen.getByText(/4\.5/)).toBeInTheDocument();
    expect(screen.getByText(/12 reviews/i)).toBeInTheDocument();
  });

  it('renders "No reviews yet" when expert has no rating data', () => {
    renderQuotesSection({ expert: { ...baseExpert, rating: null, reviewsCount: 0 } });
    expect(screen.getByText(/no reviews yet/i)).toBeInTheDocument();
  });

  it('shows singular "1 review" when reviewsCount is 1', () => {
    renderQuotesSection({ expert: { ...baseExpert, rating: 5, reviewsCount: 1 } });
    expect(screen.getByText(/1 review\b/)).toBeInTheDocument();
  });

  it('"Verified Expert" badge renders only when expert.verified === true', () => {
    const { rerender } = renderQuotesSection({ expert: { ...baseExpert, verified: false } });
    expect(screen.queryByText('Verified Expert')).not.toBeInTheDocument();

    rerender(
      <QuotesSection
        quotesLocked={false}
        quotes={[{
          id: 'quote-1', amount: 180, message: 'msg', status: 'submitted',
          tradieUid: 'tradie-1', expert: { ...baseExpert, verified: true },
        }]}
        quotesLockReason=""
        job={{ acceptedQuoteId: null, status: 'QUOTED' }}
        revisionRequests={[]}
        requestingRevisionFor={null}
        onAcceptQuote={jest.fn()}
        onOpenRevisionModal={jest.fn()}
        styles={styles}
      />
    );
    expect(screen.getByText('Verified Expert')).toBeInTheDocument();
  });

  it('"Top rated" badge renders when rating >= 4.8', () => {
    renderQuotesSection({ expert: { ...baseExpert, rating: 4.9, reviewsCount: 5 } });
    expect(screen.getByText('Top rated')).toBeInTheDocument();
  });

  it('"Highly rated" badge renders when rating >= 4.5 and < 4.8', () => {
    renderQuotesSection({ expert: { ...baseExpert, rating: 4.6, reviewsCount: 5 } });
    expect(screen.getByText('Highly rated')).toBeInTheDocument();
  });

  it('no rating badge renders when rating is below 4.5', () => {
    renderQuotesSection({ expert: { ...baseExpert, rating: 4.2, reviewsCount: 3 } });
    expect(screen.queryByText('Top rated')).not.toBeInTheDocument();
    expect(screen.queryByText('Highly rated')).not.toBeInTheDocument();
  });

  // -----------------------------------------------------------------------
  // Phase 5: Stripe protection hint
  // -----------------------------------------------------------------------
  it('shows the Stripe escrow hint when the Accept CTA is visible', () => {
    renderQuotesSection();
    expect(
      screen.getByText(/payment is secured through stripe/i)
    ).toBeInTheDocument();
  });

  it('does not show the Stripe hint on an already-funded accepted quote', () => {
    render(
      <QuotesSection
        quotesLocked={false}
        quotes={[{
          id: 'quote-1', amount: 180, message: 'msg', status: 'accepted',
          tradieUid: 'tradie-1', expert: baseExpert,
        }]}
        quotesLockReason=""
        job={{ acceptedQuoteId: 'quote-1', status: 'FUNDED', paymentState: 'in_escrow' }}
        revisionRequests={[]}
        requestingRevisionFor={null}
        onAcceptQuote={jest.fn()}
        onOpenRevisionModal={jest.fn()}
        styles={styles}
      />
    );
    expect(screen.queryByText(/payment is secured through stripe/i)).not.toBeInTheDocument();
  });
});
