import { JOB_STATUSES, normalizeStatus } from '../constants/jobStatuses';
import { toMillis } from './adminOps';

export const RISK_TYPES = {
  PAYMENT_ISSUE: 'PAYMENT_ISSUE',
  DISPUTE_STALE: 'DISPUTE_STALE',
  FLAGGED_CHAT: 'FLAGGED_CHAT',
  PROFILE_VERIFICATION_REQUIRED: 'PROFILE_VERIFICATION_REQUIRED',
  SUPPORT_ESCALATION: 'SUPPORT_ESCALATION',
  EXPERT_TRUST_REVIEW: 'EXPERT_TRUST_REVIEW',
};

/** Client-side mirror of backend adminRiskService (for list rows without extra API). */
export function getAdminRiskSignalsForJob(job) {
  const out = [];
  if (!job) return out;

  const ps = String(job.paymentState || '').toLowerCase();
  if (ps === 'payment_failed' || ps === 'refund_failed' || (Array.isArray(job.flagTypes) && job.flagTypes.includes('PAYMENT_ISSUE'))) {
    out.push({ type: RISK_TYPES.PAYMENT_ISSUE, severity: 'HIGH', label: 'Payment' });
  }

  const st = normalizeStatus(job.status);
  if (st === JOB_STATUSES.DISPUTED) {
    const t = toMillis(job.disputedAt);
    if (t && Date.now() - t >= 24 * 60 * 60 * 1000) {
      out.push({ type: RISK_TYPES.DISPUTE_STALE, severity: 'HIGH', label: 'Dispute >24h' });
    } else {
      out.push({ type: RISK_TYPES.DISPUTE_STALE, severity: 'MEDIUM', label: 'Dispute' });
    }
  }

  if ((Number(job.flaggedChatCount || 0) > 0) || (Array.isArray(job.chatFlags) && job.chatFlags.length > 0)) {
    out.push({ type: RISK_TYPES.FLAGGED_CHAT, severity: 'MEDIUM', label: 'Chat' });
  }

  const seen = new Set();
  return out.filter((s) => {
    const k = `${s.type}:${s.label}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

export function topRiskTags(job, max = 2) {
  return getAdminRiskSignalsForJob(job).slice(0, max);
}
