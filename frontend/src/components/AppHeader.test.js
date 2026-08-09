import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';

const mockNavigate = jest.fn();
const mockLocation = { pathname: '/dashboard' };

jest.mock('react-router-dom', () => ({
  __esModule: true,
  Link: ({ children }) => <div>{children}</div>,
  useNavigate: () => mockNavigate,
  useLocation: () => mockLocation,
}), { virtual: true });

jest.mock('react-firebase-hooks/auth', () => ({
  useAuthState: () => ([{ uid: 'user-1' }]),
}));

jest.mock('../firebase', () => ({
  auth: {},
  db: {},
}));

jest.mock('firebase/auth', () => ({
  signOut: jest.fn(),
}));

jest.mock('firebase/firestore', () => ({
  collection: jest.fn(),
  limit: jest.fn(),
  onSnapshot: jest.fn(),
  query: jest.fn(),
  where: jest.fn(),
}));

jest.mock('../design/components/BrandLogo', () => () => <div>Taskio</div>);
jest.mock('../hooks/useMessagingSummary', () => ({
  useChatThreads: () => ({ unreadCount: 3 }),
  useNotificationUnreadCount: () => 2,
}));

const AppHeader = require('./AppHeader').default;

describe('AppHeader', () => {
  beforeEach(() => {
    mockNavigate.mockReset();
  });

  it('shows account settings in the homeowner menu', () => {
    render(<AppHeader userRole="homeowner" userName="Jane Citizen" userEmail="jane@example.com" />);

    expect(screen.getByText(/messages/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /notifications \(2 unread\)/i })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /account menu/i }));

    expect(screen.getByText(/account settings/i)).toBeInTheDocument();
  });

  it('routes experts to tradie account settings from the menu', () => {
    render(<AppHeader userRole="tradie" userName="Sam Tradie" userEmail="sam@example.com" />);

    fireEvent.click(screen.getByRole('button', { name: /account menu/i }));

    const link = screen.getByRole('link', { name: /account settings/i });
    expect(link).toHaveAttribute('href', '/tradie/account-settings');
  });

  it('shows password management in the admin menu', () => {
    render(<AppHeader userRole="admin" userName="Ava Admin" userEmail="admin@example.com" />);

    fireEvent.click(screen.getByRole('button', { name: /account menu/i }));

    expect(screen.getByText(/^password$/i)).toBeInTheDocument();
    expect(screen.queryByText(/account settings/i)).not.toBeInTheDocument();
  });
});
