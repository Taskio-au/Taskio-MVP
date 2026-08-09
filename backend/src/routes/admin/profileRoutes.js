'use strict';

const express = require('express');

const { admin, db } = require('../../firebaseAdmin');
const { requireAuth, requireAdmin } = require('../../middleware/auth');
const { safeToMillis } = require('../../utils/firestore');
const { writeUserAuditLog } = require('../../utils/auditLogs');
const { phase1KeysSet } = require('../../shared/expertiseCatalog');
const { sanitizePlainText } = require('./shared/text');
const { normalizeStringArray, pruneToAllowed } = require('./shared/collections');
const { parseNameParts } = require('./shared/names');
const { getExpertTrustSummary } = require('../../services/expertTrustService');
const { buildDisplayName } = require('../../utils/pii');

const router = express.Router();

const TRUST_IMPACT_FIELDS = new Set(['displayName', 'name', 'firstName', 'lastName', 'businessName', 'businessType', 'abn']);

function profileRequestIsTrustImpacting(r) {
  const row = r || {};
  const f = String(row.field || '').trim();
  if (TRUST_IMPACT_FIELDS.has(f)) return true;
  const patch = row.requestedPatch && typeof row.requestedPatch === 'object' ? row.requestedPatch : {};
  return Object.keys(patch).some((k) => TRUST_IMPACT_FIELDS.has(k));
}

/**
 * GET /api/admin/profile-change-requests?status=pending|approved|rejected&uid=<uid>&limit=50&cursor=<docId>
 * Returns a paginated list of profile change requests.
 *
 * NOTE: For status-filtered queries we order by document id to avoid composite index requirements.
 */
/**
 * GET /api/admin/profile-change-requests/:id
 * Single request with user label + trust snippet (experts).
 */
router.get('/api/admin/profile-change-requests/:id', requireAuth, requireAdmin, async (req, res) => {
  try {
    const id = String(req.params.id || '').trim();
    if (!id) return res.status(400).send({ message: 'Invalid id.' });

    const reqRef = db.collection('profile_change_requests').doc(id);
    const snap = await reqRef.get();
    if (!snap.exists) return res.status(404).send({ message: 'Request not found.' });
    const r = snap.data() || {};

    let userDisplayName = null;
    let userRole = null;
    let trustSummary = null;
    if (r.uid) {
      const uSnap = await db.collection('users').doc(String(r.uid)).get();
      if (uSnap.exists) {
        const u = uSnap.data() || {};
        userRole = u.role || null;
        userDisplayName = buildDisplayName(u);
        if (u.role === 'tradie') {
          try {
            trustSummary = await getExpertTrustSummary(String(r.uid));
          } catch (_) {
            trustSummary = null;
          }
        }
      }
    }

    const evidenceCount = Array.isArray(r.evidenceUrls) ? r.evidenceUrls.length : (r.evidenceCount || 0);

    return res.status(200).send({
      id: snap.id,
      ...r,
      userDisplayName,
      userRole,
      trustSummary,
      trustImpacting: profileRequestIsTrustImpacting(r),
      evidenceCount,
    });
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error('GET /api/admin/profile-change-requests/:id failed:', e);
    return res.status(500).send({ message: 'Failed to load request.' });
  }
});

/**
 * POST /api/admin/profile-change-requests/:id/escalate
 * Queues for super-admin review (metadata only).
 */
router.post('/api/admin/profile-change-requests/:id/escalate', requireAuth, requireAdmin, async (req, res) => {
  try {
    const id = String(req.params.id || '').trim();
    const reqRef = db.collection('profile_change_requests').doc(id);
    const snap = await reqRef.get();
    if (!snap.exists) return res.status(404).send({ message: 'Request not found.' });
    const r = snap.data() || {};
    if (r.status !== 'pending') return res.status(409).send({ message: 'Request is not pending.' });

    await reqRef.set(
      {
        escalationStatus: 'super_admin_review',
        escalatedAt: admin.firestore.FieldValue.serverTimestamp(),
        escalatedByUid: req.user.uid,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true }
    );
    return res.status(200).send({ message: 'Escalated for super admin review.' });
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error('POST escalate profile request failed:', e);
    return res.status(500).send({ message: 'Failed to escalate.' });
  }
});

router.get('/api/admin/profile-change-requests', requireAuth, requireAdmin, async (req, res) => {
  try {
    const status = (req.query.status || '').toString().trim();
    const uid = (req.query.uid || '').toString().trim();
    const limitRaw = Number(req.query.limit || 50);
    const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(limitRaw, 1), 200) : 50;

    let query = db.collection('profile_change_requests');
    if (uid) query = query.where('uid', '==', uid);
    if (status) query = query.where('status', '==', status);

    // IMPORTANT: keep this query index-free (no orderBy combined with where) to avoid requiring composite indexes.
    const snap = await query.limit(limit).get();

    const items = snap.docs.map((d) => {
      const data = d.data() || {};
      const row = {
        id: d.id,
        uid: data.uid || '',
        role: data.role || '',
        field: data.field || '',
        currentValue: data.currentValue || '',
        requestedValue: data.requestedValue || '',
        requestedPatch: data.requestedPatch || null,
        reason: data.reason || '',
        status: data.status || 'pending',
        adminNote: data.adminNote || '',
        decidedByUid: data.decidedByUid || '',
        decidedAtMs: safeToMillis(data.decidedAt),
        createdAtMs: safeToMillis(data.createdAt),
        updatedAtMs: safeToMillis(data.updatedAt),
        escalationStatus: data.escalationStatus || 'normal',
      };
      return { ...row, trustImpacting: profileRequestIsTrustImpacting(row) };
    });

    items.sort((a, b) => (b.createdAtMs || 0) - (a.createdAtMs || 0));
    return res.status(200).send({ items, nextCursor: null });
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error('GET /api/admin/profile-change-requests failed:', e);
    return res.status(500).send({ message: 'Failed to load profile change requests.' });
  }
});

/**
 * POST /api/admin/migrate/expertise
 * Phase 1 migration:
 * - If legacy users/{uid}.expertise exists and expertiseApproved missing: copy -> expertiseApproved, log 'migrate'
 * - Prune any non-Phase-1 keys from expertiseApproved, log 'phase1_prune' for each removed key
 *
 * IMPORTANT: Tier 2 categories must not remain in expertiseApproved after this runs.
 */
router.post('/api/admin/migrate/expertise', requireAuth, requireAdmin, async (req, res) => {
  try {
    const adminUid = req.user.uid;
    const limitRaw = Number(req.body?.limit || 500);
    const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(limitRaw, 1), 2000) : 500;

    const snap = await db.collection('users').where('role', '==', 'tradie').limit(limit).get();
    // NOTE: Firestore does not allow FieldValue.serverTimestamp() inside arrays.
    const now = admin.firestore.Timestamp.now();

    let touched = 0;
    let migrated = 0;
    let pruned = 0;

    // Firestore batch max 500 ops; keep a conservative limit (users count) here.
    const batch = db.batch();

    for (const d of snap.docs) {
      const uid = d.id;
      const u = d.data() || {};
      const hasApproved = Array.isArray(u.expertiseApproved);
      const legacy = u.expertise;

      let nextApproved = hasApproved ? normalizeStringArray(u.expertiseApproved) : null;
      const log = Array.isArray(u.expertiseChangeLog) ? u.expertiseChangeLog.slice(0, 50) : [];
      let didChange = false;

      if (!nextApproved && legacy) {
        nextApproved = Array.isArray(legacy)
          ? legacy
          : String(legacy || '')
            .split(',')
            .map((s) => s.trim())
            .filter(Boolean);
        log.push({ action: 'migrate', category: 'legacy_expertise', by: 'admin', at: now });
        migrated += 1;
        didChange = true;
      }

      nextApproved = normalizeStringArray(nextApproved || []);
      const { kept, removed } = pruneToAllowed(nextApproved, phase1KeysSet);
      if (removed.length > 0) {
        for (const r of removed) log.push({ action: 'phase1_prune', category: r, by: 'admin', at: now });
        nextApproved = kept;
        pruned += removed.length;
        didChange = true;
      } else {
        nextApproved = kept;
      }

      if (!didChange) continue;

      touched += 1;
      batch.set(
        db.collection('users').doc(uid),
        {
          expertiseApproved: nextApproved,
          expertiseUpdatedAt: admin.firestore.FieldValue.serverTimestamp(),
          expertiseChangeLog: log.slice(-50),
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        },
        { merge: true }
      );

      await writeUserAuditLog({
        uid,
        actorUid: adminUid,
        action: 'ADMIN_MIGRATE_EXPERTISE_PHASE1',
        before: { hasApproved: !!hasApproved },
        after: { migrated: !hasApproved && !!legacy, removedCount: removed.length },
        req,
      });
    }

    await batch.commit();
    return res.status(200).send({ message: 'Migration complete.', touched, migrated, pruned });
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error('POST /api/admin/migrate/expertise failed:', e);
    return res.status(500).send({ message: 'Failed to migrate expertise.' });
  }
});

/**
 * POST /api/admin/profile-change-requests/:id/decision
 * Body: { decision: "approved" | "rejected", note?: string }
 * Approving applies the patch to users/{uid} even if fields are locked for the user.
 */
router.post('/api/admin/profile-change-requests/:id/decision', requireAuth, requireAdmin, async (req, res) => {
  try {
    const id = req.params.id;
    const adminUid = req.user.uid;
    const decision = String(req.body?.decision || '').trim();
    const note = sanitizePlainText(req.body?.note, 1000);

    if (decision !== 'approved' && decision !== 'rejected') {
      return res.status(400).send({ message: 'Invalid decision.' });
    }

    const reqRef = db.collection('profile_change_requests').doc(id);
    const snap = await reqRef.get();
    if (!snap.exists) return res.status(404).send({ message: 'Request not found.' });
    const r = snap.data() || {};
    if (r.status !== 'pending') return res.status(409).send({ message: 'Request is not pending.' });
    if (!r.uid) return res.status(400).send({ message: 'Request is missing uid.' });

    if (decision === 'rejected' && profileRequestIsTrustImpacting(r)) {
      const n = String(note || '').trim();
      if (n.length < 8) {
        return res.status(400).send({
          message: 'Trust-impacting rejections require a clear reason (at least 8 characters).',
          code: 'trust_rejection_reason_required',
        });
      }
    }

    const userRef = db.collection('users').doc(r.uid);
    const userSnap = await userRef.get();
    if (!userSnap.exists) return res.status(404).send({ message: 'User not found.' });
    const beforeUser = userSnap.data() || {};

    const beforeIdentity = {
      displayName: String(beforeUser.displayName || beforeUser.name || '').trim(),
      businessName: String(beforeUser.businessName || '').trim(),
    };

    const patch = r.requestedPatch && typeof r.requestedPatch === 'object' ? r.requestedPatch : {};
    const updateUser = {};

    if (decision === 'approved') {
      if (patch.displayName) {
        const dn = String(patch.displayName || '').trim().replace(/\s+/g, ' ');
        if (dn.length < 2 || dn.length > 80) return res.status(400).send({ message: 'Invalid displayName in patch.' });
        updateUser.displayName = dn;
        updateUser.name = dn; // legacy compatibility
        const parts = parseNameParts(dn);
        updateUser.firstName = parts.firstName;
        updateUser.lastName = parts.lastName;
      }
      if (patch.businessName) {
        const bn = String(patch.businessName || '').trim().replace(/\s+/g, ' ');
        if (bn.length < 2 || bn.length > 120) return res.status(400).send({ message: 'Invalid businessName in patch.' });
        updateUser.businessName = bn;
      }

      updateUser.updatedAt = admin.firestore.FieldValue.serverTimestamp();
      await userRef.set(updateUser, { merge: true });
    }

    await reqRef.set(
      {
        status: decision,
        adminNote: note || null,
        decisionReason: note || null,
        decidedByUid: adminUid,
        decidedBy: adminUid,
        decidedAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        before: beforeIdentity,
        after: decision === 'approved'
          ? {
            displayName: updateUser.displayName || beforeIdentity.displayName,
            businessName: updateUser.businessName || beforeIdentity.businessName,
          }
          : beforeIdentity,
      },
      { merge: true }
    );

    await writeUserAuditLog({
      uid: r.uid,
      actorUid: adminUid,
      action: decision === 'approved' ? 'ADMIN_APPROVE_PROFILE_CHANGE' : 'ADMIN_REJECT_PROFILE_CHANGE',
      before: { requestId: id, ...beforeIdentity },
      after: { requestId: id, decision, note, patch },
      req,
    });

    return res.status(200).send({ message: `Request ${decision}.` });
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error('POST /api/admin/profile-change-requests/:id/decision failed:', e);
    return res.status(500).send({ message: 'Failed to update request.' });
  }
});

module.exports = router;
