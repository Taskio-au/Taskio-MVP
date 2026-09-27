'use strict';

/**
 * Minimal Expert-interest waitlist. Email plus canonical expertise/service-area arrays.
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

function normalizeExpertiseSelection(value) {
  const raw = Array.isArray(value) ? value : (value == null || value === '' ? [] : [value]);
  const seen = new Set();
  const expertise = [];
  for (const item of raw) {
    const key = String(item || '').trim();
    if (!phase1KeysSet.has(key)) {
      return { ok: false, error: 'Choose supported areas of expertise.' };
    }
    if (seen.has(key)) continue;
    seen.add(key);
    expertise.push(key);
  }
  if (expertise.length === 0) {
    return { ok: false, error: 'Choose at least one area of expertise.' };
  }
  return { ok: true, value: expertise };
}

function normalizeServiceAreaSelection(value, legacySuburb) {
  const raw = Array.isArray(value)
    ? value
    : (value == null || value === ''
      ? (legacySuburb == null || legacySuburb === '' ? [] : [legacySuburb])
      : [value]);
  const seen = new Set();
  const serviceAreas = [];
  for (const item of raw) {
    const suburb = String(item || '').replace(/\s+/g, ' ').trim();
    if (!PILOT_SUBURBS.has(suburb)) {
      return { ok: false, error: 'Choose supported Inner Melbourne service areas.' };
    }
    if (seen.has(suburb)) continue;
    seen.add(suburb);
    serviceAreas.push(suburb);
  }
  if (serviceAreas.length === 0) {
    return { ok: false, error: 'Choose at least one service area.' };
  }
  return { ok: true, value: serviceAreas };
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
  serviceAreas,
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

  const expertiseResult = normalizeExpertiseSelection(expertise);
  if (!expertiseResult.ok) {
    return { ok: false, status: 400, error: { message: expertiseResult.error } };
  }
  const serviceAreasResult = normalizeServiceAreaSelection(serviceAreas, suburb);
  if (!serviceAreasResult.ok) {
    return { ok: false, status: 400, error: { message: serviceAreasResult.error } };
  }

  const now = admin.firestore.FieldValue.serverTimestamp();
  const ref = db.collection(WAITLIST_COLLECTION).doc(waitlistDocId(normalizedEmail));
  const snap = await ref.get();
  const nextSource = normalizeWaitlistSource(source);
  const nextExpertise = expertiseResult.value;
  const nextServiceAreas = serviceAreasResult.value;
  const nextSuburb = nextServiceAreas[0];

  if (snap.exists) {
    await ref.set({
      expertise: nextExpertise,
      serviceAreas: nextServiceAreas,
      suburb: nextSuburb,
      source: nextSource,
      updatedAt: now,
    }, { merge: true });
  } else {
    await ref.set({
      email: normalizedEmail,
      expertise: nextExpertise,
      serviceAreas: nextServiceAreas,
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
  normalizeExpertiseSelection,
  normalizeServiceAreaSelection,
  normalizeWaitlistSource,
  waitlistDocId,
  publicWaitlistSuccess,
  isExplicitWaitlistConsent,
  addExpertWaitlistSignup,
};
