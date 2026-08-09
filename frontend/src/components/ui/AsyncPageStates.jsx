import React from 'react';
import { Link } from 'react-router-dom';
import { Loader2, AlertCircle } from 'lucide-react';

/** Shared layout/copy for loading / errors across marketplace surfaces (Client & Expert). */
export const TASKIO_PAGE_STATE_CSS = `
  .taskio-page-state-shell {
    min-height: calc(100vh - 64px);
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 24px 16px;
    box-sizing: border-box;
    background: #F7F9FA;
  }
  .taskio-page-state {
    width: 100%;
    max-width: 420px;
    display: flex;
    gap: 14px;
    align-items: flex-start;
    padding: 20px 18px;
    border-radius: 12px;
    border: 1px solid #E5E7EB;
    background: #FFFFFF;
    box-shadow: 0 1px 3px rgba(15, 23, 42, 0.06);
    text-align: left;
  }
  .taskio-page-state--loading {
    border-left: 4px solid #14C5C5;
  }
  .taskio-page-state--error {
    border-left: 4px solid #E11D48;
    background: #FFFBFC;
    border-color: #FECDD3;
  }
  .taskio-page-state__body {
    min-width: 0;
    flex: 1;
  }
  .taskio-page-state__title {
    font-family: 'Poppins', 'Inter', sans-serif;
    font-size: 16px;
    font-weight: 700;
    color: #111827;
    line-height: 1.35;
    margin: 0 0 4px 0;
  }
  .taskio-page-state__detail {
    font-size: 14px;
    color: #6B7280;
    line-height: 1.5;
    margin: 0;
  }
  .taskio-page-state__message {
    font-size: 14px;
    color: #4B5563;
    line-height: 1.5;
    margin: 0 0 12px 0;
    overflow-wrap: anywhere;
  }
  .taskio-page-state__spinner {
    color: #0F766E;
    flex-shrink: 0;
    animation: taskio-page-spin 0.75s linear infinite;
  }
  @keyframes taskio-page-spin {
    to { transform: rotate(360deg); }
  }
  @media (prefers-reduced-motion: reduce) {
    .taskio-page-state__spinner {
      animation: none;
    }
  }
  .taskio-page-state__retry {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-height: 44px;
    padding: 0 18px;
    border-radius: 10px;
    border: none;
    background: #14C5C5;
    color: #fff;
    font-weight: 800;
    font-size: 14px;
    font-family: 'Inter', sans-serif;
    cursor: pointer;
    width: 100%;
    box-sizing: border-box;
  }
  .taskio-page-state__retry:hover {
    filter: brightness(0.95);
  }
  .taskio-page-state__retry:focus {
    outline: 2px solid #14C5C5;
    outline-offset: 2px;
  }
  @media (min-width: 480px) {
    .taskio-page-state__retry {
      width: auto;
    }
  }
  .taskio-page-state__actions {
    display: flex;
    flex-direction: column;
    gap: 10px;
    margin-top: 0;
    align-items: stretch;
  }
  @media (min-width: 480px) {
    .taskio-page-state__actions {
      flex-direction: row;
      flex-wrap: wrap;
      align-items: center;
    }
  }
  .taskio-page-state__navLink {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-height: 44px;
    padding: 0 18px;
    border-radius: 10px;
    font-weight: 700;
    font-size: 14px;
    font-family: 'Inter', sans-serif;
    text-decoration: none;
    box-sizing: border-box;
    width: 100%;
    text-align: center;
    cursor: pointer;
    border: 1px solid transparent;
  }
  @media (min-width: 480px) {
    .taskio-page-state__navLink {
      width: auto;
    }
  }
  .taskio-page-state__navLink--primary {
    background: #14C5C5;
    color: #fff;
    border-color: #14C5C5;
  }
  .taskio-page-state__navLink--primary:hover {
    filter: brightness(0.95);
  }
  .taskio-page-state__navLink--primary:focus {
    outline: 2px solid #14C5C5;
    outline-offset: 2px;
  }
  .taskio-page-state__navLink--secondary {
    background: #fff;
    color: #374151;
    border-color: #E5E7EB;
  }
  .taskio-page-state__navLink--secondary:hover {
    background: #F9FAFB;
  }
  .taskio-page-state__navLink--secondary:focus {
    outline: 2px solid #94A3B8;
    outline-offset: 2px;
  }
`;

export function PageStateStyles() {
  return <style>{TASKIO_PAGE_STATE_CSS}</style>;
}

function LoadingStateCardInner({ message, detail, className = '' }) {
  return (
    <div
      className={`taskio-page-state taskio-page-state--loading ${className}`.trim()}
      role="status"
      aria-live="polite"
      aria-busy="true"
    >
      <Loader2 className="taskio-page-state__spinner" size={22} strokeWidth={2.2} aria-hidden />
      <div className="taskio-page-state__body">
        <p className="taskio-page-state__title">{message}</p>
        {detail ? <p className="taskio-page-state__detail">{detail}</p> : null}
      </div>
    </div>
  );
}

function ErrorStateCardInner({
  title = 'Something went wrong',
  message,
  onRetry,
  retryLabel = 'Try again',
  className = '',
}) {
  return (
    <div className={`taskio-page-state taskio-page-state--error ${className}`.trim()} role="alert">
      <AlertCircle
        size={22}
        color="#BE123C"
        strokeWidth={2}
        aria-hidden
        style={{ flexShrink: 0 }}
      />
      <div className="taskio-page-state__body">
        <p className="taskio-page-state__title">{title}</p>
        {message ? <p className="taskio-page-state__message">{message}</p> : null}
        {typeof onRetry === 'function' ? (
          <button type="button" className="taskio-page-state__retry" onClick={onRetry}>
            {retryLabel}
          </button>
        ) : null}
      </div>
    </div>
  );
}

export function LoadingStateCard({ message = 'Loading…', detail, className = '' }) {
  return (
    <>
      <PageStateStyles />
      <LoadingStateCardInner message={message} detail={detail} className={className} />
    </>
  );
}

export function ErrorStateCard({
  title = 'Something went wrong',
  message,
  onRetry,
  retryLabel = 'Try again',
  className = '',
}) {
  return (
    <>
      <PageStateStyles />
      <ErrorStateCardInner title={title} message={message} onRetry={onRetry} retryLabel={retryLabel} className={className} />
    </>
  );
}

/** Full-viewport centered loading (e.g. auth gate before header). */
export function PageLoadingShell({ message, detail }) {
  return (
    <>
      <PageStateStyles />
      <main
        id="main-content"
        tabIndex={-1}
        className="taskio-page-state-shell"
        aria-busy="true"
        aria-label="Loading"
      >
        <LoadingStateCardInner message={message} detail={detail} />
      </main>
    </>
  );
}

/** Full-viewport centered error with retry. */
export function PageErrorShell({ title, message, onRetry, retryLabel }) {
  return (
    <>
      <PageStateStyles />
      <main id="main-content" tabIndex={-1} className="taskio-page-state-shell" aria-label="Error">
        <ErrorStateCardInner title={title} message={message} onRetry={onRetry} retryLabel={retryLabel} />
      </main>
    </>
  );
}

/** Inline card for use inside an existing padded shell (e.g. expert dashboard) — includes one style injection. */
export function InlineLoadingCard({ message, detail }) {
  return <LoadingStateCard message={message} detail={detail} />;
}

export function InlineErrorCard({ title, message, onRetry, retryLabel }) {
  return <ErrorStateCard title={title} message={message} onRetry={onRetry} retryLabel={retryLabel} />;
}

/** Inline error with router links (e.g. post-task permission / recovery). Omit secondary for a single action. */
export function InlineErrorCardWithNavLinks({
  title,
  message,
  primaryLabel,
  primaryTo,
  secondaryLabel,
  secondaryTo,
  className = '',
}) {
  return (
    <>
      <PageStateStyles />
      <div className={`taskio-page-state taskio-page-state--error ${className}`.trim()} role="alert">
        <AlertCircle
          size={22}
          color="#BE123C"
          strokeWidth={2}
          aria-hidden
          style={{ flexShrink: 0 }}
        />
        <div className="taskio-page-state__body">
          <p className="taskio-page-state__title">{title}</p>
          {message ? <p className="taskio-page-state__message">{message}</p> : null}
          <div className="taskio-page-state__actions">
            {primaryLabel && primaryTo ? (
              <Link
                className="taskio-page-state__navLink taskio-page-state__navLink--primary"
                to={primaryTo}
              >
                {primaryLabel}
              </Link>
            ) : null}
            {secondaryLabel && secondaryTo ? (
              <Link
                className="taskio-page-state__navLink taskio-page-state__navLink--secondary"
                to={secondaryTo}
              >
                {secondaryLabel}
              </Link>
            ) : null}
          </div>
        </div>
      </div>
    </>
  );
}
