import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';

const mockNavigate = jest.fn();
const mockPost = jest.fn();
const mockGoToCheckout = jest.fn();

jest.mock('react-router-dom', () => ({
  __esModule: true,
  useParams: () => ({ jobId: 'job-1', quoteId: 'quote-1' }),
  useNavigate: () => mockNavigate,
  useLocation: () => ({ pathname: '/payment/job-1/quote-1' }),
}), { virtual: true });

jest.mock('../firebase', () => ({
  auth: {
    currentUser: {
      uid: 'homeowner-1',
      getIdToken: jest.fn(async () => 'token'),
    },
  },
}));

jest.mock('../e2e/authBypass', () => ({
  getE2EAuthUser: () => null,
}));

jest.mock('../api/createApiClient', () => ({
  createApiClient: () => ({
    post: (...args) => mockPost(...args),
  }),
}));

jest.mock('../utils/stripeHostedCheckoutUrl', () => ({
  InvalidStripeCheckoutUrlError: class InvalidStripeCheckoutUrlError extends Error {
    constructor(message) {
      super(message);
      this.name = 'InvalidStripeCheckoutUrlError';
      this.code = 'stripe_checkout_url_invalid';
    }
  },
  navigateToStripeHostedCheckout: (...args) => mockGoToCheckout(...args),
}));

jest.mock('../design/components', () => ({
  BrandLogo: () => <div>Taskio</div>,
}));

jest.mock('./ui/AsyncPageStates', () => ({
  PageLoadingShell: ({ message }) => <div>{message}</div>,
}));

jest.mock('./ui/PageMain', () => ({ children }) => <main>{children}</main>);

const CHECKOUT_URL = 'https://checkout.stripe.com/c/pay/cs_test_abc123';

describe('PaymentPage hosted Checkout', () => {
  const originalPk = process.env.REACT_APP_STRIPE_PUBLISHABLE_KEY;

  beforeEach(() => {
    mockNavigate.mockReset();
    mockPost.mockReset();
    mockGoToCheckout.mockReset();
    delete process.env.REACT_APP_STRIPE_PUBLISHABLE_KEY;
  });

  afterAll(() => {
    if (originalPk == null) delete process.env.REACT_APP_STRIPE_PUBLISHABLE_KEY;
    else process.env.REACT_APP_STRIPE_PUBLISHABLE_KEY = originalPk;
  });

  it('navigates to the server-returned Checkout URL without a publishable key', async () => {
    mockPost.mockResolvedValueOnce({
      data: { sessionId: 'cs_test_abc123', checkoutUrl: CHECKOUT_URL },
    });

    const PaymentPage = require('./PaymentPage').default;
    render(<PaymentPage />);

    await waitFor(() => {
      expect(mockPost).toHaveBeenCalledWith(
        '/api/jobs/job-1/checkout',
        { quoteId: 'quote-1' },
        expect.objectContaining({ headers: { Authorization: 'Bearer token' } }),
      );
      expect(mockGoToCheckout).toHaveBeenCalledWith(CHECKOUT_URL);
    });
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it('does not start checkout when checkoutUrl is missing', async () => {
    mockPost.mockResolvedValueOnce({ data: { sessionId: 'cs_test_abc123' } });

    const PaymentPage = require('./PaymentPage').default;
    render(<PaymentPage />);

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(/couldn't start/i);
    });
    expect(mockGoToCheckout).not.toHaveBeenCalled();
  });

  it('fails safely when the Checkout URL is invalid', async () => {
    mockPost.mockResolvedValueOnce({
      data: { checkoutUrl: 'https://evil.example/phish' },
    });
    mockGoToCheckout.mockImplementation(() => {
      const err = new Error('invalid');
      err.code = 'stripe_checkout_url_invalid';
      throw err;
    });

    const PaymentPage = require('./PaymentPage').default;
    render(<PaymentPage />);

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(/couldn't start/i);
    });
  });

  it('returns to the task when payment is already confirmed', async () => {
    mockPost.mockResolvedValueOnce({
      data: { paymentAlreadyConfirmed: true, confirmed: true },
    });

    const PaymentPage = require('./PaymentPage').default;
    render(<PaymentPage />);

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith('/job/job-1', expect.objectContaining({ replace: true }));
    });
    expect(mockGoToCheckout).not.toHaveBeenCalled();
  });

  it('shows the account completion gate when checkout requires it', async () => {
    const err = new Error('complete account');
    err.response = {
      status: 403,
      data: {
        code: 'account_completion_required',
        message: 'Verify your email or continue with Google before you can pay securely.',
      },
    };
    mockPost.mockRejectedValueOnce(err);

    const PaymentPage = require('./PaymentPage').default;
    render(<PaymentPage />);

    await waitFor(() => {
      expect(screen.getByText(/finish account setup to pay/i)).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /continue setup/i })).toBeInTheDocument();
    });
    expect(mockGoToCheckout).not.toHaveBeenCalled();
  });
});
