'use strict';

/**
 * Minimal Expert-interest waitlist. Email plus optional canonical category/suburb.
 * Separate from homeowner pilotWaitlist. Admin SDK writes only.
 */

const crypto = require('crypto');
const { admin } = require('../firebaseAdmin');
const { phase1KeysSet } = require('../shared/expertiseCatalog');
const { melbournePilotSuburbNames } = require('../../../shared/auLocations');

const WAITLIST_COLLECTION = 'expertWaitlist';
const EMAIL_MAX = 254;
const CONSENT_VERSION = 'expert-waitlist-contact-v1';
const ALLOWED_SOURCES = new Set([
  'expert-waitlist',
  'landing',
  'get-started',
  'signup',
  'header',
]);
const PILOT_SUBURBS = new Set(melbournePilotSuburbNames);

function normalizeWaitlistEmail(value) {
  const email = String(value || '').trim().toLowerCase();
  if (!email || email.length > EMAIL_MAX) return '';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return '';
  return email;
}

function normalizeOptionalExpertise(value) {
  if (value == null || value === '') return { ok: true, value: '' };
  const key = String(value).trim();
  if (!phase1KeysSet.has(key)) {
    return { ok: false, error: 'Choose a supported task category.' };
  }
  return { ok: true, value: key };
}

function normalizeOptionalSuburb(value) {
  if (value == null || value === '') return { ok: true, value: '' };
  const suburb = String(value).replace(/\s+/g, ' ').trim();
  if (!PILOT_SUBURBS.has(suburb)) {
    return { ok: false, error: 'Choose a supported Inner Melbourne suburb.' };
  }
  return { ok: true, value: suburb };
}

function normalizeWaitlistSource(value) {
  const source = String(value || '').trim();
  return ALLOWED_SOURCES.has(source) ? source : 'expert-waitlist';
}

function waitlistDocId(normalizedEmail) {
  return crypto.createHash('sha256').update(`expert-waitlist:${normalizedEmail}`).digest('hex');
}

function publicWaitlistSuccess() {
  return { ok: true, message: "You're on the waitlist." };
}

function isExplicitWaitlistConsent(value) {
  return value === true;
}

async function addExpertWaitlistSignup(db, {
  email,
  expertise,
  suburb,
  source,
  consentAccepted,
} = {}) {
  const normalizedEmail = normalizeWaitlistEmail(email);
  if (!normalizedEmail) {
    return {
      ok: false,
      status: 400,
      error: { message: 'Please enter a valid email address.' },
    };
  }
  if (!isExplicitWaitlistConsent(consentAccepted)) {
    return {
      ok: false,
      status: 400,
      error: { message: 'Please confirm we can contact you about becoming a Taskio Expert.' },
    };
  }

  const expertiseResult = normalizeOptionalExpertise(expertise);
  if (!expertiseResult.ok) {
    return { ok: false, status: 400, error: { message: expertiseResult.error } };
  }
  const suburbResult = normalizeOptionalSuburb(suburb);
  if (!suburbResult.ok) {
    return { ok: false, status: 400, error: { message: suburbResult.error } };
  }

  const now = admin.firestore.FieldValue.serverTimestamp();
  const ref = db.collection(WAITLIST_COLLECTION).doc(waitlistDocId(normalizedEmail));
  const snap = await ref.get();
  const nextSource = normalizeWaitlistSource(source);
  const nextExpertise = expertiseResult.value;
  const nextSuburb = suburbResult.value;

  if (snap.exists) {
    const previous = snap.data() || {};
    await ref.set({
      expertise: nextExpertise || String(previous.expertise || ''),
      suburb: nextSuburb || String(previous.suburb || ''),
      source: nextSource,
      updatedAt: now,
    }, { merge: true });
  } else {
    await ref.set({
      email: normalizedEmail,
      expertise: nextExpertise,
      suburb: nextSuburb,
      source: nextSource,
      consentVersion: CONSENT_VERSION,
      consentAcceptedAt: now,
      createdAt: now,
      updatedAt: now,
    });
  }

  return { ok: true };
}

module.exports = {
  WAITLIST_COLLECTION,
  EMAIL_MAX,
  CONSENT_VERSION,
  ALLOWED_SOURCES,
  normalizeWaitlistEmail,
  normalizeOptionalExpertise,
  normalizeOptionalSuburb,
  normalizeWaitlistSource,
  waitlistDocId,
  publicWaitlistSuccess,
  isExplicitWaitlistConsent,
  addExpertWaitlistSignup,
};
