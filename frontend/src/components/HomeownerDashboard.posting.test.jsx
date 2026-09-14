import React from 'react';
import { render, screen } from '@testing-library/react';

jest.mock('react-router-dom', () => ({
  __esModule: true,
  useNavigate: () => jest.fn(),
  useSearchParams: () => [new URLSearchParams(), jest.fn()],
}), { virtual: true });

jest.mock('react-firebase-hooks/auth', () => ({
  __esModule: true,
  useAuthState: () => [{ uid: 'homeowner-1', getIdToken: jest.fn().mockResolvedValue('token') }, false],
}), { virtual: true });

jest.mock('../firebase', () => ({
  auth: {},
}));

jest.mock('../api/createApiClient', () => ({
  createApiClient: () => ({
    get: jest.fn().mockResolvedValue({ data: [] }),
  }),
}));

jest.mock('./AppHeader', () => () => <header>Header</header>);
jest.mock('../hooks/useMessagingSummary', () => ({
  useChatThreads: () => ({ unreadByJobId: {} }),
}));
jest.mock('../hooks/useDashboardAttentionLimit', () => ({
  useDashboardAttentionLimit: () => 3,
}));

const mockPilot = {
  value: {
    loadState: 'ok',
    status: { homeownerPosting: 'OPEN', canPost: true, waitlistAvailable: false },
    refresh: jest.fn(),
  },
};

jest.mock('../hooks/usePublicPilotStatus', () => ({
  __esModule: true,
  default: () => mockPilot.value,
}));

const HomeownerDashboard = require('./HomeownerDashboard').default;

describe('HomeownerDashboard posting entry', () => {
  it('shows Post a task when operational state is OPEN', async () => {
    mockPilot.value = {
      loadState: 'ok',
      status: { homeownerPosting: 'OPEN', canPost: true, waitlistAvailable: false },
      refresh: jest.fn(),
    };
    render(<HomeownerDashboard />);
    expect(await screen.findByRole('button', { name: /post a task/i })).toBeInTheDocument();
  });

  it('shows the waitlist path when posting is CLOSED', async () => {
    mockPilot.value = {
      loadState: 'ok',
      status: { homeownerPosting: 'CLOSED', canPost: false, waitlistAvailable: true },
      refresh: jest.fn(),
    };
    render(<HomeownerDashboard />);
    expect(await screen.findByRole('button', { name: /join waitlist/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /post a task/i })).not.toBeInTheDocument();
  });
});