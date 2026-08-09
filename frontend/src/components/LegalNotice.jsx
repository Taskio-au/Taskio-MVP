import React from 'react';
import { Link } from 'react-router-dom';

export default function LegalNotice({
  checked = true,
  onChange,
  requireAcceptance = false,
  compact = false,
  style,
}) {
  const body = (
    <>
      I agree to Taskio&apos;s <Link to="/terms">Terms of Use</Link> and <Link to="/privacy">Privacy Policy</Link>.
    </>
  );

  if (requireAcceptance) {
    return (
      <label
        style={{
          display: 'flex',
          alignItems: 'flex-start',
          gap: 10,
          fontSize: compact ? 12 : 13,
          lineHeight: 1.5,
          color: '#4B5563',
          ...style,
        }}
      >
        <input
          type="checkbox"
          checked={checked}
          onChange={(event) => onChange?.(event.target.checked)}
          style={{ marginTop: 3 }}
        />
        <span>{body}</span>
      </label>
    );
  }

  return (
    <p
      style={{
        margin: 0,
        fontSize: compact ? 12 : 13,
        lineHeight: 1.5,
        color: '#4B5563',
        ...style,
      }}
    >
      {body}
    </p>
  );
}
