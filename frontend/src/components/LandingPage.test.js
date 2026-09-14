import React from 'react';
import { render, screen } from '@testing-library/react';

jest.mock('react-router-dom', () => ({
  __esModule: true,
  MemoryRouter: ({ children }) => <div>{children}</div>,
  Link: ({ children, to, ...props }) => <a href={to} {...props}>{children}</a>,
  useNavigate: () => jest.fn(),
}), { virtual: true });

const { MemoryRouter } = jest.requireMock('react-router-dom');

jest.mock('../firebase', () => ({
  auth: {},
}));

jest.mock('react-firebase-hooks/auth', () => ({
  __esModule: true,
  useAuthState: jest.fn(() => [null, false, null]),
}), { virtual: true });

const mockPilotStatus = {
  value: {
    loadState: 'ok',
    status: { homeownerPosting: 'CLOSED', canPost: false, waitlistAvailable: true },
    refresh: jest.fn(),
  },
};

jest.mock('../hooks/usePublicPilotStatus', () => ({
  __esModule: true,
  default: () => mockPilotStatus.value,
}));

const mockPublicAcquisition = { enabled: false };
jest.mock('../config/publicAcquisitionConfig', () => ({
  isExpertPublicSignupEnabled: () => mockPublicAcquisition.enabled,
  isPublicAcquisitionEnabled: () => mockPublicAcquisition.enabled,
}));

const LandingPage = require('./LandingPage').default;

describe('LandingPage', () => {
  it('renders the primary public trust messaging and calls to action', () => {
    render(
      <MemoryRouter>
        <LandingPage />
      </MemoryRouter>
    );

    expect(screen.getByRole('heading', { level: 1, name: /small indoor jobs, sorted/i })).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: /join waitlist/i }).length).toBeGreaterThan(0);
    expect(screen.getByRole('link', { name: /how taskio works/i })).toHaveAttribute('href', '#how-taskio-works');
    expect(screen.getAllByRole('link', { name: /join expert waitlist/i }).length).toBeGreaterThan(0);
    expect(screen.queryByText(/^experts invited$/i)).not.toBeInTheDocument();
    expect(screen.getAllByText(/verified experts/i).length).toBeGreaterThan(0);
    expect(screen.getByText('Payment through Taskio')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /one place\. clear from start to finish/i })).toBeInTheDocument();
    expect(screen.getByText(/your brief, quotes, messages and payment stay organised/i)).toBeInTheDocument();
    expect(screen.getByText(/quotes in one place/i)).toBeInTheDocument();
    expect(screen.getByText(/indoor jobs you can post/i)).toBeInTheDocument();
    expect(screen.getAllByText(/inner melbourne/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/mounting/i).length).toBeGreaterThan(0);
    expect(screen.getByText(/curtains & blinds/i)).toBeInTheDocument();
    expect(screen.queryByText(/garden care/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/home cleaning/i)).not.toBeInTheDocument();
  });

  it('renders the three-stage product journey without implying real customer activity', () => {
    render(
      <MemoryRouter>
        <LandingPage />
      </MemoryRouter>
    );

    expect(screen.getByRole('heading', { name: /one path from brief to approval/i })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /one structured brief/i })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /quotes side by side/i })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /payment you control/i })).toBeInTheDocument();

    expect(screen.getByText('Illustrative preview')).toBeInTheDocument();
    expect(screen.getAllByText('Illustrative example').length).toBe(3);
    expect(screen.getByText(/these are not real customer tasks/i)).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: /clients and experts in their own words/i })).not.toBeInTheDocument();
  });

  it('explains closed homeowner posting and Expert waitlist', () => {
    render(
      <MemoryRouter>
        <LandingPage />
      </MemoryRouter>
    );

    expect(
      screen.getByRole('heading', { name: /private early access in inner melbourne/i })
    ).toBeInTheDocument();
    expect(screen.getByText(/homeowner posting closed — join the waitlist/i)).toBeInTheDocument();
    expect(screen.getAllByRole('link', { name: /join the expert waitlist/i }).length).toBeGreaterThan(0);
  });

  it('keeps public acquisition closed in every landing call to action', () => {
    render(
      <MemoryRouter>
        <LandingPage />
      </MemoryRouter>
    );

    expect(screen.getAllByText('Join waitlist').length).toBeGreaterThan(0);
    expect(screen.queryByText('Post task')).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /^post a task$/i })).not.toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /join waitlist for mounting/i })
    ).toBeInTheDocument();
    expect(screen.getAllByRole('link', { name: /join expert waitlist/i }).length).toBeGreaterThan(0);
  });

  it('lets a new homeowner post when OPEN even if Expert public signup is off', () => {
    mockPilotStatus.value = {
      loadState: 'ok',
      status: { homeownerPosting: 'OPEN', canPost: true, waitlistAvailable: false },
      refresh: jest.fn(),
    };
    const { unmount } = render(
      <MemoryRouter>
        <LandingPage />
      </MemoryRouter>
    );
    expect(screen.getByRole('button', { name: /post your task for free/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /log in if invited/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^join waitlist$/i })).not.toBeInTheDocument();
    expect(screen.getByText(/sign up or log in, no invitation/i)).toBeInTheDocument();
    expect(screen.getAllByRole('link', { name: /join expert waitlist/i }).length).toBeGreaterThan(0);
    unmount();
    mockPilotStatus.value = {
      loadState: 'ok',
      status: { homeownerPosting: 'CLOSED', canPost: false, waitlistAvailable: true },
      refresh: jest.fn(),
    };
  });

  it('shows Post a task when posting is OPEN and public acquisition is enabled', () => {
    mockPublicAcquisition.enabled = true;
    mockPilotStatus.value = {
      loadState: 'ok',
      status: { homeownerPosting: 'OPEN', canPost: true, waitlistAvailable: false },
      refresh: jest.fn(),
    };
    const { unmount } = render(
      <MemoryRouter>
        <LandingPage />
      </MemoryRouter>
    );
    expect(screen.getByRole('button', { name: /post your task for free/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /post a task$/i })).toBeInTheDocument();
    unmount();
    mockPublicAcquisition.enabled = false;
    mockPilotStatus.value = {
      loadState: 'ok',
      status: { homeownerPosting: 'CLOSED', canPost: false, waitlistAvailable: true },
      refresh: jest.fn(),
    };
  });

  it('shows pause copy and a waitlist CTA when posting is PAUSED', () => {
    mockPilotStatus.value = {
      loadState: 'ok',
      status: { homeownerPosting: 'PAUSED', canPost: false, waitlistAvailable: true },
      refresh: jest.fn(),
    };
    const { unmount } = render(
      <MemoryRouter>
        <LandingPage />
      </MemoryRouter>
    );
    expect(screen.getByText(/temporarily pausing new job posts/i)).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: /join waitlist/i }).length).toBeGreaterThan(0);
    unmount();
    mockPilotStatus.value = {
      loadState: 'ok',
      status: { homeownerPosting: 'CLOSED', canPost: false, waitlistAvailable: true },
      refresh: jest.fn(),
    };
  });

  it('lets a new Expert apply when Expert onboarding is OPEN even if homeowner posting is CLOSED', () => {
    mockPilotStatus.value = {
      loadState: 'ok',
      status: {
        homeownerPosting: 'CLOSED',
        canPost: false,
        waitlistAvailable: true,
        expertOnboarding: 'OPEN',
        canExpertApply: true,
        expertWaitlistAvailable: false,
      },
      refresh: jest.fn(),
    };
    const { unmount } = render(
      <MemoryRouter>
        <LandingPage />
      </MemoryRouter>
    );
    expect(screen.getAllByRole('link', { name: /become an expert/i })[0]).toHaveAttribute('href', '/tradie/signup');
    expect(screen.getAllByRole('button', { name: /join waitlist/i }).length).toBeGreaterThan(0);
    unmount();
    mockPilotStatus.value = {
      loadState: 'ok',
      status: { homeownerPosting: 'CLOSED', canPost: false, waitlistAvailable: true },
      refresh: jest.fn(),
    };
  });

  it('fails Expert applications closed when public status cannot be loaded', () => {
    mockPilotStatus.value = {
      loadState: 'error',
      status: { homeownerPosting: 'CLOSED', canPost: false, waitlistAvailable: true },
      refresh: jest.fn(),
    };
    const { unmount } = render(
      <MemoryRouter>
        <LandingPage />
      </MemoryRouter>
    );
    expect(screen.getByText(/temporarily unavailable/i)).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: /join waitlist/i }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole('link', { name: /join expert waitlist/i })[0]).toHaveAttribute('href', '/expert-waitlist');
    unmount();
    mockPilotStatus.value = {
      loadState: 'ok',
      status: { homeownerPosting: 'CLOSED', canPost: false, waitlistAvailable: true },
      refresh: jest.fn(),
    };
  });

  it('describes payment without claiming Taskio holds the money', () => {
    render(
      <MemoryRouter>
        <LandingPage />
      </MemoryRouter>
    );

    expect(screen.getByRole('heading', { name: /pay when you approve/i })).toBeInTheDocument();
    expect(screen.getAllByText(/released to the expert after you approve/i).length).toBeGreaterThan(0);
    expect(screen.queryByText(/payment sits with taskio/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/escrow/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/guaranteed/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/insured/i)).not.toBeInTheDocument();
  });
});
