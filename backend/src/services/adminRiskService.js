'use strict';

const { JOB_STATUSES, normalizeStatus } = require('../constants/jobStatuses');
const { safeToMillis } = require('../utils/firestore');

const RISK_TYPES = {
  PAYMENT_ISSUE: 'PAYMENT_ISSUE',
  DISPUTE_STALE: 'DISPUTE_STALE',
  FLAGGED_CHAT: 'FLAGGED_CHAT',
  PROFILE_VERIFICATION_REQUIRED: 'PROFILE_VERIFICATION_REQUIRED',
  SUPPORT_ESCALATION: 'SUPPORT_ESCALATION',
  EXPERT_TRUST_REVIEW: 'EXPERT_TRUST_REVIEW',
};

/**
 * @param {object} job - job document (+ id)
 * @returns {{ type: string, severity: 'LOW'|'MEDIUM'|'HIGH', label: string }[]}
 */
function getAdminRiskSignalsForJob(job) {
  const out = [];
  if (!job) return out;

  const ps = String(job.paymentState || '').toLowerCase();
  if (ps === 'payment_failed' || ps === 'refund_failed' || (Array.isArray(job.flagTypes) && job.flagTypes.includes('PAYMENT_ISSUE'))) {
    out.push({ type: RISK_TYPES.PAYMENT_ISSUE, severity: 'HIGH', label: 'Payment issue' });
  }

  const st = normalizeStatus(job.status);
  if (st === JOB_STATUSES.DISPUTED) {
    const t = safeToMillis(job.disputedAt);
    if (t && Date.now() - t >= 24 * 60 * 60 * 1000) {
      out.push({ type: RISK_TYPES.DISPUTE_STALE, severity: 'HIGH', label: 'Dispute >24h' });
    } else {
      out.push({ type: RISK_TYPES.DISPUTE_STALE, severity: 'MEDIUM', label: 'Dispute open' });
    }
  }

  if ((Number(job.flaggedChatCount || 0) > 0) || (Array.isArray(job.chatFlags) && job.chatFlags.length > 0)) {
    out.push({ type: RISK_TYPES.FLAGGED_CHAT, severity: 'MEDIUM', label: 'Flagged chat' });
  }

  return dedupeSignals(out);
}

/**
 * @param {object} ticket - support ticket
 */
function getAdminRiskSignalsForTicket(ticket) {
  const out = [];
  if (!ticket) return out;
  const esc = String(ticket.escalationStatus || 'normal').toLowerCase();
  if (esc === 'ops' || esc === 'super_admin' || esc === 'priority') {
    out.push({ type: RISK_TYPES.SUPPORT_ESCALATION, severity: esc === 'super_admin' ? 'HIGH' : 'MEDIUM', label: 'Escalated' });
  }
  const lr = Array.isArray(ticket.linkedRiskTypes) ? ticket.linkedRiskTypes : [];
  for (const x of lr) {
    const t = String(x || '').toUpperCase();
    if (t === RISK_TYPES.PAYMENT_ISSUE) out.push({ type: RISK_TYPES.PAYMENT_ISSUE, severity: 'HIGH', label: 'Linked payment' });
    if (t === 'VERIFICATION') out.push({ type: RISK_TYPES.PROFILE_VERIFICATION_REQUIRED, severity: 'MEDIUM', label: 'Verification' });
  }
  return dedupeSignals(out);
}

function dedupeSignals(arr) {
  const seen = new Set();
  const out = [];
  for (const s of arr) {
    const k = `${s.type}:${s.label}`;
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(s);
  }
  return out;
}

function getAdminRiskSignals(job, user, ticket) {
  if (job) return getAdminRiskSignalsForJob(job);
  if (ticket) return getAdminRiskSignalsForTicket(ticket);
  return [];
}

module.exports = {
  getAdminRiskSignals,
  getAdminRiskSignalsForJob,
  getAdminRiskSignalsForTicket,
  RISK_TYPES,
};
