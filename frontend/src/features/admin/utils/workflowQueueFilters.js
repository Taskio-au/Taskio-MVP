/**
 * Client-side mirror of backend listFilteredWorkItems for job queue UX (single fetch).
 */

export function workItemMatchesQueueFilters(workItem, filters, currentUid) {
  const w = workItem || {};
  const uid = String(currentUid || '').trim();
  const owner = String(filters?.owner || '').trim();
  const sla = String(filters?.sla || '').trim();
  const priority = String(filters?.priority || '').trim();
  const followup = String(filters?.followup || '').trim();

  if (owner === 'me' && w.assignedTo !== uid) return false;
  if (owner === 'unassigned' && w.assignedTo) return false;

  if (sla === 'overdue') {
    if (String(w.slaState) !== 'overdue' || String(w.status) === 'resolved') return false;
  }
  if (sla === 'due_soon') {
    if (String(w.slaState) !== 'due_soon') return false;
  }

  if (priority === 'high') {
    const p = String(w.priority || '').toLowerCase();
    if (p !== 'high' && p !== 'critical') return false;
  }
  if (priority === 'critical') {
    if (String(w.priority || '').toLowerCase() !== 'critical') return false;
  }

  if (followup === 'due') {
    const fu = w.followUpAtMs != null ? Number(w.followUpAtMs) : 0;
    if (!fu) return false;
    const d = new Date();
    const sod = new Date(d);
    sod.setHours(0, 0, 0, 0);
    const eod = new Date(d);
    eod.setHours(23, 59, 59, 999);
    if (fu < sod.getTime() || fu > eod.getTime()) return false;
  }

  return true;
}

export function jobIdsMatchingWorkflowFilters(allItems, filters, currentUid) {
  const ids = new Set();
  const arr = Array.isArray(allItems) ? allItems : [];
  for (const w of arr) {
    if (workItemMatchesQueueFilters(w, filters, currentUid)) {
      const jid = String(w.entityId || '').trim();
      if (jid) ids.add(jid);
    }
  }
  return ids;
}
