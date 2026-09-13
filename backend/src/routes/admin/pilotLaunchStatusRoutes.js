'use strict';

const express = require('express');
const { db } = require('../../firebaseAdmin');
const { requireAuth, requireAdmin } = require('../../middleware/auth');
const { buildPilotLaunchReadinessSnapshot } = require('../../services/pilotLaunchStatusService');

const router = express.Router();

/**
 * GET /api/admin/pilot-launch-readiness
 * Read-only Pilot Status. Never opens posting. If the manifest is invalid or
 * supply cannot load, overallStatus is DATA UNAVAILABLE — never READY TO OPEN.
 */
router.get('/api/admin/pilot-launch-readiness', requireAuth, requireAdmin, async (req, res) => {
  try {
    const snapshot = await buildPilotLaunchReadinessSnapshot(db);
    return res.status(200).send(snapshot);
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('GET /api/admin/pilot-launch-readiness failed:', error);
    return res.status(500).send({ message: 'Failed to load pilot launch readiness.' });
  }
});

module.exports = router;
