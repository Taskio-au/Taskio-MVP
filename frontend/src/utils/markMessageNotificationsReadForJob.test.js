import { collection, getDocs, limit, query, where, writeBatch } from 'firebase/firestore';
import { markMessageNotificationsReadForJob } from './markMessageNotificationsReadForJob';

jest.mock('firebase/firestore', () => ({
  collection: jest.fn((...args) => ({ type: 'collection', path: args })),
  getDocs: jest.fn(),
  limit: jest.fn((n) => ({ type: 'limit', n })),
  query: jest.fn((...args) => ({ type: 'query', args })),
  serverTimestamp: jest.fn(() => 'SERVER_TS'),
  where: jest.fn((f, op, v) => ({ type: 'where', f, op, v })),
  writeBatch: jest.fn(),
}));

describe('markMessageNotificationsReadForJob', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns marked: 0 when userId or jobId missing', async () => {
    await expect(markMessageNotificationsReadForJob({}, '', 'j1')).resolves.toEqual({ marked: 0 });
    await expect(markMessageNotificationsReadForJob({}, 'u1', '')).resolves.toEqual({ marked: 0 });
  });

  it('batch-updates only unread message_received docs for the job', async () => {
    const mockUpdate = jest.fn();
    const mockCommit = jest.fn(() => Promise.resolve());
    writeBatch.mockReturnValue({ update: mockUpdate, commit: mockCommit });

    const docA = {
      ref: { id: 'message_j1_m1' },
      data: () => ({ type: 'message_received', read: false, jobId: 'j1' }),
    };
    const docB = {
      ref: { id: 'quote_q1' },
      data: () => ({ type: 'quote_submitted', read: false, jobId: 'j1' }),
    };
    const docC = {
      ref: { id: 'message_j1_m2' },
      data: () => ({ type: 'message_received', read: true, jobId: 'j1' }),
    };

    getDocs.mockResolvedValue({
      forEach: (fn) => {
        [docA, docB, docC].forEach(fn);
      },
    });

    const result = await markMessageNotificationsReadForJob({ __db: true }, 'user-1', 'j1');

    expect(result.marked).toBe(1);
    expect(mockUpdate).toHaveBeenCalledTimes(1);
    expect(mockUpdate).toHaveBeenCalledWith(docA.ref, expect.objectContaining({ read: true }));
    expect(mockCommit).toHaveBeenCalled();
    expect(collection).toHaveBeenCalledWith({ __db: true }, 'users', 'user-1', 'notifications');
    expect(where).toHaveBeenCalledWith('jobId', '==', 'j1');
  });

  it('does not commit when nothing to mark', async () => {
    const mockCommit = jest.fn();
    writeBatch.mockReturnValue({ update: jest.fn(), commit: mockCommit });
    getDocs.mockResolvedValue({
      forEach: (fn) => {
        fn({
          ref: { id: 'x' },
          data: () => ({ type: 'escrow_funded', read: false, jobId: 'j1' }),
        });
      },
    });

    const result = await markMessageNotificationsReadForJob({}, 'u1', 'j1');
    expect(result.marked).toBe(0);
    expect(mockCommit).not.toHaveBeenCalled();
  });
});
