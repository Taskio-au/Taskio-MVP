import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useAuthState } from 'react-firebase-hooks/auth';

const mockNavigate = jest.fn();
const mockGet = jest.fn();
const mockPost = jest.fn();
const mockLocation = { state: {}, pathname: '/settings' };

jest.mock('react-router-dom', () => ({
  __esModule: true,
  Navigate: ({ to }) => <div>Redirect:{to}</div>,
  useNavigate: () => mockNavigate,
  useLocation: () => mockLocation,
}), { virtual: true });

jest.mock('react-firebase-hooks/auth', () => ({
  useAuthState: jest.fn(),
}));

jest.mock('../firebase', () => ({
  auth: {
    currentUser: {
      uid: 'user-1',
      email: '',
      displayName: 'Jane Citizen',
      emailVerified: false,
      providerData: [{ providerId: 'phone' }],
      getIdToken: jest.fn(async () => 'token'),
      getIdTokenResult: jest.fn(async () => ({ token: 'token', claims: {} })),
      reload: jest.fn(async () => {}),
    },
  },
  db: {},
  storage: {},
  googleProvider: {},
}));

jest.mock('../api/createApiClient', () => ({
  createApiClient: () => ({
    get: mockGet,
    post: mockPost,
    put: jest.fn(),
  }),
}));

jest.mock('./AppHeader', () => () => <div>AppHeader</div>);
jest.mock('./profile/PrivateDetailsVerificationCard', () => () => <div>Phone verification panel</div>);
jest.mock('./profile/ProfileModals', () => ({
  DeletionRequestModal: () => null,
}));

jest.mock('firebase/firestore', () => ({
  doc: jest.fn(),
  getDoc: jest.fn(async () => ({ exists: () => false, data: () => ({}) })),
}));

jest.mock('firebase/auth', () => ({
  EmailAuthProvider: {
    credential: jest.fn(),
  },
  linkWithCredential: jest.fn(),
  linkWithPopup: jest.fn(),
  reauthenticateWithCredential: jest.fn(),
  sendEmailVerification: jest.fn(),
  verifyBeforeUpdateEmail: jest.fn(),
}));

const AccountSettings = require('./AccountSettings').default;

describe('AccountSettings', () => {
  beforeEach(() => {
    mockNavigate.mockReset();
    mockGet.mockReset();
    mockPost.mockReset();
    mockLocation.state = {};
    useAuthState.mockReturnValue([
      {
        uid: 'user-1',
        email: '',
        displayName: 'Jane Citizen',
        emailVerified: false,
        providerData: [{ providerId: 'phone' }],
        getIdToken: jest.fn(async () => 'token'),
        getIdTokenResult: jest.fn(async () => ({ token: 'token', claims: {} })),
      },
      false,
    ]);
    mockGet.mockResolvedValue({
      data: {
        profile: {
          role: 'homeowner',
          displayName: 'Jane Citizen',
          email: '',
          firstName: 'Jane',
          lastName: 'Citizen',
          phone: '+61 412 345 678',
          phoneVerified: true,
          emailVerified: false,
          createdAt: { seconds: 1711929600 },
        },
      },
    });
  });

  it('renders the new account settings structure', async () => {
    render(<AccountSettings />);

    await waitFor(() => expect(mockGet).toHaveBeenCalledWith('/api/me', expect.any(Object)));

    expect(screen.getByText(/account settings/i)).toBeInTheDocument();
    expect(screen.getByText(/account & security/i)).toBeInTheDocument();
    expect(screen.getByText(/danger zone/i)).toBeInTheDocument();
  });

  it('expands only one security row at a time', async () => {
    render(<AccountSettings />);

    await waitFor(() => expect(mockGet).toHaveBeenCalled());

    fireEvent.click(screen.getByRole('button', { name: /^add$/i }));
    expect(screen.getByLabelText(/^email$/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^close$/i })).toHaveAttribute('aria-expanded', 'true');
    expect(screen.queryByText(/phone verification panel/i)).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /^link$/i }));
    expect(screen.queryByLabelText(/^email$/i)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /continue with google/i })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /^edit$/i }));
    expect(screen.getByText(/phone verification panel/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /continue with google/i })).not.toBeInTheDocument();
  });

  it('shows manage for already linked google accounts', async () => {
    useAuthState.mockReturnValue([
      {
        uid: 'user-1',
        email: '',
        displayName: 'Jane Citizen',
        emailVerified: false,
        providerData: [{ providerId: 'phone' }, { providerId: 'google.com' }],
        getIdToken: jest.fn(async () => 'token'),
        getIdTokenResult: jest.fn(async () => ({ token: 'token', claims: {} })),
      },
      false,
    ]);

    render(<AccountSettings />);

    await waitFor(() => expect(mockGet).toHaveBeenCalled());

    expect(screen.getByRole('button', { name: /^manage$/i })).toBeInTheDocument();
  });
});
