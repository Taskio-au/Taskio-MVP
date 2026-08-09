import React from 'react';
import { render, screen, waitFor, fireEvent, within } from '@testing-library/react';

const mockNavigate = jest.fn();
const mockGet = jest.fn();
const mockPost = jest.fn();

jest.mock('react-router-dom', () => {
  const R = require('react');
  return {
    __esModule: true,
    useNavigate: () => mockNavigate,
    Link: ({ children, to }) => R.createElement('a', { href: to }, children),
  };
}, { virtual: true });

const mockUser = {
  uid: 'tradie-1',
  email: 'expert@example.com',
  displayName: 'Taylor Expert',
  getIdToken: jest.fn(),
};

jest.mock('react-firebase-hooks/auth', () => ({
  useAuthState: () => [mockUser, false],
}));

jest.mock('../firebase', () => ({
  auth: {},
  db: {},
}));

jest.mock('firebase/firestore', () => ({
  doc: jest.fn(() => ({ path: 'users/tradie-1' })),
  getDoc: jest.fn(),
}));

jest.mock('../api/createApiClient', () => ({
  createApiClient: () => ({ get: mockGet, post: mockPost }),
}));

jest.mock('./AppHeader', () => {
  const R = require('react');
  return () => R.createElement('div', null, 'AppHeader');
});
jest.mock('./ui/AsyncPageStates', () => {
  const R = require('react');
  return {
    PageLoadingShell: () => R.createElement('div', null, 'Loading shell'),
  };
});
jest.mock('./ui/PageMain', () => {
  const R = require('react');
  return ({ children }) => R.createElement('div', null, children);
});

const { getDoc } = require('firebase/firestore');
const PaymentsPage = require('./PaymentsPage').default;

function activityPayload(overrides = {}) {
  const released = overrides.released ?? [
    {
      jobId: 'job-1',
      title: 'Fix leak',
      displayTaskTitle: 'Fix leak',
      taskNumber: '42',
      displayReference: 'TSK-0042',
      providerAmountCents: 17000,
      platformFeeAmountCents: 3000,
      grossPaymentCents: 20000,
      clientPaidCents: 20000,
      feesTotalCents: 3000,
      totalGrossReleasedCents: 20000,
      currency: 'aud',
      transferId: 'tr_1',
      releasedAtMs: Date.UTC(2026, 3, 15),
      statusLabel: 'Released to Stripe',
      taskioFeeCents: 3000,
      expertReleasedCents: 17000,
      feeBenefitLabel: 'Taskio fee',
      breakdown: {
        title: 'Fix leak',
        taskRef: '42',
        taskDisplayReference: 'TSK-0042',
        releasedAtMs: Date.UTC(2026, 3, 15),
        statusLabel: 'Released to Stripe',
        baseJobClientPaidCents: 20000,
        variationClientPaidCents: 0,
        totalClientPaidCents: 20000,
        stripeProcessingNote: 'Card processing is handled by Stripe. See balances and fees in your Stripe Express Dashboard.',
        taskioPlatformFeeCents: 3000,
        baseTaskioFeeCents: 3000,
        variationTaskioFeeCents: 0,
        baseExpertReleasedCents: 17000,
        variationExpertReleasedCents: 0,
        feeBenefitLabel: 'Taskio fee',
        expertReleasedCents: 17000,
        baseTransferId: 'tr_1',
        variationTransferIds: {},
        bankPayoutStatus: null,
        bankPayoutNote: 'Bank payout timing is managed by Stripe.',
      },
    },
  ];
  return {
    data: {
      summary: {
        totalReleasedToStripeCents: 17000,
        totalSecuredInEscrowCents: 0,
        releasedJobCount: 1,
        hasStripeConnectedAccount: true,
        paymentsShowPlatformFeeLine: false,
        stripeBalance: { dataAvailable: false },
        ...overrides.summary,
      },
      released,
    },
  };
}

describe('PaymentsPage (expert)', () => {
  beforeEach(() => {
    mockNavigate.mockReset();
    mockGet.mockReset();
    mockPost.mockReset();
    mockUser.getIdToken.mockResolvedValue('test-token');
    delete window.location;
    window.location = { assign: jest.fn() };
    getDoc.mockResolvedValue({
      exists: () => true,
      data: () => ({ role: 'tradie', name: 'Taylor', email: 'expert@example.com' }),
    });
    mockGet.mockImplementation((url) => {
      if (url === '/api/me') {
        return Promise.resolve({
          data: {
            profile: { stripe: { onboardingComplete: true } },
          },
        });
      }
      if (url === '/api/tradie/payment-activity') {
        return Promise.resolve(activityPayload());
      }
      return Promise.reject(new Error(`unexpected ${url}`));
    });
    mockPost.mockResolvedValue({ data: { url: 'https://connect.stripe.com/express/test' } });
  });

  it('shows released payment rows from /api/tradie/payment-activity', async () => {
    render(<PaymentsPage />);

    const region = await screen.findByRole('region', { name: /recent activity/i });
    await waitFor(() => {
      expect(within(region).getAllByText(/Fix leak/i).length).toBeGreaterThan(0);
    });

    expect(within(region).getAllByText(/TSK-0042/).length).toBeGreaterThan(0);
    expect(within(region).getAllByText('$30.00').length).toBeGreaterThanOrEqual(2);
    expect(screen.getAllByText(/Released to Stripe/).length).toBeGreaterThan(0);
    expect(mockGet).toHaveBeenCalledWith(
      '/api/tradie/payment-activity',
      expect.objectContaining({
        headers: { Authorization: 'Bearer test-token' },
      })
    );
  });

  it('prefers displayTaskTitle over legacy title for Recent activity copy', async () => {
    mockGet.mockImplementation((url) => {
      if (url === '/api/me') {
        return Promise.resolve({
          data: { profile: { stripe: { onboardingComplete: true } } },
        });
      }
      if (url === '/api/tradie/payment-activity') {
        return Promise.resolve(
          activityPayload({
            released: [
              {
                ...activityPayload().data.released[0],
                title: 'Mirrors in Docklands',
                displayTaskTitle: 'Hang mirrors in Docklands',
              },
            ],
          })
        );
      }
      return Promise.reject(new Error(`unexpected ${url}`));
    });

    render(<PaymentsPage />);

    const region = await screen.findByRole('region', { name: /recent activity/i });
    await waitFor(() => {
      expect(within(region).getAllByText(/Hang mirrors in Docklands/i).length).toBeGreaterThan(0);
    });
    expect(within(region).queryByText(/^Mirrors in Docklands$/)).not.toBeInTheDocument();
  });

  it('shows concise dashboard labels and copy', async () => {
    render(<PaymentsPage />);

    await screen.findByRole('heading', { name: /Payout overview/i });
    await screen.findByText(/Released payments from completed tasks/i);
    await screen.findByText(/How payouts work/i);
    await screen.findByText(/Client approval → Taskio release → Stripe bank payout timing/i);
    await screen.findByRole('heading', { name: /Payout setup/i });
    const payoutSetupWrap = screen.getByLabelText(/Payout setup status/i);
    expect(within(payoutSetupWrap).getByText(/^Stripe account$/)).toBeInTheDocument();
    expect(within(payoutSetupWrap).getByText(/^Managed by Stripe$/)).toBeInTheDocument();
    await screen.findByText(/Secured client payments/i);
    expect(screen.getAllByText(/Available now/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Pending in Stripe/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Total released/).length).toBeGreaterThan(0);
    expect(screen.queryByText(/Secured in escrow/i)).not.toBeInTheDocument();

    expect(screen.queryByRole('heading', { name: /Statements & records/i })).not.toBeInTheDocument();

    await waitFor(() => {
      const ledgerCard = screen.getByRole('heading', { name: /Recent activity/i }).closest('.pp-pay-card--ledger');
      expect(ledgerCard).toBeTruthy();
      expect(within(ledgerCard).getByText(/CSV includes task reference/i)).toBeInTheDocument();
      expect(within(ledgerCard).getByText(/For formal tax advice, speak with your accountant/i)).toBeInTheDocument();
    });

    const stripeDashBtns = screen.getAllByRole('button', { name: /Open Stripe dashboard/i });
    expect(stripeDashBtns.length).toBe(1);

    const exportBtns = screen.getAllByRole('button', { name: /Export current payment activity as CSV/i });
    expect(exportBtns.length).toBe(1);
  });

  it('shows released payment count from summary', async () => {
    render(<PaymentsPage />);
    await screen.findByLabelText(/1 released payment/i);
  });

  it('filters activity by search on task title or reference', async () => {
    mockGet.mockImplementation((url) => {
      if (url === '/api/me') {
        return Promise.resolve({
          data: { profile: { stripe: { onboardingComplete: true } } },
        });
      }
      if (url === '/api/tradie/payment-activity') {
        return Promise.resolve(
          activityPayload({
            released: [
              activityPayload().data.released[0],
              {
                jobId: 'job-2',
                title: 'Deck stain',
                taskNumber: '77',
                displayReference: 'TSK-0077',
                providerAmountCents: 8000,
                clientPaidCents: 10000,
                taskioFeeCents: 0,
                feesTotalCents: 0,
                platformFeeAmountCents: 0,
                totalGrossReleasedCents: 10000,
                releasedAtMs: Date.UTC(2026, 4, 1),
                statusLabel: 'Released to Stripe',
                breakdown: {
                  title: 'Deck stain',
                  taskRef: '77',
                  taskDisplayReference: 'TSK-0077',
                  releasedAtMs: Date.UTC(2026, 4, 1),
                  statusLabel: 'Released to Stripe',
                  expertReleasedCents: 8000,
                  totalClientPaidCents: 10000,
                  baseJobClientPaidCents: 10000,
                  variationClientPaidCents: 0,
                  taskioPlatformFeeCents: 0,
                  baseTaskioFeeCents: 0,
                  variationTaskioFeeCents: 0,
                  baseExpertReleasedCents: 8000,
                  variationExpertReleasedCents: 0,
                  baseTransferId: 'tr_2',
                  variationTransferIds: {},
                  bankPayoutStatus: null,
                },
              },
            ],
            summary: { releasedJobCount: 2, totalReleasedToStripeCents: 25000 },
          })
        );
      }
      return Promise.reject(new Error(`unexpected ${url}`));
    });

    render(<PaymentsPage />);

    const region = await screen.findByRole('region', { name: /recent activity/i });
    await waitFor(() => {
      expect(within(region).getAllByText(/Fix leak/i).length).toBeGreaterThan(0);
      expect(within(region).getAllByText(/Deck stain/i).length).toBeGreaterThan(0);
      expect(within(region).getAllByText('$0.00').length).toBeGreaterThan(0);
    });

    const search = screen.getByRole('searchbox', { name: /Search task or reference/i });
    fireEvent.change(search, { target: { value: 'TSK-0077' } });

    await waitFor(() => {
      expect(within(region).queryByText(/Fix leak/i)).not.toBeInTheDocument();
      expect(within(region).getAllByText(/Deck stain/i).length).toBeGreaterThan(0);
    });
  });

  it('does not show misleading expert-facing forbidden vocabulary', async () => {
    render(<PaymentsPage />);
    await screen.findByText(/Secured client payments/i);
    const expertRoot = screen.getByText(/Secured client payments/i).closest('.pp-pay-expert');
    expect(expertRoot).toBeTruthy();
    const t = (expertRoot?.textContent || '').toLowerCase();
    expect(t).not.toMatch(/\bescrow\b/);
    expect(t).not.toMatch(/\btradie\b/);
    expect(t).not.toMatch(/\bhomeowner\b/);
    expect(t).not.toMatch(/\bpaid to bank\b/);
    expect(t).not.toMatch(/\bin_escrow\b/);
  });

  it('opens Payment details modal when View details is clicked', async () => {
    render(<PaymentsPage />);

    const detailsButtons = await screen.findAllByRole('button', { name: /View details/i });
    fireEvent.click(detailsButtons[0]);

    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByRole('heading', { name: /Payment details/i })).toBeInTheDocument();

    expect(within(dialog).getAllByText(/released to Stripe/i).length).toBeGreaterThan(0);
    expect(within(dialog).getAllByText(/\$170\.00/).length).toBeGreaterThanOrEqual(2);
    expect(within(dialog).getByText(/TSK-0042/)).toBeInTheDocument();

    expect(within(dialog).getByRole('heading', { name: /^Client paid$/i })).toBeInTheDocument();
    expect(within(dialog).getByText(/Base task amount/i)).toBeInTheDocument();
    expect(within(dialog).getAllByText(/\$200\.00/).length).toBeGreaterThanOrEqual(1);
    expect(within(dialog).queryByText(/Approved paid variations/i)).not.toBeInTheDocument();

    expect(within(dialog).getByRole('heading', { name: /^Taskio fee$/i })).toBeInTheDocument();
    expect(within(dialog).getByText(/See your Stripe Dashboard for card processing/i)).toBeInTheDocument();

    expect(within(dialog).getByRole('heading', { name: /Your payout/i })).toBeInTheDocument();
    const payoutSection = within(dialog).getByRole('heading', { name: /Your payout/i }).closest('section');
    expect(within(payoutSection).getByText(/^Your released amount$/)).toBeInTheDocument();
    expect(within(payoutSection).getByText(/^Released to Stripe$/)).toBeInTheDocument();

    const supportRef = within(dialog).getByText(/Support reference/i).closest('details');
    expect(supportRef).toBeTruthy();
    expect(supportRef?.hasAttribute('open')).toBe(false);
    expect(supportRef?.querySelector('.pp-pay-modal-mono-line')?.textContent).toMatch(/tr_1/);

    fireEvent.click(within(dialog).getByText(/Support reference/i));
    expect(within(dialog).getByText(/Base transfer: tr_1/i)).toBeInTheDocument();

    expect(within(dialog).getAllByText(/Bank payout timing is managed by Stripe/i).length).toBeGreaterThanOrEqual(1);
    expect(within(dialog).queryByText(/paid to bank/i)).not.toBeInTheDocument();
    expect(within(dialog).queryByText(/\bescrow\b/i)).not.toBeInTheDocument();
    expect(within(dialog).queryByText(/\btradie\b/i)).not.toBeInTheDocument();
    expect(within(dialog).queryByText(/\bhomeowner\b/i)).not.toBeInTheDocument();
  });

  it('modal shows Founding Expert offer applied when Taskio fee is zero', async () => {
    mockGet.mockImplementation((url) => {
      if (url === '/api/me') {
        return Promise.resolve({
          data: { profile: { stripe: { onboardingComplete: true } } },
        });
      }
      if (url === '/api/tradie/payment-activity') {
        return Promise.resolve(
          activityPayload({
            released: [
              {
                jobId: 'job-fe',
                title: 'Pilot install',
                displayTaskTitle: 'Pilot install',
                taskNumber: '88',
                displayReference: 'TSK-0088',
                providerAmountCents: 25000,
                expertReleasedCents: 25000,
                clientPaidCents: 25000,
                totalGrossReleasedCents: 25000,
                grossPaymentCents: 25000,
                taskioFeeCents: 0,
                feesTotalCents: 0,
                platformFeeAmountCents: 0,
                currency: 'aud',
                transferId: 'tr_fe',
                releasedAtMs: Date.UTC(2026, 2, 1),
                feeBenefitLabel: 'Founding Expert offer applied',
                breakdown: {
                  title: 'Pilot install',
                  taskRef: '88',
                  taskDisplayReference: 'TSK-0088',
                  releasedAtMs: Date.UTC(2026, 2, 1),
                  baseJobClientPaidCents: 20000,
                  variationClientPaidCents: 5000,
                  totalClientPaidCents: 25000,
                  taskioPlatformFeeCents: 0,
                  baseTaskioFeeCents: 0,
                  variationTaskioFeeCents: 0,
                  expertReleasedCents: 25000,
                  baseExpertReleasedCents: 20000,
                  variationExpertReleasedCents: 5000,
                  feeBenefitLabel: 'Founding Expert offer applied',
                  baseTransferId: 'tr_fe',
                  variationTransferIds: {},
                  bankPayoutStatus: null,
                  bankPayoutNote: 'Bank payout timing is managed by Stripe.',
                },
              },
            ],
            summary: { totalReleasedToStripeCents: 25000 },
          })
        );
      }
      return Promise.reject(new Error(`unexpected ${url}`));
    });

    render(<PaymentsPage />);

    const region = await screen.findByRole('region', { name: /recent activity/i });
    await waitFor(() => {
      expect(within(region).getAllByText('$0.00').length).toBeGreaterThanOrEqual(2);
    });

    fireEvent.click(screen.getAllByRole('button', { name: /View details/i })[0]);

    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText(/Founding Expert offer applied/i)).toBeInTheDocument();
    expect(
      within(dialog).getByText((content) => /Taskio fee:\s*\$0\.00/.test(content) && /Founding Expert offer applied/.test(content))
    ).toBeInTheDocument();
    expect(within(dialog).queryByText(/\btradie\b/i)).not.toBeInTheDocument();
  });

  it('shows exactly one Open Stripe dashboard button when expert has a connected account', async () => {
    render(<PaymentsPage />);

    await waitFor(() => {
      const btns = screen.getAllByRole('button', { name: /Open Stripe dashboard/i });
      expect(btns.length).toBe(1);
    });
  });

  it('hides Stripe dashboard buttons when no connected account id on summary', async () => {
    mockGet.mockImplementation((url) => {
      if (url === '/api/me') {
        return Promise.resolve({
          data: { profile: { stripe: { onboardingComplete: true } } },
        });
      }
      if (url === '/api/tradie/payment-activity') {
        return Promise.resolve(
          activityPayload({ summary: { hasStripeConnectedAccount: false } })
        );
      }
      return Promise.reject(new Error(`unexpected ${url}`));
    });

    render(<PaymentsPage />);

    await screen.findByRole('region', { name: /recent activity/i });

    expect(
      screen.queryByRole('button', { name: /Open Stripe dashboard/i })
    ).not.toBeInTheDocument();
  });

  it('POSTs stripe-dashboard-link and redirects to returned URL', async () => {
    render(<PaymentsPage />);

    await waitFor(() => {
      expect(screen.getAllByRole('button', { name: /Open Stripe dashboard/i }).length).toBe(1);
    });

    fireEvent.click(screen.getByRole('button', { name: /Open Stripe dashboard/i }));

    await waitFor(() => {
      expect(mockPost).toHaveBeenCalledWith(
        '/api/tradie/stripe-dashboard-link',
        {},
        expect.objectContaining({
          headers: { Authorization: 'Bearer test-token' },
        })
      );
    });

    expect(window.location.assign).toHaveBeenCalledWith(
      'https://connect.stripe.com/express/test'
    );
  });

  it('shows variation client paid in breakdown when present', async () => {
    mockGet.mockImplementation((url) => {
      if (url === '/api/me') {
        return Promise.resolve({
          data: { profile: { stripe: { onboardingComplete: true } } },
        });
      }
      if (url === '/api/tradie/payment-activity') {
        return Promise.resolve(
          activityPayload({
            released: [
              {
                jobId: 'job-v',
                title: 'Deck extension',
                taskNumber: '99',
                displayReference: 'TSK-0099',
                providerAmountCents: 25500,
                clientPaidCents: 30000,
                taskioFeeCents: 4500,
                feesTotalCents: 4500,
                platformFeeAmountCents: 4500,
                releasedAtMs: Date.UTC(2026, 3, 20),
                statusLabel: 'Released to Stripe',
                feeBenefitLabel: 'Taskio fee',
                breakdown: {
                  title: 'Deck extension',
                  taskRef: '99',
                  taskDisplayReference: 'TSK-0099',
                  releasedAtMs: Date.UTC(2026, 3, 20),
                  statusLabel: 'Released to Stripe',
                  baseJobClientPaidCents: 20000,
                  variationClientPaidCents: 10000,
                  totalClientPaidCents: 30000,
                  taskioPlatformFeeCents: 4500,
                  baseTaskioFeeCents: 3000,
                  variationTaskioFeeCents: 1500,
                  expertReleasedCents: 25500,
                  baseExpertReleasedCents: 17000,
                  variationExpertReleasedCents: 8500,
                  feeBenefitLabel: 'Taskio fee',
                  baseTransferId: 'tr_base',
                  variationTransferIds: { v1: 'tr_var' },
                  bankPayoutStatus: null,
                  bankPayoutNote: 'Bank payout timing is managed by Stripe.',
                },
              },
            ],
          })
        );
      }
      return Promise.reject(new Error(`unexpected ${url}`));
    });

    render(<PaymentsPage />);

    const region = await screen.findByRole('region', { name: /recent activity/i });
    await waitFor(() => {
      expect(within(region).getAllByText(/TSK-0099/).length).toBeGreaterThan(0);
    });

    fireEvent.click(screen.getAllByRole('button', { name: /View details/i })[0]);

    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByRole('heading', { name: /Payment details/i })).toBeInTheDocument();
    expect(within(dialog).getByText(/Approved paid variations/i)).toBeInTheDocument();
    expect(within(dialog).getByText(/\$100\.00/)).toBeInTheDocument();
    expect(within(dialog).getByText(/\$300\.00/)).toBeInTheDocument();
    expect(within(dialog).getByText(/Variation Taskio fee/i)).toBeInTheDocument();
    expect(within(dialog).getByText('$15.00')).toBeInTheDocument();
    expect(within(dialog).getByText(/Variation released amount/i)).toBeInTheDocument();

    fireEvent.click(within(dialog).getByText(/Support reference/i));
    expect(within(dialog).getByText(/Variation transfers: v1: tr_var/i)).toBeInTheDocument();
  });

  it('does not show fake zero dollars as live Stripe balance when Stripe balance is unavailable', async () => {
    mockGet.mockImplementation((url) => {
      if (url === '/api/me') {
        return Promise.resolve({
          data: { profile: { stripe: { onboardingComplete: true } } },
        });
      }
      if (url === '/api/tradie/payment-activity') {
        return Promise.resolve(activityPayload());
      }
      return Promise.reject(new Error(`unexpected ${url}`));
    });

    render(<PaymentsPage />);

    await screen.findByText(/Secured client payments/i);
    await waitFor(() => {
      const availableSection = screen.getAllByText(/Available now/)[0].closest('.pp-pay-summary-card');
      expect(availableSection?.textContent || '').toMatch(/Live Stripe balance unavailable/i);
      expect(availableSection?.textContent || '').not.toMatch(/\$\s*0\.00/);
    });
  });

  it('shows Stripe balance snapshot when Stripe reports data', async () => {
    mockGet.mockImplementation((url) => {
      if (url === '/api/me') {
        return Promise.resolve({
          data: { profile: { stripe: { onboardingComplete: true } } },
        });
      }
      if (url === '/api/tradie/payment-activity') {
        return Promise.resolve(
          activityPayload({
            summary: {
              totalReleasedToStripeCents: 0,
              releasedJobCount: 0,
              stripeBalance: {
                dataAvailable: true,
                availableCents: 12550,
                pendingCents: 0,
                currency: 'aud',
              },
            },
            released: [],
          })
        );
      }
      return Promise.reject(new Error(`unexpected ${url}`));
    });

    render(<PaymentsPage />);

    await waitFor(() => {
      expect(screen.getAllByText(/\$125\.50/).length).toBeGreaterThanOrEqual(1);
    });
  });

  it('hero highlights pending in Stripe when nothing released yet but Stripe reports pending balance', async () => {
    mockGet.mockImplementation((url) => {
      if (url === '/api/me') {
        return Promise.resolve({
          data: { profile: { stripe: { onboardingComplete: true } } },
        });
      }
      if (url === '/api/tradie/payment-activity') {
        return Promise.resolve(
          activityPayload({
            released: [],
            summary: {
              totalReleasedToStripeCents: 0,
              totalSecuredInEscrowCents: 0,
              releasedJobCount: 0,
              stripeBalance: {
                dataAvailable: true,
                availableCents: 0,
                pendingCents: 9264,
                currency: 'aud',
              },
            },
          })
        );
      }
      return Promise.reject(new Error(`unexpected ${url}`));
    });

    render(<PaymentsPage />);

    await waitFor(() => {
      const overview = screen.getByRole('heading', { name: /Payout overview/i }).closest('section');
      expect(overview?.textContent || '').toMatch(/Pending in Stripe/);
      expect(overview?.textContent || '').toMatch(/\$92\.64/);
      expect(overview?.textContent || '').toMatch(/\$0\.00 available now · \$92\.64 pending in Stripe/);
    });
  });
});
