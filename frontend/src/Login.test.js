import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';

const mockNavigate = jest.fn();
const mockFetchSignInMethodsForEmail = jest.fn();
const mockGetAdditionalUserInfo = jest.fn();
const mockSignInWithEmailAndPassword = jest.fn();
const mockSignInWithPopup = jest.fn();
const mockSendPasswordResetEmail = jest.fn();
const mockRequestPhoneOtpForSignIn = jest.fn();
const mockConfirmPhoneOtpForSignIn = jest.fn();
const mockFinalizeAuthenticatedSession = jest.fn();
const mockResolvePostAuthDestination = jest.fn();
const mockSendTaskioMagicLink = jest.fn();
const mockResolveEmailSignIn = jest.fn();
const mockApiPost = jest.fn();

jest.mock('react-router-dom', () => ({
  __esModule: true,
  Link: ({ children, to, ...props }) => <a href={typeof to === 'string' ? to : undefined} {...props}>{children}</a>,
  useNavigate: () => mockNavigate,
}), { virtual: true });

jest.mock('./firebase', () => ({
  auth: {
    currentUser: null,
    settings: {},
  },
  googleProvider: {},
}));

jest.mock('./api/createApiClient', () => ({
  createApiClient: () => ({
    post: (...args) => mockApiPost(...args),
  }),
}));

jest.mock('./design/components/BrandLogo', () => () => <div>BrandLogo</div>);

jest.mock('./components/profile/GoogleBrand', () => ({
  GoogleActionButton: ({ children, ...props }) => <button type="button" {...props}>{children}</button>,
}));

jest.mock('./components/auth/OtpCodeInput', () => ({ value, onChange }) => (
  <input
    aria-label="otp code"
    value={value}
    onChange={(event) => onChange(event.target.value)}
  />
));

jest.mock('./features/auth/utils', () => {
  const actual = jest.requireActual('./features/auth/utils');
  return {
    ...actual,
    sendTaskioMagicLink: (...args) => mockSendTaskioMagicLink(...args),
    resolveEmailSignIn: (...args) => mockResolveEmailSignIn(...args),
  };
});

jest.mock('./features/auth/postAuth', () => ({
  finalizeAuthenticatedSession: (...args) => mockFinalizeAuthenticatedSession(...args),
  resolvePostAuthDestination: (...args) => mockResolvePostAuthDestination(...args),
  buildExistingMethodMessage: jest.fn(async () => 'Existing account found.'),
}));

jest.mock('./services/phoneVerification', () => ({
  normalizeAuMobileToE164: jest.fn(() => '+61405000123'),
  createInvisibleRecaptcha: jest.fn(() => ({ verify: jest.fn() })),
  requestPhoneOtpForSignIn: (...args) => mockRequestPhoneOtpForSignIn(...args),
  confirmPhoneOtpForSignIn: (...args) => mockConfirmPhoneOtpForSignIn(...args),
}));

jest.mock('firebase/auth', () => ({
  fetchSignInMethodsForEmail: (...args) => mockFetchSignInMethodsForEmail(...args),
  getAdditionalUserInfo: (...args) => mockGetAdditionalUserInfo(...args),
  sendPasswordResetEmail: (...args) => mockSendPasswordResetEmail(...args),
  signInWithEmailAndPassword: (...args) => mockSignInWithEmailAndPassword(...args),
  signInWithPopup: (...args) => mockSignInWithPopup(...args),
}));

const Login = require('./Login').default;

describe('Login unified auth flow', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockResolvePostAuthDestination.mockRejectedValue(new Error('no session'));
    mockFinalizeAuthenticatedSession.mockResolvedValue('/dashboard');
    mockFetchSignInMethodsForEmail.mockResolvedValue([]);
    mockGetAdditionalUserInfo.mockReturnValue({ isNewUser: false });
  });

  it('routes password-backed emails to the password step', async () => {
    mockResolveEmailSignIn.mockResolvedValue({ strategy: 'password' });

    render(<Login />);

    fireEvent.change(screen.getByLabelText(/phone number or email/i), { target: { value: 'user@example.com' } });
    fireEvent.click(screen.getByRole('button', { name: /^continue$/i }));

    await waitFor(() => expect(mockResolveEmailSignIn).toHaveBeenCalledWith(expect.anything(), 'user@example.com'));
    await waitFor(() => expect(screen.getByRole('heading', { name: /enter your password/i })).toBeInTheDocument());
  });

  it('routes phone identifiers to the otp step', async () => {
    mockRequestPhoneOtpForSignIn.mockResolvedValue({ verificationId: 'abc' });

    render(<Login />);

    fireEvent.change(screen.getByLabelText(/phone number or email/i), { target: { value: '0405 000 123' } });
    fireEvent.click(screen.getByRole('button', { name: /^continue$/i }));

    await waitFor(() => expect(mockRequestPhoneOtpForSignIn).toHaveBeenCalled());
    await waitFor(() => expect(screen.getByRole('heading', { name: /enter verification code/i })).toBeInTheDocument());
  });

  it('sends magic links for passwordless email accounts', async () => {
    mockResolveEmailSignIn.mockResolvedValue({ strategy: 'magic_link' });
    mockSendTaskioMagicLink.mockResolvedValue(undefined);

    render(<Login />);

    fireEvent.change(screen.getByLabelText(/phone number or email/i), { target: { value: 'user@example.com' } });
    fireEvent.click(screen.getByRole('button', { name: /^continue$/i }));

    await waitFor(() => expect(mockSendTaskioMagicLink).toHaveBeenCalled());
    await waitFor(() => expect(screen.getByRole('heading', { name: /check your email/i })).toBeInTheDocument());
  });

  it('routes google-linked email accounts to a google continuation step', async () => {
    mockResolveEmailSignIn.mockResolvedValue({ strategy: 'google' });

    render(<Login />);

    fireEvent.change(screen.getByLabelText(/phone number or email/i), { target: { value: 'user@example.com' } });
    fireEvent.click(screen.getByRole('button', { name: /^continue$/i }));

    await waitFor(() => expect(screen.getByRole('heading', { name: /continue with google/i })).toBeInTheDocument());
    expect(mockSendTaskioMagicLink).not.toHaveBeenCalled();
  });

  it('shows a neutral error when email resolution is unknown', async () => {
    mockResolveEmailSignIn.mockResolvedValue({ strategy: 'unknown' });

    render(<Login />);

    fireEvent.change(screen.getByLabelText(/phone number or email/i), { target: { value: 'missing@example.com' } });
    fireEvent.click(screen.getByRole('button', { name: /^continue$/i }));

    await waitFor(() => {
      expect(screen.getByText(/we couldn't sign you in\. please check your details or try another method\./i)).toBeInTheDocument();
    });
  });

  it('falls back to Firebase methods when the resolver is temporarily unavailable', async () => {
    mockResolveEmailSignIn.mockResolvedValue({ strategy: 'unavailable' });
    mockFetchSignInMethodsForEmail.mockResolvedValue(['password']);

    render(<Login />);

    fireEvent.change(screen.getByLabelText(/phone number or email/i), { target: { value: 'user@example.com' } });
    fireEvent.click(screen.getByRole('button', { name: /^continue$/i }));

    await waitFor(() => expect(mockFetchSignInMethodsForEmail).toHaveBeenCalledWith(expect.anything(), 'user@example.com'));
    await waitFor(() => expect(screen.getByRole('heading', { name: /enter your password/i })).toBeInTheDocument());
  });

  it('shows a temporary message when the resolver is unavailable and no fallback method is found', async () => {
    mockResolveEmailSignIn.mockResolvedValue({ strategy: 'unavailable' });

    render(<Login />);

    fireEvent.change(screen.getByLabelText(/phone number or email/i), { target: { value: 'user@example.com' } });
    fireEvent.click(screen.getByRole('button', { name: /^continue$/i }));

    await waitFor(() => {
      expect(screen.getByText(/we're having trouble signing you in right now\. please try again in a moment\./i)).toBeInTheDocument();
    });
  });

  it('completes the password step and redirects through the shared resolver', async () => {
    mockResolveEmailSignIn.mockResolvedValue({ strategy: 'password' });
    mockSignInWithEmailAndPassword.mockResolvedValue({ user: { uid: 'user-1' } });

    render(<Login />);

    fireEvent.change(screen.getByLabelText(/phone number or email/i), { target: { value: 'user@example.com' } });
    fireEvent.click(screen.getByRole('button', { name: /^continue$/i }));

    await waitFor(() => expect(screen.getByRole('heading', { name: /enter your password/i })).toBeInTheDocument());
    fireEvent.change(screen.getByLabelText(/^password$/i), { target: { value: 'hunter2pass' } });
    fireEvent.click(screen.getByRole('button', { name: /^sign in$/i }));

    await waitFor(() => expect(mockSignInWithEmailAndPassword).toHaveBeenCalled());
    expect(mockFinalizeAuthenticatedSession).toHaveBeenCalled();
    expect(mockNavigate).toHaveBeenCalledWith('/dashboard', { replace: true });
  });

  it('sends first-time Google users to get started without creating a default session profile', async () => {
    mockSignInWithPopup.mockResolvedValue({ user: { uid: 'google-1', email: 'new@example.com' } });
    mockGetAdditionalUserInfo.mockReturnValue({ isNewUser: true });

    render(<Login />);

    fireEvent.click(screen.getByRole('button', { name: /continue with google/i }));

    await waitFor(() => expect(mockSignInWithPopup).toHaveBeenCalled());
    expect(mockFinalizeAuthenticatedSession).not.toHaveBeenCalled();
    expect(mockNavigate).toHaveBeenCalledWith('/get-started', { replace: true });
  });

  it('keeps existing Google-linked users on the normal post-auth flow', async () => {
    mockSignInWithPopup.mockResolvedValue({ user: { uid: 'google-2', email: 'existing@example.com' } });
    mockGetAdditionalUserInfo.mockReturnValue({ isNewUser: false });

    render(<Login />);

    fireEvent.click(screen.getByRole('button', { name: /continue with google/i }));

    await waitFor(() => expect(mockFinalizeAuthenticatedSession).toHaveBeenCalledWith(
      expect.objectContaining({ uid: 'google-2', email: 'existing@example.com' }),
      expect.objectContaining({
        providerName: 'google',
        profileOverrides: { email: 'existing@example.com' },
      }),
    ));
    expect(mockNavigate).toHaveBeenCalledWith('/dashboard', { replace: true });
  });

  it('keeps get started pointed at the dedicated signup entry and hides admin affordances', () => {
    render(<Login />);

    expect(screen.getByRole('link', { name: /get started/i })).toHaveAttribute('href', '/get-started');
    expect(screen.queryByText(/admin sign in/i)).not.toBeInTheDocument();
  });

  it('renders the hidden admin route as email and password only', async () => {
    render(<Login adminMode />);

    expect(screen.getByRole('heading', { name: /admin sign in/i })).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText(/email address/i), { target: { value: 'admin@example.com' } });
    fireEvent.click(screen.getByRole('button', { name: /^continue$/i }));

    await waitFor(() => expect(screen.getByRole('heading', { name: /enter your password/i })).toBeInTheDocument());
    expect(screen.queryByLabelText(/phone number or email/i)).not.toBeInTheDocument();
  });
});
