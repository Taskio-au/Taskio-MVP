// src/services/phoneVerification.js
//
// Firebase Phone Auth helper utilities (AU mobile only).
// This flow verifies a phone number for eligibility and stores the result in Firestore.
// It should NOT replace primary email/password auth.

import {
  PhoneAuthProvider,
  RecaptchaVerifier,
  signInWithPhoneNumber,
  linkWithCredential,
  linkWithPhoneNumber,
} from 'firebase/auth';

export function normalizeAuMobileToE164(rawInput) {
  const raw = String(rawInput || '').trim();
  if (!raw) throw new Error('Phone is required.');

  // Remove spaces, parentheses, dashes.
  let s = raw.replace(/[()\-\s]/g, '');

  // Allow leading "+" for E.164.
  if (s.startsWith('00')) s = `+${s.slice(2)}`; // 00 -> +

  if (s.startsWith('+61')) {
    // already E.164 AU
  } else if (s.startsWith('61')) {
    s = `+${s}`;
  } else if (s.startsWith('04')) {
    // 04xx... -> +614xx...
    s = `+61${s.slice(1)}`;
  } else if (s.startsWith('4')) {
    // 4xx... -> +614xx...
    s = `+61${s}`;
  }

  // AU mobile E.164: +61 + 9 digits (typically starts with 4)
  if (!/^\+61\d{9}$/.test(s)) {
    throw new Error('Enter a valid Australian mobile number (e.g. 04xx xxx xxx).');
  }
  // Enforce mobile starts with 4 after country code (optional but helps)
  if (!/^\+614\d{8}$/.test(s)) {
    throw new Error('Enter a valid Australian mobile number (e.g. 04xx xxx xxx).');
  }

  return s;
}

export const RECAPTCHA_CONTAINER_MISSING =
  'Phone verification is not ready. Please try again.';

export function assertRecaptchaContainerMounted(containerId) {
  if (typeof document === 'undefined' || !containerId) {
    const error = new Error(RECAPTCHA_CONTAINER_MISSING);
    error.code = 'recaptcha-container-missing';
    throw error;
  }
  const el = document.getElementById(containerId);
  if (!el) {
    const error = new Error(RECAPTCHA_CONTAINER_MISSING);
    error.code = 'recaptcha-container-missing';
    throw error;
  }
  return el;
}

export function createInvisibleRecaptcha(auth, containerId, params = {}) {
  // This project uses Firebase v12 (modular). Signature:
  // new RecaptchaVerifier(auth, containerOrId, parameters)
  if (!auth) throw new Error('Missing auth instance.');
  assertRecaptchaContainerMounted(containerId);
  return new RecaptchaVerifier(auth, containerId, {
    size: 'invisible',
    ...(params || {}),
  });
}

export function clearRecaptchaVerifier(verifierRef) {
  try {
    verifierRef?.current?.clear?.();
  } catch (error) {
    // ignore cleanup failures
  }
  if (verifierRef) verifierRef.current = null;
}

export function ensureOfficialRecaptchaVerifier({
  auth,
  containerId,
  verifierRef,
  params = {},
} = {}) {
  if (!auth) throw new Error('Missing auth instance.');
  if (!verifierRef) throw new Error('Missing reCAPTCHA verifier ref.');
  if (verifierRef.current) return verifierRef.current;
  verifierRef.current = createInvisibleRecaptcha(auth, containerId, params);
  return verifierRef.current;
}

function buildDuplicatePhoneError(code) {
  const e = new Error('This phone number is already linked to another Taskio account. Use that account instead or choose a different number.');
  e.code = code;
  return e;
}

export async function requestPhoneOtp({ auth, user, phoneNumberE164, recaptchaVerifier }) {
  if (!user) throw new Error('You must be logged in.');
  if (!phoneNumberE164) throw new Error('Phone number is required.');
  if (!recaptchaVerifier) throw new Error('Missing reCAPTCHA verifier.');

  try {
    // Link flow (preferred): does not switch auth state to a phone-only user.
    const confirmationResult = await linkWithPhoneNumber(user, phoneNumberE164, recaptchaVerifier);
    return confirmationResult;
  } catch (error) {
    if (error?.code === 'auth/unauthorized-domain') {
      const e = new Error(
        'This domain isn’t authorised for Firebase Auth. Add this domain in Firebase Console → Authentication → Settings → Authorized domains.'
      );
      e.code = error.code;
      throw e;
    }
    if (error?.code === 'auth/operation-not-allowed') {
      const e = new Error(
        'Phone sign-in isn’t enabled for this Firebase project. Enable it in Firebase Console → Authentication → Sign-in method → Phone.'
      );
      e.code = error.code;
      throw e;
    }
    if (error?.code === 'auth/network-request-failed') {
      const e = new Error(
        'Network request failed while contacting Firebase/reCAPTCHA. Please check your connection, VPN/proxy, and that Google reCAPTCHA domains are not blocked.'
      );
      e.code = error.code;
      throw e;
    }
    if (error?.code === 'auth/requires-recent-login') {
      const e = new Error('For security, please log out and log back in, then try phone verification again.');
      e.code = error.code;
      throw e;
    }
    if (error?.code === 'auth/too-many-requests') {
      const e = new Error('Too many attempts. Please wait a minute and try again.');
      e.code = error.code;
      throw e;
    }
    if (error?.code === 'auth/invalid-phone-number') {
      const e = new Error('Invalid phone number. Please use an Australian mobile number (e.g. 04xx xxx xxx).');
      e.code = error.code;
      throw e;
    }
    if (error?.code === 'auth/invalid-app-credential' || error?.code === 'auth/captcha-check-failed') {
      const e = new Error(
        'Phone verification is blocked by reCAPTCHA. Please disable ad blockers/VPN, allow third‑party cookies, and ensure this domain is added in Firebase Auth → Settings → Authorized domains.'
      );
      e.code = error.code;
      throw e;
    }
    if (error?.code === 'auth/provider-already-linked') {
      const e = new Error('Your phone is already linked to this account.');
      e.code = error.code;
      throw e;
    }
    if (error?.code === 'auth/credential-already-in-use' || error?.code === 'auth/account-exists-with-different-credential') {
      throw buildDuplicatePhoneError(error.code);
    }
    throw error;
  }
}

export async function confirmPhoneOtp({ auth, user, confirmationResult, code }) {
  if (!user) throw new Error('You must be logged in.');
  if (!confirmationResult) throw new Error('Please send a code first.');
  if (!/^\d{6}$/.test(String(code || '').trim())) throw new Error('Enter the 6-digit code.');

  const originalUid = user.uid;

  try {
    // Prefer confirmationResult.confirm — with linkWithPhoneNumber this links to current user.
    const result = await confirmationResult.confirm(String(code).trim());

    // Safety: If SDK signs into a different user (shouldn't happen with linkWithPhoneNumber), re-link to original.
    if (result?.user?.uid && result.user.uid !== originalUid) {
      const cred = PhoneAuthProvider.credential(confirmationResult.verificationId, String(code).trim());
      await linkWithCredential(user, cred);
      // Best-effort: restore email user session if it was swapped
      try {
        await auth.updateCurrentUser(user);
      } catch (e) {
        // ignore
      }
    }

    return result;
  } catch (error) {
    if (error?.code === 'auth/too-many-requests') {
      const e = new Error('Too many attempts. Please wait a minute and try again.');
      e.code = error.code;
      throw e;
    }
    if (error?.code === 'auth/provider-already-linked') {
      const e = new Error('Your phone is already linked to this account.');
      e.code = error.code;
      throw e;
    }
    if (error?.code === 'auth/credential-already-in-use' || error?.code === 'auth/account-exists-with-different-credential') {
      throw buildDuplicatePhoneError(error.code);
    }
    if (error?.code === 'auth/invalid-app-credential' || error?.code === 'auth/captcha-check-failed') {
      const e = new Error(
        'Phone verification is blocked by reCAPTCHA. Please try again with ad blockers/VPN disabled and ensure this domain is authorized in Firebase Auth.'
      );
      e.code = error.code;
      throw e;
    }
    if (error?.code === 'auth/invalid-verification-code') {
      const e = new Error('Invalid code. Please check and try again.');
      e.code = error.code;
      throw e;
    }
    if (error?.code === 'auth/code-expired') {
      const e = new Error('Code expired. Please request a new one.');
      e.code = error.code;
      throw e;
    }
    if (error?.code === 'auth/user-disabled') {
      const e = new Error('This phone number is currently unavailable for sign-in. Please use a different number or check Firebase Authentication users.');
      e.code = error.code;
      throw e;
    }
    throw error;
  }
}

export async function requestPhoneOtpForSignIn({ auth, phoneNumberE164, recaptchaVerifier }) {
  if (!auth) throw new Error('Missing auth instance.');
  if (!phoneNumberE164) throw new Error('Phone number is required.');
  if (!recaptchaVerifier) throw new Error('Missing reCAPTCHA verifier.');

  try {
    return await signInWithPhoneNumber(auth, phoneNumberE164, recaptchaVerifier);
  } catch (error) {
    if (error?.code === 'auth/unauthorized-domain') {
      const e = new Error(
        'This domain isn’t authorised for Firebase Auth. Add this domain in Firebase Console → Authentication → Settings → Authorized domains.'
      );
      e.code = error.code;
      throw e;
    }
    if (error?.code === 'auth/operation-not-allowed') {
      const e = new Error(
        'Phone sign-in isn’t enabled for this Firebase project. Enable it in Firebase Console → Authentication → Sign-in method → Phone.'
      );
      e.code = error.code;
      throw e;
    }
    if (error?.code === 'auth/network-request-failed') {
      const e = new Error('Network request failed while sending your verification code. Please check your connection and try again.');
      e.code = error.code;
      throw e;
    }
    if (error?.code === 'auth/too-many-requests') {
      const e = new Error('Too many attempts. Please wait a minute and try again.');
      e.code = error.code;
      throw e;
    }
    if (error?.code === 'auth/invalid-phone-number') {
      const e = new Error('Invalid phone number. Please use an Australian mobile number (e.g. 04xx xxx xxx).');
      e.code = error.code;
      throw e;
    }
    if (error?.code === 'auth/invalid-app-credential' || error?.code === 'auth/captcha-check-failed') {
      const e = new Error(
        'Phone verification is blocked by reCAPTCHA. Please disable ad blockers/VPN, allow third-party cookies, and ensure this domain is added in Firebase Auth → Settings → Authorized domains.'
      );
      e.code = error.code;
      throw e;
    }
    throw error;
  }
}

export async function confirmPhoneOtpForSignIn({ confirmationResult, code }) {
  if (!confirmationResult) throw new Error('Please send a code first.');
  if (!/^\d{6}$/.test(String(code || '').trim())) throw new Error('Enter the 6-digit code.');

  try {
    return await confirmationResult.confirm(String(code).trim());
  } catch (error) {
    if (error?.code === 'auth/too-many-requests') {
      const e = new Error('Too many attempts. Please wait a minute and try again.');
      e.code = error.code;
      throw e;
    }
    if (error?.code === 'auth/invalid-verification-code') {
      const e = new Error('Invalid code. Please check and try again.');
      e.code = error.code;
      throw e;
    }
    if (error?.code === 'auth/code-expired') {
      const e = new Error('Code expired. Please request a new one.');
      e.code = error.code;
      throw e;
    }
    if (error?.code === 'auth/user-disabled') {
      const e = new Error('This phone number is currently unavailable for sign-in. Please use a different number or check Firebase Authentication users.');
      e.code = error.code;
      throw e;
    }
    throw error;
  }
}
