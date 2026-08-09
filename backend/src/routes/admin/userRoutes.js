'use strict';

const express = require('express');

const { admin, db } = require('../../firebaseAdmin');
const { requireAuth, requireAdmin } = require('../../middleware/auth');
const { safeToMillis } = require('../../utils/firestore');
const { maskEmail, buildDisplayName } = require('../../utils/pii');
const { writeUserAuditLog } = require('../../utils/auditLogs');
const {
  approveFoundingExpert,
  removeFoundingExpert,
  resetFoundingExpertTestProgram,
  foundingExpertTestResetAllowed,
  FoundingExpertEnrollmentError,
} = require('../../services/foundingExpertEnrollmentService');
const { computeProfileCompleted, computeStripeOnboardingComplete } = require('../../utils/v11TradieEligibility');
const { sanitizePlainText } = require('./shared/text');
const { is18PlusConfirmed, hasServiceLocation, hasBusinessType } = require('./shared/eligibility');
const { getFoundingExpertStage } = require('../../services/expertFeeProgram');
const feePlans = require('../../../../shared/feePlans');
const { foundingExpertEligibilityPayload } = require('../../utils/foundingExpertEligibility');
const {
  foundingExpertAutoEnrollEnabled,
  scheduleMaybeAutoEnrollFoundingExpert,
} = require('../../services/foundingExpertAutoEnrollmentService');

/**
 * Safe subset for admin GET user detail — no actor UIDs, no raw Timestamp objects.
 */
function sanitizeFoundingExpertForAdminUserDetail(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const status = typeof raw.status === 'string' ? raw.status.trim().toLowerCase() : '';
  const zLimitRaw = Number(raw.zeroFeeTaskLimit);
  const zLimit =
    Number.isFinite(zLimitRaw) && zLimitRaw > 0 ? zLimitRaw : feePlans.FOUNDING_EXPERT_ZERO_FEE_TASK_LIMIT;
  const zUsedRaw = Number(raw.zeroFeeSlotsUsed);
  const zUsed =
    Number.isFinite(zUsedRaw) && Number.isInteger(zUsedRaw)
      ? Math.max(0, zUsedRaw)
      : 0;
  const seq = Number(raw.sequenceNumber);

  const reducedFeeBpsRaw = Number(raw.reducedFeeBps);
  const reducedFeeBps =
    Number.isFinite(reducedFeeBpsRaw) ? reducedFeeBpsRaw : feePlans.FOUNDING_EXPERT_REDUCED_FEE_BPS;
  const stdBpsRaw = Number(raw.standardFeeBpsAfter);
  const standardFeeBpsAfter =
    Number.isFinite(stdBpsRaw) ? stdBpsRaw : feePlans.STANDARD_LAUNCH_FEE_BPS;

  return {
    status,
    programId: raw.programId != null ? String(raw.programId).trim() : '',
    sequenceNumber: Number.isFinite(seq) ? seq : null,
    city: typeof raw.city === 'string' && raw.city.trim() ? raw.city.trim() : null,
    zeroFeeTaskLimit: zLimit,
    zeroFeeSlotsUsed: zUsed,
    reducedFeeBps,
    standardFeeBpsAfter,
    approvedAtMs: safeToMillis(raw.approvedAt),
    removedAtMs: safeToMillis(raw.removedAt),
    testResetAtMs: safeToMillis(raw.testResetAt),
    reducedFeeStartsAtMs: safeToMillis(raw.reducedFeeStartsAt),
    reducedFeeEndsAtMs: safeToMillis(raw.reducedFeeEndsAt),
  };
}

function foundingExpertFeePreviewForAdmin(profileData) {
  const s = getFoundingExpertStage(profileData);
  let effectiveReducedFeeEndsAtMs = null;
  if (
    s.effectiveReducedFeeEndsAt instanceof Date
    && !Number.isNaN(s.effectiveReducedFeeEndsAt.getTime())
  ) {
    effectiveReducedFeeEndsAtMs = s.effectiveReducedFeeEndsAt.getTime();
  }
  return {
    stage: s.stage,
    expertFeeBps: s.expertFeeBps,
    benefitLabel: s.benefitLabel,
    derivedReducedFeeEndsAt: !!s.derivedReducedFeeEndsAt,
    effectiveReducedFeeEndsAtMs,
  };
}

function foundingExpertProgramMetaForAdmin() {
  return {
    cap: feePlans.foundingExpertCap,
    activeProgramId: feePlans.getActiveFoundingExpertProgramId(),
    zeroFeeTaskLimit: feePlans.FOUNDING_EXPERT_ZERO_FEE_TASK_LIMIT,
    reducedFeeBps: feePlans.FOUNDING_EXPERT_REDUCED_FEE_BPS,
    standardFeeBpsAfter: feePlans.STANDARD_LAUNCH_FEE_BPS,
    testResetAllowed: foundingExpertTestResetAllowed(),
  };
}

const router = express.Router();

function foundingExpertSafePayload(fe) {
  if (!fe || typeof fe !== 'object') return null;
  return {
    ...fe,
    approvedAtMs: safeToMillis(fe.approvedAt),
    removedAtMs: safeToMillis(fe.removedAt),
    testResetAtMs: safeToMillis(fe.testResetAt),
    reducedFeeStartsAtMs: safeToMillis(fe.reducedFeeStartsAt),
    reducedFeeEndsAtMs: safeToMillis(fe.reducedFeeEndsAt),
  };
}

async function logFoundingExpertAdminAction({
  req,
  expertUid,
  action,
  metadata,
}) {
  await db.collection('admin_audit_logs').add({
    adminId: req.user.uid,
    targetUserId: expertUid || null,
    jobId: null,
    action,
    path: req.originalUrl,
    ip: req.ip,
    userAgent: req.headers['user-agent'] || null,
    metadata: metadata || null,
    timestamp: admin.firestore.FieldValue.serverTimestamp(),
  });
}

/**
 * POST /api/admin/experts/:expertUid/founding-expert/approve
 * Body (optional): { programId?: string }
 */
router.post(
  '/api/admin/experts/:expertUid/founding-expert/approve',
  requireAuth,
  requireAdmin,
  async (req, res) => {
    try {
      const expertUid = req.params.expertUid;
      const programIdBody = req.body?.programId;

      const result = await approveFoundingExpert(db, admin, {
        expertUid,
        adminUid: req.user.uid,
        programId: programIdBody,
      });

      const fe = result.foundingExpert;

      await writeUserAuditLog({
        uid: expertUid,
        actorUid: req.user.uid,
        action: result.duplicate ? 'ADMIN_FOUNDING_EXPERT_APPROVE_DUPLICATE' : 'ADMIN_FOUNDING_EXPERT_APPROVE',
        before: null,
        after: {
          programId: fe.programId,
          duplicate: !!result.duplicate,
          sequenceNumber: fe.sequenceNumber,
        },
        req,
      });

      await logFoundingExpertAdminAction({
        req,
        expertUid,
        action: result.duplicate ? 'FOUNDING_EXPERT_APPROVE_DUPLICATE' : 'FOUNDING_EXPERT_APPROVE',
        metadata: { programId: fe.programId, sequenceNumber: fe.sequenceNumber, duplicate: !!result.duplicate },
      });

      return res.status(200).send({
        ok: true,
        duplicate: !!result.duplicate,
        foundingExpert: foundingExpertSafePayload(fe),
      });
    } catch (error) {
      if (error instanceof FoundingExpertEnrollmentError) {
        return res.status(error.statusCode).send({ message: error.message, code: error.code });
      }
      // eslint-disable-next-line no-console
      console.error('POST founding-expert approve failed:', error);
      return res.status(500).send({ message: 'Failed to approve founding expert.' });
    }
  }
);

/**
 * POST /api/admin/experts/:expertUid/founding-expert/remove
 * Body (optional): { programId?: string }
 */
router.post(
  '/api/admin/experts/:expertUid/founding-expert/remove',
  requireAuth,
  requireAdmin,
  async (req, res) => {
    try {
      const expertUid = req.params.expertUid;
      const programIdBody = req.body?.programId;

      const result = await removeFoundingExpert(db, admin, {
        expertUid,
        adminUid: req.user.uid,
        programId: programIdBody,
      });

      await writeUserAuditLog({
        uid: expertUid,
        actorUid: req.user.uid,
        action: 'ADMIN_FOUNDING_EXPERT_REMOVE',
        before: null,
        after: {
          programId: result.foundingExpert?.programId || null,
          alreadyRemoved: !!result.alreadyRemoved,
        },
        req,
      });

      await logFoundingExpertAdminAction({
        req,
        expertUid,
        action: 'FOUNDING_EXPERT_REMOVE',
        metadata: {
          programId: result.foundingExpert?.programId || null,
          alreadyRemoved: !!result.alreadyRemoved,
        },
      });

      return res.status(200).send({
        ok: true,
        alreadyRemoved: !!result.alreadyRemoved,
        foundingExpert: foundingExpertSafePayload(result.foundingExpert),
      });
    } catch (error) {
      if (error instanceof FoundingExpertEnrollmentError) {
        return res.status(error.statusCode).send({ message: error.message, code: error.code });
      }
      // eslint-disable-next-line no-console
      console.error('POST founding-expert remove failed:', error);
      return res.status(500).send({ message: 'Failed to remove founding expert.' });
    }
  }
);

/**
 * POST /api/admin/founding-expert-program/reset-test
 * Resets test cohort only (`melbourne_founding_expert_test_2026`).
 */
router.post('/api/admin/founding-expert-program/reset-test', requireAuth, requireAdmin, async (req, res) => {
  try {
    if (!foundingExpertTestResetAllowed()) {
      return res.status(403).send({ message: 'Test program reset is disabled in this environment.' });
    }

    const summary = await resetFoundingExpertTestProgram(db, admin, { adminUid: req.user.uid });

    await db.collection('admin_audit_logs').add({
      adminId: req.user.uid,
      targetUserId: null,
      jobId: null,
      action: 'FOUNDING_EXPERT_TEST_PROGRAM_RESET',
      path: req.originalUrl,
      ip: req.ip,
      userAgent: req.headers['user-agent'] || null,
      metadata: { usersUpdated: summary.usersUpdated },
      timestamp: admin.firestore.FieldValue.serverTimestamp(),
    });

    await writeUserAuditLog({
      uid: null,
      actorUid: req.user.uid,
      action: 'ADMIN_FOUNDING_EXPERT_TEST_PROGRAM_RESET',
      before: null,
      after: { usersUpdated: summary.usersUpdated },
      req,
    });

    return res.status(200).send({ ok: true, usersUpdated: summary.usersUpdated });
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('POST founding-expert-program reset-test failed:', error);
    return res.status(500).send({ message: 'Failed to reset test founding expert program.' });
  }
});

/**
 * Protected by requireAuth + requireAdmin
 * Disabled by default unless ENABLE_SET_ADMIN_ENDPOINT=true
 */
router.post('/api/admin/set-admin/:uid', requireAuth, requireAdmin, async (req, res) => {
  try {
    if (process.env.ENABLE_SET_ADMIN_ENDPOINT !== 'true') {
      return res.status(404).send({ message: 'Not found' });
    }

    const uid = req.params.uid;
    const userRecord = await admin.auth().getUser(uid);
    const customClaims = userRecord.customClaims || {};

    await admin.auth().setCustomUserClaims(uid, { ...customClaims, admin: true });

    return res.status(200).send({ message: `Successfully made user ${uid} an admin.` });
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('Error setting admin claim:', error);
    return res.status(500).send({ message: 'Error setting admin claim', error: error.message });
  }
});

/**
 * GET /api/admin/users?role=homeowner|tradie|all&limit=50&cursor=...
 * Returns a paginated list with masked email (privacy-by-design).
 */
router.get('/api/admin/users', requireAuth, requireAdmin, async (req, res) => {
  try {
    const role = (req.query.role || 'all').toString();
    const status = (req.query.status || '').toString().trim(); // e.g. pending_deletion
    const limitRaw = Number(req.query.limit || 50);
    const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(limitRaw, 1), 200) : 50;
    const cursor = (req.query.cursor || '').toString().trim();

    let query = db.collection('users');
    if (status) {
      // Avoid composite indexes by ordering on document id.
      query = query.where('status', '==', status).orderBy(admin.firestore.FieldPath.documentId()).limit(limit + 1);
    }
    const hasRoleFilter = (role === 'homeowner' || role === 'tradie');
    if (!status && hasRoleFilter) {
      // IMPORTANT: avoid requiring a composite index for (role + createdAt) by ordering by documentId
      query = query.where('role', '==', role).orderBy(admin.firestore.FieldPath.documentId()).limit(limit + 1);
    } else if (!status) {
      // For "all", we can order by createdAt directly (single-field index)
      query = query.orderBy('createdAt', 'desc').limit(limit + 1);
    }

    if (cursor) {
      const cursorDoc = await db.collection('users').doc(cursor).get();
      if (cursorDoc.exists) {
        query = query.startAfter(cursorDoc);
      }
    }

    const snap = await query.get();
    const docs = snap.docs;

    const hasNext = docs.length > limit;
    const pageDocs = hasNext ? docs.slice(0, limit) : docs;
    const nextCursor = hasNext ? pageDocs[pageDocs.length - 1].id : null;

    const users = pageDocs.map((doc) => {
      const data = doc.data() || {};
      const email = data.email || '';
      const updatedAtMs = safeToMillis(data.updatedAt);
      const adminNoteText =
        (typeof data.adminNote === 'string' ? data.adminNote : '') ||
        (data.adminNote && typeof data.adminNote === 'object' ? String(data.adminNote.text || '') : '') ||
        (typeof data.adminNoteText === 'string' ? data.adminNoteText : '');
      const adminNoteUpdatedAtMs =
        safeToMillis(data.adminNote?.updatedAt) ||
        safeToMillis(data.adminNoteUpdatedAt) ||
        safeToMillis(data.adminNoteTextUpdatedAt) ||
        0;
      const stripeOk = data.role === 'tradie' ? computeStripeOnboardingComplete(data) : undefined;
      const profileCompleted = data.role === 'tradie'
        ? (data.profileCompleted === true || computeProfileCompleted(data))
        : undefined;
      const adultOk = data.role === 'tradie' ? is18PlusConfirmed(data) : undefined;
      const serviceLocationPresent = data.role === 'tradie' ? hasServiceLocation(data) : undefined;
      const businessTypeSet = data.role === 'tradie' ? hasBusinessType(data) : undefined;
      return {
        uid: doc.id,
        role: data.role || '',
        displayName: buildDisplayName(data),
        emailMasked: maskEmail(email),
        createdAt: safeToMillis(data.createdAt),
        updatedAtMs,
        status: data.status === 'disabled' ? 'suspended' : 'active',
        verified: !!data.verified,
        // tradie-only operational fields (no Stripe account IDs)
        stripeOnboardingStatus: data.role === 'tradie' ? (data.stripeOnboardingStatus || 'pending') : undefined,
        stripeOnboardingComplete: stripeOk,
        // tradie-only non-PII fields used for operational filtering
        expertiseApproved: data.role === 'tradie' ? (Array.isArray(data.expertiseApproved) ? data.expertiseApproved : []) : undefined,
        profileCompleted,
        phoneVerified: data.role === 'tradie' ? (data.phoneVerified === true) : undefined,
        abnVerified: data.role === 'tradie' ? (data.abnVerified === true) : undefined,
        // Privacy: do NOT return DOB; only return derived 18+ confirmation.
        is18PlusConfirmed: adultOk,
        serviceLocationPresent,
        businessTypeSet,
        // Boost (MVP): prefer new boost schema, fall back to legacy boostedVisibility.
        boostedVisibility: data.role === 'tradie'
          ? ((data.boost && data.boost.isBoosted === true) || data.boostedVisibility === true)
          : undefined,
        boost: data.role === 'tradie'
          ? {
            isBoosted: !!((data.boost && data.boost.isBoosted === true) || data.boostedVisibility === true),
            boostedAtMs: safeToMillis(data.boost?.boostedAt) || safeToMillis(data.boostedAt) || 0,
            boostedUntilMs: safeToMillis(data.boost?.boostedUntil) || 0,
            boostedBy: data.boost?.boostedBy || data.boostedBy || '',
            reason: data.boost?.reason || '',
          }
          : undefined,
        lastQuoteSubmittedAtMs: data.role === 'tradie' ? safeToMillis(data.lastQuoteSubmittedAt) : undefined,
        adminNote: adminNoteText ? String(adminNoteText).slice(0, 200) : '',
        adminNoteUpdatedAtMs: adminNoteUpdatedAtMs || undefined,
        adminNoteUpdatedBy: (data.adminNote && typeof data.adminNote === 'object' ? (data.adminNote.updatedBy || '') : '') || String(data.adminNoteUpdatedBy || ''),
        adminNoteUpdatedByName: (data.adminNote && typeof data.adminNote === 'object' ? (data.adminNote.updatedByName || '') : '') || String(data.adminNoteUpdatedByName || ''),
      };
    });

    return res.status(200).send({ users, nextCursor });
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('Failed to fetch users:', error);
    return res.status(500).send({ message: 'Failed to fetch users' });
  }
});

/**
 * GET /api/admin/users/:uid/summary
 * Minimal, masked data for inline admin views (does NOT write PII audit log).
 */
router.get('/api/admin/users/:uid/summary', requireAuth, requireAdmin, async (req, res) => {
  try {
    const targetUid = req.params.uid;
    const userDoc = await db.collection('users').doc(targetUid).get();
    if (!userDoc.exists) return res.status(404).send({ message: 'User not found.' });
    const data = userDoc.data() || {};
    const email = data.email || '';

    return res.status(200).send({
      uid: targetUid,
      role: data.role || '',
      displayName: buildDisplayName(data),
      emailMasked: maskEmail(email),
      status: data.status === 'disabled' ? 'suspended' : 'active',
      verified: !!data.verified,
      stripeOnboardingStatus: data.role === 'tradie' ? (data.stripeOnboardingStatus || 'pending') : undefined,
    });
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('Failed to fetch user summary:', error);
    return res.status(500).send({ message: 'Failed to fetch user summary' });
  }
});

/**
 * GET /api/admin/users/:uid
 * Returns full details including full email (admin-only) and writes an audit log.
 * Firestore-only rows (listed in GET /users but Auth user deleted/absent) use profile data without failing.
 */
router.get('/api/admin/users/:uid', requireAuth, requireAdmin, async (req, res) => {
  try {
    const targetUid = req.params.uid;
    const adminUid = req.user.uid;

    const userDoc = await db.collection('users').doc(targetUid).get();

    let userRecord = null;
    try {
      userRecord = await admin.auth().getUser(targetUid);
    } catch (err) {
      if (err?.code !== 'auth/user-not-found') throw err;
    }

    const data = userDoc.exists ? (userDoc.data() || {}) : {};
    if (!userDoc.exists && !userRecord) {
      return res.status(404).send({ message: 'User not found.' });
    }

    const displayName = buildDisplayName(data) || (userRecord?.displayName || '');

    const adminCommsLog = Array.isArray(data.adminCommsLog) ? data.adminCommsLog : [];
    let lastOutreachAtMs = null;
    for (const entry of adminCommsLog) {
      const at = safeToMillis(entry?.copiedAt);
      if (at && (!lastOutreachAtMs || at > lastOutreachAtMs)) lastOutreachAtMs = at;
    }

    const response = {
      uid: targetUid,
      role: data.role || '',
      firstName: data.firstName || '',
      lastName: data.lastName || '',
      displayName,
      email: userRecord?.email || data.email || '',
      phone: userRecord?.phoneNumber || data.phone || null,
      createdAt:
        safeToMillis(data.createdAt)
        || (userRecord?.metadata?.creationTime ? Date.parse(userRecord.metadata.creationTime) : 0),
      status: data.status === 'disabled' ? 'suspended' : 'active',
      verified: !!data.verified,
      lastLogin: userRecord?.metadata?.lastSignInTime ? Date.parse(userRecord.metadata.lastSignInTime) : null,
      lastOutreachAtMs,
      // Privacy: Do NOT return DOB; derived 18+ confirmation only.
      is18PlusConfirmed: data.role === 'tradie' ? is18PlusConfirmed(data) : undefined,
      // Stripe operational fields (no account IDs)
      stripeOnboardingStatus: data.role === 'tradie' ? (data.stripeOnboardingStatus || 'pending') : undefined,
      stripeChargesEnabled: data.role === 'tradie' ? !!data.stripeChargesEnabled : undefined,
      stripePayoutsEnabled: data.role === 'tradie' ? !!data.stripePayoutsEnabled : undefined,
      stripeRequirements: data.role === 'tradie' ? (data.stripeRequirements || null) : undefined,
    };

    if (response.role === 'tradie') {
      const foundingRaw = data.foundingExpert && typeof data.foundingExpert === 'object'
        ? data.foundingExpert
        : null;
      response.foundingExpert = foundingRaw
        ? sanitizeFoundingExpertForAdminUserDetail(foundingRaw)
        : null;
      response.foundingExpertFeePreview = foundingExpertFeePreviewForAdmin(data);
      response.foundingExpertProgramMeta = foundingExpertProgramMetaForAdmin();
      response.foundingExpertEligibility = foundingExpertEligibilityPayload(data);
    }

    // Audit log: PII access
    await db.collection('admin_audit_logs').add({
      adminId: adminUid,
      targetUserId: targetUid,
      action: 'VIEW_USER_PII',
      path: req.originalUrl,
      ip: req.ip,
      userAgent: req.headers['user-agent'] || null,
      timestamp: admin.firestore.FieldValue.serverTimestamp(),
    });

    return res.status(200).send(response);
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('Failed to fetch user details:', error);
    return res.status(500).send({ message: 'Failed to fetch user details' });
  }
});

router.put('/api/admin/users/:uid/verify', requireAuth, requireAdmin, async (req, res) => {
  try {
    const uid = req.params.uid;
    await db.collection('users').doc(uid).set(
      {
        verified: true,
        audit: {
          verifiedAt: admin.firestore.FieldValue.serverTimestamp(),
          verifiedBy: req.user.uid,
          nameLockedAt: admin.firestore.FieldValue.serverTimestamp(),
        },
        adminLastTouchAt: admin.firestore.FieldValue.serverTimestamp(),
        adminLastTouchBy: req.user.uid,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true }
    );

    await writeUserAuditLog({
      uid,
      actorUid: req.user.uid,
      action: 'ADMIN_VERIFY_USER',
      before: null,
      after: { verified: true },
      req,
    });

    if (foundingExpertAutoEnrollEnabled()) {
      await scheduleMaybeAutoEnrollFoundingExpert({
        db,
        admin,
        expertUid: uid,
        trigger: 'admin_verify_user',
        actorUidForApproval: req.user.uid,
      });
    }

    return res.status(200).send({ message: `Successfully verified user ${uid}.` });
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('Error verifying user:', error);
    return res.status(500).send({ message: 'Error verifying user', error: error.message });
  }
});

/**
 * POST /api/admin/users/:uid/deletion/execute
 * Manual (MVP) execution of anonymising deletion after cooling period.
 */
router.post('/api/admin/users/:uid/deletion/execute', requireAuth, requireAdmin, async (req, res) => {
  try {
    const uid = req.params.uid;
    const userRef = db.collection('users').doc(uid);
    const snap = await userRef.get();
    if (!snap.exists) return res.status(404).send({ message: 'User not found.' });
    const u = snap.data() || {};

    if (u.status !== 'pending_deletion') {
      return res.status(409).send({ message: `User is not pending deletion (status: ${u.status || 'unknown'}).` });
    }
    const scheduledFor = u.deletion?.scheduledFor?.toDate ? u.deletion.scheduledFor.toDate() : null;
    if (!scheduledFor) return res.status(409).send({ message: 'Missing scheduledFor timestamp.' });
    if (scheduledFor.getTime() > Date.now()) {
      return res.status(409).send({ message: 'Cooling-off period has not ended yet.' });
    }
    if (!u.deletion?.confirmStep2At) {
      return res.status(409).send({ message: 'Email confirmation step not completed.' });
    }

    // Anonymise user profile (do NOT hard-delete financial records).
    await userRef.set(
      {
        status: 'deleted',
        verified: false,
        displayName: 'Deleted user',
        name: 'Deleted user',
        legalName: '',
        businessName: '',
        bio: '',
        expertiseApproved: [],
        expertiseChangeLog: [],
        phone: '',
        phoneVerified: false,
        abn: '',
        abnVerified: false,
        photoURL: '',
        profilePhotoURL: '',
        audit: { ...(u.audit || {}), deletedAt: admin.firestore.FieldValue.serverTimestamp(), deletedBy: req.user.uid },
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true }
    );

    // Disable sign-in (keep auth record for compliance)
    await admin.auth().updateUser(uid, { disabled: true, displayName: 'Deleted user' });

    await writeUserAuditLog({
      uid,
      actorUid: req.user.uid,
      action: 'ADMIN_EXECUTE_DELETION',
      before: { status: u.status || null },
      after: { status: 'deleted' },
      req,
    });

    return res.status(200).send({ message: 'Deletion executed (anonymised).' });
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('Error executing deletion:', error);
    return res.status(500).send({ message: 'Failed to execute deletion.' });
  }
});

router.put('/api/admin/users/:uid/status', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { uid } = req.params;
    const { status } = req.body;

    // Accept both legacy + new naming
    const normalized = status === 'suspended' ? 'disabled' : status;
    if (normalized !== 'active' && normalized !== 'disabled') {
      return res.status(400).send({ message: 'Invalid status provided.' });
    }

    await db.collection('users').doc(uid).update({
      status: normalized,
      adminLastTouchAt: admin.firestore.FieldValue.serverTimestamp(),
      adminLastTouchBy: req.user.uid,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    // Keep your existing auth disable/enable behaviour
    await admin.auth().updateUser(uid, { disabled: normalized === 'disabled' });

    return res.status(200).send({ message: `Successfully set user ${uid} status to ${normalized === 'disabled' ? 'suspended' : 'active'}.` });
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('Error updating user status:', error);
    return res.status(500).send({ message: 'Error updating user status', error: error.message });
  }
});

/**
 * POST /api/admin/users/:uid/disable
 * Body: { reason: string, note?: string }
 * Disables a user with required reason (safety / compliance).
 */
router.post('/api/admin/users/:uid/disable', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { uid } = req.params;
    const reason = String(req.body?.reason || '').trim();
    const note = sanitizePlainText(req.body?.note, 1000);

    const allowedReasons = new Set(['fraud', 'abuse', 'spam', 'policy_violation', 'chargeback_risk', 'other']);
    if (!allowedReasons.has(reason)) {
      return res.status(400).send({ message: 'Invalid disable reason.' });
    }

    const userRef = db.collection('users').doc(uid);
    const snap = await userRef.get();
    if (!snap.exists) return res.status(404).send({ message: 'User not found.' });
    const before = snap.data() || {};

    await userRef.set(
      {
        status: 'disabled',
        disabledAt: admin.firestore.FieldValue.serverTimestamp(),
        disabledBy: req.user.uid,
        disabledReason: { code: reason, note: note || '' },
        adminLastTouchAt: admin.firestore.FieldValue.serverTimestamp(),
        adminLastTouchBy: req.user.uid,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true }
    );

    // Disable sign-in
    await admin.auth().updateUser(uid, { disabled: true });

    await writeUserAuditLog({
      uid,
      actorUid: req.user.uid,
      action: 'ADMIN_DISABLE_USER',
      before: { status: before.status || null },
      after: { status: 'disabled', reason, hasNote: !!note },
      req,
    });

    return res.status(200).send({ message: 'User disabled.' });
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('Error disabling user:', error);
    return res.status(500).send({ message: 'Failed to disable user.' });
  }
});

/**
 * POST /api/admin/users/:uid/boost
 * Body: { isBoosted: boolean, reason?: string, note?: string, boostedUntilMs?: number }
 * MVP boost: prioritise in invite lists (manual ops). No algorithmic ranking beyond invites.
 */
router.post('/api/admin/users/:uid/boost', requireAuth, requireAdmin, async (req, res) => {
  try {
    const uid = req.params.uid;
    const isBoosted = req.body?.isBoosted === true;
    const reason = sanitizePlainText(req.body?.reason, 120);
    const note = sanitizePlainText(req.body?.note, 500);
    const boostedUntilMs = Number(req.body?.boostedUntilMs || 0) || 0;

    const userRef = db.collection('users').doc(uid);
    const snap = await userRef.get();
    if (!snap.exists) return res.status(404).send({ message: 'User not found.' });
    const u = snap.data() || {};
    if (u.role !== 'tradie') return res.status(400).send({ message: 'User is not an expert.' });

    const now = admin.firestore.FieldValue.serverTimestamp();
    const boost = {
      isBoosted,
      boostedAt: now,
      boostedBy: req.user.uid,
      ...(reason ? { reason } : {}),
      ...(note ? { note } : {}),
      ...(boostedUntilMs > 0 ? { boostedUntil: admin.firestore.Timestamp.fromMillis(boostedUntilMs) } : {}),
    };

    await userRef.set(
      {
        boost,
        // Backward compatibility for existing UI/filtering
        boostedVisibility: isBoosted,
        boostedAt: now,
        boostedBy: req.user.uid,
        adminLastTouchAt: now,
        adminLastTouchBy: req.user.uid,
        updatedAt: now,
      },
      { merge: true }
    );

    await writeUserAuditLog({
      uid,
      actorUid: req.user.uid,
      action: isBoosted ? 'ADMIN_BOOST_TASK_EXPERT' : 'ADMIN_REMOVE_BOOST_TASK_EXPERT',
      before: null,
      after: { isBoosted, reason: reason || null },
      req,
    });

    return res.status(200).send({ message: isBoosted ? 'Boost enabled.' : 'Boost removed.' });
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error('POST /api/admin/users/:uid/boost failed:', e);
    return res.status(500).send({ message: 'Failed to update boost.' });
  }
});

/**
 * POST /api/admin/users/:uid/comms-log
 * Body: { templateId: string, text: string }
 * Admin-only log for manual outreach actions (copy/template usage).
 * Stores last 50 entries in users/{uid}.adminCommsLog.
 */
router.post('/api/admin/users/:uid/comms-log', requireAuth, requireAdmin, async (req, res) => {
  try {
    const uid = req.params.uid;
    const templateId = String(req.body?.templateId || '').trim().slice(0, 80);
    const text = sanitizePlainText(req.body?.text, 2000);
    if (!templateId || !text) {
      return res.status(400).send({ message: 'templateId and text are required.' });
    }

    const userRef = db.collection('users').doc(uid);
    const snap = await userRef.get();
    if (!snap.exists) return res.status(404).send({ message: 'User not found.' });
    const u = snap.data() || {};

    // IMPORTANT: serverTimestamp cannot be used inside arrays.
    const now = admin.firestore.Timestamp.now();
    const prev = Array.isArray(u.adminCommsLog) ? u.adminCommsLog.slice(0, 100) : [];
    const next = [...prev, { templateId, text, copiedAt: now, copiedBy: req.user.uid }].slice(-50);

    await userRef.set(
      {
        adminCommsLog: next,
        adminLastTouchAt: admin.firestore.FieldValue.serverTimestamp(),
        adminLastTouchBy: req.user.uid,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true }
    );

    await writeUserAuditLog({
      uid,
      actorUid: req.user.uid,
      action: 'ADMIN_LOG_CLIENT_OUTREACH',
      before: null,
      after: { templateId },
      req,
    });

    return res.status(200).send({ lastOutreachAtMs: safeToMillis(now) });
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error('POST /api/admin/users/:uid/comms-log failed:', e);
    return res.status(500).send({ message: 'Failed to log outreach.' });
  }
});

/**
 * PUT /api/admin/users/:uid/ops
 * Body: { adminNote?: string, boostedVisibility?: boolean }
 * Admin-only operational fields (no PII).
 */
router.put('/api/admin/users/:uid/ops', requireAuth, requireAdmin, async (req, res) => {
  try {
    const uid = req.params.uid;
    const note = sanitizePlainText(req.body?.adminNote, 5000);
    const boostedVisibility = req.body?.boostedVisibility;

    if (boostedVisibility !== undefined && typeof boostedVisibility !== 'boolean') {
      return res.status(400).send({ message: 'boostedVisibility must be boolean.' });
    }

    // Best-effort: resolve admin display name for audit UX.
    let adminName = '';
    try {
      const aSnap = await db.collection('users').doc(req.user.uid).get();
      const a = aSnap.exists ? (aSnap.data() || {}) : {};
      adminName = buildDisplayName(a) || (req.user.email ? String(req.user.email) : '') || req.user.uid;
    } catch (_) {
      adminName = req.user.uid;
    }

    const updates = {
      adminLastTouchAt: admin.firestore.FieldValue.serverTimestamp(),
      adminLastTouchBy: req.user.uid,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    };

    if (req.body && Object.prototype.hasOwnProperty.call(req.body, 'adminNote')) {
      const txt = String(note || '').slice(0, 500);
      // New schema (auditable)
      updates.adminNote = {
        text: txt,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedBy: req.user.uid,
        updatedByName: adminName || undefined,
      };
      // Backward compatibility for older UIs / scripts
      updates.adminNoteText = txt;
      updates.adminNoteUpdatedAt = admin.firestore.FieldValue.serverTimestamp();
      updates.adminNoteUpdatedBy = req.user.uid;
      updates.adminNoteUpdatedByName = adminName || undefined;
    }
    if (boostedVisibility !== undefined) {
      updates.boostedVisibility = boostedVisibility;
      updates.boostedAt = admin.firestore.FieldValue.serverTimestamp();
      updates.boostedBy = req.user.uid;
    }

    await db.collection('users').doc(uid).set(updates, { merge: true });

    await writeUserAuditLog({
      uid,
      actorUid: req.user.uid,
      action: 'ADMIN_UPDATE_USER_OPS_FIELDS',
      before: null,
      after: { hasAdminNote: !!updates.adminNote, boostedVisibility: boostedVisibility },
      req,
    });

    return res.status(200).send({ message: 'Updated.' });
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('Error updating user ops fields:', error);
    return res.status(500).send({ message: 'Failed to update user.' });
  }
});

const { getExpertTrustSummary } = require('../../services/expertTrustService');

/**
 * GET /api/admin/users/:uid/trust-summary
 */
router.get('/api/admin/users/:uid/trust-summary', requireAuth, requireAdmin, async (req, res) => {
  try {
    const summary = await getExpertTrustSummary(req.params.uid);
    return res.status(200).send(summary);
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('GET /api/admin/users/:uid/trust-summary failed:', error);
    return res.status(500).send({ message: 'Failed to load trust summary.' });
  }
});

module.exports = router;
