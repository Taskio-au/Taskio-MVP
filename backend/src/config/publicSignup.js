'use strict';

/**
 * Public Expert enrollment kill switch.
 *
 * TASKIO_PUBLIC_SIGNUP_ENABLED:
 *   "true"  => Expert /api/users/register may proceed
 *   "false" => disabled
 *   missing/blank:
 *     production    => disabled (fail closed)
 *     non-production => allowed (local/test usability)
 *   any other value => disabled
 *
 * Homeowner enrollment is NOT this flag. New homeowner accounts are created by
 * phone-verified POST /api/me/homeowner/activate-quote-access. New job posting
 * is gated by persisted pilot operational state (OPEN / CLOSED / PAUSED).
 *
 * Do not infer enablement from Firebase client config or Hosting.
 */

function readFlag(env) {
  const raw = env.TASKIO_PUBLIC_SIGNUP_ENABLED;
  if (raw === undefined || raw === null) return null;
  const trimmed = String(raw).trim();
  return trimmed === '' ? null : trimmed;
}

function isProductionNodeEnv(env) {
  return (env.NODE_ENV || 'development') === 'production';
}

function isPublicSignupEnabled(env = process.env) {
  const flag = readFlag(env);
  if (flag === null) {
    return !isProductionNodeEnv(env);
  }
  return flag === 'true';
}

function signupDisabledBody() {
  return {
    message: 'Signup is temporarily unavailable.',
    code: 'signup_disabled',
  };
}

function requirePublicSignupEnabled(req, res, next) {
  if (!isPublicSignupEnabled()) {
    return res.status(503).send(signupDisabledBody());
  }
  return next();
}

module.exports = {
  isPublicSignupEnabled,
  signupDisabledBody,
  requirePublicSignupEnabled,
};
