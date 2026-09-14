'use strict';

/**
 * Minimal Melbourne-pilot waitlist. Email only plus optional suburb.
 * Admin SDK writes. Do not treat this as a P06-complete privacy flow.
 */

const { admin } = require('../firebaseAdmin');

const WAITLIST_COLLECTION = 'pilotWaitlist';
const EMAIL_MAX = 254;

function normalizeWaitlistEmail(value) {
  const email = String(value || '').trim().toLowerCase();
  if (!email || email.length > EMAIL_MAX) return '';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return '';
  return email;
}

function normalizeWaitlistSuburb(value) {
  const suburb = String(value || '').replace(/\s+/g, ' ').trim();
  return suburb.slice(0, 80);
}

async function addPilotWaitlistSignup(db, { email, suburb, source } = {}) {
  const normalizedEmail = normalizeWaitlistEmail(email);
  if (!normalizedEmail) {
    return {
      ok: false,
      status: 400,
      error: { message: 'Please enter a valid email address.' },
    };
  }

  await db.collection(WAITLIST_COLLECTION).add({
    email: normalizedEmail,
    suburb: normalizeWaitlistSuburb(suburb),
    source: String(source || 'waitlist').trim().slice(0, 40),
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
  });

  return { ok: true };
}

module.exports = {
  WAITLIST_COLLECTION,
  normalizeWaitlistEmail,
  addPilotWaitlistSignup,
};
