import { getDoc } from 'firebase/firestore';
import { JOB_STATUSES, getPrimaryAction, isChatEnabled } from './constants/jobStatuses';
import { upsertUserProfileFromAuth } from './utils/upsertUserProfileFromAuth';

jest.mock('firebase/firestore', () => ({
  doc: jest.fn(() => ({})),
  getDoc: jest.fn(),
  setDoc: jest.fn(),
  updateDoc: jest.fn(),
  serverTimestamp: jest.fn(() => '__ts__'),
}));

jest.mock('./firebase', () => ({
  db: {},
}));

const { setDoc, updateDoc } = jest.requireMock('firebase/firestore');

describe('smoke: auth guard flow', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('does not create a profile when none exists and reports not enrolled', async () => {
    const user = {
      uid: 'uid-1',
      email: 'owner@example.com',
      displayName: 'Owner One',
      photoURL: '',
    };
    getDoc.mockResolvedValue({ exists: () => false, data: () => ({}) });
    const result = await upsertUserProfileFromAuth(user, 'password');
    expect(result).toEqual({ enrolled: false, code: 'account_not_enrolled' });
    expect(setDoc).not.toHaveBeenCalled();
    expect(updateDoc).not.toHaveBeenCalled();
  });

  it('does not overwrite existing non-empty role/status fields on update path', async () => {
    const user = {
      uid: 'uid-2',
      email: 'tradie@example.com',
      displayName: 'Tradie Two',
      photoURL: '',
    };
    getDoc.mockResolvedValue({
      exists: () => true,
      data: () => ({ role: 'tradie', status: 'active', email: 'already@set.com', name: 'Tradie Two' }),
    });
    await upsertUserProfileFromAuth(user, 'password');
    expect(updateDoc).toHaveBeenCalledTimes(1);
    expect(setDoc).not.toHaveBeenCalled();
    const [, patch] = updateDoc.mock.calls[0];
    expect(patch.role).toBeUndefined();
    expect(patch.status).toBeUndefined();
    expect(patch.email).toBeUndefined();
    expect(patch).toHaveProperty('updatedAt');
  });

  it('does not write a structurally invalid profile and reports account_state_invalid', async () => {
    const user = {
      uid: 'uid-3',
      displayName: 'Stub User',
    };
    getDoc.mockResolvedValue({
      exists: () => true,
      data: () => ({ phone: '+61400000001' }),
    });
    const result = await upsertUserProfileFromAuth(user, 'password');
    expect(result).toEqual({ enrolled: false, code: 'account_state_invalid' });
    expect(setDoc).not.toHaveBeenCalled();
    expect(updateDoc).not.toHaveBeenCalled();
  });
});

describe('routes: retired homeowner email signup', () => {
  // Homeowner accounts are created only by the phone-verified /post-job flow.
  it('no longer ships the /auth-and-post page module', () => {
    expect(() => require('./components/HomeownerAuthPage')).toThrow(/Cannot find module/);
  });
});

describe('smoke: quote and escrow flow', () => {
  it('shows expected quote acceptance CTA labels', () => {
    expect(getPrimaryAction(JOB_STATUSES.QUOTED, 'job-1')?.label).toBe('View quotes');
    expect(getPrimaryAction(JOB_STATUSES.ASSIGNED, 'job-1')?.label).toBe('Review quote');
  });

  it('gates chat until escrow is funded', () => {
    expect(getPrimaryAction(JOB_STATUSES.AWAITING_FUNDING, 'job-1')?.label).toBe('Complete payment');
    expect(isChatEnabled(JOB_STATUSES.AWAITING_FUNDING)).toBe(false);
    expect(isChatEnabled(JOB_STATUSES.FUNDED)).toBe(true);
  });
});

describe('smoke: admin dispute action visibility mapping', () => {
  it('exposes disputed status action for admin follow-up', () => {
    const action = getPrimaryAction(JOB_STATUSES.DISPUTED, 'job-42');
    expect(action?.label).toBe('View dispute');
    expect(action?.route).toBe('/job/job-42');
  });
});
