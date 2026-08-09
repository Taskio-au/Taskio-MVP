import { getVariationStatusLabel } from './variationStatusLabels';

describe('getVariationStatusLabel', () => {
  it('maps secured variation to Payment secured', () => {
    expect(getVariationStatusLabel('approved', 'in_escrow')).toBe('Payment secured');
  });

  it('maps awaiting_payment to Payment required', () => {
    expect(getVariationStatusLabel('awaiting_payment', 'pending_payment')).toBe('Payment required');
  });

  it('maps pending to Variation requested', () => {
    expect(getVariationStatusLabel('pending', '')).toBe('Variation requested');
  });
});
