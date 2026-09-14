import React from 'react';
import { render, screen } from '@testing-library/react';

jest.mock('../hooks/usePublicPilotStatus', () => ({
  __esModule: true,
  default: () => ({
    loadState: 'ok',
    status: { canExpertApply: false, expertOnboarding: 'WAITLIST' },
    refresh: jest.fn(),
  }),
}));

jest.mock('./ExpertSignUpPage', () => () => <div>Expert signup form</div>);

jest.mock('react-router-dom', () => ({
  __esModule: true,
  Navigate: ({ to }) => <div>Redirect {to}</div>,
}), { virtual: true });

const ExpertSignUpRoute = require('./ExpertSignUpRoute').default;

test('WAITLIST Expert onboarding hides the expert signup form', () => {
  render(<ExpertSignUpRoute />);

  expect(screen.getByText('Redirect /expert-waitlist')).toBeInTheDocument();
  expect(screen.queryByText('Expert signup form')).not.toBeInTheDocument();
});
