import { PASSWORD_ISSUE_MESSAGES } from './passwordStrength';

export const SIGNUP_ERROR_MESSAGES = {
  duplicateEmail: 'An account already exists with this email.',
  shortPassword: PASSWORD_ISSUE_MESSAGES.password_too_short,
  unavailable: "We couldn't create your account right now. Please try again.",
  generic: 'We could not create the account with those details.',
};

const SHORT_PASSWORD_CODES = new Set(['password_too_short', 'auth/invalid-password', 'auth/weak-password']);

// Maps API/network failures to applicant-safe copy. Relies on status and stable codes, not provider text.
export function expertSignupErrorMessage(err) {
  const response = err?.response;
  if (!response) return SIGNUP_ERROR_MESSAGES.unavailable;

  const data = response.data && typeof response.data === 'object' ? response.data : {};
  const code = String(data.code || '');
  const serverMessage = typeof data.message === 'string' ? data.message.trim() : '';

  if (code === 'auth/email-already-exists') return SIGNUP_ERROR_MESSAGES.duplicateEmail;
  if (SHORT_PASSWORD_CODES.has(code)) return SIGNUP_ERROR_MESSAGES.shortPassword;
  if (PASSWORD_ISSUE_MESSAGES[code]) return PASSWORD_ISSUE_MESSAGES[code];
  if (code === 'expert_claim_incomplete' && serverMessage) return serverMessage;
  if (code === 'registration_unavailable' || Number(response.status) >= 500) {
    return SIGNUP_ERROR_MESSAGES.unavailable;
  }
  return serverMessage || SIGNUP_ERROR_MESSAGES.generic;
}
