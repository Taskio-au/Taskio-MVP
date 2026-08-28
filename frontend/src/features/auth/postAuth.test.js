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
    user.getIdTokenResult.mockResolvedValue({ claims: {} });
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

  it('does not accept a tradie destination from custom claims alone', async () => {
    user.getIdTokenResult.mockResolvedValue({ claims: { role: 'tradie' } });
    const err = new Error('This account is not enrolled.');
    err.response = { data: { code: 'account_not_enrolled' } };
    mockGet.mockRejectedValue(err);

    await expect(resolvePostAuthDestination(user)).rejects.toMatchObject({
      code: 'account_not_enrolled',
    });
    expect(mockGet).toHaveBeenCalledWith('/api/me');
  });

  it('routes a valid tradie from the server profile even when claims say tradie', async () => {
    user.getIdTokenResult.mockResolvedValue({ claims: { role: 'tradie' } });
    mockGet.mockResolvedValue({ data: { profile: { role: 'tradie', status: 'active' } } });

    await expect(resolvePostAuthDestination(user)).resolves.toBe('/tradie/dashboard');
    expect(mockGet).toHaveBeenCalledWith('/api/me');
  });

  it('routes a valid homeowner from the server profile even when claims say homeowner', async () => {
    user.getIdTokenResult.mockResolvedValue({ claims: { role: 'homeowner' } });
    mockGet.mockResolvedValue({ data: { profile: { role: 'homeowner', status: 'active' } } });

    await expect(resolvePostAuthDestination(user)).resolves.toBe('/dashboard');
    expect(mockGet).toHaveBeenCalledWith('/api/me');
  });

  it('rethrows a malformed-profile enrolment code from /api/me', async () => {
    const err = new Error('This account is in an invalid state and needs support.');
    err.response = { data: { code: 'account_state_invalid' } };
    mockGet.mockRejectedValue(err);

    await expect(resolvePostAuthDestination(user)).rejects.toMatchObject({
      code: 'account_state_invalid',
    });
    await expect(finalizeAuthenticatedSession(user)).rejects.toMatchObject({
      code: 'account_state_invalid',
    });
    expect(signOut).toHaveBeenCalled();
  });

  it('keeps admin destinations on the admin claim without calling /api/me', async () => {
    user.getIdTokenResult.mockResolvedValue({ claims: { admin: true } });

    await expect(resolvePostAuthDestination(user)).resolves.toBe('/admin/dashboard');
    expect(mockGet).not.toHaveBeenCalled();
  });

  it('does not sign out on timeout, generic permission, or server failures', async () => {
    const timeoutError = new Error('timeout');
    timeoutError.code = 'ECONNABORTED';
    mockGet.mockRejectedValueOnce(timeoutError);
    await expect(finalizeAuthenticatedSession(user)).rejects.toMatchObject({ code: 'ECONNABORTED' });
    expect(signOut).not.toHaveBeenCalled();

    const permissionError = new Error('permission-denied');
    permissionError.code = 'permission-denied';
    mockGet.mockRejectedValueOnce(permissionError);
    await expect(finalizeAuthenticatedSession(user)).rejects.toMatchObject({ code: 'permission-denied' });
    expect(signOut).not.toHaveBeenCalled();

    const serverError = new Error('Internal Server Error');
    serverError.response = { status: 500, data: { message: 'Failed to load account.' } };
    mockGet.mockRejectedValueOnce(serverError);
    await expect(finalizeAuthenticatedSession(user)).rejects.toBe(serverError);
    expect(signOut).not.toHaveBeenCalled();
  });
});
