'use strict';

/**
 * Derive material mismatch reason codes for trust-critical profile change requests.
 * Does not auto-approve — feeds risk scoring + audit only.
 */

function collectMismatchCodes(user, request) {
  const codes = [];
  if (!user || !request) return codes;

  const verified = user.verified === true;
  const field = String(request.field || '');
  const patch = request.requestedPatch && typeof request.requestedPatch === 'object' ? request.requestedPatch : {};

  if (verified && (field === 'firstName' || field === 'lastName' || patch.displayName)) {
    codes.push('LEGAL_NAME_CHANGED_AFTER_VERIFICATION');
  }

  if (field === 'abn' || patch.abn) {
    codes.push('ABN_CHANGED');
  }

  const bizName = String(user.businessName || '').toLowerCase().trim();
  const reqBiz = String(request.requestedValue || patch.businessName || '').toLowerCase().trim();
  if (field === 'businessName' && bizName && reqBiz && bizName !== reqBiz && user.abnVerified) {
    codes.push('BUSINESS_DETAILS_INCONSISTENT');
  }

  if (user.abnVerified && field === 'businessName' && reqBiz.length > 3 && bizName && !bizName.includes(reqBiz.slice(0, Math.min(4, reqBiz.length)))) {
    codes.push('ABN_NAME_MISMATCH');
  }

  return [...new Set(codes)];
}

module.exports = { collectMismatchCodes };
