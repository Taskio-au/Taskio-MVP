'use strict';

const {
  normalizeAttempt,
  jobCheckoutIdempotencyKey,
  variationCheckoutIdempotencyKey,
  refundIdempotencyKey,
  homeownerCancelRefundKey,
  homeownerCancelVariationRefundKey,
  expressAccountIdempotencyKey,
  allocateCheckoutGeneration,
  allocateRefundAttempt,
} = require('../src/services/stripeIdempotency');

describe('stripeIdempotency keys', () => {
  it('does not include Date.now() or client-supplied tokens', () => {
    const nowSpy = jest.spyOn(Date, 'now').mockReturnValue(9999999999999);
    try {
      expect(jobCheckoutIdempotencyKey('job-1', 'quote-1', 1)).toBe('taskio_checkout_job-1_quote-1_g1');
      expect(variationCheckoutIdempotencyKey('job-1', 'var-1', 2)).toBe('taskio_var_checkout_job-1_var-1_g2');
      expect(refundIdempotencyKey('job-7', 1)).toBe('taskio_refund_job-7_g1');
      expect(homeownerCancelRefundKey('job-1')).toBe('taskio_homeowner_cancel_job-1');
      expect(homeownerCancelVariationRefundKey('job-1', 'var-a')).toBe('taskio_homeowner_cancel_var_job-1_var-a');
      expect(expressAccountIdempotencyKey('uid-1')).toBe('taskio_express_account_uid-1');
    } finally {
      nowSpy.mockRestore();
    }
  });

  it('scopes keys so jobs and variations do not collide', () => {
    expect(variationCheckoutIdempotencyKey('job-1', 'var-a', 1))
      .not.toBe(variationCheckoutIdempotencyKey('job-1', 'var-b', 1));
    expect(jobCheckoutIdempotencyKey('job-1', 'quote-1', 1))
      .not.toBe(jobCheckoutIdempotencyKey('job-2', 'quote-1', 1));
    expect(refundIdempotencyKey('job-1', 1)).not.toBe(refundIdempotencyKey('job-2', 1));
  });

  it('normalizes missing or invalid attempts to 1', () => {
    expect(normalizeAttempt(undefined)).toBe(1);
    expect(normalizeAttempt(0)).toBe(1);
    expect(normalizeAttempt(-4)).toBe(1);
    expect(jobCheckoutIdempotencyKey('j', 'q', null)).toBe('taskio_checkout_j_q_g1');
  });
});

describe('allocateCheckoutGeneration', () => {
  it('reuses generation 1 when not replacing a session', () => {
    expect(allocateCheckoutGeneration({}, {})).toEqual({
      generation: 1,
      patch: { paymentCheckoutGeneration: 1 },
    });
    expect(allocateCheckoutGeneration({ paymentCheckoutGeneration: 1 }, {})).toEqual({
      generation: 1,
      patch: null,
    });
  });

  it('increments once when replacing the stored session, then reuses for the same replacement', () => {
    const first = allocateCheckoutGeneration(
      { paymentCheckoutGeneration: 1, paymentCheckoutSessionId: 'cs_old' },
      { replaceSessionId: 'cs_old' }
    );
    expect(first.generation).toBe(2);
    expect(first.patch.paymentCheckoutReplacementFor).toBe('cs_old');

    const concurrent = allocateCheckoutGeneration(
      {
        paymentCheckoutGeneration: 2,
        paymentCheckoutSessionId: 'cs_old',
        paymentCheckoutReplacementFor: 'cs_old',
      },
      { replaceSessionId: 'cs_old' }
    );
    expect(concurrent.generation).toBe(2);
    expect(concurrent.patch).toBeNull();
  });

  it('uses checkoutSessionId for variations', () => {
    const alloc = allocateCheckoutGeneration(
      { paymentCheckoutGeneration: 1, checkoutSessionId: 'cs_var' },
      { sessionIdField: 'checkoutSessionId', replaceSessionId: 'cs_var' }
    );
    expect(alloc.generation).toBe(2);
  });
});

describe('allocateRefundAttempt', () => {
  it('starts initial refunds at attempt 1 and reuses an open attempt', () => {
    expect(allocateRefundAttempt({}, { mode: 'initial' })).toEqual({
      attempt: 1,
      patch: { refundAttempt: 1, refundAttemptOpen: true },
    });
    expect(allocateRefundAttempt(
      { refundAttempt: 1, refundAttemptOpen: true },
      { mode: 'initial' }
    )).toEqual({ attempt: 1, patch: null });
  });

  it('increments only after a definitive refund_failed when no attempt is open', () => {
    const next = allocateRefundAttempt(
      { paymentState: 'refund_failed', refundAttempt: 1, refundAttemptOpen: false },
      { mode: 'retry_failed' }
    );
    expect(next).toEqual({
      attempt: 2,
      patch: { refundAttempt: 2, refundAttemptOpen: true },
    });

    const reuse = allocateRefundAttempt(
      { paymentState: 'refund_failed', refundAttempt: 2, refundAttemptOpen: true },
      { mode: 'retry_failed' }
    );
    expect(reuse).toEqual({ attempt: 2, patch: null });
  });
});

describe('classifyStripeRefundCreateError', () => {
  const {
    classifyStripeRefundCreateError,
    refundCreateErrorHttpStatus,
    refundCreateDefinitiveFailurePatch,
    refundAttemptFailedPatch,
    sanitizeRefundFailureCode,
  } = require('../src/services/stripeIdempotency');

  it('treats network timeouts as ambiguous', () => {
    expect(classifyStripeRefundCreateError({ code: 'ETIMEDOUT', message: 'timeout' })).toEqual({
      outcome: 'ambiguous',
      category: 'network',
      code: 'ETIMEDOUT',
    });
    expect(classifyStripeRefundCreateError({
      type: 'StripeConnectionError',
      rawType: 'api_connection_error',
    }).outcome).toBe('ambiguous');
  });

  it('treats Stripe API 500 as ambiguous', () => {
    const classified = classifyStripeRefundCreateError({
      type: 'StripeAPIError',
      rawType: 'api_error',
      statusCode: 500,
      code: 'internal_error',
    });
    expect(classified).toEqual({
      outcome: 'ambiguous',
      category: 'api_error',
      code: 'internal_error',
    });
    expect(refundCreateErrorHttpStatus(classified)).toBe(503);
  });

  it('treats rate limiting as ambiguous, not a new refund attempt', () => {
    const classified = classifyStripeRefundCreateError({
      type: 'StripeRateLimitError',
      rawType: 'rate_limit_error',
      statusCode: 429,
      code: 'rate_limit',
    });
    expect(classified.outcome).toBe('ambiguous');
    expect(classified.category).toBe('rate_limit');
    expect(refundCreateErrorHttpStatus(classified)).toBe(429);
  });

  it('treats invalid_request 400 as definitive', () => {
    const classified = classifyStripeRefundCreateError({
      type: 'StripeInvalidRequestError',
      rawType: 'invalid_request_error',
      statusCode: 400,
      code: 'resource_missing',
      message: 'No such payment_intent: pi_secret',
    });
    expect(classified).toEqual({
      outcome: 'definitive',
      category: 'invalid_request',
      code: 'resource_missing',
    });
    expect(refundCreateErrorHttpStatus(classified)).toBe(400);
    expect(refundCreateDefinitiveFailurePatch(classified)).toEqual({
      refundAttemptOpen: false,
      paymentState: 'refund_failed',
      refundLastFailedId: null,
      refundLastFailureCategory: 'invalid_request',
      refundLastFailureCode: 'resource_missing',
    });
  });

  it('does not persist secret-like or free-text error payloads', () => {
    expect(sanitizeRefundFailureCode('sk_test_placeholder')).toBe('redacted');
    expect(sanitizeRefundFailureCode('No such payment_intent: pi_123')).toBe('unknown');
    expect(refundAttemptFailedPatch({ id: 're_1', failure_reason: 'expired_or_canceled_card' })).toEqual({
      refundAttemptOpen: false,
      refundLastFailedId: 're_1',
      refundLastFailureCategory: 'refund_object_failed',
      refundLastFailureCode: 'expired_or_canceled_card',
    });
  });
});
