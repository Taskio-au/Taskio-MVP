import { fireEvent } from '@testing-library/react';
import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';

const mockNavigate = jest.fn();
const mockSignInWithEmailLink = jest.fn();
const mockIsSignInWithEmailLink = jest.fn();
const mockFinalizeAuthenticatedSession = jest.fn();

jest.mock('react-router-dom', () => ({
  __esModule: true,
  Link: ({ children, ...props }) => <a {...props}>{children}</a>,
  useNavigate: () => mockNavigate,
  useSearchParams: () => [new URLSearchParams('')],
}), { virtual: true });

jest.mock('../firebase', () => ({
  auth: {},
}));

jest.mock('../design/components/BrandLogo', () => () => <div>BrandLogo</div>);

jest.mock('../features/auth/utils', () => ({
  clearPendingMagicLinkEmail: jest.fn(),
  readPendingMagicLinkEmail: jest.fn(() => ''),
}));

jest.mock('../features/auth/postAuth', () => ({
  finalizeAuthenticatedSession: (...args) => mockFinalizeAuthenticatedSession(...args),
}));

jest.mock('firebase/auth', () => ({
  applyActionCode: jest.fn(),
  confirmPasswordReset: jest.fn(),
  isSignInWithEmailLink: (...args) => mockIsSignInWithEmailLink(...args),
  signInWithEmailLink: (...args) => mockSignInWithEmailLink(...args),
  verifyPasswordResetCode: jest.fn(),
}));

const AuthAction = require('./AuthAction').default;

describe('AuthAction magic link flow', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockIsSignInWithEmailLink.mockReturnValue(true);
    mockSignInWithEmailLink.mockResolvedValue({ user: { uid: 'user-1' } });
    mockFinalizeAuthenticatedSession.mockResolvedValue('/dashboard');
  });

  it('completes a stored magic-link sign-in and offers continue', async () => {
    render(<AuthAction />);

    fireEvent.change(screen.getByPlaceholderText(/you@example.com/i), { target: { value: 'user@example.com' } });
    fireEvent.click(screen.getByRole('button', { name: /continue/i }));

    await waitFor(() => expect(mockSignInWithEmailLink).toHaveBeenCalled());
    await waitFor(() => expect(screen.getByText(/all set/i)).toBeInTheDocument());
    expect(screen.getByRole('button', { name: /continue/i })).toBeInTheDocument();
  });
});
