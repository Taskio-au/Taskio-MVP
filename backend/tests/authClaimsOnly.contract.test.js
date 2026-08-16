'use strict';

jest.mock('../src/firebaseAdmin', () => ({
  admin: {},
  db: {
    collection: jest.fn(() => {
      throw new Error('Profile documents must not be consulted for admin authority.');
    }),
  },
}));

const { requireAdmin, requireSuperAdmin } = require('../src/middleware/auth');

function invoke(middleware, user) {
  const req = { user };
  const res = {
    statusCode: 200,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    send(body) {
      this.body = body;
      return this;
    },
  };
  const next = jest.fn();
  return Promise.resolve(middleware(req, res, next)).then(() => ({ res, next }));
}

describe('claims-only privileged authorization', () => {
  it('allows and denies admin access from the custom claim only', async () => {
    const allowed = await invoke(requireAdmin, { uid: 'claims-admin', admin: true });
    expect(allowed.next).toHaveBeenCalledTimes(1);

    const denied = await invoke(requireAdmin, { uid: 'profile-admin', role: 'admin' });
    expect(denied.next).not.toHaveBeenCalled();
    expect(denied.res.statusCode).toBe(403);
  });

  it('allows and denies super-admin access from the custom claim only', async () => {
    const allowed = await invoke(requireSuperAdmin, { uid: 'claims-super', super_admin: true });
    expect(allowed.next).toHaveBeenCalledTimes(1);

    const denied = await invoke(requireSuperAdmin, { uid: 'profile-super', role: 'super_admin' });
    expect(denied.next).not.toHaveBeenCalled();
    expect(denied.res.statusCode).toBe(403);
  });
});
