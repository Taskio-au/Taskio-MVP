import React from 'react';
import { render, screen } from '@testing-library/react';

jest.mock('react-router-dom', () => ({
  __esModule: true,
  MemoryRouter: ({ children }) => <div>{children}</div>,
  Link: ({ children, to, ...props }) => <a href={to} {...props}>{children}</a>,
  useNavigate: () => jest.fn(),
}), { virtual: true });

const { MemoryRouter } = jest.requireMock('react-router-dom');

const mockRefresh = jest.fn();
const mockPilot = {
  value: {
    loadState: 'ok',
    status: { homeownerPosting: 'CLOSED', canPost: false, waitlistAvailable: true },
    refresh: (...args) => mockRefresh(...args),
  },
};

jest.mock('../hooks/usePublicPilotStatus', () => ({
  __esModule: true,
  default: () => mockPilot.value,
}));

jest.mock('../api/createApiClient', () => ({
  createApiClient: () => ({
    post: jest.fn(),
    get: jest.fn(),
  }),
}));

jest.mock('../firebase', () => ({
  auth: {
    currentUser: { uid: 'homeowner-1', getIdToken: jest.fn().mockResolvedValue('token') },
    onAuthStateChanged: jest.fn(() => () => {}),
  },
  storage: {},
}));

jest.mock('firebase/storage', () => ({
  getDownloadURL: jest.fn(),
  ref: jest.fn(),
  uploadBytesResumable: jest.fn(),
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
  isPublicAcquisitionEnabled: () => true,
}));

const JobPostingForm = require('./JobPostingForm').default;

describe('JobPostingForm pilot status', () => {
  beforeEach(() => {
    mockRefresh.mockReset();
    mockPilot.value = {
      loadState: 'ok',
      status: { homeownerPosting: 'CLOSED', canPost: false, waitlistAvailable: true },
      refresh: (...args) => mockRefresh(...args),
    };
  });

  it('shows the closed waitlist experience on the direct post route', () => {
    render(
      <MemoryRouter>
        <JobPostingForm />
      </MemoryRouter>
    );
    expect(screen.getByRole('heading', { name: /homeowner posting is not open yet/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /join waitlist/i })).toBeInTheDocument();
    expect(screen.queryByLabelText(/description/i)).not.toBeInTheDocument();
  });

  it('shows pause copy when operational state is PAUSED', () => {
    mockPilot.value = {
      loadState: 'ok',
      status: { homeownerPosting: 'PAUSED', canPost: false, waitlistAvailable: true },
      refresh: mockRefresh,
    };
    render(
      <MemoryRouter>
        <JobPostingForm />
      </MemoryRouter>
    );
    expect(screen.getByRole('heading', { name: /new job posts are paused/i })).toBeInTheDocument();
    expect(screen.getByText(/temporarily pausing new job posts/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /join waitlist/i })).toBeInTheDocument();
  });

  it('fails closed when public status cannot be loaded', () => {
    mockPilot.value = {
      loadState: 'error',
      status: { homeownerPosting: 'CLOSED', canPost: false, waitlistAvailable: true },
      refresh: mockRefresh,
    };
    render(
      <MemoryRouter>
        <JobPostingForm />
      </MemoryRouter>
    );
    expect(screen.getByRole('heading', { name: /posting temporarily unavailable/i })).toBeInTheDocument();
    expect(screen.queryByLabelText(/description/i)).not.toBeInTheDocument();
  });

  it('shows the posting form when operational state is OPEN', () => {
    mockPilot.value = {
      loadState: 'ok',
      status: { homeownerPosting: 'OPEN', canPost: true, waitlistAvailable: false },
      refresh: mockRefresh,
    };
    render(
      <MemoryRouter>
        <JobPostingForm />
      </MemoryRouter>
    );
    expect(screen.getByRole('heading', { name: /post a task/i })).toBeInTheDocument();
    expect(screen.getByLabelText(/description/i)).toBeInTheDocument();
  });
});
