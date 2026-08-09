'use strict';

const express = require('express');
const { admin, db } = require('../../firebaseAdmin');
const { requireAuth, requireAdmin } = require('../../middleware/auth');
const { evaluateSupportTicketRiskById } = require('../../services/riskAutomationPipeline');

const router = express.Router();

const VALID_ESC = new Set(['normal', 'priority', 'ops', 'super_admin']);

/**
 * PATCH /api/admin/support-tickets/:ticketId
 * Body: { escalationStatus?: string, linkedRiskTypes?: string[] }
 */
router.patch('/api/admin/support-tickets/:ticketId', requireAuth, requireAdmin, async (req, res) => {
  try {
    const ticketId = String(req.params.ticketId || '').trim();
    if (!ticketId) return res.status(400).send({ message: 'Invalid ticket id.' });

    const ref = db.collection('supportTickets').doc(ticketId);
    const snap = await ref.get();
    if (!snap.exists) return res.status(404).send({ message: 'Ticket not found.' });

    const escalationStatus = req.body?.escalationStatus != null
      ? String(req.body.escalationStatus).trim().toLowerCase()
      : null;
    const linkedRiskTypes = Array.isArray(req.body?.linkedRiskTypes)
      ? req.body.linkedRiskTypes.map((x) => String(x || '').trim()).filter(Boolean).slice(0, 12)
      : null;

    const update = {
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      lastUpdatedBy: 'admin',
      lastAdminActionAt: admin.firestore.FieldValue.serverTimestamp(),
      lastAdminActionBy: req.user.uid,
    };

    if (escalationStatus && VALID_ESC.has(escalationStatus)) {
      update.escalationStatus = escalationStatus;
      update.escalationSource = 'manual';
    }
    if (linkedRiskTypes) {
      update.linkedRiskTypes = linkedRiskTypes;
    }

    await ref.set(update, { merge: true });

    setImmediate(() => {
      evaluateSupportTicketRiskById(ticketId).catch(() => {});
    });

    return res.status(200).send({ message: 'Updated.' });
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error('PATCH /api/admin/support-tickets/:ticketId failed:', e);
    return res.status(500).send({ message: 'Failed to update ticket.' });
  }
});

module.exports = router;
