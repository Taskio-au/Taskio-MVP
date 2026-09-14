'use strict';

const express = require('express');
const rateLimit = require('express-rate-limit');
const { db } = require('../firebaseAdmin');
const { readPublicPilotStatus } = require('../services/pilotPostingAccess');
const {
  addPilotWaitlistSignup,
  publicWaitlistSuccess,
} = require('../services/pilotWaitlistService');

const router = express.Router();

const publicPilotLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
});

const waitlistLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: 'Too many waitlist requests. Please try again shortly.' },
});

/**
 * GET /api/pilot-status
 * Public, fail-closed posting availability. No launch gates or admin metadata.
 * If this handler errors, posting stays CLOSED. Waitlist remains advertised
 * because POST /api/pilot-waitlist is independent of system/pilotSettings.
 */
router.get('/api/pilot-status', publicPilotLimiter, async (_req, res) => {
  try {
    const status = await readPublicPilotStatus(db);
    return res.status(200).send(status);
  } catch (_) {
    return res.status(200).send({
      homeownerPosting: 'CLOSED',
      canPost: false,
      waitlistAvailable: true,
    });
  }
});

/**
 * POST /api/pilot-waitlist
 * Minimal interest email. Does not open posting or change operational state.
 */
router.post('/api/pilot-waitlist', waitlistLimiter, async (req, res) => {
  try {
    const result = await addPilotWaitlistSignup(db, {
      email: req.body && req.body.email,
      suburb: req.body && req.body.suburb,
      source: req.body && req.body.source,
      consentAccepted: req.body && req.body.consentAccepted,
    });
    if (!result.ok) {
      return res.status(result.status || 400).send(result.error);
    }
    return res.status(200).send(publicWaitlistSuccess());
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('POST /api/pilot-waitlist failed:', error);
    return res.status(500).send({ message: 'Could not join the waitlist right now.' });
  }
});

module.exports = router;
