'use strict';

const { admin, db } = require('../firebaseAdmin');

const VALID = new Set([
  'WORK_ITEM_CREATED',
  'WORK_ITEM_UPDATED',
  'WORK_ASSIGNED',
  'WORK_REASSIGNED',
  'WORK_UNASSIGNED',
  'WORK_STATUS_CHANGED',
  'WORK_SNOOZED',
  'WORK_OVERDUE',
  'WORK_RESOLVED',
  'WORK_REOPENED',
  'WORK_REMINDER_DUE',
  'BULK_ACTION_STARTED',
  'BULK_ACTION_COMPLETED',
  'WORK_ITEM_BULK_UPDATED',
  'WORK_REASSIGNED_WITH_NOTE',
  'WORK_HANDOFF_NOTE_ADDED',
  'FILTERED_QUEUE_OPENED',
]);

function computeEntityKey(entityType, entityId) {
  const a = String(entityType || '').trim();
  const b = String(entityId || '').trim();
  if (!a || !b) return '';
  return `${a}:${b}`.slice(0, 1500);
}

async function logWorkflowEvent({
  type,
  actor,
  entityType,
  entityId,
  workItemId,
  reasonCodes = [],
  payload = null,
}) {
  const t = String(type || '').trim();
  if (!VALID.has(t)) return null;
  const et = String(entityType || '').trim();
  const eid = String(entityId || '').trim();
  const entityKey = computeEntityKey(et, eid);
  const ref = db.collection('admin_workflow_events').doc();
  await ref.set({
    type: t,
    actor: actor === 'system' ? 'system' : String(actor || 'system'),
    entityType: et,
    entityId: eid,
    entityKey,
    workItemId: String(workItemId || ''),
    reasonCodes: Array.isArray(reasonCodes) ? reasonCodes.slice(0, 24) : [],
    payload: payload && typeof payload === 'object' ? payload : null,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    createdAtMs: Date.now(),
  });
  return ref.id;
}

module.exports = { logWorkflowEvent, VALID, computeEntityKey };
