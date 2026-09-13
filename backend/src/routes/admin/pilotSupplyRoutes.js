'use strict';

const express = require('express');
const { db } = require('../../firebaseAdmin');
const { requireAuth, requireAdmin } = require('../../middleware/auth');
const { buildPilotSupplySnapshot } = require('../../services/pilotSupplyService');

const router = express.Router();

/**
 * GET /api/admin/pilot-supply
 * Authoritative Expert supply/readiness counts. Pages all tradies (capped).
 * Not the visual cockpit.
 */
router.get('/api/admin/pilot-supply', requireAuth, requireAdmin, async (req, res) => {
  try {
    const snapshot = await buildPilotSupplySnapshot(db);
    return res.status(200).send(snapshot);
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('GET /api/admin/pilot-supply failed:', error);
    return res.status(500).send({ message: 'Failed to load pilot supply readiness.' });
  }
});

module.exports = router;
