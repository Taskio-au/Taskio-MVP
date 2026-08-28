'use strict';

const express = require('express');
const crypto = require('crypto');
const rateLimit = require('express-rate-limit');
const { ipKeyGenerator } = rateLimit;

const { admin, db } = require('../firebaseAdmin');
const { requireAuth, requireRole } = require('../middleware/auth');
const {
  classifyUserProfile,
  hasQuoteAccess,
  isOperationallyActive,
  loadClassifiedProfile,
  respondIfNotValidProfile,
  sendAccountNotActive,
  sendAccountNotEnrolled,
  sendAccountStateInvalid,
  sendIfMissingProfile,
  isMissingDocumentError,
  sendQuoteAccessRequired,
  sendSignupDisabled,
} = require('../utils/enrolledProfile');
const { isPublicSignupEnabled } = require('../config/publicSignup');
const { isValidAbn, cleanAbn } = require('../utils/abn');
const { lookupAbnDetails, isAbnCurrentlyActive, summarizeAbnLookupError } = require('../services/abnLookup');
const { phase1KeysSet } = require('../shared/expertiseCatalog');
const {
  computeEligibility,
  computeProfileCompleted,
  normalizeBusinessType,
  requiresAbn,
  requiresBusinessName,
} = require('../utils/v11TradieEligibility');
const { writeUserAuditLog } = require('../utils/auditLogs');
const { hasVerifiedPhone } = require('../utils/verifiedPhone');
const { evaluateProfileRequestRiskById } = require('../services/riskAutomationPipeline');
const { safeToMillis } = require('../utils/firestore');
const { isSupportedMelbournePilotLocation, INNER_MELBOURNE_LAUNCH_MESSAGE } = require('../../../shared/auLocations');
const { buildExpertFoundingFeeProfile } = require('../services/expertFeeProgram');

const router = express.Router();
const HOMEOWNER_NAME_CHANGE_COOLDOWN_DAYS = 30;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

const ABN_VERIFY_WINDOW_MS = 15 * 60 * 1000;
const ABN_VERIFY_MAX = 20;
const abnVerifyLimiter = rateLimit({
  windowMs: ABN_VERIFY_WINDOW_MS,
  max: ABN_VERIFY_MAX,
  standardHeaders: true,
  legacyHeaders: false,
  statusCode: 429,
  message: { message: 'Too many ABN verification attempts. Please try again later.' },
  keyGenerator: (req) => {
    const uid = String(req.user?.uid || '').trim();
    if (uid) return `abn-verify:uid:${uid}`;
    const ip = String(req.ip || '').trim();
    if (ip) return `abn-verify:ip:${ipKeyGenerator(ip)}`;
    return 'abn-verify:ip:unknown';
  },
  validate: { keyGeneratorIpFallback: false, xForwardedForHeader: false },
});

function sha256Base64Url(input) {
  return crypto.createHash('sha256').update(String(input)).digest('base64url');
}

function getOtpSalt() {
  const salt = String(process.env.OTP_SALT || '').trim();
  if (!salt) {
    const err = new Error('OTP verification is not configured.');
    err.code = 'otp_not_configured';
    throw err;
  }
  return salt;
}

function isSafeString(v, max = 5000) {
  return typeof v === 'string' && v.length <= max;
}

function sanitizePlainText(input, maxLen) {
  if (!isSafeString(input, maxLen)) return '';
  return input.replace(/<[^>]*>/g, '').trim();
}

function parseExpertise(input) {
  if (Array.isArray(input)) {
    return input
      .map((x) => String(x || '').trim())
      .filter(Boolean)
      .slice(0, 12);
  }
  const s = String(input || '').trim();
  if (!s) return [];
  return s
    .split(',')
    .map((x) => x.trim())
    .filter(Boolean)
    .slice(0, 12);
}

function parseNameParts(displayName) {
  const s = String(displayName || '').trim().replace(/\s+/g, ' ');
  if (!s) return { firstName: '', lastName: '' };
  const parts = s.split(' ');
  const firstName = parts[0] || '';
  const lastName = parts.slice(1).join(' ').trim();
  return { firstName, lastName };
}

function buildDisplayNameFromParts(firstName, lastName) {
  return String(`${String(firstName || '').trim()} ${String(lastName || '').trim()}`)
    .trim()
    .replace(/\s+/g, ' ');
}

function sanitizeOptionalName(input, max = 80) {
  const value = String(input || '').trim().replace(/\s+/g, ' ');
  if (!value) return '';
  if (value.length > max) return null;
  return value;
}

function hasMeaningfulNameChars(value) {
  return /[\p{L}\p{N}]/u.test(String(value || ''));
}

function getHomeownerNameChangeWindow(userDoc = {}) {
  const lastUpdatedMs = safeToMillis(userDoc?.lastNameUpdatedAt) || safeToMillis(userDoc?.nameUpdatedAt);
  if (!lastUpdatedMs) {
    return {
      canChange: true,
      blockedUntilMs: null,
      daysRemaining: 0,
      message: '',
    };
  }
  const blockedUntilMs = lastUpdatedMs + (HOMEOWNER_NAME_CHANGE_COOLDOWN_DAYS * MS_PER_DAY);
  if (Date.now() >= blockedUntilMs) {
    return {
      canChange: true,
      blockedUntilMs: null,
      daysRemaining: 0,
      message: '',
    };
  }
  const daysRemaining = Math.max(1, Math.ceil((blockedUntilMs - Date.now()) / MS_PER_DAY));
  return {
    canChange: false,
    blockedUntilMs,
    daysRemaining,
    message: `You can update your name again after ${daysRemaining} day${daysRemaining === 1 ? '' : 's'}.`,
  };
}

function validateRequiredHomeownerName(input, label) {
  const value = String(input || '').trim().replace(/\s+/g, ' ');
  if (!value) return { value: '', error: `${label} is required.` };
  if (value.length > 80) return { value: '', error: `${label} must be under 80 characters.` };
  if (!hasMeaningfulNameChars(value)) return { value: '', error: `${label} is invalid.` };
  return { value, error: '' };
}

function jobHasPaymentHistory(job = {}) {
  const paymentState = String(job.paymentState || '').trim().toLowerCase();
  const paymentStatus = String(job.paymentStatus || '').trim().toLowerCase();
  return Boolean(
    job?.fundedAt
    || job?.releasedAt
    || ['in_escrow', 'released', 'refunded'].includes(paymentState)
    || paymentStatus === 'succeeded'
  );
}

async function getHomeownerPaymentHistory(uid) {
  if (!uid) return false;
  const snap = await db.collection('jobs').where('homeownerUid', '==', uid).limit(50).get();
  if (snap.empty) return false;
  return snap.docs.some((doc) => jobHasPaymentHistory(doc.data() || {}));
}

async function writeHomeownerNameChangeAudit({ uid, oldFirstName, oldLastName, newFirstName, newLastName, req }) {
  return db.collection('homeowner_name_change_audit').add({
    uid,
    oldFirstName: String(oldFirstName || ''),
    oldLastName: String(oldLastName || ''),
    newFirstName: String(newFirstName || ''),
    newLastName: String(newLastName || ''),
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    ip: req?.ip || null,
    userAgent: req?.headers?.['user-agent'] || null,
    path: req?.originalUrl || null,
  });
}

function hasHomeownerFirstName(profile = {}) {
  const explicitFirstName = String(profile.firstName || '').trim();
  if (explicitFirstName) return true;
  return Boolean(parseNameParts(profile.displayName || profile.name || '').firstName);
}

function hasDurableHomeownerAccount(profile = {}, decodedToken = {}) {
  const phoneVerified = hasVerifiedPhone(profile, decodedToken);
  const emailVerified = profile.emailVerified === true || decodedToken?.email_verified === true;
  return phoneVerified && emailVerified && hasHomeownerFirstName(profile);
}

function isLikelyFirebaseStorageUrl(url) {
  const s = String(url || '');
  return (
    s.startsWith('https://firebasestorage.googleapis.com/')
    || s.startsWith('https://storage.googleapis.com/')
    // Allow Firebase Storage emulator URLs in non-production environments
    || (process.env.NODE_ENV !== 'production'
      && (
        s.startsWith('http://127.0.0.1:9199/')
        || s.startsWith('http://localhost:9199/')
        || s.startsWith('http://0.0.0.0:9199/')
      ))
  );
}

function addDays(date, days) {
  const d = new Date(date.getTime());
  d.setDate(d.getDate() + days);
  return d;
}

function parseDobInput(input) {
  // Accept { day, month, year } OR "YYYY-MM-DD" OR "DD/MM/YYYY"
  if (!input) return null;
  if (typeof input === 'string') {
    const s = input.trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
      const [y, m, d] = s.split('-').map((x) => Number(x));
      return { day: d, month: m, year: y };
    }
    if (/^\d{2}\/\d{2}\/\d{4}$/.test(s)) {
      const [d, m, y] = s.split('/').map((x) => Number(x));
      return { day: d, month: m, year: y };
    }
  }
  if (typeof input === 'object') {
    const day = Number(input.day);
    const month = Number(input.month);
    const year = Number(input.year);
    return { day, month, year };
  }
  return null;
}

function isRealDate({ day, month, year }) {
  if (!Number.isFinite(day) || !Number.isFinite(month) || !Number.isFinite(year)) return false;
  if (year < 1900 || year > 2100) return false;
  if (month < 1 || month > 12) return false;
  if (day < 1 || day > 31) return false;
  const d = new Date(Date.UTC(year, month - 1, day));
  return d.getUTCFullYear() === year && (d.getUTCMonth() + 1) === month && d.getUTCDate() === day;
}

function validateServiceLocation(input) {
  const loc = input && typeof input === 'object' ? input : null;
  if (!loc) return null;
  const postcode = String(loc.postcode || '').trim();
  const suburb = String(loc.suburb || '').trim();
  const state = String(loc.state || '').trim();
  const label = String(loc.label || '').trim();
  const country = String(loc.country || 'AU').trim() || 'AU';
  if (!/^[0-9]{4}$/.test(postcode)) return null;
  if (!suburb || suburb.length < 2) return null;
  if (!state || state.length < 2 || state.length > 4) return null;
  if (!label || label.length < 3 || label.length > 120) return null;
  if (country !== 'AU') return null;
  if (!isSupportedMelbournePilotLocation({ suburb, state, postcode })) return null;
  return { label, suburb, state, postcode, country };
}

async function mirrorAuthContactFields(classified, decodedToken) {
  const data = classified.data || {};
  const updates = {};
  const email = decodedToken?.email ? String(decodedToken.email).trim().toLowerCase() : '';
  if (email && email !== String(data.email || '').trim().toLowerCase()) {
    updates.email = email;
  }
  if (decodedToken?.email_verified === true && data.emailVerified !== true) {
    updates.emailVerified = true;
  }
  const phone = decodedToken?.phone_number ? String(decodedToken.phone_number).trim() : '';
  if (phone && phone !== String(data.phone || '').trim()) {
    updates.phone = phone;
  }
  if (decodedToken?.phone_number && data.phoneVerified !== true) {
    updates.phoneVerified = true;
  }
  if (Object.keys(updates).length === 0) {
    return classified;
  }
  updates.updatedAt = admin.firestore.FieldValue.serverTimestamp();
  await classified.ref.update(updates);
  const fresh = await classified.ref.get();
  return {
    ...classified,
    snap: fresh,
    data: fresh.data() || data,
  };
}

async function loadValidProfileOrSend(uid, res) {
  const classified = await loadClassifiedProfile(uid);
  if (respondIfNotValidProfile(res, classified)) return null;
  return classified;
}

function normalizeStringArray(input, max = 50) {
  if (!Array.isArray(input)) return [];
  const out = [];
  for (const x of input) {
    const s = String(x || '').trim();
    if (!s) continue;
    if (!out.includes(s)) out.push(s);
    if (out.length >= max) break;
  }
  return out;
}

function pruneToPhase1(keys) {
  const cleaned = normalizeStringArray(keys);
  const kept = [];
  const removed = [];
  for (const k of cleaned) {
    if (phase1KeysSet.has(k)) kept.push(k);
    else removed.push(k);
  }
  return { kept, removed };
}

async function ensureExpertiseApprovedPhase1({ uid, userRef, userDoc }) {
  // Phase 1 migration:
  // - If legacy user.expertise exists and expertiseApproved missing, copy it.
  // - Always prune expertiseApproved to Phase 1 keys.
  const beforeApproved = Array.isArray(userDoc?.expertiseApproved) ? userDoc.expertiseApproved : null;
  const legacy = userDoc?.expertise;

  let approved = beforeApproved;
  const log = Array.isArray(userDoc?.expertiseChangeLog) ? userDoc.expertiseChangeLog.slice(0, 50) : [];
  // NOTE: Firestore does not allow FieldValue.serverTimestamp() inside arrays.
  // Use a concrete timestamp value.
  const now = admin.firestore.Timestamp.now();
  let changed = false;

  if (!approved && legacy) {
    const legacyArr = Array.isArray(legacy)
      ? legacy
      : String(legacy || '')
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
    approved = legacyArr;
    log.push({ action: 'migrate', category: 'legacy_expertise', by: 'admin', at: now });
    changed = true;
  }

  if (approved) {
    const { kept, removed } = pruneToPhase1(approved);
    if (removed.length > 0) {
      for (const r of removed) log.push({ action: 'phase1_prune', category: r, by: 'admin', at: now });
      approved = kept;
      changed = true;
    }
  }

  if (!changed) return userDoc;

  const updates = {
    expertiseApproved: Array.isArray(approved) ? approved : [],
    expertiseUpdatedAt: admin.firestore.FieldValue.serverTimestamp(),
    expertiseChangeLog: log.slice(-50),
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  };
  await userRef.update(updates);
  const fresh = await userRef.get();
  return fresh.data() || userDoc;
}

/**
 * GET /api/me
 * Returns current user profile + V11 quote eligibility (reasons + checklist)
 */
router.get('/api/me', requireAuth, async (req, res) => {
  try {
    const uid = req.user.uid;
    const classified = await loadValidProfileOrSend(uid, res);
    if (!classified) return undefined;
    const mirrored = await mirrorAuthContactFields(classified, req.user);
    const ref = mirrored.ref;
    const raw = mirrored.data;
    const data = raw?.role === 'tradie' ? await ensureExpertiseApprovedPhase1({ uid, userRef: ref, userDoc: raw }) : raw;
    const isHomeowner = data?.role === 'homeowner';

    // Auto-heal: if a tradie already has private details saved, mark them as locked so locks persist after relogin.
    // (This supports legacy accounts created before the explicit confirmation flag existed.)
    try {
      if (data?.role === 'tradie' && data?.privateDetailsLocked !== true) {
        const bt = normalizeBusinessType(data?.businessType);
        const needsAbn = requiresAbn(bt, data?.businessName);
        const dob = data?.dob;
        const hasDob = dob && typeof dob === 'object' && Number(dob.day) > 0 && Number(dob.month) > 0 && Number(dob.year) > 0;
        const hasBusinessType = !!bt;
        const hasAbn = String(data?.abn || '').trim().length > 0;
        const abnSatisfied = !needsAbn || (hasAbn && data?.abnVerified === true);
        if (hasDob && hasBusinessType && abnSatisfied) {
          await ref.update({
            privateDetailsLocked: true,
            privateDetailsLockedAt: admin.firestore.FieldValue.serverTimestamp(),
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          });
          data.privateDetailsLocked = true;
        }
      }
    } catch (healErr) {
      if (isMissingDocumentError(healErr)) throw healErr;
      // ignore other auto-heal failures
    }

    const eligibility = data?.role === 'tradie'
      ? computeEligibility({ decodedToken: req.user, userDoc: data })
      : { eligible: true, reasons: [], checklist: null, derived: null };
    const derivedAccountCompleted = data?.role === 'homeowner'
      ? hasDurableHomeownerAccount(data, req.user)
      : !!data.accountCompleted;
    const homeownerNameChangeWindow = isHomeowner ? getHomeownerNameChangeWindow(data) : null;
    const hasPaymentHistory = isHomeowner ? await getHomeownerPaymentHistory(uid) : false;

    const nowForFees = new Date();
    const foundingExpertFeeProfile =
      data?.role === 'tradie' ? buildExpertFoundingFeeProfile(data, nowForFees) : null;

    const displayNameFromLegacy = String(data.displayName || data.name || '').trim();
    const fnResolved = String(data.firstName || '').trim();
    const lnResolved = String(data.lastName || '').trim();
    const displayNameFromParts = `${fnResolved} ${lnResolved}`.trim();
    const displayNameResolved =
      displayNameFromLegacy.length >= 2 ? displayNameFromLegacy : (displayNameFromParts.length >= 2 ? displayNameFromParts : '');

    return res.status(200).send({
      uid,
      profile: {
        role: data.role,
        status: data.status,
        verified: !!data.verified,
        privateDetailsLocked: !!data.privateDetailsLocked,
        privateDetailsLockedAt: data.privateDetailsLockedAt || null,
        firstName: data.firstName || '',
        lastName: data.lastName || '',
        displayName: displayNameResolved,
        email: data.email || '',
        emailVerified: !!data.emailVerified || req.user?.email_verified === true,
        legalName: data.legalName || '',
        businessName: data.businessName || '',
        businessType: data.businessType || '',
        dob: data.dob || null,
        serviceLocation: data.serviceLocation || null,
        primaryServiceSuburb: data.primaryServiceSuburb || data.serviceLocation?.suburb || '',
        primaryServicePostcode: data.primaryServicePostcode || data.serviceLocation?.postcode || '',
        bio: data.bio || '',
        expertiseApproved: Array.isArray(data.expertiseApproved) ? data.expertiseApproved : [],
        phone: data.phone || '',
        phoneNumber: data.phone || '',
        phoneVerified: !!data.phoneVerified,
        isPhoneVerified: !!data.phoneVerified,
        quoteAccessVerified: !!data.quoteAccessVerified,
        abn: data.abn || '',
        abnVerified: !!data.abnVerified,
        photoURL: data.photoURL || data.profilePhotoURL || '',
        profilePhotoPath: data.profilePhotoPath || '',
        stripe: {
          onboardingComplete: eligibility?.derived?.stripeOnboardingComplete || false,
        },
        hasPaymentHistory,
        nameChangeCooldownDays: isHomeowner ? HOMEOWNER_NAME_CHANGE_COOLDOWN_DAYS : null,
        nameChangeBlockedUntilMs: homeownerNameChangeWindow?.blockedUntilMs || null,
        nameChangeBlockedMessage: homeownerNameChangeWindow?.message || '',
        accountCompleted: derivedAccountCompleted,
        profileCompleted: !!data.profileCompleted || eligibility?.derived?.profileCompleted || false,
        isProfileComplete: !!data.profileCompleted || eligibility?.derived?.profileCompleted || false,
        isEligibleForInvites: data?.role === 'tradie' ? eligibility.eligible : false,
        isPayoutReady: data?.role === 'tradie' ? eligibility?.derived?.stripeOnboardingComplete === true : false,
        createdAt: data.createdAt || null,
        updatedAt: data.updatedAt || null,
        audit: data.audit || null,
        deletion: data.deletion || null,
      },
      eligibility: data?.role === 'tradie'
        ? {
          canQuote: eligibility.eligible,
          code: eligibility.eligible ? null : 'TRADIE_NOT_ELIGIBLE',
          reasons: eligibility.reasons,
          checklist: eligibility.checklist,
        }
        : null,
      foundingExpertFeeProfile,
    });
  } catch (e) {
    if (sendIfMissingProfile(res, e)) return undefined;
    // eslint-disable-next-line no-console
    console.error('GET /api/me failed:', e);
    return res.status(500).send({ message: 'Failed to load profile.' });
  }
});

/**
 * PUT /api/me/profile
 * Updates allowed fields. Locks identity fields if verified=true.
 */
router.put('/api/me/profile', requireAuth, async (req, res) => {
  try {
    const uid = req.user.uid;
    const classified = await loadValidProfileOrSend(uid, res);
    if (!classified) return undefined;
    const mirrored = await mirrorAuthContactFields(classified, req.user);
    const ref = mirrored.ref;
    const before = mirrored.data;

    const body = req.body || {};
    const updates = {};
    const privateDetailsLocked = before?.privateDetailsLocked === true;
    const isHomeowner = before?.role === 'homeowner';
    let sanitizedFirstName = before?.firstName || parseNameParts(before?.displayName || before?.name || '').firstName || '';
    let sanitizedLastName = before?.lastName || parseNameParts(before?.displayName || before?.name || '').lastName || '';
    let homeownerNameChanged = false;
    let homeownerOldFirstName = sanitizedFirstName;
    let homeownerOldLastName = sanitizedLastName;

    // Common editable fields
    if (Object.prototype.hasOwnProperty.call(body, 'bio')) {
      updates.bio = sanitizePlainText(body.bio, 250);
    }
    if (Object.prototype.hasOwnProperty.call(body, 'photoURL')) {
      const url = String(body.photoURL || '').trim();
      if (url && !isLikelyFirebaseStorageUrl(url)) {
        return res.status(400).send({ message: 'Invalid photoURL.' });
      }
      updates.photoURL = url;
    }
    if (Object.prototype.hasOwnProperty.call(body, 'profilePhotoPath')) {
      const photoPath = String(body.profilePhotoPath || '').trim();
      const ownedPrefix = `profilePhotos/${uid}/`;
      if (photoPath && (!photoPath.startsWith(ownedPrefix) || photoPath.length > 500 || photoPath.includes('..'))) {
        return res.status(400).send({ message: 'Invalid profilePhotoPath.' });
      }
      updates.profilePhotoPath = photoPath;
    }

    // Service location (Task Expert)
    if (Object.prototype.hasOwnProperty.call(body, 'serviceLocation')) {
      const loc = validateServiceLocation(body.serviceLocation);
      if (!loc) return res.status(400).send({ message: INNER_MELBOURNE_LAUNCH_MESSAGE });
      updates.serviceLocation = loc;
      updates.primaryServiceSuburb = loc.suburb;
      updates.primaryServicePostcode = loc.postcode;
    }

    // DOB + business type (Task Expert)
    if (Object.prototype.hasOwnProperty.call(body, 'dob')) {
      const dobObj = parseDobInput(body.dob);
      if (!dobObj || !isRealDate(dobObj)) {
        return res.status(400).send({ message: 'Date of birth must be a real date.' });
      }
      // Lock DOB only after private details have been confirmed/saved.
      if (before?.role === 'tradie' && privateDetailsLocked && before?.dob && typeof before.dob === 'object') {
        const bd = Number(before.dob.day);
        const bm = Number(before.dob.month);
        const by = Number(before.dob.year);
        const same = bd === Number(dobObj.day) && bm === Number(dobObj.month) && by === Number(dobObj.year);
        if (!same) {
          return res.status(409).send({ message: 'Date of birth is locked after private details are confirmed. Please contact support to change it.' });
        }
      }
      // Validate DOB is not in the future
      const dobDate = new Date(Date.UTC(dobObj.year, dobObj.month - 1, dobObj.day));
      const today = new Date();
      today.setUTCHours(0, 0, 0, 0);
      if (dobDate > today) {
        return res.status(400).send({ message: 'Date of birth cannot be in the future.' });
      }
      // Validate 18+ (compliance)
      const ageDiffMs = today - dobDate.getTime();
      const ageDate = new Date(ageDiffMs);
      const age = Math.abs(ageDate.getUTCFullYear() - 1970);
      if (age < 18) {
        return res.status(400).send({ message: 'You must be 18 or older to use Taskio as an Expert.' });
      }
      updates.dob = { day: Number(dobObj.day), month: Number(dobObj.month), year: Number(dobObj.year) };
    }
    if (Object.prototype.hasOwnProperty.call(body, 'businessType')) {
      const bt = normalizeBusinessType(body.businessType);
      if (!bt) return res.status(400).send({ message: 'Invalid business type.' });
      // Lock business type only after private details have been confirmed/saved.
      if (before?.role === 'tradie' && privateDetailsLocked && before?.businessType) {
        const same = String(before.businessType).trim() === bt;
        if (!same) {
          return res.status(409).send({ message: 'Business type is locked after private details are confirmed. Please contact support to change it.' });
        }
      }
      updates.businessType = bt;
    }

    // Phone + ABN are private but required for quoting. If changed -> reset verification.
    if (Object.prototype.hasOwnProperty.call(body, 'phone')) {
      const phone = String(body.phone || '').trim();
      if (!phone) return res.status(400).send({ message: 'Phone is required.' });
      if (phone.length < 8 || phone.length > 20) return res.status(400).send({ message: 'Invalid phone number.' });
      updates.phone = phone;
      if (phone !== (before.phone || '')) {
        updates.phoneVerified = false;
      }
    }
    if (Object.prototype.hasOwnProperty.call(body, 'abn')) {
      const abn = cleanAbn(body.abn);
      
      // Check if ABN is required based on business type
      const currentBusinessType = updates.businessType || before.businessType || '';
      const bn = String((Object.prototype.hasOwnProperty.call(updates, 'businessName') ? updates.businessName : before.businessName) || '').trim();
      const needsAbn = requiresAbn(currentBusinessType, bn);
      
      if (needsAbn && !abn) {
        return res.status(400).send({ message: 'ABN is required for sole traders and companies.' });
      }
      if (abn.length > 30) return res.status(400).send({ message: 'ABN is too long.' });
      // Lock ABN only after private details have been confirmed/saved.
      if (before?.role === 'tradie' && privateDetailsLocked && before?.abn) {
        const same = String(before.abn).trim() === abn;
        if (!same) {
          return res.status(409).send({ message: 'ABN is locked after private details are confirmed. Please contact support to change it.' });
        }
      }
      updates.abn = abn;
      if (abn !== (before.abn || '')) {
        updates.abnVerified = false;
      }
    }

    // Lock private details (Task Expert): only when explicitly confirmed from UI
    if (before?.role === 'tradie' && body?.privateDetailsLock === true && !privateDetailsLocked) {
      const afterCandidate = { ...(before || {}), ...(updates || {}) };
      const bt = normalizeBusinessType(afterCandidate.businessType);
      const needsAbn = requiresAbn(bt, afterCandidate.businessName);
      const hasDob = afterCandidate?.dob && typeof afterCandidate.dob === 'object';
      const hasBusinessType = !!bt;
      const hasAbn = String(afterCandidate.abn || '').trim().length > 0;
      if (!hasDob || !hasBusinessType) {
        return res.status(400).send({ message: 'Please complete DOB, business type, and ABN (if applicable) before confirming private details.' });
      }
      if (needsAbn && (!hasAbn || afterCandidate.abnVerified !== true)) {
        return res.status(400).send({ message: 'Please verify your ABN before confirming your private details.' });
      }
      updates.privateDetailsLocked = true;
      updates.privateDetailsLockedAt = admin.firestore.FieldValue.serverTimestamp();
    }

    // Identity fields: editable only until verified (except homeowner names, which now use a controlled edit flow)
    const isVerified = before.verified === true;
    const homeownerNamePayloadProvided =
      isHomeowner
      && (
        Object.prototype.hasOwnProperty.call(body, 'firstName')
        || Object.prototype.hasOwnProperty.call(body, 'lastName')
        || Object.prototype.hasOwnProperty.call(body, 'displayName')
      );
    if (homeownerNamePayloadProvided) {
      let firstNameInput = Object.prototype.hasOwnProperty.call(body, 'firstName') ? body.firstName : sanitizedFirstName;
      let lastNameInput = Object.prototype.hasOwnProperty.call(body, 'lastName') ? body.lastName : sanitizedLastName;
      if (
        Object.prototype.hasOwnProperty.call(body, 'displayName')
        && !Object.prototype.hasOwnProperty.call(body, 'firstName')
        && !Object.prototype.hasOwnProperty.call(body, 'lastName')
      ) {
        const parsedDisplayName = parseNameParts(body.displayName);
        firstNameInput = parsedDisplayName.firstName;
        lastNameInput = parsedDisplayName.lastName;
      }

      const validatedFirstName = validateRequiredHomeownerName(firstNameInput, 'First name');
      if (validatedFirstName.error) {
        return res.status(400).send({ message: validatedFirstName.error });
      }
      const validatedLastName = validateRequiredHomeownerName(lastNameInput, 'Last name');
      if (validatedLastName.error) {
        return res.status(400).send({ message: validatedLastName.error });
      }

      homeownerOldFirstName = sanitizedFirstName;
      homeownerOldLastName = sanitizedLastName;
      sanitizedFirstName = validatedFirstName.value;
      sanitizedLastName = validatedLastName.value;
      const nextDisplayName = buildDisplayNameFromParts(sanitizedFirstName, sanitizedLastName);
      homeownerNameChanged = (
        sanitizedFirstName !== homeownerOldFirstName
        || sanitizedLastName !== homeownerOldLastName
        || nextDisplayName !== String(before?.displayName || before?.name || '').trim()
      );

      if (homeownerNameChanged) {
        const nameChangeWindow = getHomeownerNameChangeWindow(before);
        if (!nameChangeWindow.canChange) {
          return res.status(429).send({
            message: nameChangeWindow.message,
            code: 'HOMEOWNER_NAME_COOLDOWN',
            blockedUntilMs: nameChangeWindow.blockedUntilMs,
          });
        }
        updates.firstName = sanitizedFirstName;
        updates.lastName = sanitizedLastName;
        updates.displayName = nextDisplayName;
        updates.nameUpdatedAt = admin.firestore.FieldValue.serverTimestamp();
        updates.lastNameUpdatedAt = admin.firestore.FieldValue.serverTimestamp();
        updates.nameChangeCount = Number(before?.nameChangeCount || 0) + 1;
      }
    } else {
      if (Object.prototype.hasOwnProperty.call(body, 'firstName')) {
        const firstName = sanitizeOptionalName(body.firstName, 80);
        if (firstName === null) {
          return res.status(400).send({ message: 'First name must be under 80 characters.' });
        }
        sanitizedFirstName = firstName;
        updates.firstName = firstName;
      }
      if (Object.prototype.hasOwnProperty.call(body, 'lastName')) {
        const lastName = sanitizeOptionalName(body.lastName, 80);
        if (lastName === null) {
          return res.status(400).send({ message: 'Last name must be under 80 characters.' });
        }
        sanitizedLastName = lastName;
        updates.lastName = lastName;
      }
      if (Object.prototype.hasOwnProperty.call(body, 'displayName')) {
        const displayName = String(body.displayName || '').trim().replace(/\s+/g, ' ');
        if (displayName.length < 2 || displayName.length > 80) {
          return res.status(400).send({ message: 'Display name must be 2â€“80 characters.' });
        }
        if (isVerified) {
          if (displayName !== (before.displayName || before.name || '')) {
            return res.status(409).send({ message: 'Display name is locked after verification. Please request a change.' });
          }
        } else {
          updates.displayName = displayName;
        }
      }
    }

    if (Object.prototype.hasOwnProperty.call(body, 'businessName')) {
      const businessName = String(body.businessName || '').trim().replace(/\s+/g, ' ');
      
      // Check if business name is required based on business type
      const currentBusinessType = updates.businessType || before.businessType || '';
      const businessNameRequired = requiresBusinessName(currentBusinessType);
      
      if (businessNameRequired && !businessName) {
        return res.status(400).send({ message: 'Business name is required for companies.' });
      }
      
      if (businessName && (businessName.length < 2 || businessName.length > 120)) {
        return res.status(400).send({ message: 'Business name must be 2â€“120 characters.' });
      }
      if (isVerified) {
        if (businessName !== (before.businessName || '')) {
          return res.status(409).send({ message: 'Business name is locked after verification. Please request a change.' });
        }
      } else {
        updates.businessName = businessName;
      }
    }

    // Derived profileCompleted
    const afterCandidate = { ...(before || {}), ...(updates || {}) };
    if (afterCandidate.role === 'homeowner') {
      afterCandidate.firstName = sanitizedFirstName;
      afterCandidate.lastName = sanitizedLastName;
      updates.accountCompleted = hasDurableHomeownerAccount(afterCandidate, req.user);
    }
    const derivedProfileCompleted = computeProfileCompleted(afterCandidate, req.user);
    updates.profileCompleted = derivedProfileCompleted;
    updates.updatedAt = admin.firestore.FieldValue.serverTimestamp();

    await ref.update(updates);

    await writeUserAuditLog({
      uid,
      actorUid: uid,
      action: 'UPDATE_PROFILE',
      before: { verified: !!before.verified, profileCompleted: !!before.profileCompleted },
      after: { verified: !!before.verified, profileCompleted: derivedProfileCompleted },
      req,
    });

    if (isHomeowner && homeownerNameChanged) {
      await writeHomeownerNameChangeAudit({
        uid,
        oldFirstName: homeownerOldFirstName,
        oldLastName: homeownerOldLastName,
        newFirstName: sanitizedFirstName,
        newLastName: sanitizedLastName,
        req,
      });
    }

    const fresh = await ref.get();
    const data = fresh.data() || {};
    const eligibility = data?.role === 'tradie'
      ? computeEligibility({ decodedToken: req.user, userDoc: data })
      : null;
    const hasPaymentHistory = isHomeowner ? await getHomeownerPaymentHistory(uid) : false;
    const homeownerNameChangeWindow = isHomeowner ? getHomeownerNameChangeWindow(data) : null;

    return res.status(200).send({
      message: 'Profile updated.',
      profile: {
        ...(data || {}),
        hasPaymentHistory,
        nameChangeCooldownDays: isHomeowner ? HOMEOWNER_NAME_CHANGE_COOLDOWN_DAYS : null,
        nameChangeBlockedUntilMs: homeownerNameChangeWindow?.blockedUntilMs || null,
        nameChangeBlockedMessage: homeownerNameChangeWindow?.message || '',
      },
      eligibility: eligibility ? { canQuote: eligibility.eligible, reasons: eligibility.reasons, checklist: eligibility.checklist } : null,
    });
  } catch (e) {
    if (sendIfMissingProfile(res, e)) return undefined;
    // eslint-disable-next-line no-console
    console.error('PUT /api/me/profile failed:', e);
    return res.status(500).send({ message: 'Failed to update profile.' });
  }
});

/**
 * POST /api/me/phone/start-verify
 * MVP: server-generated OTP.
 * SECURITY: devCode is only returned when explicitly enabled, and never in production.
 */
router.post('/api/me/phone/start-verify', requireAuth, async (req, res) => {
  try {
    const uid = req.user.uid;
    const classified = await loadValidProfileOrSend(uid, res);
    if (!classified) return undefined;
    const phone = String(req.body?.phone || '').trim();
    if (!phone) return res.status(400).send({ message: 'Phone is required.' });
    if (phone.length < 8 || phone.length > 20) return res.status(400).send({ message: 'Invalid phone number.' });

    const code = String(Math.floor(100000 + Math.random() * 900000)); // 6 digits
    const tokenSalt = getOtpSalt();
    const codeHash = sha256Base64Url(`${uid}:${code}:${tokenSalt}`);
    const expiresAt = addDays(new Date(), 0);
    expiresAt.setMinutes(expiresAt.getMinutes() + 10);

    await db.collection('phone_verifications').doc(uid).set({
      uid,
      phone,
      codeHash,
      status: 'pending',
      expiresAt: admin.firestore.Timestamp.fromDate(expiresAt),
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    await classified.ref.update(
      { phone, phoneVerified: false, updatedAt: admin.firestore.FieldValue.serverTimestamp() }
    );

    // NOTE: In production you must deliver OTP via SMS provider.
    const allowDevOtp =
      process.env.NODE_ENV !== 'production' &&
      String(process.env.TASKIO_SHOW_DEV_OTP || '').toLowerCase() === 'true';
    return res.status(200).send({
      message: 'Verification code sent.',
      ...(allowDevOtp ? { devCode: code } : {}),
    });
  } catch (e) {
    if (e?.code === 'otp_not_configured') {
      return res.status(503).send({ message: 'Phone verification is not configured on this server.' });
    }
    if (sendIfMissingProfile(res, e)) return undefined;
    // eslint-disable-next-line no-console
    console.error('POST /api/me/phone/start-verify failed:', e);
    return res.status(500).send({ message: 'Failed to start phone verification.' });
  }
});

/**
 * POST /api/me/phone/confirm-verify
 */
router.post('/api/me/phone/confirm-verify', requireAuth, async (req, res) => {
  try {
    const uid = req.user.uid;
    const classified = await loadValidProfileOrSend(uid, res);
    if (!classified) return undefined;
    const code = String(req.body?.code || '').trim();
    if (!/^\d{6}$/.test(code)) return res.status(400).send({ message: 'Invalid code.' });

    const snap = await db.collection('phone_verifications').doc(uid).get();
    if (!snap.exists) return res.status(409).send({ message: 'No pending verification found.' });
    const v = snap.data() || {};
    if (v.status !== 'pending') return res.status(409).send({ message: 'Verification is not pending.' });
    if (v.expiresAt?.toDate && v.expiresAt.toDate() < new Date()) {
      return res.status(409).send({ message: 'Verification code expired. Please request a new code.' });
    }

    const tokenSalt = getOtpSalt();
    const expectedHash = sha256Base64Url(`${uid}:${code}:${tokenSalt}`);
    if (expectedHash !== v.codeHash) {
      return res.status(400).send({ message: 'Incorrect code.' });
    }

    await db.collection('phone_verifications').doc(uid).set(
      { status: 'verified', verifiedAt: admin.firestore.FieldValue.serverTimestamp(), updatedAt: admin.firestore.FieldValue.serverTimestamp() },
      { merge: true }
    );
    await classified.ref.update(
      { phoneVerified: true, updatedAt: admin.firestore.FieldValue.serverTimestamp() }
    );

    return res.status(200).send({ message: 'Phone verified.' });
  } catch (e) {
    if (e?.code === 'otp_not_configured') {
      return res.status(503).send({ message: 'Phone verification is not configured on this server.' });
    }
    if (sendIfMissingProfile(res, e)) return undefined;
    // eslint-disable-next-line no-console
    console.error('POST /api/me/phone/confirm-verify failed:', e);
    return res.status(500).send({ message: 'Failed to confirm phone verification.' });
  }
});

router.post('/api/me/homeowner/activate-quote-access', requireAuth, async (req, res) => {
  try {
    const uid = req.user.uid;
    const tokenRole = String(req.user?.role || '').trim();
    if (tokenRole && tokenRole !== 'homeowner') {
      return res.status(403).send({ message: 'Only homeowners can activate quote access.' });
    }

    const firstName = sanitizeOptionalName(req.body?.firstName, 80);
    if (firstName === null) {
      return res.status(400).send({ message: 'First name must be under 80 characters.' });
    }

    const phone = String(req.user?.phone_number || '').trim();
    if (!phone) {
      return res.status(400).send({ message: 'Phone verification is required before posting.' });
    }

    const userRef = db.collection('users').doc(uid);
    const result = await db.runTransaction(async (transaction) => {
      const snap = await transaction.get(userRef);
      const classified = classifyUserProfile(snap);
      const existing = classified.data || {};
      const signupEnabled = isPublicSignupEnabled();

      if (classified.kind === 'invalid') {
        return { type: 'invalid' };
      }

      if (classified.kind === 'valid') {
        if (classified.role !== 'homeowner') {
          return { type: 'wrong_role' };
        }
        if (hasQuoteAccess(existing)) {
          return { type: 'already', data: existing };
        }
        if (!signupEnabled) {
          return { type: 'signup_disabled' };
        }
        if (!isOperationallyActive(classified)) {
          return { type: 'not_active' };
        }
        const displayName = firstName || String(existing.displayName || existing.name || '').trim();
        const nextProfile = {
          ...(existing || {}),
          ...(firstName ? { firstName } : {}),
          ...(displayName ? { displayName } : {}),
          phone,
          phoneVerified: true,
          ...(req.user?.email ? { email: String(req.user.email).trim().toLowerCase() } : {}),
          ...(req.user?.email_verified === true ? { emailVerified: true } : {}),
        };
        const derivedAccountCompleted = hasDurableHomeownerAccount(nextProfile, req.user);
        transaction.update(userRef, {
          phone,
          phoneVerified: true,
          quoteAccessVerified: true,
          accountCompleted: derivedAccountCompleted,
          ...(req.user?.email ? { email: String(req.user.email).trim().toLowerCase() } : {}),
          ...(req.user?.email_verified === true ? { emailVerified: true } : {}),
          ...(firstName ? { firstName } : {}),
          ...(displayName ? { displayName } : {}),
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
        return { type: 'granted', derivedAccountCompleted };
      }

      if (!signupEnabled) {
        return { type: 'signup_disabled' };
      }

      const displayName = firstName || '';
      const nextProfile = {
        ...(firstName ? { firstName } : {}),
        ...(displayName ? { displayName } : {}),
        phone,
        phoneVerified: true,
        ...(req.user?.email ? { email: String(req.user.email).trim().toLowerCase() } : {}),
        emailVerified: req.user?.email_verified === true,
      };
      const derivedAccountCompleted = hasDurableHomeownerAccount(nextProfile, req.user);
      transaction.set(userRef, {
        role: 'homeowner',
        status: 'active',
        verified: false,
        phone,
        phoneVerified: true,
        quoteAccessVerified: true,
        accountCompleted: derivedAccountCompleted,
        ...(req.user?.email ? { email: String(req.user.email).trim().toLowerCase() } : {}),
        ...(req.user?.email_verified === true ? { emailVerified: true } : {}),
        ...(firstName ? { firstName } : {}),
        ...(displayName ? { displayName } : {}),
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      return { type: 'enrolled', derivedAccountCompleted };
    });

    if (result.type === 'invalid') return sendAccountStateInvalid(res);
    if (result.type === 'signup_disabled') return sendSignupDisabled(res);
    if (result.type === 'wrong_role') {
      return res.status(403).send({ message: 'Only homeowners can activate quote access.' });
    }
    if (result.type === 'not_active') return sendAccountNotActive(res);

    const derivedAccountCompleted = result.type === 'already'
      ? hasDurableHomeownerAccount(result.data, req.user)
      : result.derivedAccountCompleted;

    return res.status(200).send({
      message: 'Quote access activated.',
      profile: {
        phone,
        phoneVerified: true,
        quoteAccessVerified: true,
        accountCompleted: derivedAccountCompleted,
      },
    });
  } catch (e) {
    if (sendIfMissingProfile(res, e)) return undefined;
    // eslint-disable-next-line no-console
    console.error('POST /api/me/homeowner/activate-quote-access failed:', e);
    return res.status(500).send({ message: 'Failed to activate quote access.' });
  }
});

router.post('/api/me/homeowner/complete-account', requireAuth, async (req, res) => {
  try {
    const uid = req.user.uid;
    const classified = await loadClassifiedProfile(uid);
    if (classified.kind === 'missing') return sendAccountNotEnrolled(res);
    if (classified.kind === 'invalid') return sendAccountStateInvalid(res);
    if (classified.role !== 'homeowner') {
      return res.status(403).send({ message: 'Only homeowners can complete this account flow.' });
    }
    if (!hasQuoteAccess(classified.data)) {
      return sendQuoteAccessRequired(res);
    }

    const method = String(req.body?.method || '').trim();
    if (!['email', 'google'].includes(method)) {
      return res.status(400).send({ message: 'Please choose a supported completion method.' });
    }

    const firstName = sanitizeOptionalName(req.body?.firstName, 80);
    if (firstName === null || !firstName) {
      return res.status(400).send({ message: 'First name is required to continue.' });
    }

    const userRef = classified.ref;
    const existing = classified.data || {};
    const phone = String(req.user?.phone_number || existing.phone || '').trim();
    const email = String(req.user?.email || existing.email || '').trim().toLowerCase();
    const existingLastName = String(existing.lastName || parseNameParts(existing.displayName || existing.name || '').lastName || '').trim();
    const displayName = buildDisplayNameFromParts(firstName, existingLastName);
    const candidateProfile = {
      ...(existing || {}),
      firstName,
      ...(existingLastName ? { lastName: existingLastName } : {}),
      displayName,
      ...(phone ? { phone, phoneVerified: true } : {}),
      ...(email ? { email } : {}),
      emailVerified: req.user?.email_verified === true || existing.emailVerified === true,
    };
    const derivedAccountCompleted = hasDurableHomeownerAccount(candidateProfile, req.user);
    if (!derivedAccountCompleted) {
      return res.status(400).send({ message: 'Add a verified email or continue with Google to unlock payment.' });
    }

    await userRef.update(
      {
        ...(firstName ? { firstName } : {}),
        ...(existingLastName ? { lastName: existingLastName } : {}),
        ...(displayName ? { displayName } : {}),
        ...(phone ? { phone, phoneVerified: true } : {}),
        ...(email ? { email } : {}),
        emailVerified: req.user?.email_verified === true || existing.emailVerified === true,
        accountCompleted: derivedAccountCompleted,
        accountCompletionMethod: method,
        accountCompletedAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      }
    );

    return res.status(200).send({
      message: 'Account completed.',
      profile: {
        quoteAccessVerified: existing.quoteAccessVerified === true,
        accountCompleted: derivedAccountCompleted,
        phoneVerified: !!phone,
        emailVerified: req.user?.email_verified === true || existing.emailVerified === true,
      },
    });
  } catch (e) {
    if (sendIfMissingProfile(res, e)) return undefined;
    // eslint-disable-next-line no-console
    console.error('POST /api/me/homeowner/complete-account failed:', e);
    return res.status(500).send({ message: 'Failed to complete account.' });
  }
});

/**
 * POST /api/me/abn/verify
 * Verifies ABN via ABR (ABN Lookup) web service + stores verified details in Firestore.
 * Task Expert onboarding only. Marks verified only when ABR reports currently Active.
 * GST registration is not required.
 */
router.post('/api/me/abn/verify', requireAuth, requireRole('tradie'), async (req, res, next) => {
  const classified = await loadClassifiedProfile(req.user?.uid);
  if (respondIfNotValidProfile(res, classified)) return undefined;
  if (classified.role !== 'tradie') {
    return res.status(403).send({
      message: `Forbidden: Requires role tradie. Your role is '${classified.role}'.`,
    });
  }
  return next();
}, abnVerifyLimiter, async (req, res) => {
  try {
    const uid = req.user.uid;
    const abn = cleanAbn(req.body?.abn);
    if (!abn) return res.status(400).send({ message: 'ABN is required.' });
    if (!isValidAbn(abn)) return res.status(400).send({ message: 'ABN is invalid.' });

    // Lookup ABN on ABR (official). Requires ABN_LOOKUP_GUID in backend env.
    const details = await lookupAbnDetails(abn);
    const status = details.entityStatus || '';

    if (!isAbnCurrentlyActive(status)) {
      await db.collection('users').doc(uid).update(
        {
          abn,
          abnVerified: false,
          abnVerifiedAt: null,
          abnEntityName: details.entityName || '',
          abnEntityTypeName: details.entityTypeName || '',
          abnEntityStatus: status,
          abnGstStatus: details.gst || '',
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        }
      );
      return res.status(400).send({
        message: 'This ABN is not currently active on the Australian Business Register.',
        details: {
          abn: details.abn,
          entityName: details.entityName,
          entityTypeName: details.entityTypeName,
          entityStatus: status,
        },
      });
    }

    await db.collection('users').doc(uid).update(
      {
        abn,
        abnVerified: true,
        abnVerifiedAt: admin.firestore.FieldValue.serverTimestamp(),
        abnEntityName: details.entityName || '',
        abnEntityTypeName: details.entityTypeName || '',
        abnEntityStatus: status,
        abnGstStatus: details.gst || '',
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      }
    );

    return res.status(200).send({
      message: 'ABN verified.',
      details: {
        abn: details.abn,
        entityName: details.entityName,
        entityTypeName: details.entityTypeName,
        entityStatus: status,
        gst: details.gst,
      },
    });
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error('POST /api/me/abn/verify failed:', summarizeAbnLookupError(e));
    if (e?.code === 'ABN_LOOKUP_NOT_CONFIGURED') {
      return res.status(501).send({ message: 'ABN verification is not configured on the server. Set ABN_LOOKUP_GUID in backend .env.' });
    }
    if (e?.code === 'ABN_NOT_FOUND') {
      return res.status(400).send({ message: e.message || 'ABN not found.' });
    }
    if (e?.code === 'ABN_LOOKUP_PARSE_ERROR' || e?.code === 'ABN_LOOKUP_EMPTY') {
      return res.status(502).send({ message: 'ABN verification is temporarily unavailable. Please try again later.' });
    }
    if (sendIfMissingProfile(res, e)) return undefined;
    return res.status(500).send({ message: 'Failed to verify ABN.' });
  }
});

/**
 * POST /api/me/profile/change-request
 * Stores a pending request for locked fields (displayName/businessName).
 */
router.post('/api/me/profile/change-request', requireAuth, async (req, res) => {
  try {
    const uid = req.user.uid;
    const field = String(req.body?.field || '').trim();
    const requestedValue = String(req.body?.requestedValue || '').trim().replace(/\s+/g, ' ');
    const reason = sanitizePlainText(req.body?.reason, 500);

    if (field !== 'firstName' && field !== 'lastName' && field !== 'businessName') {
      return res.status(400).send({ message: 'Invalid field.' });
    }
    if (!requestedValue) return res.status(400).send({ message: 'Requested value is required.' });
    if (!reason) return res.status(400).send({ message: 'Reason is required.' });

    const userDoc = await db.collection('users').doc(uid).get();
    if (!userDoc.exists) return res.status(404).send({ message: 'User not found.' });
    const user = userDoc.data() || {};

    const beforeIdentity = {
      displayName: String(user.displayName || user.name || '').trim(),
      businessName: String(user.businessName || '').trim(),
    };

    // Build a safe patch that admins can approve/reject later.
    let currentValue = '';
    const requestedPatch = {};

    if (field === 'businessName') {
      if (requestedValue.length < 2 || requestedValue.length > 120) {
        return res.status(400).send({ message: 'Requested value is invalid.' });
      }
      currentValue = beforeIdentity.businessName;
      requestedPatch.businessName = requestedValue;
    } else {
      // firstName / lastName -> update displayName
      if (requestedValue.length < 1 || requestedValue.length > 60) {
        return res.status(400).send({ message: 'Requested value is invalid.' });
      }
      const parts = parseNameParts(beforeIdentity.displayName);
      currentValue = field === 'firstName' ? parts.firstName : parts.lastName;
      const newDisplayName = field === 'firstName'
        ? buildDisplayNameFromParts(requestedValue, parts.lastName)
        : buildDisplayNameFromParts(parts.firstName, requestedValue);
      if (newDisplayName.length < 2 || newDisplayName.length > 80) {
        return res.status(400).send({ message: 'Requested value is invalid.' });
      }
      requestedPatch.displayName = newDisplayName;
    }

    const reqRef = await db.collection('profile_change_requests').add({
      uid,
      role: user.role || '',
      field,
      currentValue,
      requestedValue,
      requestedPatch,
      reason,
      status: 'pending',
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    try {
      await evaluateProfileRequestRiskById(reqRef.id);
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error('evaluateProfileRequestRiskById failed:', e);
    }

    await writeUserAuditLog({
      uid,
      actorUid: uid,
      action: 'PROFILE_CHANGE_REQUEST',
      before: { field },
      after: { field },
      req,
    });

    return res.status(200).send({ message: 'Change request submitted.' });
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error('POST /api/me/profile/change-request failed:', e);
    return res.status(500).send({ message: 'Failed to submit change request.' });
  }
});

/**
 * GET /api/me/profile/change-requests
 * List the authenticated user's own change requests (history).
 */
router.get('/api/me/profile/change-requests', requireAuth, async (req, res) => {
  try {
    const uid = req.user.uid;

    const snap = await db
      .collection('profile_change_requests')
      .where('uid', '==', uid)
      .limit(50)
      .get();

    const items = snap.docs.map((d) => {
      const data = d.data() || {};
      return {
        id: d.id,
        field: data.field || '',
        currentValue: data.currentValue || '',
        requestedValue: data.requestedValue || '',
        status: data.status || 'pending',
        adminNote: data.adminNote || '',
        decidedAtMs: safeToMillis(data.decidedAt),
        createdAtMs: safeToMillis(data.createdAt),
        updatedAtMs: safeToMillis(data.updatedAt),
      };
    });

    items.sort((a, b) => (b.createdAtMs || 0) - (a.createdAtMs || 0));
    return res.status(200).send({ items });
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error('GET /api/me/profile/change-requests failed:', e);
    return res.status(500).send({ message: 'Failed to load change requests.' });
  }
});

/**
 * POST /api/me/deactivate
 * Default â€œsafeâ€ action: disable account (soft).
 */
router.post('/api/me/deactivate', requireAuth, async (req, res) => {
  try {
    const uid = req.user.uid;
    const classified = await loadValidProfileOrSend(uid, res);
    if (!classified) return undefined;
    await classified.ref.update(
      { status: 'disabled', updatedAt: admin.firestore.FieldValue.serverTimestamp() }
    );
    await admin.auth().updateUser(uid, { disabled: true });

    await writeUserAuditLog({ uid, actorUid: uid, action: 'DEACTIVATE_ACCOUNT', before: null, after: null, req });
    return res.status(200).send({ message: 'Account deactivated.' });
  } catch (e) {
    if (sendIfMissingProfile(res, e)) return undefined;
    // eslint-disable-next-line no-console
    console.error('POST /api/me/deactivate failed:', e);
    return res.status(500).send({ message: 'Failed to deactivate account.' });
  }
});

async function checkDeletionConstraints({ uid }) {
  // Block deletion if active jobs/disputes/pending escrow states exist.
  // Conservative MVP checks.
  const blocking = {
    hasActiveJobs: false,
    hasDisputes: false,
    hasPendingQuotes: false,
  };

  const jobsSnap = await db.collection('jobs').where('acceptedTradieUid', '==', uid).limit(25).get();
  if (!jobsSnap.empty) {
    for (const d of jobsSnap.docs) {
      const job = d.data() || {};
      const status = String(job.status || '').toLowerCase();
      const paymentState = String(job.paymentState || '').toLowerCase();
      if (status === 'disputed' || paymentState === 'disputed' || job.disputeFlag === true) blocking.hasDisputes = true;
      if (!['completed', 'paid', 'cancelled'].includes(status)) blocking.hasActiveJobs = true;
      if (paymentState && !['released', 'refunded', ''].includes(paymentState)) blocking.hasActiveJobs = true;
    }
  }

  const quoteSnap = await db.collection('quotes').where('tradieUid', '==', uid).where('status', 'in', ['submitted', 'accepted']).limit(5).get();
  if (!quoteSnap.empty) blocking.hasPendingQuotes = true;

  return blocking;
}

/**
 * POST /api/me/deletion/request
 * Step 1: user typed DELETE + reason; server validates constraints and issues email token.
 *
 * NOTE: Reauth is performed client-side (Firebase). Server relies on valid ID token.
 */
router.post('/api/me/deletion/request', requireAuth, async (req, res) => {
  try {
    const uid = req.user.uid;
    const classified = await loadValidProfileOrSend(uid, res);
    if (!classified) return undefined;
    const typed = String(req.body?.typed || '').trim();
    const reason = sanitizePlainText(req.body?.reason, 500);
    if (typed !== 'DELETE') return res.status(400).send({ message: 'Please type DELETE to confirm.' });
    if (!reason) return res.status(400).send({ message: 'Reason is required.' });

    const constraints = await checkDeletionConstraints({ uid });
    if (constraints.hasActiveJobs || constraints.hasDisputes || constraints.hasPendingQuotes) {
      return res.status(409).send({
        message: 'You canâ€™t delete your account while you have active jobs, disputes, or pending quotes/payments. Please contact support.',
        code: 'DELETION_BLOCKED',
        constraints,
      });
    }

    const token = crypto.randomBytes(32).toString('base64url');
    const tokenHash = sha256Base64Url(token);
    const now = new Date();
    const scheduledFor = addDays(now, 7);

    await db.collection('deletion_tokens').doc(tokenHash).set({
      uid,
      status: 'issued',
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      expiresAt: admin.firestore.Timestamp.fromDate(addDays(now, 2)), // link valid 48h
    });

    await classified.ref.update(
      {
        status: 'pending_deletion',
        deletion: {
          requestedAt: admin.firestore.FieldValue.serverTimestamp(),
          scheduledFor: admin.firestore.Timestamp.fromDate(scheduledFor),
          reason,
          confirmStep1At: admin.firestore.FieldValue.serverTimestamp(),
          confirmTokenHash: tokenHash,
        },
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      }
    );

    await writeUserAuditLog({ uid, actorUid: uid, action: 'REQUEST_DELETION', before: null, after: { scheduledFor: scheduledFor.toISOString() }, req });

    const frontend = (process.env.FRONTEND_URL || 'http://localhost:3000').replace(/\/$/, '');
    const confirmUrl = `${frontend}/account/deletion/confirm?token=${encodeURIComponent(token)}`;

    // MVP: we don't have an email provider in this repo. Return confirmUrl for dev/manual ops.
    return res.status(200).send({
      message: 'Deletion requested. Please confirm via the link sent to your email.',
      ...(process.env.NODE_ENV !== 'production' ? { devConfirmUrl: confirmUrl } : {}),
    });
  } catch (e) {
    if (sendIfMissingProfile(res, e)) return undefined;
    // eslint-disable-next-line no-console
    console.error('POST /api/me/deletion/request failed:', e);
    return res.status(500).send({ message: 'Failed to request deletion.' });
  }
});

/**
 * GET /api/me/deletion/confirm?token=...
 * Step 2: email confirm.
 * No auth required.
 */
router.get('/api/me/deletion/confirm', async (req, res) => {
  try {
    const token = String(req.query?.token || '').trim();
    if (!token) return res.status(400).send({ message: 'Missing token.' });
    const tokenHash = sha256Base64Url(token);

    const tRef = db.collection('deletion_tokens').doc(tokenHash);
    const tDoc = await tRef.get();
    if (!tDoc.exists) return res.status(404).send({ message: 'Invalid token.' });
    const t = tDoc.data() || {};
    if (t.status !== 'issued') return res.status(409).send({ message: 'Token already used or invalid.' });
    if (t.expiresAt?.toDate && t.expiresAt.toDate() < new Date()) return res.status(409).send({ message: 'Token expired.' });

    const classified = await loadClassifiedProfile(t.uid);
    if (classified.kind === 'missing') return sendAccountNotEnrolled(res);
    if (classified.kind === 'invalid') return sendAccountStateInvalid(res);

    await tRef.set({ status: 'used', usedAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });
    const existingDeletion = (classified.data?.deletion && typeof classified.data.deletion === 'object')
      ? classified.data.deletion
      : {};
    await classified.ref.update({
      deletion: {
        ...existingDeletion,
        confirmStep2At: admin.firestore.FieldValue.serverTimestamp(),
      },
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    return res.status(200).send({ message: 'Deletion confirmed. Your account will be deleted after the cooling-off period unless cancelled.' });
  } catch (e) {
    if (sendIfMissingProfile(res, e)) return undefined;
    // eslint-disable-next-line no-console
    console.error('GET /api/me/deletion/confirm failed:', e);
    return res.status(500).send({ message: 'Failed to confirm deletion.' });
  }
});

/**
 * POST /api/me/deletion/cancel
 */
router.post('/api/me/deletion/cancel', requireAuth, async (req, res) => {
  try {
    const uid = req.user.uid;
    const classified = await loadValidProfileOrSend(uid, res);
    if (!classified) return undefined;
    const existingDeletion = (classified.data?.deletion && typeof classified.data.deletion === 'object')
      ? classified.data.deletion
      : {};
    await classified.ref.update({
      status: 'disabled',
      deletion: {
        ...existingDeletion,
        cancelledAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    await writeUserAuditLog({ uid, actorUid: uid, action: 'CANCEL_DELETION', before: null, after: null, req });
    return res.status(200).send({ message: 'Deletion cancelled. Your account remains deactivated.' });
  } catch (e) {
    if (sendIfMissingProfile(res, e)) return undefined;
    // eslint-disable-next-line no-console
    console.error('POST /api/me/deletion/cancel failed:', e);
    return res.status(500).send({ message: 'Failed to cancel deletion.' });
  }
});

module.exports = router;
