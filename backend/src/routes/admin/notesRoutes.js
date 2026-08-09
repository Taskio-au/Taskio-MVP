'use strict';

const express = require('express');
const { requireAuth, requireAdmin } = require('../../middleware/auth');
const { listAdminNotes, addAdminNote } = require('../../services/adminNotesService');

const router = express.Router();

router.get('/api/admin/notes', requireAuth, requireAdmin, async (req, res) => {
  try {
    const entityType = String(req.query.entityType || '').trim();
    const entityId = String(req.query.entityId || '').trim();
    const limit = Number(req.query.limit || 50);
    const rows = await listAdminNotes(entityType, entityId, limit);
    return res.status(200).send({ notes: rows });
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error('GET /api/admin/notes failed:', e);
    return res.status(500).send({ message: 'Failed to load notes.' });
  }
});

router.post('/api/admin/notes', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { entityType, entityId, note, noteType } = req.body || {};
    const result = await addAdminNote({
      entityType,
      entityId,
      note,
      noteType,
      createdBy: req.user.uid,
    });
    return res.status(201).send(result);
  } catch (e) {
    if (e?.code === 'empty_note' || e?.code === 'invalid_entity') {
      return res.status(400).send({ message: 'Invalid note or entity.' });
    }
    // eslint-disable-next-line no-console
    console.error('POST /api/admin/notes failed:', e);
    return res.status(500).send({ message: 'Failed to save note.' });
  }
});

module.exports = router;
