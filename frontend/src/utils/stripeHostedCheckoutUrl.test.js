import {
  validateStripeHostedCheckoutUrl,
  navigateToStripeHostedCheckout,
  InvalidStripeCheckoutUrlError,
} from './stripeHostedCheckoutUrl';

describe('stripeHostedCheckoutUrl', () => {
  const good = 'https://checkout.stripe.com/c/pay/cs_test_abc123';

  it('accepts Stripe-hosted HTTPS pay URLs', () => {
    expect(validateStripeHostedCheckoutUrl(good)).toBe(good);
  });

  it('rejects missing or non-Stripe URLs', () => {
    expect(() => validateStripeHostedCheckoutUrl('')).toThrow(InvalidStripeCheckoutUrlError);
    expect(() => validateStripeHostedCheckoutUrl('https://evil.example/c/pay/cs_test_abc'))
      .toThrow(InvalidStripeCheckoutUrlError);
    expect(() => validateStripeHostedCheckoutUrl('http://checkout.stripe.com/c/pay/cs_test_abc'))
      .toThrow(InvalidStripeCheckoutUrlError);
  });

  it('navigates with location.assign and does not call redirectToCheckout', () => {
    const assign = jest.fn();
    navigateToStripeHostedCheckout(good, assign);
    expect(assign).toHaveBeenCalledWith(good);
  });
});
