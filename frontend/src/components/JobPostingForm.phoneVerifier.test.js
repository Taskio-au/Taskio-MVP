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

jest.mock('../config/publicAcquisitionConfig', () => ({
  isPublicAcquisitionEnabled: () => true,
}));

jest.mock('../hooks/usePublicPilotStatus', () => ({
  __esModule: true,
  default: () => ({
    loadState: 'ok',
    status: { homeownerPosting: 'OPEN', canPost: true, waitlistAvailable: false },
    refresh: jest.fn().mockResolvedValue({
      homeownerPosting: 'OPEN',
      canPost: true,
      waitlistAvailable: false,
    }),
  }),
}));

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

  it('uploads same-name photos to unique Storage objects and keeps the original filename in metadata', async () => {
    auth.settings.appVerificationDisabledForTesting = true;
    global.URL.createObjectURL = jest.fn(() => 'blob:preview');
    global.URL.revokeObjectURL = jest.fn();
    const { ref, uploadBytesResumable, getDownloadURL } = require('firebase/storage');
    const recordedPaths = [];
    ref.mockImplementation((_storage, path) => {
      recordedPaths.push(path);
      return { path };
    });
    uploadBytesResumable.mockImplementation(() => ({
      on: (_event, _progress, _reject, resolve) => resolve(),
    }));
    getDownloadURL.mockResolvedValue('https://example.test/photo');
    mockApiPost.mockImplementation(async (url) => {
      if (url === '/api/jobs') return { data: { jobId: 'job-posted-1' } };
      return { data: {} };
    });
    mockRequestPhoneOtpForSignIn.mockResolvedValue({ verificationId: 'abc' });
    mockConfirmPhoneOtpForSignIn.mockResolvedValue({
      user: { getIdToken: async () => 'id-token' },
    });

    renderForm();
    fireEvent.click(screen.getByRole('button', { name: /hanging/i }));
    fireEvent.click(screen.getByLabelText(/picture frames/i));
    fireEvent.change(screen.getByLabelText(/description/i), {
      target: { value: 'Need two frames hung straight in the hallway.' },
    });

    const fileInput = document.querySelector('input[type="file"]');
    const first = new File(['one'], 'wall.jpg', { type: 'image/jpeg' });
    const second = new File(['two'], 'wall.jpg', { type: 'image/jpeg' });
    fireEvent.change(fileInput, { target: { files: [first, second] } });
    expect(screen.getAllByAltText(/uploaded preview/i)).toHaveLength(2);

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

    fireEvent.change(screen.getByLabelText(/phone number/i), { target: { value: '0412 345 678' } });
    fireEvent.click(screen.getByRole('checkbox'));
    fireEvent.click(screen.getByRole('button', { name: /get quotes/i }));
    await waitFor(() => expect(mockRequestPhoneOtpForSignIn).toHaveBeenCalled());

    fireEvent.change(screen.getByLabelText(/6-digit code/i), { target: { value: '123456' } });
    fireEvent.click(screen.getByRole('button', { name: /get quotes/i }));

    await waitFor(() => expect(uploadBytesResumable).toHaveBeenCalledTimes(2));
    expect(recordedPaths).toHaveLength(2);
    expect(recordedPaths[0]).not.toBe(recordedPaths[1]);
    expect(recordedPaths.every((path) => path.startsWith('job-posting-attachments/job-posted-1/'))).toBe(true);
    expect(recordedPaths.every((path) => !path.includes('wall.jpg'))).toBe(true);

    const photoPost = mockApiPost.mock.calls.find(([url]) => url === '/api/jobs/job-posted-1/photos');
    expect(photoPost).toBeTruthy();
    expect(photoPost[1].photos.map((photo) => photo.fileName)).toEqual(['wall.jpg', 'wall.jpg']);
    expect(photoPost[1].photos[0].storagePath).toBe(recordedPaths[0]);
    expect(photoPost[1].photos[1].storagePath).toBe(recordedPaths[1]);
  });
});
