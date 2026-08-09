import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';

const mockNavigate = jest.fn();
const mockGetDoc = jest.fn();
const mockUpdateDoc = jest.fn(() => Promise.resolve());
let mockThreads = [
  {
    id: 'job-1',
    jobId: 'job-1',
    jobTitle: 'TV mounting',
    jobStatus: 'FUNDED',
    otherParticipantName: 'Taylor Expert',
    lastMessageText: 'I can come tomorrow morning.',
    lastMessageAt: { seconds: 1712000000 },
    unreadCount: 2,
  },
];

jest.mock('react-router-dom', () => ({
  __esModule: true,
  useNavigate: () => mockNavigate,
}), { virtual: true });

jest.mock('react-firebase-hooks/auth', () => ({
  useAuthState: () => ([{ uid: 'user-1', displayName: 'Client User', email: 'client@example.com' }, false]),
}));

jest.mock('../firebase', () => ({
  auth: {},
  db: {},
}));

jest.mock('../hooks/useMessagingSummary', () => ({
  useChatThreads: () => ({
    unreadCount: mockThreads.reduce((sum, thread) => sum + Number(thread.unreadCount || 0), 0),
    threads: mockThreads,
    loadError: null,
    retry: jest.fn(),
  }),
}));

jest.mock('./AppHeader', () => () => <div>AppHeader</div>);

const mockMarkMessageNotificationsRead = jest.fn(() => Promise.resolve({ marked: 0 }));

jest.mock('../utils/markMessageNotificationsReadForJob', () => ({
  markMessageNotificationsReadForJob: (...args) => mockMarkMessageNotificationsRead(...args),
}));

jest.mock('firebase/firestore', () => ({
  doc: jest.fn((...args) => ({ path: args.join('/') })),
  getDoc: (...args) => mockGetDoc(...args),
  serverTimestamp: jest.fn(() => 'SERVER_TIMESTAMP'),
  updateDoc: (...args) => mockUpdateDoc(...args),
}));

const MessagesPage = require('./MessagesPage').default;

describe('MessagesPage', () => {
  beforeEach(() => {
    mockNavigate.mockReset();
    mockUpdateDoc.mockClear();
    mockMarkMessageNotificationsRead.mockClear();
    mockThreads = [
      {
        id: 'job-1',
        jobId: 'job-1',
        jobTitle: 'TV mounting',
        jobStatus: 'FUNDED',
        otherParticipantName: 'Taylor Expert',
        lastMessageText: 'I can come tomorrow morning.',
        lastMessageAt: { seconds: 1712000000 },
        unreadCount: 2,
      },
    ];
    mockGetDoc.mockResolvedValue({
      exists: () => true,
      data: () => ({ role: 'homeowner', displayName: 'Client User', email: 'client@example.com' }),
    });
  });

  it('renders inbox rows and deep-links to job chat', async () => {
    render(<MessagesPage />);

    expect(await screen.findByText(/TV mounting/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Taylor Expert/i }));

    await waitFor(() => {
      expect(mockUpdateDoc).toHaveBeenCalled();
    });
    await waitFor(() => {
      expect(mockMarkMessageNotificationsRead).toHaveBeenCalledWith({}, 'user-1', 'job-1');
    });
    expect(mockNavigate).toHaveBeenCalledWith('/job/job-1#chat');
  });

  it('falls back to the thread document id when jobId is missing', async () => {
    mockThreads = [
      {
        id: 'job-99',
        jobTitle: 'Shelves install',
        jobStatus: 'FUNDED',
        otherParticipantName: 'Taylor Expert',
        lastMessageText: 'Can do Friday.',
        lastMessageAt: { seconds: 1712000000 },
        unreadCount: 1,
      },
    ];

    render(<MessagesPage />);

    expect(await screen.findByText(/Shelves install/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Taylor Expert/i }));

    await waitFor(() => {
      expect(mockUpdateDoc).toHaveBeenCalled();
    });
    await waitFor(() => {
      expect(mockMarkMessageNotificationsRead).toHaveBeenCalledWith({}, 'user-1', 'job-99');
    });
    expect(mockNavigate).toHaveBeenCalledWith('/job/job-99#chat');
  });
});

