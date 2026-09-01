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

    expect(screen.getByRole('heading', { level: 1, name: /small indoor jobs, sorted/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /log in if invited/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /how taskio works/i })).toHaveAttribute('href', '#how-taskio-works');
    expect(screen.getAllByText(/^invite-only$/i).length).toBeGreaterThan(0);
    expect(screen.queryByRole('link', { name: /become an expert/i })).not.toBeInTheDocument();
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

  it('keeps the invite-only launch explanation visible', () => {
    render(
      <MemoryRouter>
        <LandingPage />
      </MemoryRouter>
    );

    expect(
      screen.getByRole('heading', { name: /private early access in inner melbourne/i })
    ).toBeInTheDocument();
    expect(screen.getByText(/public signup is not open/i)).toBeInTheDocument();
    expect(screen.getAllByRole('link', { name: /how invite-only access works/i }).length).toBeGreaterThan(0);
  });

  it('keeps public acquisition closed in every landing call to action', () => {
    render(
      <MemoryRouter>
        <LandingPage />
      </MemoryRouter>
    );

    // Category cards route invited users to login, so they must not promise open posting.
    expect(screen.getAllByText('Log in to post').length).toBe(8);
    expect(screen.queryByText('Post task')).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /^post a task$/i })).not.toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /log in to post a mounting task/i })
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /expert access/i })).toBeInTheDocument();
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
