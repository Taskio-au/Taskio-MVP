import { signOut } from 'firebase/auth';
import { finalizeAuthenticatedSession, resolvePostAuthDestination } from './postAuth';
import { upsertUserProfileFromAuth } from '../../utils/upsertUserProfileFromAuth';

const mockGet = jest.fn();
const mockSignOut = jest.fn();

jest.mock('../../api/createApiClient', () => ({
  createApiClient: () => ({
    get: (...args) => mockGet(...args),
  }),
}));

jest.mock('../../firebase', () => ({
  auth: { currentUser: { uid: 'uid-1' } },
}));

jest.mock('firebase/auth', () => ({
  signOut: jest.fn((...args) => mockSignOut(...args)),
}));

jest.mock('../../utils/upsertUserProfileFromAuth', () => ({
  ENROLMENT_ERROR_CODES: {
    NOT_ENROLLED: 'account_not_enrolled',
    STATE_INVALID: 'account_state_invalid',
  },
  upsertUserProfileFromAuth: jest.fn(),
}));

describe('postAuth enrolment handling', () => {
  const user = {
    uid: 'uid-1',
    getIdTokenResult: jest.fn().mockResolvedValue({ claims: {} }),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockSignOut.mockResolvedValue(undefined);
    upsertUserProfileFromAuth.mockResolvedValue({ enrolled: true, patch: {} });
  });

  it('signs out and throws when the profile is not enrolled', async () => {
    upsertUserProfileFromAuth.mockResolvedValue({ enrolled: false, code: 'account_not_enrolled' });

    await expect(finalizeAuthenticatedSession(user, { providerName: 'password' })).rejects.toMatchObject({
      code: 'account_not_enrolled',
    });
    expect(signOut).toHaveBeenCalled();
  });

  it('does not sign out on a transient backend failure', async () => {
    const networkError = new Error('Network Error');
    networkError.code = 'ERR_NETWORK';
    mockGet.mockRejectedValue(networkError);

    await expect(finalizeAuthenticatedSession(user, { providerName: 'password' })).rejects.toMatchObject({
      code: 'ERR_NETWORK',
    });
    expect(signOut).not.toHaveBeenCalled();
  });

  it('rethrows enrolment codes from /api/me and signs out', async () => {
    const err = new Error('This account is not enrolled.');
    err.response = { data: { code: 'account_not_enrolled' } };
    mockGet.mockRejectedValue(err);

    await expect(resolvePostAuthDestination(user)).rejects.toMatchObject({
      code: 'account_not_enrolled',
    });
  });
});
