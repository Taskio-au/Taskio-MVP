'use strict';

const {
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
  expertPasswordIssue,
  passwordStrength,
} = require('../../shared/passwordPolicy');

describe('shared Expert password policy', () => {
  it('uses 10–128 characters', () => {
    expect(PASSWORD_MIN_LENGTH).toBe(10);
    expect(PASSWORD_MAX_LENGTH).toBe(128);
  });

  it.each([
    'aaaaaaaaaa',
    '1234567890',
    '0987654321',
    'password123',
    'password1234',
    'Pa$$w0rd2026',
    'qwerty12345',
    'asdfghjkl12',
    'letmein1234',
    'taskio1234',
    'Taskio2026',
    'abcdefghijk',
    'blueblueblue',
  ])('rejects predictable %p as Weak', (password) => {
    expect(passwordStrength(password)).toBe('weak');
    expect(expertPasswordIssue(password)).toBe('password_too_weak');
  });

  it.each([
    'BlueHouse27',
    'quiet river table',
    'CoffeeNearCarlton',
    'silver-window-27',
    'badminton court 7',
  ])('accepts %p without composition rules', (password) => {
    expect(['fair', 'strong']).toContain(passwordStrength(password));
    expect(expertPasswordIssue(password)).toBeNull();
  });

  it('enforces the length bounds and ignores non-string input', () => {
    expect(expertPasswordIssue('ninechars')).toBe('password_too_short');
    expect(expertPasswordIssue(undefined)).toBe('password_too_short');
    expect(expertPasswordIssue(1234567890123)).toBe('password_too_short');
    expect(expertPasswordIssue(`quiet river ${'x'.repeat(PASSWORD_MAX_LENGTH)}`)).toBe('password_too_long');
  });
});
