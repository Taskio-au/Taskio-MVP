'use strict';

const express = require('express');
const rateLimit = require('express-rate-limit');

const { admin, db } = require('../firebaseAdmin');

const router = express.Router();

const authResolveLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 40,
  standardHeaders: true,
  legacyHeaders: false,
});

function normalizeEmail(value) {
  return String(value || '').trim().toLowerCase();
}

async function readUserRole(uid) {
  if (!uid) return '';
  try {
    const doc = await db.collection('users').doc(uid).get();
    if (!doc.exists) return '';
    return String(doc.data()?.role || '').trim().toLowerCase();
  } catch (_) {
    return '';
  }
}

function hasGoogleProvider(providerData = []) {
  return Array.isArray(providerData) && providerData.some((provider) => provider?.providerId === 'google.com');
}

function hasPasswordProvider(providerData = []) {
  return Array.isArray(providerData) && providerData.some((provider) => provider?.providerId === 'password');
}

router.post('/api/auth/resolve-email', authResolveLimiter, async (req, res) => {
  const email = normalizeEmail(req.body?.email);
  if (!email || !/\S+@\S+\.\S+/.test(email)) {
    return res.status(400).send({ message: 'A valid email is required.' });
  }

  try {
    const userRecord = await admin.auth().getUserByEmail(email);
    const customClaims = userRecord.customClaims || {};
    const docRole = await readUserRole(userRecord.uid);
    const isAdmin = customClaims.admin === true || customClaims.role === 'admin' || docRole === 'admin';

    if (isAdmin) {
      return res.status(200).send({
        strategy: 'unknown',
      });
    }

    const providerData = Array.isArray(userRecord.providerData) ? userRecord.providerData : [];
    const passwordEnabled = Boolean(userRecord.passwordHash) || hasPasswordProvider(providerData);
    const googleLinked = hasGoogleProvider(providerData);

    let strategy = 'unknown';
    if (passwordEnabled) strategy = 'password';
    else if (googleLinked) strategy = 'google';
    else if (userRecord.email) strategy = 'magic_link';

    return res.status(200).send({
      strategy,
    });
  } catch (error) {
    if (error?.code === 'auth/user-not-found') {
      return res.status(200).send({
        strategy: 'unknown',
      });
    }
    // eslint-disable-next-line no-console
    console.error('POST /api/auth/resolve-email failed:', error);
    return res.status(500).send({ message: 'Failed to resolve sign-in method.' });
  }
});

module.exports = router;
