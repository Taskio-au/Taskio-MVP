import React, { useEffect, useMemo, useRef } from 'react';

export default function OtpCodeInput({ value = '', onChange, disabled = false }) {
  const refs = useRef([]);
  const digits = useMemo(() => {
    const raw = String(value || '').replace(/\D/g, '').slice(0, 6);
    return Array.from({ length: 6 }, (_, index) => raw[index] || '');
  }, [value]);

  useEffect(() => {
    const firstEmptyIndex = digits.findIndex((digit) => !digit);
    const targetIndex = firstEmptyIndex === -1 ? 5 : firstEmptyIndex;
    refs.current[targetIndex]?.focus?.();
  }, [digits]);

  const updateDigits = (nextDigits) => {
    onChange?.(nextDigits.join('').replace(/\D/g, '').slice(0, 6));
  };

  const handleDigitChange = (index, nextValue) => {
    const sanitized = String(nextValue || '').replace(/\D/g, '');
    if (!sanitized) {
      const nextDigits = [...digits];
      nextDigits[index] = '';
      updateDigits(nextDigits);
      return;
    }

    const nextDigits = [...digits];
    let cursor = index;
    for (const char of sanitized.slice(0, 6 - index)) {
      nextDigits[cursor] = char;
      cursor += 1;
    }
    updateDigits(nextDigits);
    refs.current[Math.min(cursor, 5)]?.focus?.();
  };

  const handleKeyDown = (index, event) => {
    if (event.key === 'Backspace' && !digits[index] && index > 0) {
      refs.current[index - 1]?.focus?.();
    }
    if (event.key === 'ArrowLeft' && index > 0) {
      refs.current[index - 1]?.focus?.();
    }
    if (event.key === 'ArrowRight' && index < 5) {
      refs.current[index + 1]?.focus?.();
    }
  };

  const handlePaste = (event) => {
    const pasted = event.clipboardData?.getData('text') || '';
    if (!pasted) return;
    event.preventDefault();
    const nextDigits = pasted.replace(/\D/g, '').slice(0, 6).split('');
    updateDigits(nextDigits);
  };

  return (
    <div style={styles.row} onPaste={handlePaste}>
      {digits.map((digit, index) => (
        <input
          key={index}
          ref={(node) => { refs.current[index] = node; }}
          type="text"
          inputMode="numeric"
          autoComplete={index === 0 ? 'one-time-code' : 'off'}
          value={digit}
          disabled={disabled}
          onChange={(event) => handleDigitChange(index, event.target.value)}
          onKeyDown={(event) => handleKeyDown(index, event)}
          style={styles.input}
          maxLength={1}
          aria-label={`Digit ${index + 1}`}
        />
      ))}
    </div>
  );
}

const styles = {
  row: {
    display: 'grid',
    gridTemplateColumns: 'repeat(6, minmax(0, 1fr))',
    gap: 10,
  },
  input: {
    width: '100%',
    aspectRatio: '1 / 1.1',
    minHeight: 54,
    textAlign: 'center',
    borderRadius: 14,
    border: '1.5px solid #D1D5DB',
    fontSize: 24,
    fontWeight: 700,
    color: '#111827',
    outline: 'none',
    fontFamily: 'Inter, sans-serif',
    boxSizing: 'border-box',
  },
};

