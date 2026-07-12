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

const LandingPage = require('./LandingPage').default;

describe('LandingPage', () => {
  it('renders the primary public trust messaging and calls to action', () => {
    render(
      <MemoryRouter>
        <LandingPage />
      </MemoryRouter>
    );

    expect(screen.getByRole('heading', { name: /indoor help without the chase/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /post your task for free/i })).toBeInTheDocument();
    expect(screen.getAllByRole('link', { name: /become an expert/i }).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/verified experts/i).length).toBeGreaterThan(0);
    expect(screen.getByText(/one flow for small indoor jobs/i)).toBeInTheDocument();
    expect(screen.getByText(/trusted local experts/i)).toBeInTheDocument();
    expect(screen.getByText(/indoor jobs you can post/i)).toBeInTheDocument();
    expect(screen.getAllByText(/inner melbourne/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/mounting/i).length).toBeGreaterThan(0);
    expect(screen.getByText(/curtains & blinds/i)).toBeInTheDocument();
    expect(screen.queryByText(/garden care/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/home cleaning/i)).not.toBeInTheDocument();
  });
});
