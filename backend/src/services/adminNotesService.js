'use strict';

const { admin, db } = require('../firebaseAdmin');
const { sanitizePlainText } = require('../routes/admin/shared/text');

const VALID_ENTITY = new Set(['job', 'support_ticket', 'profile_request', 'expert']);
const VALID_NOTE_TYPE = new Set(['general', 'risk', 'payment', 'verification']);

function entityKey(entityType, entityId) {
  return `${String(entityType)}:${String(entityId)}`.slice(0, 1500);
}

/**
 * @param {string} entityType
 * @param {string} entityId
 * @param {number} [limitN]
 */
async function listAdminNotes(entityType, entityId, limitN = 50) {
  const et = String(entityType || '').trim();
  const eid = String(entityId || '').trim();
  if (!VALID_ENTITY.has(et) || !eid) return [];

  const key = entityKey(et, eid);
  const snap = await db
    .collection('admin_notes')
    .where('entityKey', '==', key)
    .limit(Math.min(Math.max(Number(limitN) || 50, 1), 100))
    .get();

  const rows = snap.docs.map((d) => {
    const x = d.data() || {};
    return {
      id: d.id,
      entityType: x.entityType || et,
      entityId: x.entityId || eid,
      note: x.note || '',
      createdBy: x.createdBy || '',
      createdAtMs: x.createdAt?._seconds != null ? x.createdAt._seconds * 1000 : (x.createdAtMs || 0),
      noteType: x.noteType || 'general',
    };
  });
  rows.sort((a, b) => (b.createdAtMs || 0) - (a.createdAtMs || 0));
  return rows;
}

/**
 * @param {{ entityType: string, entityId: string, note: string, createdBy: string, noteType?: string }} p
 */
async function addAdminNote(p) {
  const entityType = String(p.entityType || '').trim();
  const entityId = String(p.entityId || '').trim();
  if (!VALID_ENTITY.has(entityType) || !entityId) {
    const err = new Error('invalid_entity');
    err.code = 'invalid_entity';
    throw err;
  }
  const note = sanitizePlainText(p.note, 8000);
  if (!note || note.length < 1) {
    const err = new Error('empty_note');
    err.code = 'empty_note';
    throw err;
  }
  let noteType = String(p.noteType || 'general').trim();
  if (!VALID_NOTE_TYPE.has(noteType)) noteType = 'general';

  const ref = db.collection('admin_notes').doc();
  await ref.set({
    entityKey: entityKey(entityType, entityId),
    entityType,
    entityId,
    note,
    noteType,
    createdBy: String(p.createdBy || ''),
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
  });

  return { id: ref.id };
}

module.exports = {
  listAdminNotes,
  addAdminNote,
  VALID_ENTITY,
  VALID_NOTE_TYPE,
};
