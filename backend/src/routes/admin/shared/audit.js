'use strict';

const { admin, db } = require('../../../firebaseAdmin');

async function logAdminJobAction({ req, jobId, action, metadata }) {
  await db.collection('admin_audit_logs').add({
    adminId: req.user.uid,
    targetUserId: null,
    jobId,
    action,
    path: req.originalUrl,
    ip: req.ip,
    userAgent: req.headers['user-agent'] || null,
    metadata: metadata || null,
    timestamp: admin.firestore.FieldValue.serverTimestamp(),
  });
}

async function logJobEvent({ jobId, actorId, actorRole, action, metadata }) {
  await db.collection('job_events').add({
    jobId,
    actorId,
    actorRole,
    action,
    metadata: metadata || null,
    timestamp: admin.firestore.FieldValue.serverTimestamp(),
  });
}

module.exports = {
  logAdminJobAction,
  logJobEvent,
};
