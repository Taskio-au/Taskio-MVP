import React from 'react';
import { render, screen } from '@testing-library/react';

const mockStatus = {
  value: {
    loadState: 'ok',
    status: { canExpertApply: false, expertOnboarding: 'WAITLIST' },
    refresh: jest.fn(),
  },
};

jest.mock('../hooks/usePublicPilotStatus', () => ({
  __esModule: true,
  default: () => mockStatus.value,
}));

jest.mock('./ExpertSignUpPage', () => () => <div>Expert signup form</div>);

jest.mock('react-router-dom', () => ({
  __esModule: true,
  Navigate: ({ to }) => <div>Redirect {to}</div>,
}), { virtual: true });

const ExpertSignUpRoute = require('./ExpertSignUpRoute').default;

describe('ExpertSignUpRoute', () => {
  it('shows the signup form when Expert onboarding is OPEN', () => {
    mockStatus.value = {
      loadState: 'ok',
      status: { canExpertApply: true, expertOnboarding: 'OPEN' },
      refresh: jest.fn(),
    };
    render(<ExpertSignUpRoute />);
    expect(screen.getByText('Expert signup form')).toBeInTheDocument();
  });

  it('redirects to the Expert waitlist when applications are closed', () => {
    mockStatus.value = {
      loadState: 'ok',
      status: { canExpertApply: false, expertOnboarding: 'WAITLIST' },
      refresh: jest.fn(),
    };
    render(<ExpertSignUpRoute />);
    expect(screen.getByText('Redirect /expert-waitlist')).toBeInTheDocument();
  });

  it('does not show signup while public status is loading', () => {
    mockStatus.value = {
      loadState: 'loading',
      status: { canExpertApply: false },
      refresh: jest.fn(),
    };
    render(<ExpertSignUpRoute />);
    expect(screen.getByRole('status')).toHaveTextContent(/checking expert applications/i);
    expect(screen.queryByText('Expert signup form')).not.toBeInTheDocument();
  });
});
