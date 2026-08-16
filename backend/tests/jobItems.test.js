'use strict';

const { normalizeJobItems } = require('../src/services/jobItems');

describe('job item normalization', () => {
  test('converts a legacy single job type into one quantity-one item', () => {
    const result = normalizeJobItems({ jobType: 'mounting_shelves' });
    expect(result.error).toBeUndefined();
    expect(result.primaryCategory).toBe('Mounting');
    expect(result.items).toEqual([{ type: 'mounting_shelves', quantity: 1, customDescription: '' }]);
  });

  test('accepts multiple catalogue and custom items in one primary category', () => {
    const result = normalizeJobItems({
      primaryCategory: 'Mounting',
      items: [
        { type: 'mounting_shelves', quantity: 3 },
        { type: 'mounting_tv', quantity: 1 },
        { type: 'custom', quantity: 2, customDescription: 'Small wall-mounted planters' },
      ],
    });
    expect(result.error).toBeUndefined();
    expect(result.primaryJobType).toBe('mounting_shelves');
    expect(result.items).toHaveLength(3);
  });

  test.each([
    [{ primaryCategory: 'Mounting', items: [] }, 'Choose between'],
    [{ primaryCategory: 'Mounting', items: [{ type: 'mounting_shelves', quantity: 0 }] }, 'whole numbers'],
    [{ primaryCategory: 'Mounting', items: [{ type: 'custom', quantity: 1, customDescription: '' }] }, 'Describe'],
    [{ primaryCategory: 'Mounting', items: [{ type: 'hanging_artwork', quantity: 1 }] }, 'belong'],
  ])('rejects invalid item payload %#', (payload, message) => {
    expect(normalizeJobItems(payload).error).toContain(message);
  });
});
