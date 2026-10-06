const { calculateBookingPricing, customerServiceFeeCents, calculateVariationCustomerPricing, validCustomerPricing } = require('../../shared/bookingPricing');

describe('two-sided booking pricing in AUD cents', () => {
  test.each([[5000, 2000, 0], [17500, 2500, 125], [39000, 2000, 49], [40000, 10000, 0]])(
    'charges only the incremental customer fee on amendments from %i', (previous, additional, fee) => {
      const p = calculateVariationCustomerPricing(previous, additional);
      expect(p.customerFeeCents).toBe(fee);
      expect(p.customerTotalCents).toBe(additional + fee);
      expect(validCustomerPricing(p)).toBe(true);
    });
  test('rejects a tampered payment total', () => {
    expect(validCustomerPricing({ ...calculateBookingPricing(17500), customerTotalCents: 17500 })).toBe(false);
  });
  test.each([
    [5000, 499, 750, 4250], [10000, 500, 1500, 8500],
    [17500, 875, 2625, 14875], [25000, 1250, 3750, 21250],
    [40000, 1999, 6000, 34000], [60000, 1999, 9000, 51000],
  ])('reconciles customer and Expert allocations for %i', (price, customerFee, expertFee, net) => {
    const p = calculateBookingPricing(price);
    expect(p.customerFeeCents).toBe(customerFee);
    expect(p.expertFeeCents).toBe(expertFee);
    expect(p.expertProceedsCents).toBe(net);
    expect(p.customerTotalCents).toBe(net + p.platformGrossFeesCents);
  });
  test.each([
    [9969, 499], [9970, 499], [9979, 499], [9980, 499], [9990, 500],
    [39989, 1999], [39990, 1999], [39979, 1999], [39980, 1999], [40000, 1999],
  ])('rounds and bounds %i', (price, fee) => {
    expect(customerServiceFeeCents(price)).toBe(fee);
  });
  test.each([0, -1, 1.5, NaN, Infinity, '17500', 500000001])('rejects invalid price %s', value => {
    expect(() => calculateBookingPricing(value)).toThrow();
  });
  test('keeps an explicit founding discount on the Expert side only', () => {
    const p = calculateBookingPricing(17500, 0);
    expect(p.expertProceedsCents).toBe(17500);
    expect(p.customerTotalCents).toBe(18375);
    expect(p.platformGrossFeesCents).toBe(875);
  });
});
