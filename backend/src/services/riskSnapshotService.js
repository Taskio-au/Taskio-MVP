'use strict';

const { admin, db } = require('../firebaseAdmin');

async function persistJobSnapshot(jobId, scoreResult, extras = {}) {
  const id = String(jobId || '').trim();
  if (!id || !scoreResult) return null;

  const ref = db.collection('jobRiskSnapshots').doc(id);
  await ref.set(
    {
      entityType: 'job',
      entityId: id,
      score: scoreResult.score,
      level: scoreResult.level,
      topFactors: scoreResult.topFactors || [],
      factors: scoreResult.factors || [],
      lastEvaluatedAt: admin.firestore.FieldValue.serverTimestamp(),
      lastEvaluatedAtMs: Date.now(),
      ...extras,
    },
    { merge: true }
  );

  await db.collection('jobs').doc(id).set(
    {
      riskSummary: {
        score: scoreResult.score,
        level: scoreResult.level,
        topFactors: (scoreResult.topFactors || []).slice(0, 3),
        lastEvaluatedAtMs: Date.now(),
      },
    },
    { merge: true }
  );

  return ref.id;
}

async function persistProfileRequestSnapshot(requestId, scoreResult, extras = {}) {
  const id = String(requestId || '').trim();
  if (!id || !scoreResult) return null;

  const ref = db.collection('profileRequestRiskSnapshots').doc(id);
  await ref.set(
    {
      entityType: 'profile_request',
      entityId: id,
      score: scoreResult.score,
      level: scoreResult.level,
      topFactors: scoreResult.topFactors || [],
      factors: scoreResult.factors || [],
      lastEvaluatedAt: admin.firestore.FieldValue.serverTimestamp(),
      lastEvaluatedAtMs: Date.now(),
      ...extras,
    },
    { merge: true }
  );

  await db.collection('profile_change_requests').doc(id).set(
    {
      riskAutomation: {
        score: scoreResult.score,
        level: scoreResult.level,
        topFactors: (scoreResult.topFactors || []).slice(0, 3),
        lastEvaluatedAtMs: Date.now(),
        ...(extras.mismatchCodes ? { mismatchCodes: extras.mismatchCodes } : {}),
        ...(extras.escalationRecommendation ? { escalationRecommendation: extras.escalationRecommendation } : {}),
      },
    },
    { merge: true }
  );

  return ref.id;
}

async function persistSupportTicketSnapshot(ticketId, scoreResult) {
  const id = String(ticketId || '').trim();
  if (!id || !scoreResult) return null;

  const ref = db.collection('supportTicketRiskSnapshots').doc(id);
  await ref.set(
    {
      entityType: 'support_ticket',
      entityId: id,
      score: scoreResult.score,
      level: scoreResult.level,
      topFactors: scoreResult.topFactors || [],
      factors: scoreResult.factors || [],
      lastEvaluatedAt: admin.firestore.FieldValue.serverTimestamp(),
      lastEvaluatedAtMs: Date.now(),
    },
    { merge: true }
  );

  return ref.id;
}

module.exports = {
  persistJobSnapshot,
  persistProfileRequestSnapshot,
  persistSupportTicketSnapshot,
};
