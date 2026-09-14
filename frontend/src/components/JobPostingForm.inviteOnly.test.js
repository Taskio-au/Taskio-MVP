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

jest.mock('../hooks/usePublicPilotStatus', () => ({
  __esModule: true,
  default: () => ({
    loadState: 'ok',
    status: { homeownerPosting: 'OPEN', canPost: true, waitlistAvailable: false },
    refresh: jest.fn(),
  }),
}));

jest.mock('../services/phoneVerification', () => ({
  normalizeAuMobileToE164: jest.fn(),
  createInvisibleRecaptcha: jest.fn(),
  ensureOfficialRecaptchaVerifier: jest.fn(),
  clearRecaptchaVerifier: jest.fn(),
  requestPhoneOtpForSignIn: jest.fn(),
  confirmPhoneOtpForSignIn: jest.fn(),
}));

jest.mock('../config/publicAcquisitionConfig', () => ({
  isPublicAcquisitionEnabled: () => false,
  isExpertPublicSignupEnabled: () => false,
}));

const JobPostingForm = require('./JobPostingForm').default;

test('OPEN guest posting does not require a homeowner invitation', () => {
  render(
    <MemoryRouter>
      <JobPostingForm />
    </MemoryRouter>
  );

  expect(screen.getByRole('heading', { name: /post a task/i })).toBeInTheDocument();
  expect(screen.getByLabelText(/description/i)).toBeInTheDocument();
  expect(screen.queryByRole('heading', { name: /log in to post a task/i })).not.toBeInTheDocument();
  expect(screen.queryByText(/guest phone signup is not open/i)).not.toBeInTheDocument();
});
