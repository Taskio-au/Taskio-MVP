'use strict';

const { computeJobRisk, computeProfileRequestRisk, computeSupportTicketRisk, levelFromScore } = require('../src/services/riskScoringService');
const { analyzeMessageText, aggregateSignalScore } = require('../src/services/trustMessageSignalService');
const { collectMismatchCodes } = require('../src/services/profileTrustMismatchService');
const {
  recommendJobEscalation,
  recommendSupportEscalation,
  recommendProfileEscalation,
} = require('../src/services/riskEscalationService');
const { JOB_STATUSES } = require('../src/constants/jobStatuses');

describe('Step 17 risk scoring', () => {
  it('computes deterministic job score from payment_failed', () => {
    const job = {
      id: 'j1',
      paymentState: 'payment_failed',
      status: JOB_STATUSES.OPEN,
    };
    const a = computeJobRisk(job, { nowMs: Date.now() });
    const b = computeJobRisk(job, { nowMs: Date.now() });
    expect(a.score).toBe(b.score);
    expect(a.score).toBeGreaterThan(0);
    expect(a.level).toBe(levelFromScore(a.score));
    expect(a.factors.map((f) => f.code).sort()).toEqual(a.factors.map((f) => f.code).sort());
  });

  it('adds dispute stale factor after 24h', () => {
    const old = Date.now() - 25 * 60 * 60 * 1000;
    const job = {
      id: 'j2',
      paymentState: 'in_escrow',
      status: JOB_STATUSES.DISPUTED,
      disputedAt: { _seconds: Math.floor(old / 1000), _nanoseconds: 0 },
    };
    const r = computeJobRisk(job, { nowMs: Date.now() });
    expect(r.factors.some((f) => f.code === 'DISPUTE_STALE_24H')).toBe(true);
  });

  it('profile request includes trust-impacting factor', () => {
    const req = { field: 'businessName', requestedValue: 'X', status: 'pending' };
    const user = { verified: true, businessName: 'Old' };
    const r = computeProfileRequestRisk(req, user, collectMismatchCodes(user, req));
    expect(r.factors.some((f) => f.code === 'PROFILE_CHANGE_TRUST_IMPACTING')).toBe(true);
  });

  it('support ticket risk includes escalation', () => {
    const t = { escalationStatus: 'ops' };
    const r = computeSupportTicketRisk(t, { nowMs: Date.now() });
    expect(r.factors.some((f) => f.code === 'SUPPORT_ESCALATED')).toBe(true);
  });
});

describe('Step 17 message signals', () => {
  it('detects off-platform payment language with severity', () => {
    const sigs = analyzeMessageText('Please pay me directly via bank transfer to avoid the fee');
    expect(sigs.length).toBeGreaterThan(0);
    expect(aggregateSignalScore(sigs)).toBeGreaterThanOrEqual(3);
  });

  it('does not flood on benign text', () => {
    const sigs = analyzeMessageText('Thanks, I will complete the task tomorrow.');
    expect(aggregateSignalScore(sigs)).toBeLessThan(8);
  });
});

describe('Step 17 escalation recommendations', () => {
  it('recommends super_admin for refund_failed', () => {
    const job = { paymentState: 'refund_failed', status: JOB_STATUSES.OPEN };
    const score = computeJobRisk(job, { nowMs: Date.now() });
    const rec = recommendJobEscalation(job, score);
    expect(rec.tier).toBe('super_admin');
    expect(rec.apply).toBe(true);
  });

  it('recommends priority support escalation for repeat tickets', () => {
    const rec = recommendSupportEscalation({}, { repeatUserTicketCount: 4 });
    expect(rec.escalationStatus).toBe('priority');
    expect(rec.apply).toBe(true);
  });

  it('recommends profile escalation for ABN mismatch list', () => {
    const score = { score: 70, factors: [{ code: 'ABN_NAME_MISMATCH' }] };
    const rec = recommendProfileEscalation(score, ['ABN_NAME_MISMATCH']);
    expect(rec.apply).toBe(true);
  });
});
