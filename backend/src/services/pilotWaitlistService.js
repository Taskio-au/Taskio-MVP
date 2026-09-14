'use strict';

/**
 * Minimal Melbourne-pilot waitlist. Email only plus optional suburb.
 * Admin SDK writes. Do not treat this as a P06-complete privacy flow.
 */

const crypto = require('crypto');
const { admin } = require('../firebaseAdmin');

const WAITLIST_COLLECTION = 'pilotWaitlist';
const EMAIL_MAX = 254;
const SUBURB_MAX = 80;
const CONSENT_VERSION = 'pilot-waitlist-contact-v1';
const ALLOWED_SOURCES = new Set([
  'waitlist',
  'landing',
  'post-job',
  'dashboard',
  'header',
  'get-started',
]);

function normalizeWaitlistEmail(value) {
  const email = String(value || '').trim().toLowerCase();
  if (!email || email.length > EMAIL_MAX) return '';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return '';
  return email;
}

function normalizeWaitlistSuburb(value) {
  const suburb = String(value || '').replace(/\s+/g, ' ').trim();
  return suburb.slice(0, SUBURB_MAX);
}

function normalizeWaitlistSource(value) {
  const source = String(value || '').trim();
  return ALLOWED_SOURCES.has(source) ? source : 'waitlist';
}

function waitlistDocId(normalizedEmail) {
  return crypto.createHash('sha256').update(`pilot-waitlist:${normalizedEmail}`).digest('hex');
}

function publicWaitlistSuccess() {
  return { ok: true, message: "You're on the waitlist." };
}

async function addPilotWaitlistSignup(db, { email, suburb, source, consentAccepted } = {}) {
  const normalizedEmail = normalizeWaitlistEmail(email);
  if (!normalizedEmail) {
    return {
      ok: false,
      status: 400,
      error: { message: 'Please enter a valid email address.' },
    };
  }
  if (consentAccepted !== true) {
    return {
      ok: false,
      status: 400,
      error: { message: 'Please confirm we can contact you about the Melbourne pilot.' },
    };
  }

  const now = admin.firestore.FieldValue.serverTimestamp();
  const ref = db.collection(WAITLIST_COLLECTION).doc(waitlistDocId(normalizedEmail));
  const snap = await ref.get();
  const nextSuburb = normalizeWaitlistSuburb(suburb);
  const nextSource = normalizeWaitlistSource(source);

  if (snap.exists) {
    await ref.set({
      suburb: nextSuburb || String((snap.data() || {}).suburb || ''),
      source: nextSource,
      updatedAt: now,
    }, { merge: true });
  } else {
    await ref.set({
      email: normalizedEmail,
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
  SUBURB_MAX,
  CONSENT_VERSION,
  ALLOWED_SOURCES,
  normalizeWaitlistEmail,
  normalizeWaitlistSuburb,
  normalizeWaitlistSource,
  waitlistDocId,
  publicWaitlistSuccess,
  addPilotWaitlistSignup,
};
