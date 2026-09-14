'use strict';

const express = require('express');
const { db } = require('../../firebaseAdmin');
const { requireAuth, requireAdmin } = require('../../middleware/auth');
const { readPilotSettings, updatePilotSettingsState, updateExpertOnboardingMode } = require('../../services/pilotSettingsService');
const { adminExpertEnrollmentSafetyFields } = require('../../services/expertOnboardingAccess');

const router = express.Router();

/**
 * GET /api/admin/pilot-settings
 * Read persisted operational state. Missing/invalid documents fail closed to CLOSED.
 * Does not open homeowner posting.
 */
router.get('/api/admin/pilot-settings', requireAuth, requireAdmin, async (req, res) => {
  try {
    const settings = await readPilotSettings(db);
    return res.status(200).send({
      ...settings,
      ...adminExpertEnrollmentSafetyFields(settings),
    });
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('GET /api/admin/pilot-settings failed:', error);
    return res.status(500).send({ message: 'Failed to load pilot settings.' });
  }
});

/**
 * PUT /api/admin/pilot-settings/state
 * Admin-only mutation of CLOSED | OPEN | PAUSED. OPEN is re-checked against
 * live launch readiness. History is append-only. No posting behaviour change.
 */
router.put('/api/admin/pilot-settings/state', requireAuth, requireAdmin, async (req, res) => {
  try {
    const result = await updatePilotSettingsState(db, {
      nextState: req.body && req.body.state,
      reason: req.body && req.body.reason,
      actorUid: req.user && req.user.uid,
    });
    if (!result.ok) {
      return res.status(result.status || 400).send(result.error);
    }
    const settings = {
      ...result.settings,
      ...adminExpertEnrollmentSafetyFields(result.settings),
    };
    return res.status(200).send({ ...result, settings });
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('PUT /api/admin/pilot-settings/state failed:', error);
    return res.status(500).send({ message: 'Failed to update pilot settings.' });
  }
});

/**
 * PUT /api/admin/pilot-settings/expert-onboarding
 * Admin-only Expert application mode: OPEN | WAITLIST.
 * Independent of homeowner CLOSED/OPEN/PAUSED and does not require READY TO OPEN.
 */
router.put('/api/admin/pilot-settings/expert-onboarding', requireAuth, requireAdmin, async (req, res) => {
  try {
    const result = await updateExpertOnboardingMode(db, {
      nextMode: req.body && req.body.mode,
      reason: req.body && req.body.reason,
      actorUid: req.user && req.user.uid,
    });
    if (!result.ok) {
      return res.status(result.status || 400).send(result.error);
    }
    const settings = {
      ...result.settings,
      ...adminExpertEnrollmentSafetyFields(result.settings),
    };
    return res.status(200).send({ ...result, settings });
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('PUT /api/admin/pilot-settings/expert-onboarding failed:', error);
    return res.status(500).send({ message: 'Failed to update Expert onboarding mode.' });
  }
});

module.exports = router;
