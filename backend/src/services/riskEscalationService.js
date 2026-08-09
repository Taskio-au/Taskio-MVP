'use strict';

const { FACTOR_CODES } = require('../config/riskConfig');
const { PAYMENT_FAILED_STALE_HOURS } = require('../config/riskConfig');
const { safeToMillis } = require('../utils/firestore');
const { logTrustAutomationEvent } = require('./trustAutomationAuditService');

/**
 * Map job risk outcome to suggested escalation tier for ops (not identical to support ticket enum).
 */
function recommendJobEscalation(job, scoreResult) {
  const codes = [];
  let tier = 'none';
  if (!job || !scoreResult) return { tier, codes, apply: false };

  const ps = String(job.paymentState || '').toLowerCase();
  const factors = new Set((scoreResult.factors || []).map((f) => f.code));

  if (ps === 'refund_failed' || factors.has(FACTOR_CODES.REFUND_FAILED)) {
    return { tier: 'super_admin', codes: ['REFUND_FAILED'], apply: true };
  }

  if (factors.has(FACTOR_CODES.DISPUTE_STALE_24H)) {
    return { tier: 'super_admin', codes: ['DISPUTE_STALE_24H'], apply: true };
  }

  if (ps === 'payment_failed') {
    const failMs = safeToMillis(job.paymentUpdatedAt) || safeToMillis(job.updatedAt);
    const now = Date.now();
    if (failMs && now - failMs >= PAYMENT_FAILED_STALE_HOURS * 60 * 60 * 1000) {
      codes.push('PAYMENT_FAILED_STALE');
      return { tier: 'ops', codes, apply: true };
    }
  }

  if (scoreResult.score >= 75) {
    return { tier: 'ops', codes: ['SCORE_CRITICAL'], apply: true };
  }

  return { tier, codes: [], apply: false };
}

function recommendSupportEscalation(ticket, ctx = {}) {
  if (ctx.repeatUserTicketCount >= 3) {
    return { escalationStatus: 'priority', codes: ['REPEAT_TICKETS_SAME_USER'], apply: true };
  }
  return { escalationStatus: null, codes: [], apply: false };
}

function recommendProfileEscalation(scoreResult, mismatchCodes = []) {
  const trust = (mismatchCodes || []).length > 0 || (scoreResult?.factors || []).some((f) =>
    String(f.code).includes('PROFILE') || String(f.code).includes('ABN'));
  const high = scoreResult && scoreResult.score >= 60;
  if (trust && (mismatchCodes.includes('ABN_NAME_MISMATCH') || mismatchCodes.includes('ABN_CHANGED'))) {
    return { escalationStatus: 'ops', codes: mismatchCodes, apply: true };
  }
  if (high) {
    return { escalationStatus: 'priority', codes: ['PROFILE_RISK_SCORE'], apply: true };
  }
  return { escalationStatus: null, codes: [], apply: false };
}

/**
 * Apply automatic escalation to job when no manual override.
 */
async function applyJobEscalation(db, admin, jobRef, job, recommendation) {
  if (!recommendation.apply || !recommendation.tier || recommendation.tier === 'none') return { applied: false };

  const existing = job.riskEscalation || {};
  if (existing.source === 'manual') {
    await logTrustAutomationEvent({
      type: 'AUTO_ESCALATION_RECOMMENDED',
      entityType: 'job',
      entityId: job.id || jobRef.id,
      reasonCodes: recommendation.codes,
      payload: { tier: recommendation.tier, skippedDueTo: 'manual_override' },
    });
    return { applied: false, skipped: 'manual' };
  }

  const update = {
    riskEscalation: {
      status: recommendation.tier,
      source: 'automatic',
      reasonCodes: recommendation.codes,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    },
    requiresAdminAttention: true,
  };

  await jobRef.set(update, { merge: true });

  await logTrustAutomationEvent({
    type: 'AUTO_ESCALATION_APPLIED',
    entityType: 'job',
    entityId: job.id || jobRef.id,
    reasonCodes: recommendation.codes,
    payload: { tier: recommendation.tier },
  });

  return { applied: true };
}

/**
 * Support ticket: set escalation only if not manual.
 */
async function applySupportTicketEscalation(db, admin, ticketRef, ticket, recommendation) {
  if (!recommendation.apply || !recommendation.escalationStatus) return { applied: false };

  const src = String(ticket.escalationSource || '').toLowerCase();
  if (src === 'manual') {
    await logTrustAutomationEvent({
      type: 'AUTO_ESCALATION_RECOMMENDED',
      entityType: 'support_ticket',
      entityId: ticketRef.id,
      reasonCodes: recommendation.codes || recommendation.reasonCodes || [],
      payload: { escalationStatus: recommendation.escalationStatus, skippedDueTo: 'manual_override' },
    });
    return { applied: false, skipped: 'manual' };
  }

  const reasonCodes = recommendation.codes || recommendation.reasonCodes || [];
  await ticketRef.set(
    {
      escalationStatus: recommendation.escalationStatus,
      escalationSource: 'automatic',
      escalationReasonCodes: reasonCodes,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    },
    { merge: true }
  );

  await logTrustAutomationEvent({
    type: 'AUTO_ESCALATION_APPLIED',
    entityType: 'support_ticket',
    entityId: ticketRef.id,
      reasonCodes,
      payload: { escalationStatus: recommendation.escalationStatus },
    });

  return { applied: true };
}

module.exports = {
  recommendJobEscalation,
  recommendSupportEscalation,
  recommendProfileEscalation,
  applyJobEscalation,
  applySupportTicketEscalation,
};
