/**
 * Unit tests for jobStateHelpers.js
 *
 * These are pure functions so no mocking is needed — just pass plain job objects.
 */
import {
  isPaymentSecured,
  hasWorkStarted,
  isPaymentReleased,
  canClientCancelBeforeWork,
  canRequestCancellationAfterStart,
  canUseVariations,
  isVariationReadOnly,
} from './jobStateHelpers';

// ---------------------------------------------------------------------------
// Helper builders — keep tests readable
// ---------------------------------------------------------------------------
const job = (status, paymentState = '', extra = {}) => ({
  status,
  paymentState,
  acceptedTradieUid: 'tradie123',
  ...extra,
});

// ---------------------------------------------------------------------------
// isPaymentSecured
// ---------------------------------------------------------------------------
describe('isPaymentSecured', () => {
  test('true when paymentState is in_escrow', () => {
    expect(isPaymentSecured(job('FUNDED', 'in_escrow'))).toBe(true);
  });

  test('true when paymentStatus is succeeded (Stripe lag edge-case)', () => {
    expect(isPaymentSecured(job('AWAITING_FUNDING', '', { paymentStatus: 'succeeded' }))).toBe(true);
  });

  test('false when paymentState is released', () => {
    expect(isPaymentSecured(job('PAID', 'released'))).toBe(false);
  });

  test('false for null job', () => {
    expect(isPaymentSecured(null)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// hasWorkStarted
// ---------------------------------------------------------------------------
describe('hasWorkStarted', () => {
  test('false for FUNDED (payment secured, work not started)', () => {
    expect(hasWorkStarted(job('FUNDED', 'in_escrow'))).toBe(false);
  });

  test('false for AWAITING_FUNDING', () => {
    expect(hasWorkStarted(job('AWAITING_FUNDING', ''))).toBe(false);
  });

  test('true for IN_PROGRESS (canonical uppercase)', () => {
    expect(hasWorkStarted(job('IN_PROGRESS', 'in_escrow'))).toBe(true);
  });

  test('true for in_progress (legacy lowercase)', () => {
    expect(hasWorkStarted(job('in_progress', 'in_escrow'))).toBe(true);
  });

  test('true for COMPLETED (awaiting approval)', () => {
    expect(hasWorkStarted(job('COMPLETED', 'in_escrow'))).toBe(true);
  });

  test('true for awaiting_approval (legacy lowercase for COMPLETED)', () => {
    expect(hasWorkStarted(job('awaiting_approval', 'in_escrow'))).toBe(true);
  });

  test('true for PAID (fully released)', () => {
    expect(hasWorkStarted(job('PAID', 'released'))).toBe(true);
  });

  test('true for DISPUTED', () => {
    expect(hasWorkStarted(job('DISPUTED', 'in_escrow'))).toBe(true);
  });

  test('false for null job', () => {
    expect(hasWorkStarted(null)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// isPaymentReleased
// ---------------------------------------------------------------------------
describe('isPaymentReleased', () => {
  test('true when paymentState is released', () => {
    expect(isPaymentReleased(job('PAID', 'released'))).toBe(true);
  });

  test('false when paymentState is in_escrow', () => {
    expect(isPaymentReleased(job('FUNDED', 'in_escrow'))).toBe(false);
  });

  test('false for null', () => {
    expect(isPaymentReleased(null)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// canClientCancelBeforeWork
// ---------------------------------------------------------------------------
describe('canClientCancelBeforeWork', () => {
  test('true for FUNDED + in_escrow (payment secured, work not started)', () => {
    expect(canClientCancelBeforeWork(job('FUNDED', 'in_escrow'))).toBe(true);
  });

  test('false for IN_PROGRESS (work already started)', () => {
    expect(canClientCancelBeforeWork(job('IN_PROGRESS', 'in_escrow'))).toBe(false);
  });

  test('false for COMPLETED (awaiting approval, work done)', () => {
    expect(canClientCancelBeforeWork(job('COMPLETED', 'in_escrow'))).toBe(false);
  });

  test('false when payment not secured', () => {
    expect(canClientCancelBeforeWork(job('FUNDED', 'pending'))).toBe(false);
  });

  test('false for null', () => {
    expect(canClientCancelBeforeWork(null)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// canRequestCancellationAfterStart
// ---------------------------------------------------------------------------
describe('canRequestCancellationAfterStart', () => {
  test('true for IN_PROGRESS + in_escrow', () => {
    expect(canRequestCancellationAfterStart(job('IN_PROGRESS', 'in_escrow'))).toBe(true);
  });

  test('true for legacy in_progress + in_escrow', () => {
    expect(canRequestCancellationAfterStart(job('in_progress', 'in_escrow'))).toBe(true);
  });

  test('false for FUNDED (work not started)', () => {
    expect(canRequestCancellationAfterStart(job('FUNDED', 'in_escrow'))).toBe(false);
  });

  test('false for COMPLETED (beyond in-progress)', () => {
    expect(canRequestCancellationAfterStart(job('COMPLETED', 'in_escrow'))).toBe(false);
  });

  test('false when payment not secured', () => {
    expect(canRequestCancellationAfterStart(job('IN_PROGRESS', 'pending'))).toBe(false);
  });

  test('false for null', () => {
    expect(canRequestCancellationAfterStart(null)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// canUseVariations
// ---------------------------------------------------------------------------
describe('canUseVariations', () => {
  test('false before payment secured', () => {
    expect(canUseVariations(job('FUNDED', 'pending'))).toBe(false);
  });

  test('false for FUNDED + in_escrow (payment secured but work not started)', () => {
    expect(canUseVariations(job('FUNDED', 'in_escrow'))).toBe(false);
  });

  test('true for IN_PROGRESS + in_escrow', () => {
    expect(canUseVariations(job('IN_PROGRESS', 'in_escrow'))).toBe(true);
  });

  test('true for legacy in_progress + in_escrow', () => {
    expect(canUseVariations(job('in_progress', 'in_escrow'))).toBe(true);
  });

  test('false for COMPLETED (awaiting approval) — now read-only per product rules', () => {
    expect(canUseVariations(job('COMPLETED', 'in_escrow'))).toBe(false);
  });

  test('false for awaiting_approval (legacy) — now read-only', () => {
    expect(canUseVariations(job('awaiting_approval', 'in_escrow'))).toBe(false);
  });

  test('false for PAID (payment released)', () => {
    expect(canUseVariations(job('PAID', 'released'))).toBe(false);
  });

  test('false for CANCELLED', () => {
    expect(canUseVariations(job('CANCELLED', ''))).toBe(false);
  });

  test('false for null', () => {
    expect(canUseVariations(null)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// isVariationReadOnly
// ---------------------------------------------------------------------------
describe('isVariationReadOnly', () => {
  test('false for IN_PROGRESS (active variations)', () => {
    expect(isVariationReadOnly(job('IN_PROGRESS', 'in_escrow'))).toBe(false);
  });

  test('true for COMPLETED/awaiting approval — read-only per updated product rules', () => {
    expect(isVariationReadOnly(job('COMPLETED', 'in_escrow'))).toBe(true);
  });

  test('true for PAID (fully settled)', () => {
    expect(isVariationReadOnly(job('PAID', 'released'))).toBe(true);
  });

  test('true for CANCELLED', () => {
    expect(isVariationReadOnly(job('CANCELLED', ''))).toBe(true);
  });

  test('true for DISPUTED', () => {
    expect(isVariationReadOnly(job('DISPUTED', 'in_escrow'))).toBe(true);
  });

  test('true for REFUNDED', () => {
    expect(isVariationReadOnly(job('REFUNDED', 'refunded'))).toBe(true);
  });

  test('true for REFUND_PENDING', () => {
    expect(isVariationReadOnly(job('REFUND_PENDING', 'pending_refund'))).toBe(true);
  });

  test('true when chatFrozen is set', () => {
    expect(isVariationReadOnly(job('IN_PROGRESS', 'in_escrow', { chatFrozen: true }))).toBe(true);
  });

  test('false for null', () => {
    expect(isVariationReadOnly(null)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// progressStatus fallback — belt-and-suspenders for pre-transition snapshots
// ---------------------------------------------------------------------------
describe('hasWorkStarted — progressStatus fallback', () => {
  test('true when progressStatus is work_started even if status is still FUNDED', () => {
    expect(hasWorkStarted(job('FUNDED', 'in_escrow', { progressStatus: 'work_started' }))).toBe(true);
  });

  test('true when progressStatus is ready_for_review even if status is still FUNDED', () => {
    expect(hasWorkStarted(job('FUNDED', 'in_escrow', { progressStatus: 'ready_for_review' }))).toBe(true);
  });

  test('false when progressStatus is needs_more_info and status is FUNDED', () => {
    expect(hasWorkStarted(job('FUNDED', 'in_escrow', { progressStatus: 'needs_more_info' }))).toBe(false);
  });

  test('true when workStartedAt exists even if status is still FUNDED', () => {
    expect(hasWorkStarted(job('FUNDED', 'in_escrow', { workStartedAt: '2026-01-01T00:00:00Z' }))).toBe(true);
  });

  test('false when workStartedAt is null and status is FUNDED', () => {
    expect(hasWorkStarted(job('FUNDED', 'in_escrow', { workStartedAt: null }))).toBe(false);
  });
});

describe('canClientCancelBeforeWork — progressStatus fallback', () => {
  test('false when progressStatus is work_started (work has begun)', () => {
    expect(canClientCancelBeforeWork(job('FUNDED', 'in_escrow', { progressStatus: 'work_started' }))).toBe(false);
  });

  test('true when FUNDED + in_escrow and no progressStatus set', () => {
    expect(canClientCancelBeforeWork(job('FUNDED', 'in_escrow'))).toBe(true);
  });
});

describe('canUseVariations — progressStatus fallback', () => {
  test('true when FUNDED + in_escrow + progressStatus is work_started', () => {
    expect(canUseVariations(job('FUNDED', 'in_escrow', { progressStatus: 'work_started' }))).toBe(true);
  });

  test('true when FUNDED + in_escrow + progressStatus is ready_for_review', () => {
    expect(canUseVariations(job('FUNDED', 'in_escrow', { progressStatus: 'ready_for_review' }))).toBe(true);
  });

  test('false when FUNDED + in_escrow + progressStatus is needs_more_info (work not started)', () => {
    expect(canUseVariations(job('FUNDED', 'in_escrow', { progressStatus: 'needs_more_info' }))).toBe(false);
  });

  test('true when FUNDED + in_escrow + workStartedAt exists (legacy fallback)', () => {
    expect(canUseVariations(job('FUNDED', 'in_escrow', { workStartedAt: '2026-01-01T00:00:00Z' }))).toBe(true);
  });

  test('false when FUNDED + in_escrow + workStartedAt is null (work not started)', () => {
    expect(canUseVariations(job('FUNDED', 'in_escrow', { workStartedAt: null }))).toBe(false);
  });
});

describe('isVariationReadOnly — COMPLETED now read-only', () => {
  test('true for COMPLETED (awaiting approval) per updated product rules', () => {
    expect(isVariationReadOnly(job('COMPLETED', 'in_escrow'))).toBe(true);
  });

  test('true for awaiting_approval (legacy lowercase for COMPLETED)', () => {
    expect(isVariationReadOnly(job('awaiting_approval', 'in_escrow'))).toBe(true);
  });
});

describe('canUseVariations — COMPLETED now blocked', () => {
  test('false for COMPLETED (awaiting approval) — read-only per product rules', () => {
    expect(canUseVariations(job('COMPLETED', 'in_escrow'))).toBe(false);
  });

  test('false for awaiting_approval (legacy)', () => {
    expect(canUseVariations(job('awaiting_approval', 'in_escrow'))).toBe(false);
  });
});
