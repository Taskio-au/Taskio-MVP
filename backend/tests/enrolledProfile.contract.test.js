'use strict';

jest.mock('../src/firebaseAdmin', () => ({
  admin: {},
  db: { collection: jest.fn() },
}));

const { classifyUserProfile, hasQuoteAccess } = require('../src/utils/enrolledProfile');

function snap(data) {
  if (data === null) return { exists: false, data: () => undefined };
  return { exists: true, data: () => data };
}

describe('enrolledProfile classification', () => {
  it('treats a missing document as missing, not invalid', () => {
    expect(classifyUserProfile(snap(null))).toEqual({
      kind: 'missing',
      data: null,
      role: '',
      status: '',
    });
  });

  it('treats recognised role and status as valid structure', () => {
    expect(classifyUserProfile(snap({ role: 'homeowner', status: 'disabled' }))).toEqual({
      kind: 'valid',
      data: { role: 'homeowner', status: 'disabled' },
      role: 'homeowner',
      status: 'disabled',
    });
  });

  it('treats unknown role, unknown status, or stub fields as invalid', () => {
    expect(classifyUserProfile(snap({ phone: '+61400000001' })).kind).toBe('invalid');
    expect(classifyUserProfile(snap({ role: 'homeowner' })).kind).toBe('invalid');
    expect(classifyUserProfile(snap({ role: 'mystery', status: 'active' })).kind).toBe('invalid');
    expect(classifyUserProfile(snap({ role: 'homeowner', status: 'suspended' })).kind).toBe('invalid');
  });

  it('grants quote access only when quoteAccessVerified is exactly true', () => {
    expect(hasQuoteAccess({ quoteAccessVerified: true })).toBe(true);
    expect(hasQuoteAccess({ quoteAccessVerified: false, emailVerified: true, accountCompleted: true })).toBe(false);
    expect(hasQuoteAccess({ emailVerified: true })).toBe(false);
    expect(hasQuoteAccess({})).toBe(false);
  });
});
