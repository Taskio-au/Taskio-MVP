'use strict';

const express = require('express');
const { requireAuth, requireAdmin } = require('../../middleware/auth');
const { resolveAdminAccess } = require('../../services/adminAccessService');

const router = express.Router();

/**
 * GET /api/admin/bootstrap
 * Unified admin access snapshot for UI (claims + Firestore + mismatch warning).
 */
router.get('/api/admin/bootstrap', requireAuth, requireAdmin, async (req, res) => {
  try {
    const access = await resolveAdminAccess(req.user);
    return res.status(200).send({
      access,
      uid: req.user.uid,
      email: req.user.email || null,
    });
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error('GET /api/admin/bootstrap failed:', e);
    return res.status(500).send({ message: 'Failed to load admin session.' });
  }
});

module.exports = router;
