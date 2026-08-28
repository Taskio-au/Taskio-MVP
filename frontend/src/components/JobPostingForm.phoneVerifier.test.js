import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';

jest.mock('react-router-dom', () => ({
  __esModule: true,
  MemoryRouter: ({ children }) => <div>{children}</div>,
  Link: ({ children, to, ...props }) => <a href={to} {...props}>{children}</a>,
  useNavigate: () => jest.fn(),
}), { virtual: true });

const { MemoryRouter } = jest.requireMock('react-router-dom');

const mockApiPost = jest.fn();
const mockRequestPhoneOtpForSignIn = jest.fn();
const mockConfirmPhoneOtpForSignIn = jest.fn();
const mockRecaptchaVerifier = jest.fn();

jest.mock('../api/createApiClient', () => ({
  createApiClient: () => ({
    post: mockApiPost,
  }),
}));

jest.mock('../firebase', () => ({
  auth: {
    currentUser: null,
    settings: { appVerificationDisabledForTesting: false },
    onAuthStateChanged: jest.fn(() => () => {}),
  },
  storage: {},
}));

jest.mock('firebase/auth', () => ({
  RecaptchaVerifier: function RecaptchaVerifier(...args) {
    return mockRecaptchaVerifier(...args);
  },
}));

jest.mock('firebase/storage', () => ({
  getDownloadURL: jest.fn(),
  ref: jest.fn(),
  uploadBytesResumable: jest.fn(),
}));

jest.mock('../services/phoneVerification', () => {
  const actual = jest.requireActual('../services/phoneVerification');
  return {
    ...actual,
    requestPhoneOtpForSignIn: (...args) => mockRequestPhoneOtpForSignIn(...args),
    confirmPhoneOtpForSignIn: (...args) => mockConfirmPhoneOtpForSignIn(...args),
  };
});

const JobPostingForm = require('./JobPostingForm').default;
const { auth } = require('../firebase');

function renderForm() {
  return render(
    <MemoryRouter>
      <JobPostingForm />
    </MemoryRouter>
  );
}

function goToContactStep() {
  fireEvent.click(screen.getByRole('button', { name: /hanging/i }));
  fireEvent.click(screen.getByLabelText(/picture frames/i));
  fireEvent.change(screen.getByLabelText(/description/i), {
    target: { value: 'Need two frames hung straight in the hallway.' },
  });
  fireEvent.click(screen.getByRole('button', { name: /next/i }));

  fireEvent.click(document.querySelector('input[name="estimatedDuration"][value="under_1_hour"]'));
  fireEvent.click(document.querySelector('input[name="timeline"][value="Flexible"]'));
  fireEvent.click(screen.getByRole('button', { name: /next/i }));

  fireEvent.click(document.querySelector('input[name="budget"][value="under_150"]'));
  fireEvent.click(screen.getByRole('button', { name: /next/i }));

  fireEvent.change(screen.getByRole('combobox'), { target: { value: 'Melbourne|3000' } });
  fireEvent.click(screen.getByLabelText(/apartment \/ unit/i));
  fireEvent.click(document.querySelector('input[name="liftAvailable"][value="yes"]'));
  fireEvent.click(document.querySelector('input[name="stairs"][value="none"]'));
  fireEvent.click(document.querySelector('input[name="parking"][value="easy"]'));
  fireEvent.click(screen.getByRole('button', { name: /next/i }));
}

describe('JobPostingForm official phone verifier', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    sessionStorage.clear();
    auth.currentUser = null;
    auth.settings.appVerificationDisabledForTesting = false;
    mockRecaptchaVerifier.mockImplementation(() => ({
      clear: jest.fn(),
      verify: jest.fn(),
      render: jest.fn(async () => 'widget-1'),
    }));
  });

  it('constructs the official RecaptchaVerifier in testing mode with the exported Auth instance', async () => {
    auth.settings.appVerificationDisabledForTesting = true;
    mockRequestPhoneOtpForSignIn.mockResolvedValue({ verificationId: 'abc' });

    renderForm();
    goToContactStep();

    fireEvent.change(screen.getByLabelText(/phone number/i), { target: { value: '0412 345 678' } });
    fireEvent.click(screen.getByRole('checkbox'));
    fireEvent.click(screen.getByRole('button', { name: /get quotes/i }));

    await waitFor(() => expect(mockRequestPhoneOtpForSignIn).toHaveBeenCalled());
    expect(mockRecaptchaVerifier).toHaveBeenCalledTimes(1);
    expect(mockRecaptchaVerifier.mock.calls[0][0]).toBe(auth);
    expect(mockRecaptchaVerifier.mock.calls[0][2]).toEqual({ size: 'invisible' });
    expect(mockRequestPhoneOtpForSignIn.mock.calls[0][0].auth).toBe(auth);
    expect(mockRequestPhoneOtpForSignIn.mock.calls[0][0].recaptchaVerifier).toBe(
      mockRecaptchaVerifier.mock.results[0].value
    );
    expect(document.querySelectorAll('[id^="taskio-post-job-phone-recaptcha-"]')).toHaveLength(1);
  });

  it('clears a failed verifier and constructs a new one on retry', async () => {
    const first = { clear: jest.fn(), verify: jest.fn(), render: jest.fn() };
    const second = { clear: jest.fn(), verify: jest.fn(), render: jest.fn() };
    mockRecaptchaVerifier
      .mockImplementationOnce(() => first)
      .mockImplementationOnce(() => second);
    mockRequestPhoneOtpForSignIn
      .mockRejectedValueOnce(new Error('Could not send a verification code.'))
      .mockResolvedValueOnce({ verificationId: 'abc' });

    renderForm();
    goToContactStep();
    fireEvent.change(screen.getByLabelText(/phone number/i), { target: { value: '0412 345 678' } });
    fireEvent.click(screen.getByRole('checkbox'));
    fireEvent.click(screen.getByRole('button', { name: /get quotes/i }));

    await waitFor(() => expect(first.clear).toHaveBeenCalledTimes(1));
    expect(mockRecaptchaVerifier).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole('button', { name: /get quotes/i }));
    await waitFor(() => expect(mockRequestPhoneOtpForSignIn).toHaveBeenCalledTimes(2));
    expect(mockRecaptchaVerifier).toHaveBeenCalledTimes(2);
    expect(mockRequestPhoneOtpForSignIn.mock.calls[1][0].recaptchaVerifier).toBe(second);
  });

  it('does not send a phone OTP when the recaptcha container is missing', async () => {
    renderForm();
    goToContactStep();
    document.querySelector('[id^="taskio-post-job-phone-recaptcha-"]')?.remove();

    fireEvent.change(screen.getByLabelText(/phone number/i), { target: { value: '0412 345 678' } });
    fireEvent.click(screen.getByRole('checkbox'));
    fireEvent.click(screen.getByRole('button', { name: /get quotes/i }));

    await waitFor(() => expect(mockRecaptchaVerifier).not.toHaveBeenCalled());
    expect(mockRequestPhoneOtpForSignIn).not.toHaveBeenCalled();
  });
});
