'use strict';

const { admin, db } = require('../firebaseAdmin');
const { computeJobRisk, computeProfileRequestRisk, computeSupportTicketRisk } = require('./riskScoringService');
const {
  recommendJobEscalation,
  recommendSupportEscalation,
  recommendProfileEscalation,
  applyJobEscalation,
  applySupportTicketEscalation,
} = require('./riskEscalationService');
const { persistJobSnapshot, persistProfileRequestSnapshot, persistSupportTicketSnapshot } = require('./riskSnapshotService');
const { logTrustAutomationEvent } = require('./trustAutomationAuditService');
const { collectMismatchCodes } = require('./profileTrustMismatchService');
const { MONITORING_SCORE_MIN } = require('../config/riskConfig');
const {
  syncFromJobEvaluation,
  syncFromProfileEvaluation,
  syncFromSupportEvaluation,
} = require('./workflowAutomationBridge');

/**
 * Full job evaluation: snapshot + optional auto-escalation + audit.
 */
async function evaluateJobRiskById(jobId) {
  const id = String(jobId || '').trim();
  if (!id) return null;

  const jobRef = db.collection('jobs').doc(id);
  const snap = await jobRef.get();
  if (!snap.exists) return null;

  const job = { id: snap.id, ...snap.data() };
  const nowMs = Date.now();
  const scoreResult = computeJobRisk(job, { nowMs });

  await persistJobSnapshot(id, scoreResult);

  const rec = recommendJobEscalation(job, scoreResult);
  await applyJobEscalation(db, admin, jobRef, job, rec);

  const monitoringEligible = scoreResult.score >= MONITORING_SCORE_MIN || rec.tier === 'super_admin';
  if (monitoringEligible) {
    await jobRef.set(
      {
        requiresAdminAttention: true,
        riskMonitoringEligible: true,
      },
      { merge: true }
    );
  }

  await logTrustAutomationEvent({
    type: 'AUTO_RISK_EVALUATED',
    entityType: 'job',
    entityId: id,
    actor: 'system',
    reasonCodes: (scoreResult.factors || []).map((f) => f.code),
    payload: {
      score: scoreResult.score,
      level: scoreResult.level,
      escalationTier: rec.tier,
    },
  });

  try {
    await syncFromJobEvaluation(id, job, scoreResult);
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error('syncFromJobEvaluation failed:', e);
  }

  return scoreResult;
}

async function evaluateProfileRequestRiskById(requestId) {
  const id = String(requestId || '').trim();
  if (!id) return null;

  const ref = db.collection('profile_change_requests').doc(id);
  const snap = await ref.get();
  if (!snap.exists) return null;

  const r = snap.data() || {};
  const uid = String(r.uid || '');
  let user = {};
  if (uid) {
    const uSnap = await db.collection('users').doc(uid).get();
    if (uSnap.exists) user = uSnap.data() || {};
  }

  const mismatchCodes = collectMismatchCodes(user, { ...r, id });
  const scoreResult = computeProfileRequestRisk(r, user, mismatchCodes);

  const escRec = recommendProfileEscalation(scoreResult, mismatchCodes);
  const escalationRecommendation = escRec.apply
    ? { status: escRec.escalationStatus, reasonCodes: escRec.codes, source: 'recommended' }
    : null;

  await persistProfileRequestSnapshot(id, scoreResult, {
    mismatchCodes,
    escalationRecommendation,
  });

  for (const code of mismatchCodes) {
    await logTrustAutomationEvent({
      type: 'PROFILE_TRUST_MISMATCH_DETECTED',
      entityType: 'profile_request',
      entityId: id,
      actor: 'system',
      reasonCodes: [code],
      payload: { field: r.field },
    });
  }

  await logTrustAutomationEvent({
    type: 'AUTO_RISK_EVALUATED',
    entityType: 'profile_request',
    entityId: id,
    actor: 'system',
    reasonCodes: (scoreResult.factors || []).map((f) => f.code),
    payload: { score: scoreResult.score, level: scoreResult.level, mismatchCodes },
  });

  try {
    await syncFromProfileEvaluation(id, scoreResult, mismatchCodes);
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error('syncFromProfileEvaluation failed:', e);
  }

  return scoreResult;
}

async function evaluateSupportTicketRiskById(ticketId) {
  const id = String(ticketId || '').trim();
  if (!id) return null;

  const ref = db.collection('supportTickets').doc(id);
  const snap = await ref.get();
  if (!snap.exists) return null;

  const ticket = { id: snap.id, ...snap.data() };

  let repeatTicketCount = 0;
  const uid = String(ticket.userUid || '');
  if (uid) {
    const since = new Date(Date.now() - 72 * 60 * 60 * 1000);
    const q = await db
      .collection('supportTickets')
      .where('userUid', '==', uid)
      .limit(20)
      .get();
    repeatTicketCount = q.docs.filter((d) => {
      const c = d.data()?.createdAt;
      const ms = c?.toMillis ? c.toMillis() : (c?._seconds ? c._seconds * 1000 : 0);
      return ms >= since.getTime();
    }).length;
  }

  const scoreResult = computeSupportTicketRisk(ticket, { repeatTicketCount });
  await persistSupportTicketSnapshot(id, scoreResult);

  const rec = recommendSupportEscalation(ticket, { repeatUserTicketCount: repeatTicketCount });
  await applySupportTicketEscalation(db, admin, ref, ticket, rec);

  await logTrustAutomationEvent({
    type: 'AUTO_RISK_EVALUATED',
    entityType: 'support_ticket',
    entityId: id,
    actor: 'system',
    reasonCodes: (scoreResult.factors || []).map((f) => f.code),
    payload: { score: scoreResult.score, level: scoreResult.level },
  });

  try {
    await syncFromSupportEvaluation(id, ticket, scoreResult);
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error('syncFromSupportEvaluation failed:', e);
  }

  return scoreResult;
}

module.exports = {
  evaluateJobRiskById,
  evaluateProfileRequestRiskById,
  evaluateSupportTicketRiskById,
};
