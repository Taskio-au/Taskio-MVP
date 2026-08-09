'use strict';

const express = require('express');
const { db } = require('../../firebaseAdmin');
const { requireAuth, requireAdmin } = require('../../middleware/auth');
const {
  getSummaryForAdmin,
  getWorkItemsForEntity,
  getWorkItemById,
  batchWorkItemsForJobs,
  assignWorkItem,
  unassignWorkItem,
  setWorkItemStatus,
  snoozeWorkItem,
  setReminder,
  listFilteredWorkItems,
  getTeamLoad,
  getWorkflowActivityForEntity,
  bulkUpdateWorkItems,
} = require('../../services/adminWorkItemService');
const { logWorkflowEvent } = require('../../services/workflowAuditService');
const { runStaleWorkflowRefresh } = require('../../services/workflowRefreshService');

const router = express.Router();

router.get('/api/admin/work-items/summary', requireAuth, requireAdmin, async (req, res) => {
  try {
    const summary = await getSummaryForAdmin(req.user.uid);
    return res.status(200).send(summary);
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error('GET work-items/summary failed:', e);
    return res.status(500).send({ message: 'Failed to load summary.' });
  }
});

router.get('/api/admin/work-items', requireAuth, requireAdmin, async (req, res) => {
  try {
    const entityType = String(req.query.entityType || '').trim();
    const entityId = String(req.query.entityId || '').trim();
    if (!entityType) return res.status(400).send({ message: 'entityType required.' });
    if (entityId) {
      const items = await getWorkItemsForEntity(entityType, entityId);
      return res.status(200).send({ items });
    }
    const owner = String(req.query.owner || '').trim();
    const sla = String(req.query.sla || '').trim();
    const priority = String(req.query.priority || '').trim();
    const status = String(req.query.status || '').trim();
    const followup = String(req.query.followup || '').trim();
    const items = await listFilteredWorkItems({
      entityType,
      owner,
      sla,
      priority,
      status,
      followup,
      currentUid: req.user.uid,
    });
    if (owner || sla || priority || status || followup) {
      await logWorkflowEvent({
        type: 'FILTERED_QUEUE_OPENED',
        actor: req.user.uid,
        entityType,
        entityId: 'queue',
        workItemId: '',
        payload: { owner, sla, priority, status, followup, count: items.length },
      });
    }
    return res.status(200).send({ items });
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error('GET work-items failed:', e);
    return res.status(500).send({ message: 'Failed to load work items.' });
  }
});

router.get('/api/admin/work-items/team-load', requireAuth, requireAdmin, async (req, res) => {
  try {
    const summary = await getTeamLoad();
    return res.status(200).send(summary);
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error('GET team-load failed:', e);
    return res.status(500).send({ message: 'Failed to load team load.' });
  }
});

router.get('/api/admin/work-items/activity', requireAuth, requireAdmin, async (req, res) => {
  try {
    const entityType = String(req.query.entityType || '').trim();
    const entityId = String(req.query.entityId || '').trim();
    const limitN = req.query.limit != null ? Number(req.query.limit) : 22;
    const out = await getWorkflowActivityForEntity(entityType, entityId, limitN);
    return res.status(200).send(out);
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error('GET activity failed:', e);
    return res.status(500).send({ message: 'Failed to load activity.' });
  }
});

router.post('/api/admin/work-items/bulk-update', requireAuth, requireAdmin, async (req, res) => {
  try {
    const itemIds = req.body?.itemIds;
    const action = req.body?.action;
    const params = req.body?.params && typeof req.body.params === 'object' ? req.body.params : {};
    const out = await bulkUpdateWorkItems(itemIds, action, params, req.user.uid);
    if (!out.ok) return res.status(400).send(out);
    return res.status(200).send(out);
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error('POST bulk-update failed:', e);
    return res.status(500).send({ message: 'Bulk update failed.' });
  }
});

router.get('/api/admin/work-items/batch-jobs', requireAuth, requireAdmin, async (req, res) => {
  try {
    const raw = String(req.query.ids || '').trim();
    const ids = raw.split(',').map((x) => x.trim()).filter(Boolean).slice(0, 40);
    const map = await batchWorkItemsForJobs(ids);
    return res.status(200).send({ byJobId: map });
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error('GET batch-jobs failed:', e);
    return res.status(500).send({ message: 'Failed to load batch work items.' });
  }
});

router.post('/api/admin/work-items/:id/assign', requireAuth, requireAdmin, async (req, res) => {
  try {
    const id = String(req.params.id || '').trim();
    const assigneeUid = req.body?.assigneeUid != null ? String(req.body.assigneeUid).trim() : req.user.uid;
    const handoffNote = req.body?.handoffNote != null ? String(req.body.handoffNote) : '';
    let assigneeName = null;
    if (assigneeUid) {
      const u = await db.collection('users').doc(assigneeUid).get();
      if (u.exists) {
        const d = u.data() || {};
        assigneeName = String(d.displayName || d.name || '').trim() || null;
      }
    }
    const r = await assignWorkItem(id, assigneeUid, assigneeName, req.user.uid, { handoffNote });
    if (!r.ok) return res.status(400).send({ message: r.message || 'Assign failed.' });
    return res.status(200).send({ message: 'Assigned.' });
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error('POST assign failed:', e);
    return res.status(500).send({ message: 'Failed to assign.' });
  }
});

router.post('/api/admin/work-items/:id/unassign', requireAuth, requireAdmin, async (req, res) => {
  try {
    const id = String(req.params.id || '').trim();
    const r = await unassignWorkItem(id, req.user.uid);
    if (!r.ok) return res.status(400).send({ message: r.message || 'Unassign failed.' });
    return res.status(200).send({ message: 'Unassigned.' });
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error('POST unassign failed:', e);
    return res.status(500).send({ message: 'Failed to unassign.' });
  }
});

router.post('/api/admin/work-items/:id/status', requireAuth, requireAdmin, async (req, res) => {
  try {
    const id = String(req.params.id || '').trim();
    const status = String(req.body?.status || '').trim();
    const resolutionSummary = req.body?.resolutionSummary;
    const r = await setWorkItemStatus(id, status, req.user.uid, resolutionSummary);
    if (!r.ok) return res.status(400).send({ message: r.message || 'Update failed.' });
    return res.status(200).send({ message: 'Updated.' });
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error('POST status failed:', e);
    return res.status(500).send({ message: 'Failed to update status.' });
  }
});

router.post('/api/admin/work-items/:id/snooze', requireAuth, requireAdmin, async (req, res) => {
  try {
    const id = String(req.params.id || '').trim();
    const hours = Number(req.body?.hours);
    const untilMs = req.body?.untilMs != null ? Number(req.body.untilMs) : null;
    const wi = await getWorkItemById(id);
    const targetMs = untilMs || (Number.isFinite(hours) ? Date.now() + hours * 3600000 : Date.now() + 2 * 3600000);
    const r = await snoozeWorkItem(id, targetMs, req.user.uid, wi?.category);
    if (!r.ok) return res.status(400).send({ message: r.message || 'Snooze failed.' });
    return res.status(200).send({ message: 'Snoozed.' });
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error('POST snooze failed:', e);
    return res.status(500).send({ message: 'Failed to snooze.' });
  }
});

router.post('/api/admin/work-items/:id/remind', requireAuth, requireAdmin, async (req, res) => {
  try {
    const id = String(req.params.id || '').trim();
    const followUpAtMs = req.body?.followUpAtMs != null ? Number(req.body.followUpAtMs) : Date.now() + 4 * 3600000;
    const r = await setReminder(id, followUpAtMs, req.user.uid);
    if (!r.ok) return res.status(400).send({ message: r.message || 'Reminder failed.' });
    return res.status(200).send({ message: 'Reminder set.' });
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error('POST remind failed:', e);
    return res.status(500).send({ message: 'Failed to set reminder.' });
  }
});

router.post('/api/admin/work-items/:id/resolve', requireAuth, requireAdmin, async (req, res) => {
  try {
    const id = String(req.params.id || '').trim();
    const resolutionSummary = req.body?.resolutionSummary;
    const r = await setWorkItemStatus(id, 'resolved', req.user.uid, resolutionSummary);
    if (!r.ok) return res.status(400).send({ message: r.message || 'Resolve failed.' });
    return res.status(200).send({ message: 'Resolved.' });
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error('POST resolve failed:', e);
    return res.status(500).send({ message: 'Failed to resolve.' });
  }
});

router.post('/api/admin/workflow/refresh-stale', requireAuth, requireAdmin, async (req, res) => {
  try {
    const secret = String(req.headers['x-cron-secret'] || '').trim();
    const expected = String(process.env.CRON_SECRET || '').trim();
    if (expected && secret !== expected) {
      return res.status(403).send({ message: 'Forbidden.' });
    }
    const out = await runStaleWorkflowRefresh();
    return res.status(200).send(out);
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error('refresh-stale failed:', e);
    return res.status(500).send({ message: 'Refresh failed.' });
  }
});

module.exports = router;
