'use strict';

const crypto = require('crypto');
const { admin, db } = require('../firebaseAdmin');
const { safeToMillis } = require('../utils/firestore');
const { computeDueAtMs, computeSlaState } = require('./workflowSlaService');
const { logWorkflowEvent } = require('./workflowAuditService');
const { addAdminNote } = require('./adminNotesService');
const { MAX_SNOOZE_HOURS_CRITICAL } = require('../config/workflowSlaConfig');

function stableWorkItemId(entityType, entityId, category) {
  const raw = `${String(entityType)}|${String(entityId)}|${String(category)}`;
  const h = crypto.createHash('sha256').update(raw).digest('hex');
  return `wi_${h.slice(0, 32)}`;
}

const ACTIVE = new Set(['open', 'in_progress', 'waiting', 'snoozed']);

function priorityRank(p) {
  const x = String(p || '').toLowerCase();
  if (x === 'critical') return 4;
  if (x === 'high') return 3;
  if (x === 'medium') return 2;
  return 1;
}

function mergePriority(existing, incoming) {
  return priorityRank(incoming) > priorityRank(existing) ? incoming : existing;
}

/**
 * Upsert a work item from automation — idempotent per entity+category.
 */
async function upsertWorkItemFromAutomation({
  entityType,
  entityId,
  category,
  priority = 'medium',
  source = 'automation',
  sourceReasonCodes = [],
  linkedRiskLevel = null,
  linkedRiskScore = null,
  context = {},
  nowMs = Date.now(),
}) {
  const et = String(entityType || '').trim();
  const eid = String(entityId || '').trim();
  const cat = String(category || '').trim();
  if (!et || !eid || !cat) return null;

  const id = stableWorkItemId(et, eid, cat);
  const ref = db.collection('admin_work_items').doc(id);
  const snap = await ref.get();
  const prev = snap.exists ? snap.data() : null;

  const createdAtMs = prev ? safeToMillis(prev.createdAt) || nowMs : nowMs;
  const dueAtMs = computeDueAtMs({
    category: cat,
    createdAtMs,
    nowMs,
    context,
  });

  const sla = computeSlaState({
    dueAtMs,
    snoozedUntilMs: prev?.snoozedUntilMs,
    nowMs,
    status: prev?.status || 'open',
    category: cat,
  });

  const next = {
    id,
    entityType: et,
    entityId: eid,
    category: cat,
    priority: prev ? mergePriority(prev.priority, priority) : priority,
    status: prev && ACTIVE.has(String(prev.status)) ? prev.status : 'open',
    assignedTo: prev?.assignedTo ?? null,
    assignedToName: prev?.assignedToName ?? null,
    createdAt: prev?.createdAt || admin.firestore.FieldValue.serverTimestamp(),
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    dueAt: admin.firestore.Timestamp.fromMillis(dueAtMs),
    dueAtMs,
    slaState: sla.slaState,
    timeRemainingLabel: sla.timeRemainingLabel,
    source,
    sourceReasonCodes: Array.isArray(sourceReasonCodes) ? sourceReasonCodes.slice(0, 24) : [],
    lastTouchedAt: prev?.lastTouchedAt || admin.firestore.FieldValue.serverTimestamp(),
    lastTouchedBy: prev?.lastTouchedBy || 'system',
    resolutionSummary: prev?.resolutionSummary || null,
    snoozedUntil: prev?.snoozedUntil || null,
    snoozedUntilMs: prev?.snoozedUntilMs || null,
    followUpAt: prev?.followUpAt || null,
    followUpAtMs: prev?.followUpAtMs || null,
    reminderState: prev?.reminderState || 'none',
    reminderCount: prev?.reminderCount || 0,
    linkedRiskLevel: linkedRiskLevel != null ? linkedRiskLevel : prev?.linkedRiskLevel ?? null,
    linkedRiskScore: linkedRiskScore != null ? linkedRiskScore : prev?.linkedRiskScore ?? null,
  };

  if (prev && String(prev.status) === 'resolved') {
    return { id, skipped: true, reason: 'already_resolved' };
  }

  await ref.set(next, { merge: false });

  await logWorkflowEvent({
    type: prev ? 'WORK_ITEM_UPDATED' : 'WORK_ITEM_CREATED',
    actor: 'system',
    entityType: et,
    entityId: eid,
    workItemId: id,
    reasonCodes: sourceReasonCodes,
    payload: { category: cat, slaState: sla.slaState },
  });

  return { id, workItem: next };
}

const KNOWN_CATEGORIES = ['payment', 'dispute', 'risk', 'trust', 'support', 'verification'];

async function getWorkItemsForEntity(entityType, entityId) {
  const et = String(entityType || '').trim();
  const eid = String(entityId || '').trim();
  if (!et || !eid) return [];

  const refs = KNOWN_CATEGORIES.map((cat) => db.collection('admin_work_items').doc(stableWorkItemId(et, eid, cat)));
  const snaps = await db.getAll(...refs);
  return snaps.filter((s) => s.exists).map((s) => ({ id: s.id, ...s.data() }));
}

async function getWorkItemById(workItemId) {
  const id = String(workItemId || '').trim();
  if (!id) return null;
  const snap = await db.collection('admin_work_items').doc(id).get();
  if (!snap.exists) return null;
  return { id: snap.id, ...snap.data() };
}

async function batchWorkItemsForJobs(jobIds) {
  const ids = Array.isArray(jobIds) ? jobIds.map((x) => String(x || '').trim()).filter(Boolean).slice(0, 40) : [];
  if (ids.length === 0) return {};

  const out = {};
  const refs = ids.map((jid) =>
    ['payment', 'dispute', 'risk'].map((cat) => db.collection('admin_work_items').doc(stableWorkItemId('job', jid, cat)))
  ).flat();
  const snaps = await db.getAll(...refs);
  snaps.forEach((snap) => {
    if (!snap.exists) return;
    const d = snap.data() || {};
    const jid = d.entityId;
    if (!jid) return;
    if (!out[jid]) out[jid] = [];
    out[jid].push({ id: snap.id, ...d });
  });
  return out;
}

async function refreshWorkItemSla(ref, data, nowMs) {
  const dueAtMs = data.dueAtMs != null ? Number(data.dueAtMs) : safeToMillis(data.dueAt);
  const snoozeMs = data.snoozedUntilMs != null ? Number(data.snoozedUntilMs) : safeToMillis(data.snoozedUntil);
  const sla = computeSlaState({
    dueAtMs,
    snoozedUntilMs: snoozeMs,
    nowMs,
    status: data.status,
    category: data.category,
  });
  const prevSla = String(data.slaState || '');
  const updates = {
    slaState: sla.slaState,
    timeRemainingLabel: sla.timeRemainingLabel,
    dueAtMs: dueAtMs || data.dueAtMs,
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  };
  if (
    sla.slaState === 'overdue'
    && prevSla !== 'overdue'
    && String(data.status) !== 'resolved'
  ) {
    await logWorkflowEvent({
      type: 'WORK_OVERDUE',
      actor: 'system',
      entityType: data.entityType,
      entityId: data.entityId,
      workItemId: ref.id,
      reasonCodes: [String(data.category || '')],
    });
  }
  await ref.set(updates, { merge: true });
}

async function assignWorkItem(workItemId, assigneeUid, assigneeName, actorUid, options = {}) {
  const ref = db.collection('admin_work_items').doc(workItemId);
  const snap = await ref.get();
  if (!snap.exists) return { ok: false, message: 'Work item not found.' };
  const prev = snap.data();
  const prevAssign = prev.assignedTo || null;
  const nextAssign = assigneeUid || null;
  const handoffNote = String(options.handoffNote || '').trim();
  const isReassign = Boolean(prevAssign && nextAssign && prevAssign !== nextAssign);
  const requiresHandoffNote =
    isReassign
    && (String(prev.slaState || '') === 'overdue' || String(prev.priority || '').toLowerCase() === 'critical');
  if (requiresHandoffNote && !handoffNote) {
    return { ok: false, message: 'Handoff note required when reassigning overdue or critical work.' };
  }

  await ref.set(
    {
      assignedTo: nextAssign,
      assignedToName: assigneeName || null,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      lastTouchedAt: admin.firestore.FieldValue.serverTimestamp(),
      lastTouchedBy: actorUid,
      status: prev.status === 'open' ? 'in_progress' : prev.status,
    },
    { merge: true }
  );

  const et = String(prev.entityType || '');
  const eid = String(prev.entityId || '');
  if (handoffNote) {
    try {
      await addAdminNote({
        entityType: et,
        entityId: eid,
        note: `Handoff: ${handoffNote}`.slice(0, 8000),
        createdBy: actorUid,
        noteType: 'general',
      });
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error('handoff admin note failed', e);
    }
    await logWorkflowEvent({
      type: 'WORK_HANDOFF_NOTE_ADDED',
      actor: actorUid,
      entityType: et,
      entityId: eid,
      workItemId,
      payload: { preview: handoffNote.slice(0, 240) },
    });
  }

  if (isReassign && handoffNote) {
    await logWorkflowEvent({
      type: 'WORK_REASSIGNED_WITH_NOTE',
      actor: actorUid,
      entityType: et,
      entityId: eid,
      workItemId,
      payload: { from: prevAssign, to: nextAssign, preview: handoffNote.slice(0, 240) },
    });
  } else if (isReassign) {
    await logWorkflowEvent({
      type: 'WORK_REASSIGNED',
      actor: actorUid,
      entityType: et,
      entityId: eid,
      workItemId,
      payload: { from: prevAssign, to: nextAssign },
    });
  } else {
    await logWorkflowEvent({
      type: 'WORK_ASSIGNED',
      actor: actorUid,
      entityType: et,
      entityId: eid,
      workItemId,
      payload: { from: prevAssign, to: nextAssign },
    });
  }

  return { ok: true };
}

async function unassignWorkItem(workItemId, actorUid) {
  const ref = db.collection('admin_work_items').doc(workItemId);
  const snap = await ref.get();
  if (!snap.exists) return { ok: false, message: 'Work item not found.' };
  const prev = snap.data();

  await ref.set(
    {
      assignedTo: null,
      assignedToName: null,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      lastTouchedAt: admin.firestore.FieldValue.serverTimestamp(),
      lastTouchedBy: actorUid,
    },
    { merge: true }
  );

  await logWorkflowEvent({
    type: 'WORK_UNASSIGNED',
    actor: actorUid,
    entityType: prev.entityType,
    entityId: prev.entityId,
    workItemId,
  });

  return { ok: true };
}

async function setWorkItemStatus(workItemId, status, actorUid, resolutionSummary) {
  const allowed = new Set(['open', 'in_progress', 'waiting', 'resolved', 'snoozed']);
  const s = String(status || '').trim();
  if (!allowed.has(s)) return { ok: false, message: 'Invalid status.' };

  const ref = db.collection('admin_work_items').doc(workItemId);
  const snap = await ref.get();
  if (!snap.exists) return { ok: false, message: 'Work item not found.' };
  const prev = snap.data();

  const update = {
    status: s,
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    lastTouchedAt: admin.firestore.FieldValue.serverTimestamp(),
    lastTouchedBy: actorUid,
  };
  if (s === 'resolved' && resolutionSummary) update.resolutionSummary = String(resolutionSummary).slice(0, 2000);

  await ref.set(update, { merge: true });

  await logWorkflowEvent({
    type: 'WORK_STATUS_CHANGED',
    actor: actorUid,
    entityType: prev.entityType,
    entityId: prev.entityId,
    workItemId,
    reasonCodes: [s],
    payload: { previous: prev.status },
  });

  if (s === 'resolved') {
    await logWorkflowEvent({
      type: 'WORK_RESOLVED',
      actor: actorUid,
      entityType: prev.entityType,
      entityId: prev.entityId,
      workItemId,
    });
  }

  return { ok: true };
}

async function snoozeWorkItem(workItemId, untilMs, actorUid, category) {
  const ref = db.collection('admin_work_items').doc(workItemId);
  const snap = await ref.get();
  if (!snap.exists) return { ok: false, message: 'Work item not found.' };
  const prev = snap.data();
  const cat = String(category || prev.category || '');
  const maxH = MAX_SNOOZE_HOURS_CRITICAL;
  const now = Date.now();
  let until = Number(untilMs) || now + 2 * 3600000;
  if (['payment', 'dispute'].includes(cat)) {
    until = Math.min(until, now + maxH * 3600000);
  }

  await ref.set(
    {
      status: 'snoozed',
      snoozedUntil: admin.firestore.Timestamp.fromMillis(until),
      snoozedUntilMs: until,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      lastTouchedAt: admin.firestore.FieldValue.serverTimestamp(),
      lastTouchedBy: actorUid,
    },
    { merge: true }
  );

  await logWorkflowEvent({
    type: 'WORK_SNOOZED',
    actor: actorUid,
    entityType: prev.entityType,
    entityId: prev.entityId,
    workItemId,
    payload: { untilMs: until },
  });

  return { ok: true };
}

async function setReminder(workItemId, followUpAtMs, actorUid) {
  const ref = db.collection('admin_work_items').doc(workItemId);
  const snap = await ref.get();
  if (!snap.exists) return { ok: false, message: 'Work item not found.' };
  const prev = snap.data();
  const t = Number(followUpAtMs) || Date.now() + 3600000;

  await ref.set(
    {
      followUpAt: admin.firestore.Timestamp.fromMillis(t),
      followUpAtMs: t,
      reminderState: 'scheduled',
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      lastTouchedAt: admin.firestore.FieldValue.serverTimestamp(),
      lastTouchedBy: actorUid,
    },
    { merge: true }
  );

  await logWorkflowEvent({
    type: 'WORK_ITEM_UPDATED',
    actor: actorUid,
    entityType: prev.entityType,
    entityId: prev.entityId,
    workItemId,
    reasonCodes: ['REMINDER_SET'],
  });

  return { ok: true };
}

const QUEUE_ENTITY_TYPES = new Set(['job', 'support_ticket', 'profile_request']);

async function listFilteredWorkItems(filters) {
  const et = String(filters.entityType || '').trim();
  if (!QUEUE_ENTITY_TYPES.has(et)) return [];
  const snap = await db.collection('admin_work_items').where('entityType', '==', et).limit(500).get();
  let rows = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  const uid = String(filters.currentUid || '').trim();
  const owner = String(filters.owner || '').trim();
  const sla = String(filters.sla || '').trim();
  const priority = String(filters.priority || '').trim();
  const status = String(filters.status || '').trim();
  const followup = String(filters.followup || '').trim();

  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);
  const endOfDay = new Date();
  endOfDay.setHours(23, 59, 59, 999);

  if (owner === 'me') rows = rows.filter((w) => w.assignedTo === uid);
  if (owner === 'unassigned') rows = rows.filter((w) => !w.assignedTo);
  if (sla === 'overdue') {
    rows = rows.filter((w) => String(w.slaState) === 'overdue' && String(w.status) !== 'resolved');
  }
  if (sla === 'due_soon') rows = rows.filter((w) => String(w.slaState) === 'due_soon');
  if (priority === 'high') {
    rows = rows.filter((w) => ['high', 'critical'].includes(String(w.priority || '').toLowerCase()));
  }
  if (priority === 'critical') {
    rows = rows.filter((w) => String(w.priority || '').toLowerCase() === 'critical');
  }
  if (followup === 'due') {
    rows = rows.filter((w) => {
      const fu = w.followUpAtMs != null ? Number(w.followUpAtMs) : safeToMillis(w.followUp);
      return fu >= startOfDay.getTime() && fu <= endOfDay.getTime();
    });
  }
  if (status && status !== 'all') rows = rows.filter((w) => String(w.status) === status);
  return rows;
}

async function getTeamLoad() {
  const col = db.collection('admin_work_items');
  const snap = await col.where('status', 'in', ['open', 'in_progress', 'waiting', 'snoozed']).limit(500).get();
  let unassignedHighPriority = 0;
  let overdueAssigned = 0;
  const byUid = {};
  snap.forEach((d) => {
    const w = d.data() || {};
    const pr = String(w.priority || '').toLowerCase();
    if (!w.assignedTo && ['high', 'critical'].includes(pr)) unassignedHighPriority += 1;
    if (w.assignedTo && String(w.slaState) === 'overdue') overdueAssigned += 1;
    const a = w.assignedTo ? String(w.assignedTo) : '';
    if (a) {
      if (!byUid[a]) byUid[a] = { uid: a, assignedOpenCount: 0, overdueCount: 0 };
      byUid[a].assignedOpenCount += 1;
      if (String(w.slaState) === 'overdue') byUid[a].overdueCount += 1;
    }
  });
  const admins = Object.values(byUid).sort((x, y) => y.assignedOpenCount - x.assignedOpenCount);
  return { unassignedHighPriority, overdueAssigned, admins };
}

async function getWorkflowActivityForEntity(entityType, entityId, limitN = 22) {
  const et = String(entityType || '').trim();
  const eid = String(entityId || '').trim();
  if (!et || !eid) return { items: [] };
  const key = `${et}:${eid}`.slice(0, 1500);
  const snap = await db.collection('admin_workflow_events').where('entityKey', '==', key).limit(80).get();
  const rows = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  rows.sort((a, b) => (b.createdAtMs || 0) - (a.createdAtMs || 0));
  return { items: rows.slice(0, Math.min(Math.max(Number(limitN) || 22, 1), 40)) };
}

function workItemAllowsBulkResolve(w) {
  if (String(w.status) === 'resolved') return false;
  const pr = String(w.priority || '').toLowerCase();
  if (pr === 'critical' || pr === 'high') return false;
  const cat = String(w.category || '').toLowerCase();
  if (cat === 'payment' || cat === 'dispute') return false;
  if (String(w.slaState) === 'overdue') return false;
  return true;
}

async function bulkUpdateWorkItems(itemIds, action, params, actorUid) {
  const ids = Array.isArray(itemIds) ? itemIds.map((x) => String(x || '').trim()).filter(Boolean).slice(0, 40) : [];
  const act = String(action || '').trim();
  const allowed = new Set(['assign_to_me', 'unassign', 'mark_waiting', 'snooze', 'resolve']);
  if (!allowed.has(act)) return { ok: false, message: 'Invalid bulk action.', results: [] };
  if (ids.length === 0) return { ok: false, message: 'No items selected.', results: [] };

  await logWorkflowEvent({
    type: 'BULK_ACTION_STARTED',
    actor: actorUid,
    entityType: 'bulk',
    entityId: act,
    workItemId: '',
    payload: { action: act, selectedCount: ids.length, itemIds: ids.slice(0, 40) },
  });

  const results = [];
  let okCount = 0;
  const uid = String(actorUid || '').trim();
  let actorName = null;
  const uSnap = await db.collection('users').doc(uid).get();
  if (uSnap.exists) {
    const ud = uSnap.data() || {};
    actorName = String(ud.displayName || ud.name || '').trim() || null;
  }

  const snoozeHours = Number(params?.snoozeHours);
  const presetHours = [2, 4, 24].includes(snoozeHours) ? snoozeHours : 4;

  for (const id of ids) {
    /* eslint-disable no-await-in-loop */
    try {
      if (act === 'assign_to_me') {
        const r = await assignWorkItem(id, uid, actorName, uid, {});
        results.push({ itemId: id, ok: r.ok, message: r.message || null });
        if (r.ok) okCount += 1;
      } else if (act === 'unassign') {
        const r = await unassignWorkItem(id, uid);
        results.push({ itemId: id, ok: r.ok, message: r.message || null });
        if (r.ok) okCount += 1;
      } else if (act === 'mark_waiting') {
        const r = await setWorkItemStatus(id, 'waiting', uid);
        results.push({ itemId: id, ok: r.ok, message: r.message || null });
        if (r.ok) okCount += 1;
      } else if (act === 'snooze') {
        const wi = await getWorkItemById(id);
        const r = await snoozeWorkItem(id, Date.now() + presetHours * 3600000, uid, wi?.category);
        results.push({ itemId: id, ok: r.ok, message: r.message || null });
        if (r.ok) okCount += 1;
      } else if (act === 'resolve') {
        const wi = await getWorkItemById(id);
        if (!wi) {
          results.push({ itemId: id, ok: false, message: 'Not found.' });
        } else if (!workItemAllowsBulkResolve(wi)) {
          results.push({ itemId: id, ok: false, message: 'Resolve not allowed for this item.' });
        } else {
          const r = await setWorkItemStatus(id, 'resolved', uid, params?.resolutionSummary);
          results.push({ itemId: id, ok: r.ok, message: r.message || null });
          if (r.ok) okCount += 1;
        }
      }
    } catch (e) {
      results.push({ itemId: id, ok: false, message: e?.message || 'error' });
    }
    /* eslint-enable no-await-in-loop */
  }

  await logWorkflowEvent({
    type: 'BULK_ACTION_COMPLETED',
    actor: actorUid,
    entityType: 'bulk',
    entityId: act,
    workItemId: '',
    payload: {
      action: act,
      selectedCount: ids.length,
      successCount: okCount,
      failCount: ids.length - okCount,
    },
  });

  await logWorkflowEvent({
    type: 'WORK_ITEM_BULK_UPDATED',
    actor: actorUid,
    entityType: 'bulk',
    entityId: act,
    workItemId: '',
    payload: { action: act, results: results.slice(0, 40) },
  });

  return { ok: true, results, successCount: okCount, failCount: ids.length - okCount };
}

async function getSummaryForAdmin(adminUid) {
  const uid = String(adminUid || '').trim();
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);
  const endOfDay = new Date();
  endOfDay.setHours(23, 59, 59, 999);

  const col = db.collection('admin_work_items');

  const mineSnap = await col.where('assignedTo', '==', uid).limit(200).get();
  const assignedToMe = mineSnap.docs.length;

  let overdue = 0;
  let unassignedHigh = 0;
  let followUpsDueToday = 0;
  let overdueUnassigned = 0;
  let assignedToMeOverdue = 0;

  const allForAgg = await col.where('status', 'in', ['open', 'in_progress', 'waiting', 'snoozed']).limit(500).get();

  allForAgg.forEach((d) => {
    const w = d.data() || {};
    if (!w.assignedTo && ['high', 'critical'].includes(String(w.priority || '').toLowerCase())) unassignedHigh += 1;
    if (String(w.slaState) === 'overdue' && String(w.status) !== 'resolved') overdue += 1;
    if (String(w.slaState) === 'overdue' && String(w.status) !== 'resolved' && !w.assignedTo) overdueUnassigned += 1;
    if (String(w.slaState) === 'overdue' && String(w.status) !== 'resolved' && w.assignedTo === uid) {
      assignedToMeOverdue += 1;
    }
    const fu = w.followUpAtMs != null ? Number(w.followUpAtMs) : safeToMillis(w.followUp);
    if (fu >= startOfDay.getTime() && fu <= endOfDay.getTime() && w.assignedTo === uid) followUpsDueToday += 1;
  });

  return {
    assignedToMe,
    overdue,
    unassignedHighPriority: unassignedHigh,
    followUpsDueToday,
    overdueUnassigned,
    assignedToMeOverdue,
  };
}

module.exports = {
  stableWorkItemId,
  upsertWorkItemFromAutomation,
  getWorkItemsForEntity,
  getWorkItemById,
  batchWorkItemsForJobs,
  refreshWorkItemSla,
  assignWorkItem,
  unassignWorkItem,
  setWorkItemStatus,
  snoozeWorkItem,
  setReminder,
  getSummaryForAdmin,
  listFilteredWorkItems,
  getTeamLoad,
  getWorkflowActivityForEntity,
  bulkUpdateWorkItems,
  workItemAllowsBulkResolve,
};
