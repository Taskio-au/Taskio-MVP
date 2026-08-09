/**
 * Task title for Expert payment UI.
 * Canonical strings come from GET /api/tradie/payment-activity `displayTaskTitle`
 * (built in shared/paymentDisplayTaskTitle.js from phase1ExpertiseCatalog expertLabel values).
 * Prefer this over legacy `title` when present.
 */
export function getReleasedDisplayTitle(row) {
  if (!row || typeof row !== 'object') return 'Task';
  const display = typeof row.displayTaskTitle === 'string' ? row.displayTaskTitle.trim() : '';
  if (display) return display;
  const legacy = typeof row.title === 'string' ? row.title.trim() : '';
  return legacy || 'Task';
}
