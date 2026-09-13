'use strict';

const express = require('express');
const { db } = require('../../firebaseAdmin');
const { requireAuth, requireAdmin } = require('../../middleware/auth');
const { DEFAULT_RANGE, normalizeRange } = require('../../services/marketplaceMetricsDerive');
const { buildMarketplaceMetricsSnapshot } = require('../../services/marketplaceMetricsService');

const router = express.Router();

/**
 * GET /api/admin/marketplace-metrics?range=7d|30d|pilot
 * Bounded, admin-only marketplace health. If truncated / scanComplete=false,
 * do not treat percentages or the funnel as exhaustive.
 */
router.get('/api/admin/marketplace-metrics', requireAuth, requireAdmin, async (req, res) => {
  try {
    const range = normalizeRange(req.query.range || DEFAULT_RANGE).key;
    const snapshot = await buildMarketplaceMetricsSnapshot(db, { range });
    return res.status(200).send(snapshot);
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('GET /api/admin/marketplace-metrics failed:', error);
    return res.status(500).send({ message: 'Failed to load marketplace metrics.' });
  }
});

module.exports = router;
