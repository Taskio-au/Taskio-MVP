import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';

const mockNavigate = jest.fn();
const mockGet = jest.fn();

jest.mock('react-router-dom', () => ({
  __esModule: true,
  useNavigate: () => mockNavigate,
  useLocation: () => ({ search: '' }),
}), { virtual: true });

jest.mock('../firebase', () => ({
  auth: {
    currentUser: {
      email: '',
      emailVerified: false,
      providerData: [{ providerId: 'phone' }],
      getIdToken: jest.fn(async () => 'token'),
      reload: jest.fn(async () => {}),
    },
  },
  googleProvider: {},
}));

jest.mock('../api/createApiClient', () => ({
  createApiClient: () => ({
    get: mockGet,
    post: jest.fn(),
  }),
}));

jest.mock('firebase/auth', () => ({
  EmailAuthProvider: {
    credential: jest.fn(),
  },
  linkWithCredential: jest.fn(),
  linkWithPopup: jest.fn(),
  sendEmailVerification: jest.fn(),
}));

jest.mock('../design/components/BrandLogo', () => () => <div>Taskio</div>);

const CompleteHomeownerAccountPage = require('./CompleteHomeownerAccountPage').default;

describe('CompleteHomeownerAccountPage', () => {
  beforeEach(() => {
    mockNavigate.mockReset();
    mockGet.mockReset();
    mockGet.mockResolvedValue({
      data: {
        profile: {
          firstName: 'Saeed',
          email: '',
          phoneVerified: true,
          emailVerified: false,
          accountCompleted: false,
        },
      },
    });
  });

  it('shows durable account methods and removes phone-only completion', async () => {
    render(<CompleteHomeownerAccountPage />);

    await waitFor(() => expect(mockGet).toHaveBeenCalled());

    expect(screen.getByText(/finish account setup/i)).toBeInTheDocument();
    expect(screen.getByText(/verify your email or continue with google/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /phone/i })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /google/i })).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: /email/i }).length).toBeGreaterThan(0);
  });
});
