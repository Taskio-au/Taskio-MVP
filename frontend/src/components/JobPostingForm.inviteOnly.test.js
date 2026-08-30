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
  auth: {
    currentUser: null,
    onAuthStateChanged: jest.fn(() => () => {}),
  },
  storage: {},
}));

jest.mock('firebase/storage', () => ({
  getDownloadURL: jest.fn(),
  ref: jest.fn(),
  uploadBytesResumable: jest.fn(),
}));

jest.mock('../api/createApiClient', () => ({
  createApiClient: () => ({ post: jest.fn() }),
}));

jest.mock('../services/phoneVerification', () => ({
  normalizeAuMobileToE164: jest.fn(),
  createInvisibleRecaptcha: jest.fn(),
  ensureOfficialRecaptchaVerifier: jest.fn(),
  clearRecaptchaVerifier: jest.fn(),
  requestPhoneOtpForSignIn: jest.fn(),
  confirmPhoneOtpForSignIn: jest.fn(),
}));

const JobPostingForm = require('./JobPostingForm').default;

test('invite-only private launch blocks guest job posting without OTP', () => {
  render(
    <MemoryRouter>
      <JobPostingForm />
    </MemoryRouter>
  );

  expect(screen.getByRole('heading', { name: /log in to post a task/i })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: /log in/i })).toBeInTheDocument();
  expect(screen.queryByLabelText(/description/i)).not.toBeInTheDocument();
});
