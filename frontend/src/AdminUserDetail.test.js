import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

jest.mock('react-router-dom', () => ({
  __esModule: true,
  Link: ({ children, to }) => <a href={to}>{children}</a>,
  useParams: () => ({ uid: globalThis.__adminDetailTestUid }),
  useNavigate: () => jest.fn(),
}), { virtual: true });

jest.mock('./api/createApiClient', () => {
  globalThis.__taskioAdminUserDetailApi = {
    get: jest.fn(),
    post: jest.fn(),
  };
  return {
    createApiClient: jest.fn(() => globalThis.__taskioAdminUserDetailApi),
  };
});

jest.mock('./firebase', () => ({
  auth: { currentUser: { displayName: 'Admin', email: 'admin@example.com' } },
}));

jest.mock('./components/AppHeader', () => function MockHeader() {
  return null;
});

const AdminUserDetail = require('./AdminUserDetail').default;

function api() {
  return globalThis.__taskioAdminUserDetailApi;
}

function renderExpertDetail(uid) {
  globalThis.__adminDetailTestUid = uid;
  return render(<AdminUserDetail />);
}

describe('AdminUserDetail — Founding Expert', () => {
  const baseTradie = {
    uid: 'expert-1',
    role: 'tradie',
    status: 'active',
    displayName: 'Taylor Expert',
    firstName: 'Taylor',
    lastName: 'Expert',
    email: 't@example.com',
    phone: null,
    createdAt: 1,
    verified: true,
    lastLogin: null,
    stripeOnboardingStatus: 'completed',
    stripeChargesEnabled: true,
    stripePayoutsEnabled: true,
    stripeRequirements: null,
    foundingExpert: null,
    foundingExpertFeePreview: {
      stage: 'standard_launch',
      expertFeeBps: 1000,
      benefitLabel: 'Standard launch fee',
      derivedReducedFeeEndsAt: false,
      effectiveReducedFeeEndsAtMs: null,
    },
    foundingExpertProgramMeta: {
      cap: 50,
      activeProgramId: 'melbourne_founding_expert_test_2026',
      zeroFeeTaskLimit: 3,
      reducedFeeBps: 750,
      standardFeeBpsAfter: 1000,
      testResetAllowed: true,
    },
    foundingExpertEligibility: {
      isExpert: true,
      isActive: true,
      isPlatformVerified: true,
      isStripePayoutReady: true,
      hasServiceAreaOnFile: true,
      isMelbournePilotArea: true,
      hasApprovedExpertise: true,
      eligible: true,
      reasons: [],
    },
  };

  beforeEach(() => {
    jest.clearAllMocks();
    api().get.mockReset();
    api().post.mockReset();
  });

  it('renders not enrolled state and enrol button', async () => {
    api().get.mockResolvedValue({ data: { ...baseTradie } });
    renderExpertDetail('expert-1');
    await waitFor(() => expect(screen.getByText(/Melbourne Founding Expert program/i)).toBeInTheDocument());
    expect(screen.queryByText(/Current fee preview/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/^Unknown$/i)).not.toBeInTheDocument();
    expect(screen.getByText(/^Eligibility$/)).toBeInTheDocument();
    expect(screen.getByText(/Melbourne launch area/)).toBeInTheDocument();
    expect(screen.getByText(/Not enrolled/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Enrol as Founding Expert/i })).toBeInTheDocument();
    expect(api().get).toHaveBeenCalledWith('/api/admin/users/expert-1');
  });

  it('renders active state with slot and zero-fee usage', async () => {
    api().get.mockResolvedValue({
      data: {
        ...baseTradie,
        foundingExpert: {
          status: 'active',
          programId: 'melbourne_founding_expert_test_2026',
          sequenceNumber: 7,
          zeroFeeSlotsUsed: 1,
          zeroFeeTaskLimit: 3,
          reducedFeeStartsAtMs: null,
          reducedFeeEndsAtMs: null,
        },
        foundingExpertFeePreview: {
          stage: 'founding_first_three',
          expertFeeBps: 0,
          benefitLabel: 'Founding Expert benefit applied',
          derivedReducedFeeEndsAt: false,
          effectiveReducedFeeEndsAtMs: null,
        },
        foundingExpertEligibility: {
          isExpert: true,
          isActive: true,
          isPlatformVerified: true,
          isStripePayoutReady: true,
          hasServiceAreaOnFile: true,
          isMelbournePilotArea: true,
          hasApprovedExpertise: true,
          eligible: true,
          reasons: [],
        },
      },
    });
    renderExpertDetail('expert-x');
    await waitFor(() => expect(screen.getByText(/#7 of 50/)).toBeInTheDocument());
    expect(screen.getByText(/1 \/ 3 used/)).toBeInTheDocument();
    expect(screen.getByText(/First 3 jobs — 0%/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Remove from Founding Expert/i })).toBeInTheDocument();
  });

  it('enrol button calls approve endpoint then reloads user', async () => {
    const updated = {
      ...baseTradie,
      foundingExpert: {
        status: 'active',
        sequenceNumber: 1,
        zeroFeeSlotsUsed: 0,
        zeroFeeTaskLimit: 3,
        programId: 'melbourne_founding_expert_test_2026',
      },
      foundingExpertFeePreview: {
        stage: 'founding_first_three',
        expertFeeBps: 0,
        benefitLabel: '',
        derivedReducedFeeEndsAt: false,
        effectiveReducedFeeEndsAtMs: null,
      },
    };
    api().get.mockResolvedValue({ data: baseTradie });

    api().post.mockImplementation(async () => {
      api().get.mockResolvedValue({ data: updated });
      return {
        data: { ok: true, foundingExpert: { status: 'active' } },
      };
    });

    renderExpertDetail('expert-1');

    await waitFor(() => expect(screen.getByRole('button', { name: /Enrol as Founding Expert/i })).toBeInTheDocument());
    await userEvent.click(screen.getByRole('button', { name: /Enrol as Founding Expert/i }));

    await waitFor(() => {
      expect(api().post).toHaveBeenCalledWith(
        '/api/admin/experts/expert-1/founding-expert/approve',
        expect.objectContaining({ programId: 'melbourne_founding_expert_test_2026' })
      );
    });
    await waitFor(() => expect(screen.getByText(/#1 of 50/)).toBeInTheDocument());
    await waitFor(() => expect(screen.getByText(/Founding Expert enrolment updated/i)).toBeInTheDocument());
  });

  it('remove button calls remove endpoint then reloads user', async () => {
    const activeUser = {
      ...baseTradie,
      foundingExpert: {
        status: 'active',
        programId: 'melbourne_founding_expert_test_2026',
        sequenceNumber: 2,
        zeroFeeSlotsUsed: 0,
        zeroFeeTaskLimit: 3,
      },
      foundingExpertFeePreview: {
        stage: 'founding_first_three',
        expertFeeBps: 0,
        benefitLabel: '',
        derivedReducedFeeEndsAt: false,
        effectiveReducedFeeEndsAtMs: null,
      },
    };
    const removedUser = {
      ...activeUser,
      foundingExpert: { ...activeUser.foundingExpert, status: 'removed', removedAtMs: 1000 },
    };

    api().get.mockResolvedValue({ data: activeUser });

    api().post.mockImplementation(async () => {
      api().get.mockResolvedValue({ data: removedUser });
      return { data: { ok: true } };
    });

    renderExpertDetail('expert-1');

    await waitFor(() => expect(screen.getByRole('button', { name: /Remove from Founding Expert/i })).toBeInTheDocument());
    await userEvent.click(screen.getByRole('button', { name: /Remove from Founding Expert/i }));

    await waitFor(() => {
      expect(api().post).toHaveBeenCalledWith(
        '/api/admin/experts/expert-1/founding-expert/remove'
      );
    });
    await waitFor(() => expect(screen.getByText(/Removed from Founding Expert program/i)).toBeInTheDocument());
  });
});
