import {
  PASSWORD_ISSUE_MESSAGES,
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
  expertPasswordIssue,
  passwordStrength,
} from './passwordStrength';

describe('Expert password policy (generated from shared/passwordPolicy.js)', () => {
  it('uses 10–128 characters', () => {
    expect(PASSWORD_MIN_LENGTH).toBe(10);
    expect(PASSWORD_MAX_LENGTH).toBe(128);
  });

  it.each([
    '',
    'ninechars',
    'aaaaaaaaaa',
    '1234567890',
    'password12',
    'password123',
    'password1234',
    'P@ssw0rd123',
    'qwerty12345',
    'letmein1234',
    'taskio1234',
    'taskio2026!',
    'blueblueblue',
  ])('rates predictable %p as Weak and blocks it', (password) => {
    expect(passwordStrength(password)).toBe('weak');
    expect(expertPasswordIssue(password)).toMatch(/^password_too_(short|weak)$/);
  });

  it.each([
    ['BlueHouse27', 'fair'],
    ['tidyshelf7', 'fair'],
    ['mountshelves', 'fair'],
    ['quiet river table', 'strong'],
    ['CoffeeNearCarlton', 'strong'],
    ['silver-window-27', 'strong'],
    ['Tidy-Shelf-72', 'strong'],
  ])('accepts %p as %s', (password, expected) => {
    expect(passwordStrength(password)).toBe(expected);
    expect(expertPasswordIssue(password)).toBeNull();
  });

  it('does not require digits, symbols or mixed case', () => {
    expect(passwordStrength('only lowercase words here')).toBe('strong');
    expect(expertPasswordIssue('mountshelves')).toBeNull();
  });

  it('reports length problems before strength', () => {
    expect(expertPasswordIssue('Tidy-Shel')).toBe('password_too_short');
    expect(expertPasswordIssue(`quiet river ${'x'.repeat(PASSWORD_MAX_LENGTH)}`)).toBe('password_too_long');
    expect(PASSWORD_ISSUE_MESSAGES.password_too_weak).toBe('Choose a less predictable password.');
  });
});
