'use strict';

const { JOB_STATUSES, normalizeStatus } = require('../constants/jobStatuses');
const { safeToMillis } = require('../utils/firestore');
const { upsertWorkItemFromAutomation } = require('./adminWorkItemService');
const { evaluateExpertAutomationState } = require('./expertTrustAutomationService');

async function syncFromJobEvaluation(jobId, job, scoreResult) {
  const id = String(jobId || '').trim();
  if (!id || !job) return;

  const ps = String(job.paymentState || '').toLowerCase();
  const st = normalizeStatus(job.status);

  if (ps === 'refund_failed' || ps === 'payment_failed') {
    await upsertWorkItemFromAutomation({
      entityType: 'job',
      entityId: id,
      category: 'payment',
      priority: ps === 'refund_failed' ? 'critical' : 'high',
      source: 'automation',
      sourceReasonCodes: [ps === 'refund_failed' ? 'REFUND_FAILED' : 'PAYMENT_FAILED'],
      linkedRiskLevel: scoreResult?.level,
      linkedRiskScore: scoreResult?.score,
      context: { paymentUpdatedAt: safeToMillis(job.paymentUpdatedAt) },
    });
  }

  if (st === JOB_STATUSES.DISPUTED) {
    const disputedAt = safeToMillis(job.disputedAt);
    const now = Date.now();
    const stale = disputedAt && now - disputedAt >= 24 * 60 * 60 * 1000;
    await upsertWorkItemFromAutomation({
      entityType: 'job',
      entityId: id,
      category: 'dispute',
      priority: stale ? 'critical' : 'high',
      source: 'automation',
      sourceReasonCodes: stale ? ['DISPUTE_STALE_24H'] : ['DISPUTE_OPEN'],
      linkedRiskLevel: scoreResult?.level,
      linkedRiskScore: scoreResult?.score,
      context: { disputeOverdue: stale, disputeStaleHours: stale ? 24 : 0 },
    });
  }

  if (scoreResult && ['high', 'critical'].includes(String(scoreResult.level || '').toLowerCase())) {
    await upsertWorkItemFromAutomation({
      entityType: 'job',
      entityId: id,
      category: 'risk',
      priority: scoreResult.level === 'critical' ? 'critical' : 'high',
      source: 'automation',
      sourceReasonCodes: (scoreResult.factors || []).slice(0, 5).map((f) => f.code),
      linkedRiskLevel: scoreResult.level,
      linkedRiskScore: scoreResult.score,
      context: {},
    });
  }
}

async function syncFromProfileEvaluation(requestId, scoreResult, mismatchCodes) {
  const id = String(requestId || '').trim();
  if (!id) return;

  const hasTrust = (mismatchCodes || []).length > 0 || (scoreResult?.factors || []).some((f) =>
    String(f.code || '').includes('PROFILE') || String(f.code || '').includes('ABN'));

  if (hasTrust || (scoreResult && scoreResult.score >= 40)) {
    await upsertWorkItemFromAutomation({
      entityType: 'profile_request',
      entityId: id,
      category: (mismatchCodes || []).length ? 'trust' : 'verification',
      priority: (mismatchCodes || []).length ? 'high' : 'medium',
      source: 'automation',
      sourceReasonCodes: (mismatchCodes || []).slice(0, 12),
      linkedRiskLevel: scoreResult?.level,
      linkedRiskScore: scoreResult?.score,
      context: {},
    });
  }
}

async function syncFromSupportEvaluation(ticketId, ticket, scoreResult) {
  const id = String(ticketId || '').trim();
  if (!id || !ticket) return;

  const esc = String(ticket.escalationStatus || 'normal').toLowerCase();
  if (esc === 'priority' || esc === 'ops' || esc === 'super_admin') {
    await upsertWorkItemFromAutomation({
      entityType: 'support_ticket',
      entityId: id,
      category: 'support',
      priority: esc === 'super_admin' ? 'critical' : 'high',
      source: 'automation',
      sourceReasonCodes: ['SUPPORT_ESCALATED', esc],
      linkedRiskLevel: scoreResult?.level,
      linkedRiskScore: scoreResult?.score,
      context: { escalationStatus: esc },
    });
  }
}

async function syncExpertTrustIfNeeded(uid, userData) {
  const id = String(uid || '').trim();
  if (!id || !userData) return;
  const ev = evaluateExpertAutomationState(userData, {});
  if (ev.state === 'REQUIRES_ATTENTION' || ev.state === 'RESTRICTED') {
    await upsertWorkItemFromAutomation({
      entityType: 'expert',
      entityId: id,
      category: 'verification',
      priority: ev.state === 'RESTRICTED' ? 'critical' : 'high',
      source: 'automation',
      sourceReasonCodes: ev.reasonCodes || [],
      context: { expertTrustReview: true },
    });
  }
}

module.exports = {
  syncFromJobEvaluation,
  syncFromProfileEvaluation,
  syncFromSupportEvaluation,
  syncExpertTrustIfNeeded,
};
