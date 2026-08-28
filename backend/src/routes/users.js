'use strict';

const express = require('express');
const rateLimit = require('express-rate-limit');

const { admin, db } = require('../firebaseAdmin');
const { requireAuth } = require('../middleware/auth');
const { requirePublicSignupEnabled } = require('../config/publicSignup');
const { classifyUserProfile, sendAccountNotActive, sendAccountStateInvalid } = require('../utils/enrolledProfile');
const { isNonEmptyString, isStringMax } = require('../utils/validation');
const { phase1KeysSet } = require('../shared/expertiseCatalog');
const { isSupportedMelbournePilotLocation, INNER_MELBOURNE_LAUNCH_MESSAGE } = require('../../../shared/auLocations');
const { logger } = require('../observability/logger');

const router = express.Router();

function registrationErrorResponse(error, requestId) {
  const code = String(error?.code || '');
  if (code === 'auth/email-already-exists') {
    return {
      status: 400,
      body: {
        message: 'This email is already registered. Please log in or use a different email address.',
        code,
        requestId: requestId || null,
      },
    };
  }
  if (code === 'auth/invalid-email') {
    return {
      status: 400,
      body: { message: 'Please enter a valid email address.', code, requestId: requestId || null },
    };
  }
  if (code === 'auth/invalid-password' || code === 'auth/weak-password') {
    return {
      status: 400,
      body: { message: 'The password does not meet the account security requirements.', code, requestId: requestId || null },
    };
  }
  return {
    status: code.startsWith('auth/') ? 400 : 500,
    body: {
      message: code.startsWith('auth/')
        ? 'We could not create the account with those details.'
        : 'Error creating user. Please try again.',
      requestId: requestId || null,
    },
  };
}

// User Registration
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
});

function validateTradieSignupPayload({
  expertise,
  serviceLocation,
  primaryServiceSuburb,
  primaryServicePostcode,
}) {
  const loc = serviceLocation || {};
  const postcode = String(primaryServicePostcode || loc.postcode || '').trim();
  const suburb = String(primaryServiceSuburb || loc.suburb || '').trim();
  const state = String(loc.state || '').trim();
  const label = String(loc.label || '').trim();
  const country = String(loc.country || 'AU').trim() || 'AU';

  if (!postcode || !/^[0-9]{4}$/.test(postcode)) {
    return { error: 'Primary service postcode must be 4 digits.' };
  }
  if (!suburb || suburb.length < 2) {
    return { error: 'Primary service suburb is required.' };
  }
  if (!state || state.length < 2 || state.length > 4) {
    return { error: 'Primary service state is required.' };
  }
  if (!label || label.length < 3 || label.length > 120) {
    return { error: 'Primary service location is required.' };
  }
  if (country !== 'AU' || !isSupportedMelbournePilotLocation({ suburb, state, postcode })) {
    return { error: INNER_MELBOURNE_LAUNCH_MESSAGE };
  }

  const raw = Array.isArray(expertise) ? expertise : (expertise ? [expertise] : []);
  const normalizedTradieExpertise = raw
    .map((x) => String(x || '').trim())
    .filter(Boolean);
  if (normalizedTradieExpertise.length === 0) {
    return { error: 'Select at least one type of job.' };
  }
  for (const key of normalizedTradieExpertise) {
    if (!phase1KeysSet.has(key)) {
      return { error: 'This task category is not available in the current release.' };
    }
  }

  return {
    location: {
      label,
      suburb,
      state,
      postcode,
      country,
    },
    expertise: normalizedTradieExpertise,
  };
}

function buildTradieUserData({
  email,
  firstName,
  lastName,
  normalizedTradieLocation,
  normalizedTradieExpertise,
}, { includeCreatedAt = true } = {}) {
  const payload = {
    email: String(email || '').trim().toLowerCase(),
    firstName: firstName || '',
    lastName: lastName || '',
    role: 'tradie',
    status: 'active',
    verified: false,
    serviceLocation: normalizedTradieLocation,
    primaryServiceSuburb: normalizedTradieLocation.suburb,
    primaryServicePostcode: normalizedTradieLocation.postcode,
    phone: '',
    phoneVerified: false,
    profileCompleted: false,
    expertiseApproved: normalizedTradieExpertise,
    expertiseUpdatedAt: admin.firestore.FieldValue.serverTimestamp(),
    expertiseChangeLog: [
      { action: 'migrate', category: 'register', by: 'tradie', at: admin.firestore.Timestamp.now() },
    ],
  };
  if (includeCreatedAt) payload.createdAt = admin.firestore.FieldValue.serverTimestamp();
  return payload;
}

router.post('/api/users/register', authLimiter, requirePublicSignupEnabled, async (req, res) => {
  try {
    const {
      email,
      password,
      role,
      expertise,
      firstName,
      lastName,
      serviceLocation,
      primaryServiceSuburb,
      primaryServicePostcode,
    } = req.body;

    // Homeowner accounts are created only by the phone-verified posting flow, which is the
    // single path that may grant quote access. See POST /api/me/homeowner/activate-quote-access.
    if (role === 'homeowner') {
      return res.status(400).send({
        message: 'Expert accounts only. To create a homeowner account, post a task.',
      });
    }
    if (role !== 'tradie') {
      return res.status(400).send({ message: 'Please choose a valid account type.' });
    }
    if (!isNonEmptyString(email) || !isStringMax(email, 320)) {
      return res.status(400).send({ message: 'A valid email is required.' });
    }
    if (!isNonEmptyString(password) || password.length < 8 || password.length > 128) {
      return res.status(400).send({ message: 'Password must be between 8 and 128 characters.' });
    }
    if (!isNonEmptyString(firstName) || !isStringMax(firstName, 80)) {
      return res.status(400).send({ message: 'First name is required and must be under 80 characters.' });
    }
    if (!isNonEmptyString(lastName) || !isStringMax(lastName, 80)) {
      return res.status(400).send({ message: 'Last name is required and must be under 80 characters.' });
    }

    let normalizedTradieLocation = null;
    let normalizedTradieExpertise = [];

    if (role === 'tradie') {
      const normalized = validateTradieSignupPayload({
        expertise,
        serviceLocation,
        primaryServiceSuburb,
        primaryServicePostcode,
      });
      if (normalized.error) {
        return res.status(400).send({ message: normalized.error });
      }
      normalizedTradieLocation = normalized.location;
      normalizedTradieExpertise = normalized.expertise;
    }

    const userRecord = await admin.auth().createUser({
      email: email.trim().toLowerCase(),
      password,
      emailVerified: false,
      displayName: `${firstName || ''} ${lastName || ''}`.trim(),
    });

    // Keep your role claim
    await admin.auth().setCustomUserClaims(userRecord.uid, { role });

    const userData = {
      email: userRecord.email,
      firstName: firstName || '',
      lastName: lastName || '',
      role,
      status: 'active',
      verified: false,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    };

    if (role === 'tradie') Object.assign(userData, buildTradieUserData({
      email: userRecord.email,
      firstName,
      lastName,
      normalizedTradieLocation,
      normalizedTradieExpertise,
    }));

    await db.collection('users').doc(userRecord.uid).set(userData);

    return res.status(201).send({ message: 'User created successfully', uid: userRecord.uid });
  } catch (error) {
    logger.warn('user_registration_failed', {
      requestId: req.requestId || null,
      errorCode: String(error?.code || 'unknown'),
    });

    const safeError = registrationErrorResponse(error, req.requestId);
    return res.status(safeError.status).send(safeError.body);
  }
});

router.post('/api/users/register/expert-google', authLimiter, requireAuth, requirePublicSignupEnabled, async (req, res) => {
  try {
    const {
      firstName,
      lastName,
      expertise,
      serviceLocation,
      primaryServiceSuburb,
      primaryServicePostcode,
    } = req.body || {};

    if (!isNonEmptyString(firstName) || !isStringMax(firstName, 80)) {
      return res.status(400).send({ message: 'First name is required and must be under 80 characters.' });
    }
    if (!isNonEmptyString(lastName) || !isStringMax(lastName, 80)) {
      return res.status(400).send({ message: 'Last name is required and must be under 80 characters.' });
    }

    const normalized = validateTradieSignupPayload({
      expertise,
      serviceLocation,
      primaryServiceSuburb,
      primaryServicePostcode,
    });
    if (normalized.error) {
      return res.status(400).send({ message: normalized.error });
    }

    const uid = req.user?.uid;
    const email = String(req.user?.email || '').trim().toLowerCase();
    if (!uid || !email) {
      return res.status(400).send({ message: 'A signed-in Google account with an email address is required.' });
    }

    const userRef = db.collection('users').doc(uid);
    const userSnap = await userRef.get();
    const classified = classifyUserProfile(userSnap);
    if (classified.kind === 'invalid') {
      return sendAccountStateInvalid(res);
    }
    if (classified.kind === 'valid') {
      if (classified.role !== 'tradie') {
        return res.status(409).send({ message: 'This account already belongs to a different Taskio role. Please log in instead.' });
      }
      if (!['active'].includes(classified.status)) {
        return sendAccountNotActive(res);
      }
    }

    const userRecord = await admin.auth().getUser(uid);
    const nextClaims = { ...(userRecord.customClaims || {}), role: 'tradie' };
    await admin.auth().setCustomUserClaims(uid, nextClaims);
    await userRef.set(buildTradieUserData({
      email,
      firstName: String(firstName).trim(),
      lastName: String(lastName).trim(),
      normalizedTradieLocation: normalized.location,
      normalizedTradieExpertise: normalized.expertise,
    }, {
      includeCreatedAt: classified.kind === 'missing',
    }), { merge: true });

    return res.status(200).send({ message: 'Expert profile completed.', uid });
  } catch (error) {
    logger.warn('google_expert_registration_failed', {
      requestId: req.requestId || null,
      errorCode: String(error?.code || 'unknown'),
    });
    return res.status(500).send({
      message: 'Error completing expert signup. Please try again.',
      requestId: req.requestId || null,
    });
  }
});

module.exports = router;




