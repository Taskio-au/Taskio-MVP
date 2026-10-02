import React from 'react';
import { render, screen } from '@testing-library/react';

jest.mock('react-router-dom', () => ({
  __esModule: true,
  Link: ({ children, to, ...props }) => <a href={to} {...props}>{children}</a>,
  Navigate: () => <div>Redirect</div>,
  useNavigate: () => jest.fn(),
}), { virtual: true });

const mockUser = {
  uid: 'expert-1',
  email: 'expert@example.com',
  displayName: 'Sam Expert',
  getIdTokenResult: async () => ({ claims: {}, token: 'token' }),
  getIdToken: async () => 'token',
};

jest.mock('react-firebase-hooks/auth', () => ({
  useAuthState: () => [mockUser, false],
}));

jest.mock('../firebase', () => ({
  auth: {},
  db: {},
}));

const mockGetMe = jest.fn();

jest.mock('../api/createApiClient', () => ({
  createApiClient: () => ({
    get: (...args) => mockGetMe(...args),
  }),
}));

jest.mock('firebase/firestore', () => ({
  doc: jest.fn(),
  getDoc: jest.fn(),
}));

jest.mock('./AppHeader', () => () => <div>Header</div>);
jest.mock('./expert/ExpertFeeProgramCard', () => () => <div>Fee program</div>);
jest.mock('./profile/TradieAccountDangerZone', () => () => <div>Danger zone</div>);
jest.mock('./profile/ProfileModals', () => ({ DeletionRequestModal: () => null }));
jest.mock('./profile/useAccountDangerActions', () => () => ({
  deactivateBusy: false,
  deleteOpen: false,
  setDeleteOpen: jest.fn(),
  deleteStep: 1,
  deletePassword: '',
  setDeletePassword: jest.fn(),
  deleteTyped: '',
  setDeleteTyped: jest.fn(),
  deleteReason: '',
  setDeleteReason: jest.fn(),
  deleteDevLink: '',
  deleteBusy: false,
  deactivateAccount: jest.fn(),
  cancelDeletion: jest.fn(),
  startDeletionFlow: jest.fn(),
  requestDeletion: jest.fn(),
}));

const TradieAccountSettingsPage = require('./TradieAccountSettingsPage').default;

describe('TradieAccountSettingsPage', () => {
  beforeEach(() => {
    mockGetMe.mockResolvedValue({
      data: {
        profile: { role: 'tradie', displayName: 'Sam Expert' },
        foundingExpertFeeProfile: null,
      },
    });
  });

  it('names the page Account & security and links profile work to My Profile', async () => {
    render(<TradieAccountSettingsPage />);

    expect(await screen.findByRole('heading', { name: 'Account & security' })).toBeInTheDocument();
    expect(screen.getByText(/for public profile details and verification, use/i)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'My Profile' })).toHaveAttribute('href', '/profile');
    expect(screen.queryByRole('heading', { name: /^account settings$/i })).not.toBeInTheDocument();
  });
});
