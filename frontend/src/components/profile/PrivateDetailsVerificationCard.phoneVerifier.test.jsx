import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';

const mockRequestPhoneOtp = jest.fn();
const mockConfirmPhoneOtp = jest.fn();
const mockGetUserProfile = jest.fn();
const mockUpdateUserProfile = jest.fn();
const mockRecaptchaVerifier = jest.fn();
const mockSendEmailVerification = jest.fn();

jest.mock('../../firebase', () => ({
  auth: {
    currentUser: {
      uid: 'expert-1',
      phoneNumber: null,
      reload: jest.fn(),
      getIdToken: jest.fn(async () => 'token'),
    },
    settings: { appVerificationDisabledForTesting: false },
  },
}));

jest.mock('../../services/userProfile', () => ({
  getUserProfile: (...args) => mockGetUserProfile(...args),
  updateUserProfile: (...args) => mockUpdateUserProfile(...args),
}));

jest.mock('firebase/auth', () => ({
  sendEmailVerification: (...args) => mockSendEmailVerification(...args),
  RecaptchaVerifier: function RecaptchaVerifier(...args) {
    return mockRecaptchaVerifier(...args);
  },
  PhoneAuthProvider: { credential: jest.fn() },
  signInWithPhoneNumber: jest.fn(),
  linkWithCredential: jest.fn(),
  linkWithPhoneNumber: jest.fn(),
}));

jest.mock('../../services/phoneVerification', () => {
  const actual = jest.requireActual('../../services/phoneVerification');
  return {
    ...actual,
    requestPhoneOtp: (...args) => mockRequestPhoneOtp(...args),
    confirmPhoneOtp: (...args) => mockConfirmPhoneOtp(...args),
  };
});

const PrivateDetailsVerificationCard = require('./PrivateDetailsVerificationCard').default;
const { auth } = require('../../firebase');

describe('PrivateDetailsVerificationCard official phone verifier', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    auth.settings.appVerificationDisabledForTesting = false;
    mockGetUserProfile.mockResolvedValue({});
    mockUpdateUserProfile.mockResolvedValue({});
    mockRecaptchaVerifier.mockImplementation(() => ({
      clear: jest.fn(),
      verify: jest.fn(),
      render: jest.fn(async () => 'widget-1'),
    }));
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('constructs the official RecaptchaVerifier in testing mode with the exported Auth instance', async () => {
    auth.settings.appVerificationDisabledForTesting = true;
    mockRequestPhoneOtp.mockResolvedValue({ verificationId: 'abc' });

    render(<PrivateDetailsVerificationCard variant="phone" />);
    await waitFor(() => expect(screen.getByRole('button', { name: /send code/i })).toBeEnabled());

    fireEvent.change(screen.getByPlaceholderText(/04xx xxx xxx/i), { target: { value: '0412 345 678' } });
    fireEvent.click(screen.getByRole('button', { name: /send code/i }));

    await waitFor(() => expect(mockRequestPhoneOtp).toHaveBeenCalled());
    expect(mockRecaptchaVerifier).toHaveBeenCalledTimes(1);
    expect(mockRecaptchaVerifier.mock.calls[0][0]).toBe(auth);
    expect(mockRecaptchaVerifier.mock.calls[0][1]).toBe('recaptcha-container');
    expect(mockRecaptchaVerifier.mock.calls[0][2]).toEqual(expect.objectContaining({ size: 'invisible' }));
    expect(mockRequestPhoneOtp.mock.calls[0][0].auth).toBe(auth);
    expect(mockRequestPhoneOtp.mock.calls[0][0].recaptchaVerifier).toBe(
      mockRecaptchaVerifier.mock.results[0].value
    );
  });

  it('clears a failed verifier and constructs a new one on retry', async () => {
    const first = { clear: jest.fn(), verify: jest.fn(), render: jest.fn(async () => 'widget-1') };
    const second = { clear: jest.fn(), verify: jest.fn(), render: jest.fn(async () => 'widget-2') };
    mockRecaptchaVerifier
      .mockImplementationOnce(() => first)
      .mockImplementationOnce(() => second);
    mockRequestPhoneOtp
      .mockRejectedValueOnce(new Error('Could not send a verification code.'))
      .mockResolvedValueOnce({ verificationId: 'abc' });

    render(<PrivateDetailsVerificationCard variant="phone" />);
    await waitFor(() => expect(screen.getByRole('button', { name: /send code/i })).toBeEnabled());
    fireEvent.change(screen.getByPlaceholderText(/04xx xxx xxx/i), { target: { value: '0412 345 678' } });
    fireEvent.click(screen.getByRole('button', { name: /send code/i }));

    await waitFor(() => expect(first.clear).toHaveBeenCalledTimes(1));
    expect(mockRecaptchaVerifier).toHaveBeenCalledTimes(1);

    const future = Date.now() + 31_000;
    jest.spyOn(Date, 'now').mockReturnValue(future);
    fireEvent.change(screen.getByPlaceholderText(/04xx xxx xxx/i), { target: { value: '0412 345 679' } });
    fireEvent.change(screen.getByPlaceholderText(/04xx xxx xxx/i), { target: { value: '0412 345 678' } });
    await waitFor(() => expect(screen.getByRole('button', { name: /^send code$/i })).toBeEnabled());
    fireEvent.click(screen.getByRole('button', { name: /send code/i }));

    await waitFor(() => expect(mockRequestPhoneOtp).toHaveBeenCalledTimes(2));
    expect(mockRecaptchaVerifier).toHaveBeenCalledTimes(2);
    expect(mockRequestPhoneOtp.mock.calls[1][0].recaptchaVerifier).toBe(second);
  });

  it('does not send a phone OTP when the recaptcha container is missing', async () => {
    const { container } = render(<PrivateDetailsVerificationCard variant="phone" />);
    await waitFor(() => expect(screen.getByRole('button', { name: /send code/i })).toBeEnabled());
    const recaptchaNode = container.querySelector('#recaptcha-container');
    recaptchaNode.removeAttribute('id');

    fireEvent.change(screen.getByPlaceholderText(/04xx xxx xxx/i), { target: { value: '0412 345 678' } });
    fireEvent.click(screen.getByRole('button', { name: /send code/i }));

    await waitFor(() => expect(screen.getByText(/phone verification is not ready/i)).toBeInTheDocument());
    expect(mockRecaptchaVerifier).not.toHaveBeenCalled();
    expect(mockRequestPhoneOtp).not.toHaveBeenCalled();
  });
});
