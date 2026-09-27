import React from 'react';
import {
  PASSWORD_ISSUE_MESSAGES,
  PASSWORD_MIN_LENGTH,
  PASSWORD_REQUIREMENTS_HINT,
  PASSWORD_STRENGTH_LABELS,
  passwordStrength,
} from '../../utils/passwordStrength';

const LEVELS = ['weak', 'fair', 'strong'];

const TONES = {
  weak: '#B91C1C',
  fair: '#B45309',
  strong: '#047857',
};

export default function PasswordStrengthMeter({ id, password }) {
  const value = String(password || '');
  const level = passwordStrength(value);
  const filled = LEVELS.indexOf(level) + 1;
  let guidance = null;
  if (level === 'weak') {
    guidance = value.length < PASSWORD_MIN_LENGTH
      ? `Use at least ${PASSWORD_MIN_LENGTH} characters.`
      : PASSWORD_ISSUE_MESSAGES.password_too_weak;
  }

  return (
    <div id={id} role="status" aria-live="polite" style={styles.wrap}>
      {value ? (
        <>
          <div style={styles.bars} aria-hidden="true">
            {LEVELS.map((item, index) => (
              <span
                key={item}
                style={{
                  ...styles.bar,
                  backgroundColor: index < filled ? TONES[level] : '#E5E7EB',
                }}
              />
            ))}
          </div>
          <span style={styles.text}>
            Password strength: <strong style={{ color: TONES[level] }}>{PASSWORD_STRENGTH_LABELS[level]}</strong>
            {guidance ? ` · ${guidance}` : null}
          </span>
        </>
      ) : (
        <span style={styles.text}>
          {PASSWORD_REQUIREMENTS_HINT} Avoid common or easy-to-guess passwords.
        </span>
      )}
    </div>
  );
}

const styles = {
  wrap: {
    display: 'grid',
    gap: 6,
    fontSize: 13,
    lineHeight: 1.4,
    color: '#4B5563',
  },
  bars: {
    display: 'grid',
    gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
    gap: 6,
  },
  bar: {
    height: 4,
    borderRadius: 999,
  },
  text: {
    display: 'block',
  },
};
