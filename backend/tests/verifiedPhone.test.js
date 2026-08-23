'use strict';

const { hasVerifiedPhone } = require('../src/utils/verifiedPhone');

describe('hasVerifiedPhone', () => {
  it('passes when profile.phoneVerified is true without a token phone', () => {
    expect(hasVerifiedPhone({ phoneVerified: true }, {})).toBe(true);
    expect(hasVerifiedPhone({ phoneVerified: true })).toBe(true);
  });

  it('passes when the decoded token has a non-empty phone_number', () => {
    expect(hasVerifiedPhone({ phoneVerified: false }, { phone_number: '+61400000001' })).toBe(true);
    expect(hasVerifiedPhone({}, { phone_number: '+61400000001' })).toBe(true);
  });

  it('fails when neither profile verification nor token phone is present', () => {
    expect(hasVerifiedPhone({}, {})).toBe(false);
    expect(hasVerifiedPhone(null, null)).toBe(false);
  });

  it('fails when users.phone exists but phoneVerified is false and there is no token phone', () => {
    expect(hasVerifiedPhone({
      phone: '+61400000099',
      phoneVerified: false,
    }, {})).toBe(false);
  });

  it('ignores request-body style phone fields', () => {
    expect(hasVerifiedPhone({}, { phone: '+61400000001' })).toBe(false);
    expect(hasVerifiedPhone({ phone: '+61400000001' }, { phone: '+61400000001' })).toBe(false);
  });

  it('ignores blank or whitespace token phone_number', () => {
    expect(hasVerifiedPhone({}, { phone_number: '' })).toBe(false);
    expect(hasVerifiedPhone({}, { phone_number: '   ' })).toBe(false);
  });
});
