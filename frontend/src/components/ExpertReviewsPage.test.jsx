import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';

const mockNavigate = jest.fn();
const mockGet = jest.fn();

jest.mock('react-router-dom', () => ({
  __esModule: true,
  useNavigate: () => mockNavigate,
}), { virtual: true });

jest.mock('react-firebase-hooks/auth', () => ({
  useAuthState: () => ([{
    uid: 'tradie-42',
    email: 'expert@example.com',
    displayName: 'Alex Expert',
    getIdToken: jest.fn(async () => 'token'),
  }]),
}));

jest.mock('../firebase', () => ({
  auth: {
    currentUser: {
      uid: 'tradie-42',
      email: 'expert@example.com',
      displayName: 'Alex Expert',
      getIdToken: jest.fn(async () => 'token'),
    },
  },
}));

jest.mock('../api/createApiClient', () => ({
  createApiClient: () => ({ get: mockGet }),
}));

jest.mock('./AppHeader', () => () => <div data-testid="app-header">AppHeader</div>);
jest.mock('./ui/PageMain', () => ({ children }) => <div>{children}</div>);
jest.mock('./ui/AsyncPageStates', () => ({
  PageLoadingShell: ({ message }) => <div data-testid="loading">{message}</div>,
  PageErrorShell: ({ title, onRetry }) => (
    <div data-testid="error">
      {title}
      <button type="button" onClick={onRetry}>retry</button>
    </div>
  ),
}));

const ExpertReviewsPage = require('./ExpertReviewsPage').default;

const REVIEWS_URL = '/api/tradies/tradie-42/reviews?limit=50';

function mockApiWith(data) {
  mockGet.mockImplementation((url) => {
    if (url === REVIEWS_URL) return Promise.resolve({ data });
    return Promise.reject(new Error(`Unexpected URL: ${url}`));
  });
}

describe('ExpertReviewsPage', () => {
  beforeEach(() => {
    mockNavigate.mockReset();
    mockGet.mockReset();
  });

  it('renders the page title "Reviews & ratings"', async () => {
    mockApiWith({ reviews: [], reviewCount: 0, count: 0, averageRating: null });
    render(<ExpertReviewsPage />);

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /reviews & ratings/i })).toBeInTheDocument();
    });
  });

  it('renders page subtitle', async () => {
    mockApiWith({ reviews: [], reviewCount: 0, count: 0, averageRating: null });
    render(<ExpertReviewsPage />);

    await waitFor(() => {
      expect(screen.getByText(/track client feedback/i)).toBeInTheDocument();
    });
  });

  it('shows empty state when there are no reviews', async () => {
    mockApiWith({ reviews: [], reviewCount: 0, count: 0, averageRating: null });
    render(<ExpertReviewsPage />);

    await waitFor(() => {
      expect(screen.getAllByText(/no reviews yet/i).length).toBeGreaterThanOrEqual(1);
    });
    expect(screen.getAllByText(/once you complete paid tasks/i).length).toBeGreaterThanOrEqual(1);
  });

  it('shows average rating number, star row, and "Based on N reviews" when reviews exist', async () => {
    mockApiWith({
      reviews: [
        { id: 'r1', rating: 5, text: 'Excellent work!', createdAt: '2025-11-01T10:00:00Z' },
        { id: 'r2', rating: 4, text: 'Very good.', createdAt: '2025-10-15T10:00:00Z' },
      ],
      reviewCount: 2,
      count: 2,
      averageRating: 4.5,
    });
    render(<ExpertReviewsPage />);

    await waitFor(() => {
      // "4.5" appears in both the hero number and the avg-rating chip
      expect(screen.getAllByText('4.5').length).toBeGreaterThanOrEqual(1);
    });
    expect(screen.getByText(/based on 2 reviews/i)).toBeInTheDocument();
    // Star row aria-label
    expect(screen.getByLabelText(/4.5 out of 5 stars/i)).toBeInTheDocument();
  });

  it('renders review cards with text and "Verified Taskio review" badge', async () => {
    mockApiWith({
      reviews: [
        { id: 'r1', rating: 5, text: 'Excellent work!', createdAt: '2025-11-01T10:00:00Z' },
      ],
      reviewCount: 1,
      count: 1,
      averageRating: 5.0,
    });
    render(<ExpertReviewsPage />);

    await waitFor(() => {
      expect(screen.getByText('Excellent work!')).toBeInTheDocument();
    });
    expect(screen.getByText(/verified taskio review/i)).toBeInTheDocument();
  });

  it('renders the "Client reviews" section heading', async () => {
    mockApiWith({
      reviews: [{ id: 'r1', rating: 4, text: 'Good job.', createdAt: '2025-10-01T10:00:00Z' }],
      reviewCount: 1,
      count: 1,
      averageRating: 4.0,
    });
    render(<ExpertReviewsPage />);

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /client reviews/i })).toBeInTheDocument();
    });
  });

  it('renders metric chips (Avg rating, Total reviews) when reviews exist', async () => {
    mockApiWith({
      reviews: [{ id: 'r1', rating: 5, text: 'Perfect.', createdAt: '2025-09-01T10:00:00Z' }],
      reviewCount: 1,
      count: 1,
      averageRating: 5.0,
    });
    render(<ExpertReviewsPage />);

    await waitFor(() => {
      expect(screen.getByText(/avg rating/i)).toBeInTheDocument();
      expect(screen.getByText(/total reviews/i)).toBeInTheDocument();
    });
  });

  it('shows loading state while fetching', () => {
    mockGet.mockImplementation(() => new Promise(() => {})); // never resolves
    render(<ExpertReviewsPage />);
    expect(screen.getByTestId('loading')).toBeInTheDocument();
  });

  it('shows error state and allows retry on API failure', async () => {
    mockGet.mockRejectedValue({ response: { data: { message: 'Server error' } } });
    render(<ExpertReviewsPage />);

    await waitFor(() => {
      expect(screen.getByTestId('error')).toBeInTheDocument();
    });
  });

  it('uses singular "review" for exactly 1 review', async () => {
    mockApiWith({
      reviews: [{ id: 'r1', rating: 5, text: 'Great!', createdAt: '2025-08-01T10:00:00Z' }],
      reviewCount: 1,
      count: 1,
      averageRating: 5.0,
    });
    render(<ExpertReviewsPage />);

    await waitFor(() => {
      expect(screen.getByText(/based on 1 review$/i)).toBeInTheDocument();
    });
  });
});
