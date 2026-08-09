import React, { useId, useMemo } from 'react';

function EyeIcon({ visible }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      {visible ? (
        <>
          <path d="M9.88 9.88a3 3 0 1 0 4.24 4.24" />
          <path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68" />
          <path d="M6.61 6.61A13.526 13.526 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61" />
          <line x1="2" x2="22" y1="2" y2="22" />
        </>
      ) : (
        <>
          <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z" />
          <circle cx="12" cy="12" r="3" />
        </>
      )}
    </svg>
  );
}

const hiddenLabelStyle = {
  border: 0,
  clip: 'rect(0 0 0 0)',
  height: '1px',
  margin: '-1px',
  overflow: 'hidden',
  padding: 0,
  position: 'absolute',
  width: '1px',
};

export function PasswordStrengthMeter({ password }) {
  const criteria = useMemo(
    () => [
      { label: 'At least 8 characters', regex: /.{8,}/ },
      { label: 'An uppercase letter', regex: /[A-Z]/ },
      { label: 'A lowercase letter', regex: /[a-z]/ },
      { label: 'A number', regex: /\d/ },
      { label: 'A special character', regex: /[^A-Za-z0-9]/ },
    ],
    []
  );

  const score = useMemo(() => {
    if (!password) return 0;
    return criteria.reduce((acc, criterion) => acc + (criterion.regex.test(password) ? 1 : 0), 0);
  }, [password, criteria]);

  const barWidth = `${(score / criteria.length) * 100}%`;
  const barColor = useMemo(() => {
    if (score <= 2) return 'var(--warning-red, #DC3545)';
    if (score <= 4) return '#FFC107';
    return 'var(--success-green, #28A745)';
  }, [score]);

  return (
    <div style={{ marginTop: '10px' }}>
      <div style={{ height: '5px', backgroundColor: 'var(--light-grey, #E0E0E0)', borderRadius: '2px', overflow: 'hidden', marginBottom: '8px' }}>
        <div style={{ height: '100%', width: barWidth, backgroundColor: barColor, transition: 'width 0.3s ease-in-out, background-color 0.3s ease-in-out' }} />
      </div>
      <ul style={{ listStyle: 'none', padding: 0, margin: 0, fontSize: '12px', color: '#666' }}>
        {criteria.map((item, index) => (
          <li key={index} style={{ marginBottom: '4px', opacity: item.regex.test(password) ? 1 : 0.6 }}>
            {item.regex.test(password) ? '✓' : '✗'} {item.label}
          </li>
        ))}
      </ul>
    </div>
  );
}

export function PasswordField({
  name,
  value,
  onChange,
  placeholder,
  error,
  isVisible,
  onToggleVisibility,
  autoComplete,
  inputId,
}) {
  const errorId = useId();

  return (
    <div style={{ position: 'relative', marginTop: '10px' }}>
      <label htmlFor={inputId} style={hiddenLabelStyle}>{placeholder}</label>
      <input
        id={inputId}
        type={isVisible ? 'text' : 'password'}
        name={name}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        required
        minLength="8"
        autoComplete={autoComplete}
        aria-invalid={!!error}
        aria-describedby={error ? errorId : undefined}
        style={{ width: '100%', padding: '10px', boxSizing: 'border-box' }}
      />
      <button
        type="button"
        onClick={onToggleVisibility}
        style={{ position: 'absolute', right: '10px', top: '0', bottom: '0', margin: 'auto 0', height: '100%', cursor: 'pointer', color: '#555', background: 'none', border: 'none', display: 'flex', alignItems: 'center' }}
        aria-label={isVisible ? 'Hide password' : 'Show password'}
      >
        <EyeIcon visible={!isVisible} />
      </button>
      {error && <p id={errorId} style={{ color: 'var(--warning-red, #DC3545)', fontSize: '12px', margin: '5px 0 10px 0' }}>{error}</p>}
    </div>
  );
}
