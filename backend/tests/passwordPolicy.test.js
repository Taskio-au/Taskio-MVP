'use strict';

const {
  PASSWORD_ISSUE_MESSAGES,
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
  expertPasswordIssue,
  passwordStrength,
} = require('../../shared/passwordPolicy');

describe('shared Expert password policy', () => {
  it('requires 12–128 characters, a letter and a number', () => {
    expect(PASSWORD_MIN_LENGTH).toBe(12);
    expect(PASSWORD_MAX_LENGTH).toBe(128);
    expect(PASSWORD_ISSUE_MESSAGES.password_too_short).toBe('Use at least 12 characters for your password.');
    expect(PASSWORD_ISSUE_MESSAGES.password_missing_letter).toBe('Include at least one letter.');
    expect(PASSWORD_ISSUE_MESSAGES.password_missing_number).toBe('Include at least one number.');
  });

  it('rejects 11 characters before other failures', () => {
    expect(expertPasswordIssue('BlueHouse27')).toBe('password_too_short');
    expect(expertPasswordIssue('elevenchars')).toBe('password_too_short');
    expect(expertPasswordIssue(undefined)).toBe('password_too_short');
    expect(expertPasswordIssue(1234567890123)).toBe('password_too_short');
  });

  it('accepts a 12-character letter and number password', () => {
    expect(passwordStrength('MountShelf27')).toBe('strong');
    expect(expertPasswordIssue('MountShelf27')).toBeNull();
    expect(passwordStrength('bluehouse277')).toBe('fair');
    expect(expertPasswordIssue('bluehouse277')).toBeNull();
  });

  it('rejects a missing number and a missing letter before weakness', () => {
    expect(passwordStrength('quiet river table')).toBe('strong');
    expect(expertPasswordIssue('quiet river table')).toBe('password_missing_number');
    expect(expertPasswordIssue('123456789012')).toBe('password_missing_letter');
    expect(expertPasswordIssue('aaaaaaaaaaaa')).toBe('password_missing_number');
  });

  it.each([
    'password1234',
    'password12345',
    'Pa$$w0rd2026',
    'qwerty123456',
    'taskio2026abc',
    'Taskio2026abc',
  ])('rejects predictable %p even though it contains a number', (password) => {
    expect(passwordStrength(password)).toBe('weak');
    expect(expertPasswordIssue(password)).toBe('password_too_weak');
  });

  it.each([
    'BlueHouse2026',
    'quiet river 7 table',
    'CarltonHome27',
    'silver-window-27',
    'BLUEHOUSE2026',
    'bluehouse277',
  ])('accepts %p when the mandatory rules pass and it is not Weak', (password) => {
    expect(['fair', 'strong']).toContain(passwordStrength(password));
    expect(expertPasswordIssue(password)).toBeNull();
  });

  it('enforces the maximum length before composition', () => {
    expect(expertPasswordIssue(`quiet river 7 ${'x'.repeat(PASSWORD_MAX_LENGTH)}`)).toBe('password_too_long');
  });
});
