'use strict';

// Expert email/password signup policy, enforced by the API and mirrored by the signup page.
// Keep this file dependency-free: frontend/scripts/syncShared.js copies it verbatim as ESM.

const PASSWORD_MIN_LENGTH = 10;
const PASSWORD_MAX_LENGTH = 128;

const PASSWORD_STRENGTH_LABELS = Object.freeze({
  weak: 'Weak',
  fair: 'Fair',
  strong: 'Strong',
});

const PASSWORD_ISSUE_MESSAGES = Object.freeze({
  password_too_short: `Use at least ${PASSWORD_MIN_LENGTH} characters for your password.`,
  password_too_long: `Use no more than ${PASSWORD_MAX_LENGTH} characters for your password.`,
  password_too_weak: 'Choose a less predictable password.',
});

const COMMON_WORDS = [
  'password', 'passwort', 'qwerty', 'letmein', 'welcome', 'admin', 'login', 'iloveyou',
  'changeme', 'trustno', 'secret', 'monkey', 'dragon', 'sunshine', 'princess',
  'football', 'baseball', 'taskio',
];

const SEQUENCES = ['abcdefghijklmnopqrstuvwxyz', '0123456789', 'qwertyuiop', 'asdfghjkl', 'zxcvbnm'];

const LOOKALIKES = { 0: 'o', 1: 'i', 3: 'e', 4: 'a', 5: 's', 7: 't', '@': 'a', $: 's', '!': 'i' };

function markRange(mask, start, end) {
  for (let index = start; index < end; index += 1) mask[index] = true;
}

function markSequenceRuns(lower, mask) {
  SEQUENCES.forEach((sequence) => {
    [1, -1].forEach((direction) => {
      let runStart = 0;
      for (let index = 1; index <= lower.length; index += 1) {
        const previous = sequence.indexOf(lower[index - 1]);
        const continues = index < lower.length
          && previous !== -1
          && sequence.indexOf(lower[index]) === previous + direction;
        if (continues) continue;
        if (index - runStart >= 3) markRange(mask, runStart, index);
        runStart = index;
      }
    });
  });
}

// Flags characters that belong to common words (including look-alike spellings such as
// "p@ssw0rd"), runs of 3+ repeated characters, and alphabet, digit or keyboard sequences.
function predictableMask(lower) {
  const mask = new Array(lower.length).fill(false);
  const plain = lower.replace(/[013457@$!]/g, (char) => LOOKALIKES[char]);

  COMMON_WORDS.forEach((word) => {
    for (let at = plain.indexOf(word); at !== -1; at = plain.indexOf(word, at + 1)) {
      markRange(mask, at, at + word.length);
    }
  });

  const repeated = /(.)\1{2,}/g;
  for (let match = repeated.exec(lower); match; match = repeated.exec(lower)) {
    markRange(mask, match.index, match.index + match[0].length);
  }

  markSequenceRuns(lower, mask);
  return mask;
}

// Weak / Fair / Strong without composition rules. Weak blocks signup; Fair and Strong pass.
function passwordStrength(password) {
  const value = typeof password === 'string' ? password : '';
  if (value.length < PASSWORD_MIN_LENGTH) return 'weak';

  const lower = value.toLowerCase();
  if (new Set(lower).size < 5) return 'weak';
  if (/^(.+)\1+$/.test(lower)) return 'weak';

  const mask = predictableMask(lower);
  const unpredictable = lower.split('').filter((char, index) => !mask[index]);
  // Digits left after removing common words ("taskio2026") are still easy to guess.
  if (unpredictable.filter((char) => !/\d/.test(char)).length < 3) return 'weak';

  const variety = [/[a-z]/, /[A-Z]/, /\d/, /[^A-Za-z0-9]/].filter((pattern) => pattern.test(value)).length;
  if (value.length >= 16 || (value.length >= 12 && variety >= 3)) return 'strong';
  return 'fair';
}

function expertPasswordIssue(password) {
  const value = typeof password === 'string' ? password : '';
  if (value.length < PASSWORD_MIN_LENGTH) return 'password_too_short';
  if (value.length > PASSWORD_MAX_LENGTH) return 'password_too_long';
  if (passwordStrength(value) === 'weak') return 'password_too_weak';
  return null;
}

module.exports = {
  PASSWORD_MIN_LENGTH,
  PASSWORD_MAX_LENGTH,
  PASSWORD_STRENGTH_LABELS,
  PASSWORD_ISSUE_MESSAGES,
  passwordStrength,
  expertPasswordIssue,
};
