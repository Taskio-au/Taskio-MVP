import { formatRelativeTimeShort } from './formatRelativeTime';

describe('formatRelativeTimeShort', () => {
  it('returns em dash for missing ts', () => {
    expect(formatRelativeTimeShort(null)).toBe('—');
  });

  it('formats recent times', () => {
    const now = Math.floor(Date.now() / 1000);
    expect(formatRelativeTimeShort({ seconds: now - 30 })).toBe('Just now');
    expect(formatRelativeTimeShort({ seconds: now - 120 })).toMatch(/^\d+m ago$/);
  });
});
