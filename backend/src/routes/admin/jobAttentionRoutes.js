'use strict';

const express = require('express');
const { db } = require('../../firebaseAdmin');
const { requireAuth, requireAdmin } = require('../../middleware/auth');
const { buildJobAttentionSnapshot } = require('../../services/jobAttentionService');

const router = express.Router();

/**
 * GET /api/admin/job-attention
 * Bounded, admin-only Job Attention Queue. If totals.truncated / scanComplete=false,
 * do not treat an empty or short list as "all clear".
 */
router.get('/api/admin/job-attention', requireAuth, requireAdmin, async (req, res) => {
  try {
    const snapshot = await buildJobAttentionSnapshot(db);
    return res.status(200).send(snapshot);
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('GET /api/admin/job-attention failed:', error);
    return res.status(500).send({ message: 'Failed to load job attention queue.' });
  }
});

module.exports = router;
