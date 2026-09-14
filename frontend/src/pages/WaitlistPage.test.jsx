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

const WaitlistPage = require('./WaitlistPage').default;

describe('WaitlistPage', () => {
  beforeEach(() => {
    mockPost.mockReset();
  });

  it('does not submit when contact consent is unchecked', () => {
    render(<WaitlistPage />);
    fireEvent.change(screen.getByLabelText(/^email$/i), { target: { value: 'homeowner@example.com' } });
    fireEvent.click(screen.getByRole('button', { name: /join waitlist/i }));
    expect(mockPost).not.toHaveBeenCalled();
    expect(screen.getByText(/confirm we can contact you about the melbourne pilot/i)).toBeInTheDocument();
  });

  it('submits email with explicit consentAccepted true after the checkbox is checked', async () => {
    mockPost.mockResolvedValue({ data: { ok: true } });
    render(<WaitlistPage />);
    fireEvent.change(screen.getByLabelText(/^email$/i), { target: { value: 'homeowner@example.com' } });
    fireEvent.click(screen.getByLabelText(/i agree to be contacted/i));
    fireEvent.click(screen.getByRole('button', { name: /join waitlist/i }));
    await waitFor(() => expect(mockPost).toHaveBeenCalledWith('/api/pilot-waitlist', {
      email: 'homeowner@example.com',
      suburb: '',
      source: 'waitlist',
      consentAccepted: true,
    }));
    expect(await screen.findByText(/we'll be in touch/i)).toBeInTheDocument();
  });
});
