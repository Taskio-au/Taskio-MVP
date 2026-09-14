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

jest.mock('../components/PublicPageHeader', () => () => <header>Header</header>);

const GetStartedPage = require('./GetStartedPage').default;

describe('GetStartedPage', () => {
  beforeEach(() => {
    mockPilot.value = {
      loadState: 'ok',
      status: { homeownerPosting: 'CLOSED', canPost: false, waitlistAvailable: true },
      refresh: jest.fn(),
    };
  });

  it('offers homeowner waitlist and Expert waitlist when both are closed', () => {
    render(<GetStartedPage />);
    expect(screen.getByRole('link', { name: /join waitlist/i })).toHaveAttribute('href', '/waitlist');
    expect(screen.getByRole('link', { name: /^log in$/i })).toHaveAttribute('href', '/login');
    expect(screen.getByRole('link', { name: /join expert waitlist/i })).toHaveAttribute('href', '/expert-waitlist');
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
    expect(screen.getByRole('link', { name: /^log in$/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /join expert waitlist/i })).toHaveAttribute('href', '/expert-waitlist');
  });

  it('lets a new Expert apply while homeowner posting stays CLOSED', () => {
    mockPilot.value = {
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
    render(<GetStartedPage />);
    expect(screen.getByRole('link', { name: /join waitlist/i })).toHaveAttribute('href', '/waitlist');
    expect(screen.getByRole('link', { name: /become an expert/i })).toHaveAttribute('href', '/tradie/signup');
    expect(screen.getByRole('link', { name: /^log in$/i })).toHaveAttribute('href', '/login');
  });
});
