/**
 * Responsive caps for dashboard "Needs attention" / priority task cards.
 * Breakpoints: desktop >=1024 → 6, tablet 768–1023 → 4, mobile <768 → 3.
 */

export const DASHBOARD_ATTENTION_BREAKPOINT_DESKTOP = 1024;
export const DASHBOARD_ATTENTION_BREAKPOINT_TABLET = 768;

/**
 * @param {number} innerWidth - `window.innerWidth` (or test override)
 * @returns {number} max visible priority cards for this viewport
 */
export function getDashboardAttentionLimit(innerWidth) {
  const w = typeof innerWidth === 'number' && Number.isFinite(innerWidth) ? innerWidth : 1280;
  if (w >= DASHBOARD_ATTENTION_BREAKPOINT_DESKTOP) return 6;
  if (w >= DASHBOARD_ATTENTION_BREAKPOINT_TABLET) return 4;
  return 3;
}
