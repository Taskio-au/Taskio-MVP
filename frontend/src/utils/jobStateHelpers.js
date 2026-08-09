/**
 * Pure job-state helpers for client (homeowner) and expert (tradie) UIs.
 *
 * All functions accept the full `job` object as received from the API.
 * They use `normalizeStatus` so they handle both canonical uppercase enum
 * values ('IN_PROGRESS') and legacy lowercase Firestore strings ('in_progress').
 *
 * Several helpers also check `job.progressStatus` as a belt-and-suspenders
 * fallback. After the work_started backend fix, `job.status` transitions to
 * IN_PROGRESS atomically. The `progressStatus` check covers any edge case where
 * the Firestore document has `progressStatus: 'work_started'` but the caller
 * received the job object before the status field fully propagated.
 */
import { JOB_STATUSES, normalizeStatus } from '../constants/jobStatuses';

/**
 * True when the client's payment is held in escrow.
 * Uses both paymentState and paymentStatus for resilience (paymentStatus may
 * lag briefly while the Stripe webhook is processed).
 */
export function isPaymentSecured(job) {
  if (!job || typeof job !== 'object') return false;
  return job.paymentState === 'in_escrow' || job.paymentStatus === 'succeeded';
}

/**
 * True once the expert has started or finished the work.
 * Primary signal: job.status is IN_PROGRESS or a later stage.
 * Secondary signals (belt-and-suspenders for callers that have a snapshot before
 * the status field transitioned, or jobs that pre-date the FUNDED→IN_PROGRESS
 * backend transition):
 *   - job.progressStatus is 'work_started' or 'ready_for_review'
 *   - job.workStartedAt exists (timestamp set atomically by the backend)
 */
export function hasWorkStarted(job) {
  if (!job) return false;
  const n = normalizeStatus(job.status);
  if (
    [
      JOB_STATUSES.IN_PROGRESS,
      JOB_STATUSES.COMPLETED,
      JOB_STATUSES.PAID,
      JOB_STATUSES.DISPUTED,
    ].includes(n)
  ) return true;
  return (
    job.progressStatus === 'work_started' ||
    job.progressStatus === 'ready_for_review' ||
    !!job.workStartedAt
  );
}

/**
 * True when payment has been released to the expert (job fully complete).
 */
export function isPaymentReleased(job) {
  if (!job) return false;
  return job.paymentState === 'released';
}

/**
 * True when the client can still cancel and receive a refund before work begins.
 * Applies when payment is secured but the expert has not yet started.
 */
export function canClientCancelBeforeWork(job) {
  if (!job) return false;
  return isPaymentSecured(job) && !hasWorkStarted(job);
}

/**
 * True when work has already started and the client should be directed to
 * contact support or message the expert rather than clicking a simple cancel button.
 */
export function canRequestCancellationAfterStart(job) {
  if (!job) return false;
  const n = normalizeStatus(job.status);
  if (n === JOB_STATUSES.IN_PROGRESS && isPaymentSecured(job)) return true;
  // Fallback: progressStatus signal (belt-and-suspenders)
  return isPaymentSecured(job) && hasWorkStarted(job) && n !== JOB_STATUSES.COMPLETED;
}

/**
 * True when the variations panel should be interactive (not locked, not read-only).
 * Requires: payment secured + work in progress.
 * Uses hasWorkStarted() for the "work in progress" check so all three fallback
 * signals are respected: status == IN_PROGRESS, progressStatus, and workStartedAt.
 * COMPLETED (awaiting approval) is intentionally read-only per product rules.
 *
 * Mirrors Firestore jobAllowsNewVariations() in firestore.rules.
 */
export function canUseVariations(job) {
  if (!job) return false;
  if (!isPaymentSecured(job)) return false;

  const n = normalizeStatus(job.status);

  // Terminal and read-only states block interactive variations.
  const blocked = [
    JOB_STATUSES.COMPLETED,    // awaiting approval — read-only
    JOB_STATUSES.PAID,
    JOB_STATUSES.CANCELLED,
    JOB_STATUSES.DISPUTED,
    JOB_STATUSES.REFUNDED,
    JOB_STATUSES.REFUND_PENDING,
  ];
  if (blocked.includes(n) || job.chatFrozen === true) return false;

  // Delegate to hasWorkStarted() which covers: status IN_PROGRESS, progressStatus, workStartedAt.
  return hasWorkStarted(job);
}

/**
 * True when the variations panel should show history in read-only mode
 * (no new submissions or approvals allowed).
 * Includes COMPLETED (awaiting approval) — client/expert should not create
 * new variations once the expert has marked the task done.
 */
export function isVariationReadOnly(job) {
  if (!job) return false;
  const n = normalizeStatus(job.status);
  return (
    job.chatFrozen === true ||
    n === JOB_STATUSES.COMPLETED ||    // awaiting approval — read-only
    n === JOB_STATUSES.CANCELLED ||
    n === JOB_STATUSES.PAID ||
    n === JOB_STATUSES.DISPUTED ||
    n === JOB_STATUSES.REFUNDED ||
    n === JOB_STATUSES.REFUND_PENDING
  );
}

