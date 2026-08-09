import {
  getIdentifierType,
  maskEmail,
  maskPhone,
  normalizeResolvedEmailStrategy,
  resolveEmailSignIn,
} from './utils';

describe('unified auth utils', () => {
  it('detects email identifiers', () => {
    expect(getIdentifierType(' USER@Example.com ')).toEqual({
      type: 'email',
      value: 'user@example.com',
    });
  });

  it('detects australian mobile identifiers', () => {
    expect(getIdentifierType('0405 000 123')).toEqual({
      type: 'phone',
      value: '+61405000123',
    });
  });

  it('flags invalid identifiers', () => {
    expect(getIdentifierType('not-valid')).toEqual({
      type: 'invalid',
      value: 'not-valid',
    });
  });

  it('masks email and phone values safely', () => {
    expect(maskEmail('hello@example.com')).toBe('he***@example.com');
    expect(maskPhone('+61405000123')).toMatch(/\+61/);
  });

  it('normalizes backend email resolution strategies', () => {
    expect(normalizeResolvedEmailStrategy('password')).toBe('password');
    expect(normalizeResolvedEmailStrategy('google')).toBe('google');
    expect(normalizeResolvedEmailStrategy('magic_link')).toBe('magic_link');
    expect(normalizeResolvedEmailStrategy('unavailable')).toBe('unavailable');
    expect(normalizeResolvedEmailStrategy('')).toBe('ambiguous');
  });

  it('surfaces a temporary resolver outage separately from an ambiguous result', async () => {
    const apiClient = {
      post: jest.fn().mockRejectedValue({ response: { status: 503 } }),
    };

    await expect(resolveEmailSignIn(apiClient, 'user@example.com')).resolves.toEqual({
      strategy: 'unavailable',
      source: 'resolver_error',
    });
  });

  it('returns resolver metadata for successful email resolution', async () => {
    const apiClient = {
      post: jest.fn().mockResolvedValue({ data: { strategy: 'password' } }),
    };

    await expect(resolveEmailSignIn(apiClient, 'user@example.com')).resolves.toEqual({
      strategy: 'password',
      source: 'resolver',
    });
  });
});
