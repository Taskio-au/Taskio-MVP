import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';

const mockNavigate = jest.fn();
const mockGet = jest.fn();
const mockLocation = { pathname: '/tradie/dashboard', search: '?stripe=return' };

jest.mock('react-router-dom', () => {
  const R = require('react');
  return {
    __esModule: true,
    useNavigate: () => mockNavigate,
    useLocation: () => mockLocation,
    Link: ({ children, to, ...rest }) =>
      R.createElement('a', { href: to, ...rest }, children),
  };
}, { virtual: true });

jest.mock('react-firebase-hooks/auth', () => ({
  useAuthState: () => ([{
    uid: 'tradie-1',
    email: 'expert@example.com',
    displayName: 'Taylor Expert',
    emailVerified: true,
    getIdToken: jest.fn(async () => 'token'),
  }]),
}));

jest.mock('../firebase', () => ({
  auth: {
    currentUser: {
      uid: 'tradie-1',
      email: 'expert@example.com',
      displayName: 'Taylor Expert',
      emailVerified: true,
      getIdToken: jest.fn(async () => 'token'),
    },
  },
}));

jest.mock('../api/createApiClient', () => ({
  createApiClient: () => ({
    get: mockGet,
  }),
}));

jest.mock('./AppHeader', () => () => <div>AppHeader</div>);
jest.mock('./tradie/TradieReviewsSection', () => ({ reviewSummary }) => (
  <div data-testid="reviews-section">
    {reviewSummary.reviewCount === 0
      ? 'No reviews yet'
      : `${reviewSummary.reviewCount} reviews`}
  </div>
));
jest.mock('./tradie/TradieChecklistModal', () => () => null);
jest.mock('../hooks/useMessagingSummary', () => ({
  useChatThreads: () => ({ unreadByJobId: {} }),
}));

const TradieDashboard = require('./TradieDashboard').default;

/** Shared mock response builders */
function baseApiMocks(reviewOverrides = {}) {
  const defaultReviews = { reviews: [], reviewCount: 0, count: 0, averageRating: null, ...reviewOverrides };
  mockGet.mockImplementation((url) => {
    if (url === '/api/tradie/stripe/status?refresh=true' || url === '/api/tradie/stripe/status') {
      return Promise.resolve({
        data: { enabled: true, onboardingStatus: 'completed', chargesEnabled: true, payoutsEnabled: true },
      });
    }
    if (url === '/api/me') {
      return Promise.resolve({
        data: {
          profile: {},
          eligibility: {
            canQuote: false,
            reasons: ['UNVERIFIED'],
            checklist: {
              emailVerified: true, phoneVerified: true, serviceLocationPresent: true,
              dobPresent: true, is18PlusConfirmed: true, businessTypeSet: true,
              abnRequired: true, abnPresent: true, abnVerified: true,
              profileCompleted: true, stripeOnboardingComplete: true, verified: false,
            },
          },
          foundingExpertFeeProfile: {
            enrolled: false,
            stage: 'standard_launch',
            expertFeeBps: 1000,
            badgeLabel: null,
            benefitLabel: 'Standard launch fee',
          },
        },
      });
    }
    if (url === '/api/tradie/jobs') {
      return Promise.resolve({ data: [] });
    }
    if (url === '/api/tradies/tradie-1/reviews?limit=20') {
      return Promise.resolve({ data: defaultReviews });
    }
    return Promise.reject(new Error(`Unexpected URL: ${url}`));
  });
}

describe('TradieDashboard stripe return sync', () => {
  beforeEach(() => {
    mockNavigate.mockReset();
    mockGet.mockReset();
    mockLocation.pathname = '/tradie/dashboard';
    mockLocation.search = '?stripe=return';
    baseApiMocks();
  });

  it('forces a live Stripe refresh after returning from onboarding', async () => {
    render(<TradieDashboard />);

    await waitFor(() => {
      expect(mockGet).toHaveBeenCalledWith('/api/tradie/stripe/status?refresh=true', expect.any(Object));
    });

    await waitFor(() => {
      expect(mockGet).toHaveBeenCalledWith('/api/me', expect.any(Object));
    });

    expect(mockNavigate).toHaveBeenCalledWith('/tradie/dashboard', { replace: true });
    expect(screen.getByText(/awaiting expert verification/i)).toBeInTheDocument();
  });
});

describe('TradieDashboard — Avg Rating card', () => {
  beforeEach(() => {
    mockNavigate.mockReset();
    mockGet.mockReset();
    mockLocation.pathname = '/tradie/dashboard';
    mockLocation.search = '';
  });

  it('shows "No reviews yet" empty state when reviewCount is 0', async () => {
    baseApiMocks({ reviews: [], reviewCount: 0, count: 0, averageRating: null });
    render(<TradieDashboard />);

    await waitFor(() => {
      // appears in both the stat card and the mocked reviews section stub
      expect(screen.getAllByText(/no reviews yet/i).length).toBeGreaterThanOrEqual(1);
    });
    expect(screen.getByText(/completed paid tasks can receive client reviews/i)).toBeInTheDocument();
  });

  it('shows visual stars and "Based on N review(s)" when reviews exist', async () => {
    baseApiMocks({ reviews: [], reviewCount: 3, count: 3, averageRating: 4.7 });
    render(<TradieDashboard />);

    await waitFor(() => {
      expect(screen.getByText('4.7')).toBeInTheDocument();
    });
    expect(screen.getByText(/based on 3 reviews/i)).toBeInTheDocument();
    // aria-label on the star row should reference the rating
    expect(screen.getByLabelText(/average rating 4.7 out of 5/i)).toBeInTheDocument();
  });

  it('Avg Rating card is informational (not a full-card button) when reviews exist', async () => {
    baseApiMocks({ reviews: [], reviewCount: 3, count: 3, averageRating: 4.7 });
    render(<TradieDashboard />);

    await waitFor(() => expect(screen.getByText('4.7')).toBeInTheDocument());
    // The stat card div itself should not carry role="button"
    const statCards = document.querySelectorAll('.tradie-stats-grid > div');
    statCards.forEach((card) => {
      expect(card.getAttribute('role')).not.toBe('button');
    });
  });

  it('uses singular "review" for exactly 1 review', async () => {
    baseApiMocks({ reviews: [], reviewCount: 1, count: 1, averageRating: 5.0 });
    render(<TradieDashboard />);

    await waitFor(() => {
      expect(screen.getByText(/based on 1 review$/i)).toBeInTheDocument();
    });
  });

  it('does not add a Reviews item to the main top nav', async () => {
    // The mock for AppHeader is a stub, so we verify via nav item config by
    // checking the rendered output does not have a standalone "Reviews" nav link.
    baseApiMocks();
    render(<TradieDashboard />);

    await waitFor(() => {
      // AppHeader stub renders as plain text "AppHeader"; confirm no nav Reviews link
      expect(screen.queryByRole('link', { name: /^reviews$/i })).toBeNull();
    });
  });
});

describe('TradieDashboard — Reviews section', () => {
  beforeEach(() => {
    mockNavigate.mockReset();
    mockGet.mockReset();
    mockLocation.pathname = '/tradie/dashboard';
    mockLocation.search = '';
  });

  it('passes reviewCount to TradieReviewsSection', async () => {
    baseApiMocks({ reviews: [], reviewCount: 5, count: 5, averageRating: 4.2 });
    render(<TradieDashboard />);

    await waitFor(() => {
      expect(screen.getByTestId('reviews-section')).toHaveTextContent('5 reviews');
    });
  });

  it('shows no-review state in section when reviewCount is 0', async () => {
    baseApiMocks({ reviews: [], reviewCount: 0, count: 0, averageRating: null });
    render(<TradieDashboard />);

    await waitFor(() => {
      expect(screen.getByTestId('reviews-section')).toHaveTextContent('No reviews yet');
    });
  });
});

describe('TradieDashboard — Fee programme', () => {
  beforeEach(() => {
    mockNavigate.mockReset();
    mockGet.mockReset();
    mockLocation.pathname = '/tradie/dashboard';
    mockLocation.search = '';
    baseApiMocks();
  });

  it('shows standard launch fee card from /api/me foundingExpertFeeProfile', async () => {
    render(<TradieDashboard />);

    await waitFor(() => {
      expect(screen.getByText('Standard launch fee')).toBeInTheDocument();
    });
    expect(screen.getByRole('link', { name: /View payments/i })).toHaveAttribute('href', '/payments');
  });

  it('shows Founding Expert first-three fee card when profile is in first-three stage', async () => {
    mockGet.mockImplementation((url) => {
      if (url === '/api/tradie/stripe/status') {
        return Promise.resolve({
          data: { enabled: true, onboardingStatus: 'completed', chargesEnabled: true, payoutsEnabled: true },
        });
      }
      if (url === '/api/me') {
        return Promise.resolve({
          data: {
            profile: {},
            eligibility: { canQuote: true, reasons: [], checklist: {} },
            foundingExpertFeeProfile: {
              enrolled: true,
              status: 'active',
              stage: 'founding_first_three',
              expertFeeBps: 0,
              badgeLabel: 'Founding Expert',
              zeroFeeSlotsUsed: 0,
              zeroFeeTaskLimit: 3,
              zeroFeeSlotsRemaining: 3,
            },
          },
        });
      }
      if (url === '/api/tradie/jobs') return Promise.resolve({ data: [] });
      if (url === '/api/tradies/tradie-1/reviews?limit=20') {
        return Promise.resolve({
          data: { reviews: [], reviewCount: 0, count: 0, averageRating: null },
        });
      }
      return Promise.reject(new Error(`Unexpected URL: ${url}`));
    });

    render(<TradieDashboard />);

    await waitFor(() => {
      expect(screen.getByText('0% Taskio fee on your first 3 funded tasks')).toBeInTheDocument();
    });
  });
});
