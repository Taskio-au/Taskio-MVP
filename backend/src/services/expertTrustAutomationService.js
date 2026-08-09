'use strict';

const { computeProfileCompleted, computeStripeOnboardingComplete } = require('../utils/v11TradieEligibility');
const { logTrustAutomationEvent } = require('./trustAutomationAuditService');
const { computeExpertUserRisk } = require('./riskScoringService');

/**
 * Automated expert trust bucket (does not auto-verify).
 * @typedef {'VERIFIED'|'PENDING_REVIEW'|'REQUIRES_ATTENTION'|'RESTRICTED'|'INCOMPLETE'} AutomatedTrustState
 */

/**
 * @param {object} userData - users/{uid}
 * @param {object} [ctx] - { cancellationCount30d, openEscalations }
 */
function evaluateExpertAutomationState(userData, ctx = {}) {
  const u = userData || {};
  if (String(u.role || '') !== 'tradie') {
    return { state: 'INCOMPLETE', reasonCodes: ['NOT_TRADIE'], shouldRestrict: false };
  }

  const reasonCodes = [];
  const profOk = computeProfileCompleted(u);
  const stripeOk = computeStripeOnboardingComplete(u);
  const abnOk = u.abnVerified === true;

  if (u.status === 'disabled') {
    return { state: 'RESTRICTED', reasonCodes: ['ACCOUNT_DISABLED'], shouldRestrict: true };
  }

  if (Number(ctx.cancellationCount30d || 0) >= 5) {
    reasonCodes.push('HIGH_CANCELLATION_RATE');
  }
  if (Number(ctx.openEscalations || 0) >= 2) {
    reasonCodes.push('OPEN_ESCALATIONS');
  }

  if (u.verificationReviewRequired === true || u.verificationStatus === 'pending') {
    return { state: 'PENDING_REVIEW', reasonCodes: ['VERIFICATION_PENDING'], shouldRestrict: false };
  }

  if (!profOk || !stripeOk || !abnOk) {
    return { state: 'INCOMPLETE', reasonCodes: ['TRUST_INPUTS_INCOMPLETE'], shouldRestrict: false };
  }

  if (reasonCodes.length >= 2) {
    return { state: 'REQUIRES_ATTENTION', reasonCodes, shouldRestrict: false };
  }

  if (u.verified === true && profOk && stripeOk && abnOk) {
    return { state: 'VERIFIED', reasonCodes: [], shouldRestrict: false };
  }

  return { state: 'REQUIRES_ATTENTION', reasonCodes: ['REVIEW_REQUIRED'], shouldRestrict: false };
}

/**
 * Persist snapshot + audit when state changes vs previous snapshot.
 */
async function persistExpertAutomationSnapshot(uid, userData, ctx = {}) {
  const id = String(uid || '').trim();
  if (!id) return null;

  const next = evaluateExpertAutomationState(userData, ctx);
  const { admin, db } = require('../firebaseAdmin');
  const ref = db.collection('userRiskSnapshots').doc(id);
  const prevSnap = await ref.get();
  const prev = prevSnap.exists ? prevSnap.data() : null;
  const prevState = prev?.automatedTrustState || null;

  const riskScore = await computeExpertUserRisk(userData, {
    uid: id,
    nowMs: Date.now(),
    cancellationCount30d: ctx.cancellationCount30d,
  });

  await ref.set(
    {
      entityType: 'user',
      entityId: id,
      score: riskScore.score,
      level: riskScore.level,
      topFactors: riskScore.topFactors || [],
      automatedTrustState: next.state,
      automatedTrustReasonCodes: next.reasonCodes,
      lastEvaluatedAt: admin.firestore.FieldValue.serverTimestamp(),
      lastEvaluatedAtMs: Date.now(),
    },
    { merge: true }
  );

  if (prevState !== next.state) {
    await logTrustAutomationEvent({
      type: 'EXPERT_TRUST_STATUS_CHANGED',
      entityType: 'user',
      entityId: id,
      actor: 'system',
      reasonCodes: [`${String(prevState || 'none')}→${String(next.state)}`, ...next.reasonCodes],
      payload: { previous: prevState || null, next: next.state },
    });
  }

  return next;
}

module.exports = {
  evaluateExpertAutomationState,
  persistExpertAutomationSnapshot,
};
