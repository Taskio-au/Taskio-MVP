import React from 'react';

/**
 * Primary content landmark for signed-in marketplace pages (skip link target).
 * @param {string} [label] - Concise page name for screen readers (e.g. "Client dashboard").
 */
export default function PageMain({ children, label = 'Main content' }) {
  return (
    <main id="main-content" tabIndex={-1} aria-label={label}>
      {children}
    </main>
  );
}
