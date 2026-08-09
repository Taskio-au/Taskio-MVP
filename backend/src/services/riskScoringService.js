'use strict';

const { JOB_STATUSES, normalizeStatus } = require('../constants/jobStatuses');
const { safeToMillis } = require('../utils/firestore');
const {
  FACTOR_CODES,
  FACTOR_WEIGHTS,
  SCORE_CAP,
  LEVEL_THRESHOLDS,
} = require('../config/riskConfig');
const { analyzeMessageText, aggregateSignalScore } = require('./trustMessageSignalService');
const { getExpertTrustSummary } = require('./expertTrustService');

function factorEntry(code, label, source, weightOverride) {
  const w = weightOverride != null ? weightOverride : (FACTOR_WEIGHTS[code] || 0);
  return { code, label, weight: w, source: String(source || 'rule') };
}

function levelFromScore(score) {
  const s = Math.max(0, Math.min(SCORE_CAP, Math.round(Number(score) || 0)));
  for (const band of LEVEL_THRESHOLDS) {
    if (s >= band.min && s <= band.max) return band.level;
  }
  return 'low';
}

function sumWeights(factors) {
  let total = 0;
  const seen = new Set();
  for (const f of factors) {
    const c = f.code;
    if (seen.has(c)) continue;
    seen.add(c);
    total += Number(f.weight) || 0;
  }
  return Math.min(SCORE_CAP, total);
}

function sortFactorsStable(factors) {
  return [...factors].sort((a, b) => {
    const ca = String(a.code);
    const cb = String(b.code);
    if (ca < cb) return -1;
    if (ca > cb) return 1;
    return 0;
  });
}

/**
 * @param {object} job - job doc + id
 * @param {object} [ctx]
 * @param {number} [ctx.nowMs]
 * @param {object} [ctx.lastChatSnippet] - optional { text } for signal analysis
 */
function computeJobRisk(job, ctx = {}) {
  const factors = [];
  const nowMs = ctx.nowMs != null ? ctx.nowMs : Date.now();
  if (!job) {
    return finalize(factors, nowMs);
  }

  const ps = String(job.paymentState || '').toLowerCase();
  if (ps === 'payment_failed') {
    factors.push(factorEntry(FACTOR_CODES.PAYMENT_FAILED, 'Payment failed', 'paymentState'));
    const failMs = safeToMillis(job.paymentUpdatedAt) || safeToMillis(job.updatedAt);
    if (failMs && nowMs - failMs >= 6 * 60 * 60 * 1000) {
      factors.push(factorEntry(FACTOR_CODES.PAYMENT_FAILED_STALE_6H, 'Payment failed >6h', 'paymentAge'));
    }
  }
  if (ps === 'refund_failed') {
    factors.push(factorEntry(FACTOR_CODES.REFUND_FAILED, 'Refund failed', 'paymentState'));
  }

  const st = normalizeStatus(job.status);
  if (st === JOB_STATUSES.DISPUTED) {
    const t = safeToMillis(job.disputedAt);
    if (t && nowMs - t >= 24 * 60 * 60 * 1000) {
      factors.push(factorEntry(FACTOR_CODES.DISPUTE_STALE_24H, 'Dispute open >24h', 'disputedAt'));
    } else {
      factors.push(factorEntry(FACTOR_CODES.DISPUTE_OPEN, 'Dispute open', 'status'));
    }
  }

  const flagCount = Number(job.flaggedChatCount || 0) || 0;
  if (flagCount >= 2 || (Array.isArray(job.chatFlags) && job.chatFlags.length >= 2)) {
    factors.push(factorEntry(FACTOR_CODES.MULTIPLE_FLAGGED_MESSAGES, 'Multiple flagged messages', 'chatFlags'));
  }

  if (ctx.lastChatSnippet?.text) {
    const sigs = analyzeMessageText(ctx.lastChatSnippet.text);
    const agg = aggregateSignalScore(sigs);
    if (agg >= 8 && sigs.some((s) => s.category === 'OFF_PLATFORM_PAYMENT_ATTEMPT')) {
      factors.push(factorEntry(FACTOR_CODES.OFF_PLATFORM_PAYMENT_ATTEMPT, 'Off-platform payment language', 'messageScan'));
    } else if (agg >= 6) {
      factors.push(factorEntry(FACTOR_CODES.OFF_PLATFORM_CONTACT_ATTEMPT, 'Off-platform contact language', 'messageScan'));
    }
  }

  const adminTouches = Number(job.adminTouchCount7d || 0);
  if (adminTouches >= 8) {
    factors.push(factorEntry(FACTOR_CODES.EXCESSIVE_ADMIN_TOUCHES, 'Frequent admin actions on task', 'job.meta'));
  }

  return finalize(factors, nowMs);
}

/**
 * @param {object} ticket
 */
function computeSupportTicketRisk(ticket, ctx = {}) {
  const factors = [];
  const nowMs = ctx.nowMs != null ? ctx.nowMs : Date.now();
  if (!ticket) return finalize(factors, nowMs);

  const esc = String(ticket.escalationStatus || 'normal').toLowerCase();
  if (esc === 'ops' || esc === 'super_admin' || esc === 'priority') {
    factors.push(factorEntry(FACTOR_CODES.SUPPORT_ESCALATED, 'Support escalation', 'escalationStatus'));
  }

  if (ctx.repeatTicketCount != null && ctx.repeatTicketCount >= 3) {
    factors.push(factorEntry(FACTOR_CODES.REPEAT_SUPPORT_TICKETS, 'Multiple recent tickets (same user)', 'support.history'));
  }

  return finalize(factors, nowMs);
}

/**
 * @param {object} request - profile_change_requests row
 * @param {object} [user] - users doc
 * @param {string[]} [mismatchCodes]
 */
function computeProfileRequestRisk(request, user, mismatchCodes = []) {
  const factors = [];
  const nowMs = Date.now();
  if (!request) return finalize(factors, nowMs);

  const field = String(request.field || '');
  const trustFields = new Set(['displayName', 'name', 'firstName', 'lastName', 'businessName', 'businessType', 'abn']);
  if (trustFields.has(field) || (request.requestedPatch && Object.keys(request.requestedPatch).some((k) => trustFields.has(k)))) {
    factors.push(factorEntry(FACTOR_CODES.PROFILE_CHANGE_TRUST_IMPACTING, 'Trust-impacting profile change', 'field'));
  }

  for (const code of mismatchCodes) {
    const c = String(code || '').trim();
    if (c === 'LEGAL_NAME_CHANGED_AFTER_VERIFICATION') {
      factors.push(factorEntry(FACTOR_CODES.LEGAL_NAME_CHANGED_AFTER_VERIFICATION, 'Legal name change after verification', 'mismatch'));
    } else if (c === 'ABN_CHANGED') {
      factors.push(factorEntry(FACTOR_CODES.ABN_CHANGED, 'ABN change', 'mismatch'));
    } else if (c === 'ABN_NAME_MISMATCH') {
      factors.push(factorEntry(FACTOR_CODES.ABN_NAME_MISMATCH, 'ABN / name mismatch', 'mismatch'));
    } else if (c === 'BUSINESS_DETAILS_INCONSISTENT') {
      factors.push(factorEntry(FACTOR_CODES.BUSINESS_DETAILS_INCONSISTENT, 'Business details inconsistent', 'mismatch'));
    }
  }

  const u = user || {};
  if (u.verified === true && (field === 'firstName' || field === 'lastName' || field === 'businessName')) {
    if (!mismatchCodes.length) {
      factors.push(factorEntry(FACTOR_CODES.PROFILE_VERIFICATION_GAP, 'Verified user identity change request', 'user.verified'));
    }
  }

  return finalize(factors, nowMs);
}

/**
 * Expert / user document risk (marketplace participant).
 */
async function computeExpertUserRisk(userDoc, ctx = {}) {
  const factors = [];
  const nowMs = ctx.nowMs != null ? ctx.nowMs : Date.now();
  if (!userDoc || String(userDoc.role || '') !== 'tradie') {
    return finalize(factors, nowMs);
  }

  const uid = ctx.uid ? String(ctx.uid) : null;
  if (uid) {
    try {
      const trust = await getExpertTrustSummary(uid);
      if (trust.trustFlags && trust.trustFlags.includes('STRIPE_INCOMPLETE')) {
        factors.push(factorEntry(FACTOR_CODES.EXPERT_STRIPE_INCOMPLETE, 'Stripe onboarding incomplete', 'expertTrust'));
      }
      if (trust.verificationStatus === 'PENDING_REVIEW' || (trust.trustFlags || []).includes('VERIFICATION_REVIEW')) {
        factors.push(factorEntry(FACTOR_CODES.EXPERT_TRUST_REVIEW, 'Expert verification review', 'expertTrust'));
      }
    } catch (_) {
      /* ignore */
    }
  }

  if (Number(ctx.cancellationCount30d || 0) >= 3) {
    factors.push(factorEntry(FACTOR_CODES.MULTIPLE_RECENT_CANCELLATIONS, 'Multiple recent cancellations', 'history'));
  }

  return finalize(factors, nowMs);
}

function finalize(factors, nowMs) {
  const sorted = sortFactorsStable(factors);
  const score = sumWeights(sorted);
  const level = levelFromScore(score);
  return {
    score,
    level,
    factors: sorted,
    updatedAt: nowMs,
    topFactors: sorted.slice(0, 5).map((f) => ({
      code: f.code,
      label: f.label,
      weight: f.weight,
      source: f.source,
    })),
  };
}

module.exports = {
  computeJobRisk,
  computeSupportTicketRisk,
  computeProfileRequestRisk,
  computeExpertUserRisk,
  levelFromScore,
  FACTOR_CODES,
};
