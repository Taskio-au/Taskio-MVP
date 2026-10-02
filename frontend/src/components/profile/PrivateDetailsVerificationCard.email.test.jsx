import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';

const mockSendEmailVerification = jest.fn();
const mockGetUserProfile = jest.fn();
const mockFirebaseState = { usingFirebaseEmulators: false };

jest.mock('../../firebase', () => ({
  get usingFirebaseEmulators() {
    return mockFirebaseState.usingFirebaseEmulators;
  },
  auth: {
    currentUser: {
      uid: 'expert-1',
      email: 'expert@example.com',
      emailVerified: false,
      phoneNumber: null,
      getIdToken: jest.fn(async () => 'token'),
    },
  },
}));

jest.mock('../../services/userProfile', () => ({
  getUserProfile: (...args) => mockGetUserProfile(...args),
  updateUserProfile: jest.fn(),
}));

jest.mock('firebase/auth', () => ({
  sendEmailVerification: (...args) => mockSendEmailVerification(...args),
}));

jest.mock('../../services/phoneVerification', () => ({
  clearRecaptchaVerifier: jest.fn(),
  ensureOfficialRecaptchaVerifier: jest.fn(),
  normalizeAuMobileToE164: jest.fn(),
  requestPhoneOtp: jest.fn(),
  confirmPhoneOtp: jest.fn(),
}));

const PrivateDetailsVerificationCard = require('./PrivateDetailsVerificationCard').default;

describe('PrivateDetailsVerificationCard email verification', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockFirebaseState.usingFirebaseEmulators = false;
    mockGetUserProfile.mockResolvedValue({});
    mockSendEmailVerification.mockResolvedValue(undefined);
    jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    console.error.mockRestore();
  });

  it('shows simulated-email guidance only in the Auth emulator', async () => {
    const view = render(<PrivateDetailsVerificationCard variant="email" />);
    expect(await screen.findByRole('button', { name: /resend verification email/i })).toBeInTheDocument();
    expect(screen.queryByText(/verification emails are not delivered/i)).not.toBeInTheDocument();
    view.unmount();

    mockFirebaseState.usingFirebaseEmulators = true;
    render(<PrivateDetailsVerificationCard variant="email" />);
    const note = await screen.findByText(/verification emails are not delivered to your inbox/i);
    expect(note).toHaveAttribute('id', 'local-email-verification-note');
    expect(screen.getByRole('button', { name: /resend verification email/i }))
      .toHaveAttribute('aria-describedby', 'local-email-verification-note');
  });

  it('resends through Firebase and does not show provider error text', async () => {
    mockSendEmailVerification.mockRejectedValueOnce({
      code: 'auth/internal-error',
      message: 'Firebase: Error (auth/internal-error). project config leaked',
    });
    render(<PrivateDetailsVerificationCard variant="email" />);
    fireEvent.click(await screen.findByRole('button', { name: /resend verification email/i }));

    expect(await screen.findByRole('status')).toHaveTextContent(
      "We couldn't send the verification email right now. Please try again.",
    );
    expect(screen.queryByText(/project config leaked|firebase/i)).not.toBeInTheDocument();
    expect(mockSendEmailVerification).toHaveBeenCalled();
    expect(console.error).toHaveBeenCalledWith('email verification resend failed', 'auth/internal-error');
  });
});
