'use strict';

/**
 * Server-side Stripe idempotency keys for money-moving operations.
 * Keys represent one authorised business attempt, not an HTTP request.
 */

function normalizeAttempt(value) {
  const n = Math.floor(Number(value));
  if (!Number.isFinite(n) || n < 1) return 1;
  return n;
}

function jobCheckoutIdempotencyKey(jobId, quoteId, generation) {
  return `taskio_checkout_${String(jobId)}_${String(quoteId)}_g${normalizeAttempt(generation)}`;
}

function variationCheckoutIdempotencyKey(jobId, variationId, generation) {
  return `taskio_var_checkout_${String(jobId)}_${String(variationId)}_g${normalizeAttempt(generation)}`;
}

function refundIdempotencyKey(jobId, attempt) {
  return `taskio_refund_${String(jobId)}_g${normalizeAttempt(attempt)}`;
}

function homeownerCancelRefundKey(jobId) {
  return `taskio_homeowner_cancel_${String(jobId)}`;
}

function homeownerCancelVariationRefundKey(jobId, variationId) {
  return `taskio_homeowner_cancel_var_${String(jobId)}_${String(variationId)}`;
}

function expressAccountIdempotencyKey(uid) {
  return `taskio_express_account_${String(uid)}`;
}

/**
 * Reuse the current Checkout generation, or increment it when replacing a
 * specific persisted session (expired / no longer open). Concurrent replacements
 * of the same session id share one next generation.
 *
 * @param {object} current job or variation fields
 * @param {{ replaceSessionId?: string, sessionIdField?: string }} [opts]
 */
function allocateCheckoutGeneration(current, opts = {}) {
  const sessionIdField = opts.sessionIdField || 'paymentCheckoutSessionId';
  const existingGeneration = normalizeAttempt(current?.paymentCheckoutGeneration || 1);
  const replacing = String(opts.replaceSessionId || '');
  const stored = String(current?.[sessionIdField] || '');

  if (!replacing || stored !== replacing) {
    const patch = Number(current?.paymentCheckoutGeneration) === existingGeneration
      ? null
      : { paymentCheckoutGeneration: existingGeneration };
    return { generation: existingGeneration, patch };
  }

  if (String(current?.paymentCheckoutReplacementFor || '') === replacing) {
    return { generation: existingGeneration, patch: null };
  }

  const nextGeneration = existingGeneration + 1;
  return {
    generation: nextGeneration,
    patch: {
      paymentCheckoutGeneration: nextGeneration,
      paymentCheckoutReplacementFor: replacing,
    },
  };
}

/**
 * Refund attempts: reuse the open in-flight attempt; increment only after a
 * definitive refund_failed when no attempt is already open.
 *
 * @param {object} job
 * @param {{ mode: 'initial' | 'retry_failed' }} [opts]
 */
function allocateRefundAttempt(job, opts = {}) {
  const mode = opts.mode || 'initial';
  const paymentState = String(job?.paymentState || '').toLowerCase();
  const attempt = normalizeAttempt(job?.refundAttempt || 1);
  const open = job?.refundAttemptOpen === true;

  if (mode === 'retry_failed') {
    if (paymentState !== 'refund_failed') {
      return { error: { code: 'not_refund_failed' } };
    }
    if (open) {
      return { attempt, patch: null };
    }
    const next = attempt + 1;
    return {
      attempt: next,
      patch: {
        refundAttempt: next,
        refundAttemptOpen: true,
      },
    };
  }

  if (!job?.refundAttempt) {
    return {
      attempt: 1,
      patch: { refundAttempt: 1, refundAttemptOpen: true },
    };
  }
  if (open) {
    return { attempt, patch: null };
  }
  return {
    attempt,
    patch: { refundAttemptOpen: true },
  };
}

function refundAttemptSettledPatch() {
  return { refundAttemptOpen: false };
}

function sanitizeRefundFailureCode(value) {
  const raw = String(value || '').trim().slice(0, 64);
  if (!raw) return 'unknown';
  if (/^(sk|rk|pk|whsec)_(live|test)_/i.test(raw)) return 'redacted';
  if (!/^[A-Za-z0-9._-]+$/.test(raw)) return 'unknown';
  return raw;
}

const NETWORK_NODE_CODES = new Set([
  'ETIMEDOUT',
  'ECONNRESET',
  'ENOTFOUND',
  'ECONNREFUSED',
  'EPIPE',
  'EAI_AGAIN',
  'EHOSTUNREACH',
  'ENETUNREACH',
  'UND_ERR_CONNECT_TIMEOUT',
  'UND_ERR_HEADERS_TIMEOUT',
  'UND_ERR_BODY_TIMEOUT',
  'UND_ERR_SOCKET',
]);

function stripeErrorTypeName(error) {
  return String(error?.type || error?.name || '').trim();
}

function stripeRawType(error) {
  return String(error?.rawType || '').trim().toLowerCase();
}

/**
 * Classify Stripe refunds.create failures using SDK class name, rawType,
 * statusCode, and code — not HTTP status alone.
 *
 * ambiguous: side effects cannot be ruled out; reuse the same generation/key.
 * definitive: this request did not create a Refund; close the attempt.
 */
function classifyStripeRefundCreateError(error) {
  const typeName = stripeErrorTypeName(error);
  const rawType = stripeRawType(error);
  const status = Number(error?.statusCode || error?.status || 0);
  const code = sanitizeRefundFailureCode(error?.code);

  if (
    typeName === 'StripeRateLimitError'
    || rawType === 'rate_limit_error'
    || status === 429
    || code === 'rate_limit'
    || code === 'lock_timeout'
  ) {
    return { outcome: 'ambiguous', category: 'rate_limit', code: code === 'unknown' ? 'rate_limit' : code };
  }

  if (
    typeName === 'StripeConnectionError'
    || rawType === 'api_connection_error'
    || NETWORK_NODE_CODES.has(String(error?.code || ''))
    || NETWORK_NODE_CODES.has(typeName)
  ) {
    return { outcome: 'ambiguous', category: 'network', code: code === 'unknown' ? 'network' : code };
  }

  if (status === 408) {
    return { outcome: 'ambiguous', category: 'timeout', code: code === 'unknown' ? 'timeout' : code };
  }

  if (status === 409) {
    return { outcome: 'ambiguous', category: 'conflict', code: code === 'unknown' ? 'conflict' : code };
  }

  if (
    typeName === 'StripeAPIError'
    || rawType === 'api_error'
    || status >= 500
  ) {
    return { outcome: 'ambiguous', category: 'api_error', code: code === 'unknown' ? 'api_error' : code };
  }

  if (typeName === 'StripeIdempotencyError' || rawType === 'idempotency_error') {
    return { outcome: 'ambiguous', category: 'idempotency', code: code === 'unknown' ? 'idempotency_error' : code };
  }

  if (
    typeName === 'StripeInvalidRequestError'
    || rawType === 'invalid_request_error'
    || typeName === 'StripeAuthenticationError'
    || rawType === 'authentication_error'
    || typeName === 'StripePermissionError'
    || typeName === 'StripeCardError'
    || rawType === 'card_error'
    || typeName === 'StripeInvalidGrantError'
    || rawType === 'invalid_grant'
  ) {
    const category = rawType === 'authentication_error' || typeName === 'StripeAuthenticationError'
      ? 'authentication'
      : typeName === 'StripePermissionError'
        ? 'permission'
        : rawType === 'card_error' || typeName === 'StripeCardError'
          ? 'card_error'
          : 'invalid_request';
    return { outcome: 'definitive', category, code: code === 'unknown' ? category : code };
  }

  if (status >= 400 && status < 500) {
    return { outcome: 'definitive', category: 'client_error', code: code === 'unknown' ? `http_${status}` : code };
  }

  if (!error || (!status && !typeName && !rawType)) {
    return { outcome: 'ambiguous', category: 'network', code: code === 'unknown' ? 'unknown_network' : code };
  }

  return { outcome: 'ambiguous', category: 'unknown', code };
}

function refundCreateErrorHttpStatus(classified) {
  if (!classified || classified.outcome !== 'definitive') {
    if (classified?.category === 'rate_limit') return 429;
    return 503;
  }
  if (classified.category === 'permission') return 403;
  return 400;
}

function refundAttemptFailedPatch(refundObj) {
  return {
    refundAttemptOpen: false,
    refundLastFailedId: refundObj?.id || null,
    refundLastFailureCategory: 'refund_object_failed',
    refundLastFailureCode: sanitizeRefundFailureCode(
      refundObj?.failure_reason || refundObj?.failure_code || 'refund_failed'
    ),
  };
}

function refundCreateDefinitiveFailurePatch(classified) {
  return {
    refundAttemptOpen: false,
    paymentState: 'refund_failed',
    refundLastFailedId: null,
    refundLastFailureCategory: String(classified?.category || 'invalid_request'),
    refundLastFailureCode: sanitizeRefundFailureCode(classified?.code || 'invalid_request'),
  };
}

module.exports = {
  normalizeAttempt,
  jobCheckoutIdempotencyKey,
  variationCheckoutIdempotencyKey,
  refundIdempotencyKey,
  homeownerCancelRefundKey,
  homeownerCancelVariationRefundKey,
  expressAccountIdempotencyKey,
  allocateCheckoutGeneration,
  allocateRefundAttempt,
  refundAttemptSettledPatch,
  refundAttemptFailedPatch,
  sanitizeRefundFailureCode,
  classifyStripeRefundCreateError,
  refundCreateErrorHttpStatus,
  refundCreateDefinitiveFailurePatch,
};
