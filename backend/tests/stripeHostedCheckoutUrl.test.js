'use strict';

const {
  validateStripeHostedCheckoutUrl,
  toHostedCheckoutPayload,
  isHostedCheckoutUrlError,
} = require('../src/utils/stripeHostedCheckoutUrl');

describe('stripeHostedCheckoutUrl', () => {
  const good = 'https://checkout.stripe.com/c/pay/cs_test_abc123';

  it('accepts Stripe-hosted HTTPS pay URLs', () => {
    expect(validateStripeHostedCheckoutUrl(good)).toBe(good);
    expect(validateStripeHostedCheckoutUrl('https://checkout.stripe.com/pay/cs_test_abc123'))
      .toBe('https://checkout.stripe.com/pay/cs_test_abc123');
  });

  it('rejects missing, non-https, wrong host, and non-pay paths', () => {
    expect(() => validateStripeHostedCheckoutUrl('')).toThrow();
    expect(() => validateStripeHostedCheckoutUrl('http://checkout.stripe.com/c/pay/cs_test_abc')).toThrow();
    expect(() => validateStripeHostedCheckoutUrl('https://evil.example/c/pay/cs_test_abc')).toThrow();
    expect(() => validateStripeHostedCheckoutUrl('https://checkout.stripe.com/evil')).toThrow();
    expect(() => validateStripeHostedCheckoutUrl('https://user:pass@checkout.stripe.com/c/pay/cs_test_abc')).toThrow();
  });

  it('builds a client payload from the Stripe Session url, not a client URL', () => {
    const payload = toHostedCheckoutPayload(
      { id: 'cs_test_abc123', url: good },
      { reused: true },
    );
    expect(payload).toEqual({
      sessionId: 'cs_test_abc123',
      checkoutUrl: good,
      reused: true,
    });
  });

  it('classifies hosted-url errors', () => {
    try {
      validateStripeHostedCheckoutUrl('https://evil.example/c/pay/x');
    } catch (e) {
      expect(isHostedCheckoutUrlError(e)).toBe(true);
    }
  });
});
