const { admin, db } = require('../firebaseAdmin');

async function writeUserAuditLog({ uid, actorUid, action, before, after, req }) {
  // Do NOT store raw PII in audit logs if avoidable. Keep before/after minimal.
  return db.collection('user_audit_logs').add({
    uid: uid || null,
    actorUid: actorUid || null,
    action: String(action || '').slice(0, 120),
    before: before || null,
    after: after || null,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    ip: req?.ip || null,
    userAgent: req?.headers?.['user-agent'] || null,
    path: req?.originalUrl || null,
  });
}

module.exports = { writeUserAuditLog };











