import React from 'react';
import { render, screen } from '@testing-library/react';

jest.mock('react-router-dom', () => ({
  __esModule: true,
  Link: ({ children, to, ...props }) => <a href={to} {...props}>{children}</a>,
}), { virtual: true });

const mockPilot = {
  value: {
    loadState: 'ok',
    status: { homeownerPosting: 'CLOSED', canPost: false, waitlistAvailable: true },
    refresh: jest.fn(),
  },
};

jest.mock('../hooks/usePublicPilotStatus', () => ({
  __esModule: true,
  default: () => mockPilot.value,
}));

const mockExpertSignup = { enabled: false };
jest.mock('../config/publicAcquisitionConfig', () => ({
  isExpertPublicSignupEnabled: () => mockExpertSignup.enabled,
  isPublicAcquisitionEnabled: () => mockExpertSignup.enabled,
}));

jest.mock('../components/PublicPageHeader', () => () => <header>Header</header>);

const GetStartedPage = require('./GetStartedPage').default;

describe('GetStartedPage', () => {
  beforeEach(() => {
    mockExpertSignup.enabled = false;
    mockPilot.value = {
      loadState: 'ok',
      status: { homeownerPosting: 'CLOSED', canPost: false, waitlistAvailable: true },
      refresh: jest.fn(),
    };
  });

  it('keeps Expert signup invite-only while offering homeowner waitlist when CLOSED', () => {
    render(<GetStartedPage />);
    expect(screen.getByRole('link', { name: /join waitlist/i })).toHaveAttribute('href', '/waitlist');
    expect(screen.getByRole('link', { name: /log in/i })).toHaveAttribute('href', '/login');
    expect(screen.queryByRole('link', { name: /become an expert/i })).not.toBeInTheDocument();
    expect(screen.getByText(/onboards founding experts manually/i)).toBeInTheDocument();
  });

  it('lets a new homeowner continue to posting when OPEN without an invitation', () => {
    mockPilot.value = {
      loadState: 'ok',
      status: { homeownerPosting: 'OPEN', canPost: true, waitlistAvailable: false },
      refresh: jest.fn(),
    };
    render(<GetStartedPage />);
    expect(screen.getByRole('link', { name: /post a task/i })).toHaveAttribute('href', '/post-job');
    expect(screen.getByText(/no invitation is required/i)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /log in/i })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /become an expert/i })).not.toBeInTheDocument();
  });
});
