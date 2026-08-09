import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useAuthState } from 'react-firebase-hooks/auth';

const mockNavigate = jest.fn();
const mockGet = jest.fn();
const mockPut = jest.fn();

jest.mock('react-router-dom', () => ({
  __esModule: true,
  useNavigate: () => mockNavigate,
  useLocation: () => ({ state: {}, hash: '', pathname: '/profile' }),
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
    put: mockPut,
    post: jest.fn(),
  }),
}));

jest.mock('./AppHeader', () => () => <div>AppHeader</div>);
jest.mock('./profile/PrivateDetailsVerificationCard', () => () => <div>Phone verification panel</div>);
jest.mock('./profile/VerificationGateBanner', () => () => null);
jest.mock('./profile/TradieIdentitySection', () => () => null);
jest.mock('./profile/TradieExpertiseSection', () => () => null);
jest.mock('./profile/ProfileModals', () => ({
  ChangeRequestModal: () => null,
  DeletionRequestModal: () => null,
  PrivateDetailsConfirmModal: () => null,
}));
jest.mock('./profile/TradiePrivateDetailsPanel', () => () => null);
jest.mock('../hooks/useDebounce', () => (value) => value);

jest.mock('firebase/firestore', () => ({
  doc: jest.fn(),
  getDoc: jest.fn(async () => ({ exists: () => false, data: () => ({}) })),
}));

jest.mock('firebase/storage', () => ({
  getDownloadURL: jest.fn(),
  ref: jest.fn(),
  uploadBytesResumable: jest.fn(),
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

const { auth } = require('../firebase');
const ProfilePage = require('./ProfilePage').default;

describe('ProfilePage homeowner layout', () => {
  beforeEach(() => {
    mockNavigate.mockReset();
    mockGet.mockReset();
    mockPut.mockReset();
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
          phoneVerified: true,
          emailVerified: false,
          hasPaymentHistory: false,
          nameChangeBlockedMessage: '',
          createdAt: { seconds: 1711929600 },
        },
      },
    });
  });

  it('uses a view-first profile and resets inline edits on cancel', async () => {
    render(<ProfilePage />);

    await waitFor(() => expect(mockGet).toHaveBeenCalledWith('/api/me', expect.any(Object)));

    expect(screen.getByText(/payment readiness/i)).toBeInTheDocument();
    expect(screen.queryByLabelText(/first name/i)).not.toBeInTheDocument();
    expect(screen.getByText('Jane Citizen')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /edit profile/i }));

    const firstNameInput = screen.getByLabelText(/first name/i);
    fireEvent.change(firstNameInput, { target: { value: 'Janet' } });
    expect(firstNameInput.value).toBe('Janet');

    fireEvent.click(screen.getAllByRole('button', { name: /^cancel$/i })[0]);

    expect(screen.queryByLabelText(/first name/i)).not.toBeInTheDocument();
    expect(screen.getByText('Jane Citizen')).toBeInTheDocument();
    expect(screen.queryByText(/account & security/i)).not.toBeInTheDocument();
  });

  it('requires both first and last name before saving', async () => {
    render(<ProfilePage />);

    await waitFor(() => expect(mockGet).toHaveBeenCalled());

    fireEvent.click(screen.getByRole('button', { name: /edit profile/i }));

    expect(screen.getByText(/last name/i)).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText(/last name/i), { target: { value: '' } });
    fireEvent.click(screen.getByRole('button', { name: /save profile/i }));

    expect(mockPut).not.toHaveBeenCalled();
    expect(screen.getByText(/enter your last name/i)).toBeInTheDocument();
  });

  it('shows a confirmation modal before saving when payment history exists', async () => {
    mockGet.mockResolvedValueOnce({
      data: {
        profile: {
          role: 'homeowner',
          displayName: 'Jane Citizen',
          email: '',
          firstName: 'Jane',
          lastName: 'Citizen',
          phoneVerified: true,
          emailVerified: false,
          hasPaymentHistory: true,
          nameChangeBlockedMessage: '',
          createdAt: { seconds: 1711929600 },
        },
      },
    });
    mockPut.mockResolvedValue({
      data: {
        profile: {
          role: 'homeowner',
          displayName: 'Janet Citizen',
          email: '',
          firstName: 'Janet',
          lastName: 'Citizen',
          phoneVerified: true,
          emailVerified: false,
          hasPaymentHistory: true,
          nameChangeBlockedMessage: '',
          createdAt: { seconds: 1711929600 },
        },
      },
    });

    render(<ProfilePage />);

    await waitFor(() => expect(mockGet).toHaveBeenCalled());

    fireEvent.click(screen.getByRole('button', { name: /edit profile/i }));
    fireEvent.change(screen.getByLabelText(/first name/i), { target: { value: 'Janet' } });
    fireEvent.click(screen.getByRole('button', { name: /save profile/i }));

    expect(screen.getByText(/confirm name change/i)).toBeInTheDocument();
    expect(mockPut).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: /confirm change/i }));

    await waitFor(() => expect(mockPut).toHaveBeenCalledWith(
      '/api/me/profile',
      expect.objectContaining({
        firstName: 'Janet',
        lastName: 'Citizen',
        displayName: 'Janet Citizen',
      }),
      expect.any(Object)
    ));
  });

  it('keeps profile focused on identity and payment readiness', async () => {
    render(<ProfilePage />);

    await waitFor(() => expect(mockGet).toHaveBeenCalled());

    expect(screen.getByText(/payment readiness/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /verify email to unlock payments/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /continue with google/i })).toBeInTheDocument();
    expect(screen.getByText(/secure payments powered by stripe/i)).toBeInTheDocument();
    expect(screen.getByText(/your name is used for payments and receipts/i)).toBeInTheDocument();
    expect(screen.queryByText(/display name is locked after verification/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/account & security/i)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /deactivate account/i })).not.toBeInTheDocument();
  });

  it('removes payment readiness from the admin profile surface', async () => {
    auth.currentUser.getIdTokenResult.mockResolvedValueOnce({ token: 'token', claims: { admin: true } });
    mockGet.mockResolvedValueOnce({
      data: {
        profile: {
          role: 'admin',
          displayName: 'Ava Admin',
          email: 'admin@example.com',
          firstName: 'Ava',
          lastName: 'Admin',
          createdAt: { seconds: 1711929600 },
        },
      },
    });

    render(<ProfilePage />);

    await waitFor(() => expect(mockGet).toHaveBeenCalled());

    expect(screen.getByText(/^Admin$/i)).toBeInTheDocument();
    expect(screen.getByText(/use the top-right menu to manage your password/i)).toBeInTheDocument();
    expect(screen.queryByText(/payment readiness/i)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /verify email to unlock payments/i })).not.toBeInTheDocument();
  });
});
