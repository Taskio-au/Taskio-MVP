import {
  PASSWORD_ISSUE_MESSAGES,
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
  PASSWORD_REQUIREMENTS_HINT,
  expertPasswordIssue,
  passwordStrength,
} from './passwordStrength';

describe('Expert password policy (generated from shared/passwordPolicy.js)', () => {
  it('requires 12–128 characters, a letter and a number', () => {
    expect(PASSWORD_MIN_LENGTH).toBe(12);
    expect(PASSWORD_MAX_LENGTH).toBe(128);
    expect(PASSWORD_REQUIREMENTS_HINT).toBe('Use at least 12 characters, including a letter and a number.');
    expect(PASSWORD_ISSUE_MESSAGES.password_missing_letter).toBe('Include at least one letter.');
    expect(PASSWORD_ISSUE_MESSAGES.password_missing_number).toBe('Include at least one number.');
    expect(PASSWORD_ISSUE_MESSAGES.password_too_weak).toBe('Choose a less predictable password.');
  });

  it('rejects an 11-character password before strength', () => {
    expect(passwordStrength('BlueHouse27')).toBe('weak');
    expect(expertPasswordIssue('BlueHouse27')).toBe('password_too_short');
    expect(expertPasswordIssue('elevenchars')).toBe('password_too_short');
  });

  it('lets a 12-character letter and number password satisfy the minimum', () => {
    expect(passwordStrength('MountShelf27')).toBe('strong');
    expect(expertPasswordIssue('MountShelf27')).toBeNull();
  });

  it('rejects a passphrase with no number even when it rates Strong', () => {
    expect(passwordStrength('quiet river table')).toBe('strong');
    expect(expertPasswordIssue('quiet river table')).toBe('password_missing_number');
  });

  it('rejects digits with no letter', () => {
    expect(expertPasswordIssue('123456789012')).toBe('password_missing_letter');
  });

  it.each([
    'password1234',
    'password12345',
    'taskio2026abc',
    'qwerty123456',
  ])('rejects the predictable password %p even though it has a number', (password) => {
    expect(passwordStrength(password)).toBe('weak');
    expect(expertPasswordIssue(password)).toBe('password_too_weak');
  });

  it.each([
    ['bluehouse277', 'fair'],
    ['BLUEHOUSE2026', 'fair'],
    ['quiet river 7 table', 'strong'],
    ['BlueHouse2026', 'strong'],
    ['CarltonHome27', 'strong'],
    ['silver-window-27', 'strong'],
  ])('accepts %p as %s', (password, expected) => {
    expect(passwordStrength(password)).toBe(expected);
    expect(expertPasswordIssue(password)).toBeNull();
  });

  it('does not require a symbol, uppercase or lowercase', () => {
    expect(expertPasswordIssue('bluehouse277')).toBeNull();
    expect(expertPasswordIssue('BLUEHOUSE2026')).toBeNull();
    expect(expertPasswordIssue('quiet river 7 table')).toBeNull();
  });

  it('reports length problems before composition and strength', () => {
    expect(expertPasswordIssue('Tidy-Shel-7')).toBe('password_too_short');
    expect(expertPasswordIssue(`quiet river 7 ${'x'.repeat(PASSWORD_MAX_LENGTH)}`)).toBe('password_too_long');
  });
});
