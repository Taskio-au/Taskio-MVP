'use strict';

const express = require('express');
const rateLimit = require('express-rate-limit');

const { admin, db } = require('../firebaseAdmin');
const { isNonEmptyString, isStringMax } = require('../utils/validation');

const router = express.Router();

// User Registration
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
});

router.post('/api/users/register', authLimiter, async (req, res) => {
  try {
    const { email, password, role, expertise, firstName, lastName } = req.body;

    if (!role || (role !== 'homeowner' && role !== 'tradie')) {
      return res.status(400).send({ message: "A valid role ('homeowner' or 'tradie') is required." });
    }
    if (!isNonEmptyString(email) || !isStringMax(email, 320)) {
      return res.status(400).send({ message: 'A valid email is required.' });
    }
    if (!isNonEmptyString(password) || password.length < 8 || password.length > 128) {
      return res.status(400).send({ message: 'Password must be between 8 and 128 characters.' });
    }
    if (!isStringMax(firstName, 80) || !isStringMax(lastName, 80)) {
      return res.status(400).send({ message: 'First and last name must be under 80 characters.' });
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

    if (role === 'tradie') {
      userData.expertise = Array.isArray(expertise) ? expertise : (expertise ? [expertise] : []);
    }

    await db.collection('users').doc(userRecord.uid).set(userData);

    return res.status(201).send({ message: 'User created successfully', uid: userRecord.uid });
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('Error in user registration:', error);
    return res.status(400).send({ message: 'Error creating user', error: error.message });
  }
});

module.exports = router;


