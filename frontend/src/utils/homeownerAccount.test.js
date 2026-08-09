import {
  getClientAccountStatus,
  getHomeownerAccountStatus,
  shouldBlockClientChat,
} from './homeownerAccount';

describe('client account status helpers', () => {
  it('requires verified phone, first name, and a durable method', () => {
    const status = getClientAccountStatus(
      { firstName: 'Saeed', phoneVerified: true, emailVerified: true },
      { emailVerified: true, providerData: [] }
    );

    expect(status.durableAccountReady).toBe(true);
  });

  it('does not unlock payment for phone-only homeowners', () => {
    const status = getClientAccountStatus(
      { firstName: 'Saeed', phoneVerified: true, emailVerified: false },
      { emailVerified: false, providerData: [{ providerId: 'phone' }] }
    );

    expect(status.durableAccountReady).toBe(false);
  });

  it('treats a linked Google account as a durable method', () => {
    const status = getClientAccountStatus(
      { firstName: 'Saeed', phoneVerified: true, emailVerified: false },
      { emailVerified: false, providerData: [{ providerId: 'google.com' }] }
    );

    expect(status.googleLinked).toBe(true);
    expect(status.durableAccountReady).toBe(true);
  });

  it('keeps the legacy homeowner helper as a compatibility alias', () => {
    const status = getHomeownerAccountStatus(
      { firstName: 'Saeed', phoneVerified: true, emailVerified: true },
      { emailVerified: true, providerData: [] }
    );

    expect(status.durableAccountReady).toBe(true);
  });

  it('does not block client chat after payment is secured', () => {
    expect(shouldBlockClientChat({ status: 'FUNDED', durableAccountReady: false })).toBe(false);
    expect(shouldBlockClientChat({ status: 'IN_PROGRESS', durableAccountReady: false })).toBe(false);
    expect(shouldBlockClientChat({ status: 'AWAITING_APPROVAL', durableAccountReady: false })).toBe(false);
    expect(shouldBlockClientChat({ status: 'IN_ESCROW', durableAccountReady: false })).toBe(false);
  });

  it('still blocks pre-payment client chat without a durable account', () => {
    expect(shouldBlockClientChat({ status: 'AWAITING_FUNDING', durableAccountReady: false })).toBe(true);
  });
});
