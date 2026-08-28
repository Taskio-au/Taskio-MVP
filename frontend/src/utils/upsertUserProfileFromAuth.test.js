import { getDoc, updateDoc } from 'firebase/firestore';
import { upsertUserProfileFromAuth } from './upsertUserProfileFromAuth';

jest.mock('firebase/firestore', () => ({
  doc: jest.fn(() => ({ path: 'users/uid-1' })),
  getDoc: jest.fn(),
  updateDoc: jest.fn(),
  setDoc: jest.fn(),
  serverTimestamp: jest.fn(() => '__ts__'),
}));

jest.mock('../firebase', () => ({
  db: {},
}));

describe('upsertUserProfileFromAuth', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns account_not_enrolled for a missing profile and does not write', async () => {
    getDoc.mockResolvedValue({ exists: () => false, data: () => ({}) });
    const result = await upsertUserProfileFromAuth({ uid: 'uid-1', displayName: 'Owner One' }, 'password');
    expect(result).toEqual({ enrolled: false, code: 'account_not_enrolled' });
    expect(updateDoc).not.toHaveBeenCalled();
  });

  it('returns account_state_invalid for a stub profile and does not write', async () => {
    getDoc.mockResolvedValue({ exists: () => true, data: () => ({ phone: '+61400000001' }) });
    const result = await upsertUserProfileFromAuth({ uid: 'uid-1' }, 'password');
    expect(result).toEqual({ enrolled: false, code: 'account_state_invalid' });
    expect(updateDoc).not.toHaveBeenCalled();
  });

  it('rethrows permission-denied instead of translating it to account_not_enrolled', async () => {
    const err = new Error('Missing or insufficient permissions.');
    err.code = 'permission-denied';
    getDoc.mockRejectedValue(err);
    await expect(upsertUserProfileFromAuth({ uid: 'uid-1' }, 'password')).rejects.toMatchObject({
      code: 'permission-denied',
    });
  });

  it('rethrows timeout errors instead of translating them to account_not_enrolled', async () => {
    const err = new Error('timeout');
    err.code = 'unavailable';
    getDoc.mockRejectedValue(err);
    await expect(upsertUserProfileFromAuth({ uid: 'uid-1' }, 'password')).rejects.toMatchObject({
      code: 'unavailable',
    });
  });
});
