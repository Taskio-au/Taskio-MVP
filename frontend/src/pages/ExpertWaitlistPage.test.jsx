import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';

const mockPost = jest.fn();

jest.mock('react-router-dom', () => ({
  __esModule: true,
  Link: ({ children, to, ...props }) => <a href={to} {...props}>{children}</a>,
}), { virtual: true });

jest.mock('../components/PublicPageHeader', () => () => <header>Header</header>);

jest.mock('../api/createApiClient', () => ({
  createApiClient: () => ({
    post: (...args) => mockPost(...args),
  }),
}));

const ExpertWaitlistPage = require('./ExpertWaitlistPage').default;

describe('ExpertWaitlistPage', () => {
  beforeEach(() => {
    mockPost.mockReset();
  });

  it('does not submit when Expert-contact consent is unchecked', () => {
    render(<ExpertWaitlistPage />);
    fireEvent.change(screen.getByLabelText(/^email$/i), { target: { value: 'expert@example.com' } });
    fireEvent.click(screen.getByRole('button', { name: /join expert waitlist/i }));
    expect(mockPost).not.toHaveBeenCalled();
    expect(screen.getByText(/contact you about becoming a taskio expert/i)).toBeInTheDocument();
  });

  it('submits email with explicit consentAccepted true', async () => {
    mockPost.mockResolvedValue({ data: { ok: true } });
    render(<ExpertWaitlistPage />);
    fireEvent.change(screen.getByLabelText(/^email$/i), { target: { value: 'expert@example.com' } });
    fireEvent.click(screen.getByLabelText(/i agree to be contacted about becoming a taskio expert/i));
    fireEvent.click(screen.getByRole('button', { name: /join expert waitlist/i }));
    await waitFor(() => expect(mockPost).toHaveBeenCalledWith('/api/expert-waitlist', {
      email: 'expert@example.com',
      expertise: '',
      suburb: '',
      source: 'expert-waitlist',
      consentAccepted: true,
    }));
    expect(await screen.findByText(/we'll be in touch about becoming a taskio expert/i)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /log in/i })).toHaveAttribute('href', '/login');
  });
});
