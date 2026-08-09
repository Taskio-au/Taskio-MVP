'use strict';

const { admin, db } = require('../firebaseAdmin');

const VALID_TYPES = new Set([
  'AUTO_RISK_EVALUATED',
  'AUTO_ESCALATION_APPLIED',
  'AUTO_ESCALATION_RECOMMENDED',
  'EXPERT_TRUST_STATUS_CHANGED',
  'PROFILE_TRUST_MISMATCH_DETECTED',
  'OFF_PLATFORM_SIGNAL_DETECTED',
  'MANUAL_ESCALATION_OVERRIDE',
]);

/**
 * Append-only automation audit trail (actor = system for automation).
 */
async function logTrustAutomationEvent({
  type,
  entityType,
  entityId,
  actor = 'system',
  reasonCodes = [],
  payload = null,
}) {
  const t = String(type || '').trim();
  if (!VALID_TYPES.has(t)) return null;
  const et = String(entityType || '').trim();
  const eid = String(entityId || '').trim();
  if (!et || !eid) return null;

  const ref = db.collection('trust_automation_audit').doc();
  const now = admin.firestore.FieldValue.serverTimestamp();
  await ref.set({
    type: t,
    entityType: et,
    entityId: eid,
    actor: actor === 'system' ? 'system' : String(actor || 'system'),
    reasonCodes: Array.isArray(reasonCodes) ? reasonCodes.slice(0, 24) : [],
    payload: payload && typeof payload === 'object' ? payload : null,
    createdAt: now,
    createdAtMs: Date.now(),
  });
  return ref.id;
}

module.exports = { logTrustAutomationEvent, VALID_TYPES };
