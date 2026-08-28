'use strict';

const { db } = require('../firebaseAdmin');

const RECOGNISED_ROLES = new Set(['homeowner', 'tradie', 'admin']);
const RECOGNISED_STATUSES = new Set(['active', 'disabled', 'pending_deletion', 'deleted']);

function normalisedRole(data) {
  return String(data?.role || '').trim();
}

function normalisedStatus(data) {
  return String(data?.status || '').trim();
}

function classifyUserProfile(snap) {
  if (!snap || snap.exists !== true) {
    return { kind: 'missing', data: null, role: '', status: '' };
  }
  const data = snap.data() || {};
  const role = normalisedRole(data);
  const status = normalisedStatus(data);
  if (!role || !status || !RECOGNISED_ROLES.has(role) || !RECOGNISED_STATUSES.has(status)) {
    return { kind: 'invalid', data, role, status };
  }
  return { kind: 'valid', data, role, status };
}

function isOperationallyActive(classified) {
  return classified?.kind === 'valid' && classified.status === 'active';
}

function hasQuoteAccess(profile) {
  return profile?.quoteAccessVerified === true;
}

function signupDisabledBody() {
  return {
    message: 'Signup is temporarily unavailable.',
    code: 'signup_disabled',
  };
}

function sendSignupDisabled(res) {
  return res.status(503).send(signupDisabledBody());
}

function sendAccountNotEnrolled(res) {
  return res.status(403).send({
    message: 'This account is not enrolled.',
    code: 'account_not_enrolled',
  });
}

function sendAccountStateInvalid(res) {
  return res.status(409).send({
    message: 'This account is in an invalid state and needs support.',
    code: 'account_state_invalid',
  });
}

function sendQuoteAccessRequired(res) {
  return res.status(403).send({
    message: 'Please verify your phone to view quotes.',
    code: 'quote_access_required',
  });
}

function sendAccountNotActive(res) {
  return res.status(403).send({
    message: 'This account is not active.',
    code: 'account_not_active',
  });
}

function respondIfNotValidProfile(res, classified) {
  if (!classified || classified.kind === 'missing') {
    sendAccountNotEnrolled(res);
    return true;
  }
  if (classified.kind === 'invalid') {
    sendAccountStateInvalid(res);
    return true;
  }
  return false;
}

async function loadClassifiedProfile(uid) {
  const ref = db.collection('users').doc(uid);
  const snap = await ref.get();
  return { ref, snap, ...classifyUserProfile(snap) };
}

/**
 * Existing-valid-profile gate. Never creates a document.
 * Structural enrolment (recognised role + status) is separate from operational
 * access: disabled / pending_deletion / deleted profiles are valid structure
 * but fail when requireOperationallyActive is set.
 */
function requireEnrolledProfile(options = {}) {
  const {
    requireQuoteAccess = false,
    requireOperationallyActive = false,
    requireRole = null,
  } = options;

  return async (req, res, next) => {
    const uid = req.user?.uid;
    if (!uid) return sendAccountNotEnrolled(res);

    try {
      const classified = await loadClassifiedProfile(uid);
      req.enrolledProfile = classified;
      if (classified.kind === 'missing') return sendAccountNotEnrolled(res);
      if (classified.kind === 'invalid') return sendAccountStateInvalid(res);
      if (requireRole && classified.role !== requireRole) {
        return res.status(403).send({
          message: `Forbidden: Requires role ${requireRole}. Your role is '${classified.role}'.`,
        });
      }
      if (requireOperationallyActive && !isOperationallyActive(classified)) {
        return sendAccountNotActive(res);
      }
      if (requireQuoteAccess && !hasQuoteAccess(classified.data)) {
        return sendQuoteAccessRequired(res);
      }
      return next();
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('requireEnrolledProfile failed:', error);
      return res.status(500).send({ message: 'Failed to load account.' });
    }
  };
}

module.exports = {
  RECOGNISED_ROLES,
  RECOGNISED_STATUSES,
  classifyUserProfile,
  isOperationallyActive,
  hasQuoteAccess,
  signupDisabledBody,
  sendSignupDisabled,
  sendAccountNotEnrolled,
  sendAccountStateInvalid,
  sendQuoteAccessRequired,
  sendAccountNotActive,
  respondIfNotValidProfile,
  loadClassifiedProfile,
  requireEnrolledProfile,
};
