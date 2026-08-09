'use strict';

const { approveFoundingExpert, FoundingExpertEnrollmentError } = require('./foundingExpertEnrollmentService');
const { writeUserAuditLog } = require('../utils/auditLogs');
const { foundingExpertEligibilityPayload } = require('../utils/foundingExpertEligibility');

const DEFAULT_AUTO_ACTOR_UID = 'founding_expert_auto_enroll_system';

/** @returns {boolean} */
function foundingExpertAutoEnrollEnabled(env = process.env) {
  return String(env?.FOUNDING_EXPERT_AUTO_ENROLL_ENABLED || '').toLowerCase() === 'true';
}

function summarizeFoundingExpert(fe) {
  if (!fe || typeof fe !== 'object') return null;
  return {
    programId: fe.programId || null,
    sequenceNumber:
      Number.isFinite(Number(fe.sequenceNumber)) ? Number(fe.sequenceNumber) : null,
    status: typeof fe.status === 'string' ? fe.status.trim().toLowerCase() : '',
  };
}

/**
 * @param {{
 *   db: import('firebase-admin/firestore').Firestore,
 *   admin: typeof import('firebase-admin'),
 *   expertUid: string,
 *   trigger: string,
 *   actorUidForApproval: string,
 * }} params
 *
 * actorUidForApproval becomes users.foundingExpert.approvedBy (admin verify passes real admin uid;
 * Stripe/self triggers use DEFAULT_AUTO_ACTOR_UID unless overridden.)
 */
async function maybeAutoEnrollFoundingExpert({
  db,
  admin: adminSdk,
  expertUid,
  trigger,
  actorUidForApproval,
}) {
  if (!foundingExpertAutoEnrollEnabled()) {
    return { enrolled: false, reason: 'disabled', eligibility: null, trigger };
  }

  const uid = String(expertUid || '').trim();
  if (!uid) {
    return { enrolled: false, reason: 'invalid_uid', eligibility: null, trigger };
  }

  const userRef = db.collection('users').doc(uid);
  const snap = await userRef.get();
  if (!snap.exists) {
    return { enrolled: false, reason: 'user_not_found', eligibility: null, trigger };
  }

  let firebaseEmailVerified = false;
  try {
    const rec = await adminSdk.auth().getUser(uid);
    firebaseEmailVerified = rec.emailVerified === true;
  } catch (e) {
    if (e?.code === 'auth/user-not-found') {
      firebaseEmailVerified = false;
    } else {
      // eslint-disable-next-line no-console
      console.warn('[founding-auto-enroll] auth.getUser failed:', e?.message || e);
    }
  }

  const data = snap.data() || {};
  const eligibility = foundingExpertEligibilityPayload(data, {
    autoEnroll: true,
    firebaseEmailVerified,
  });

  if (!eligibility.eligible) {
    return { enrolled: false, reason: 'ineligible', eligibility, trigger };
  }

  const rawFe =
    data.foundingExpert && typeof data.foundingExpert === 'object' ? data.foundingExpert : {};
  const foundingStatus =
    typeof rawFe.status === 'string' ? rawFe.status.trim().toLowerCase() : '';
  if (foundingStatus === 'active') {
    return {
      enrolled: false,
      reason: 'already_active',
      foundingExpert: summarizeFoundingExpert(rawFe),
      eligibility,
      trigger,
    };
  }

  const approvalActor = actorUidForApproval || DEFAULT_AUTO_ACTOR_UID;

  try {
    const result = await approveFoundingExpert(db, adminSdk, {
      expertUid: uid,
      adminUid: approvalActor,
      programId: undefined,
    });

    const feOut = result.foundingExpert || {};
    const afterSummary = summarizeFoundingExpert(feOut);

    await writeUserAuditLog({
      uid,
      actorUid: approvalActor,
      action:
        result.duplicate
          ? 'FOUNDING_EXPERT_AUTO_ENROLL_SKIP_DUPLICATE'
          : 'FOUNDING_EXPERT_AUTO_ENROLL_APPROVED',
      before: null,
      after: {
        trigger,
        enrolled: !result.duplicate,
        duplicate: !!result.duplicate,
        reason: result.duplicate ? 'already_active' : 'enrolled',
        programId: afterSummary?.programId || null,
        sequenceNumber:
          Number.isFinite(Number(afterSummary?.sequenceNumber))
            ? afterSummary.sequenceNumber
            : null,
      },
      req: undefined,
    });

    await db.collection('admin_audit_logs').add({
      adminId: approvalActor,
      targetUserId: uid,
      jobId: null,
      action:
        result.duplicate ? 'FOUNDING_EXPERT_AUTO_ENROLL_DUPLICATE' : 'FOUNDING_EXPERT_AUTO_ENROLL',
      path: `auto:${trigger}`,
      ip: null,
      userAgent: null,
      metadata: {
        trigger,
        duplicate: !!result.duplicate,
        programId: feOut.programId || null,
        sequenceNumber:
          Number.isFinite(Number(feOut.sequenceNumber)) ? feOut.sequenceNumber : null,
      },
      timestamp: adminSdk.firestore.FieldValue.serverTimestamp(),
    });

    if (result.duplicate) {
      return {
        enrolled: false,
        reason: 'already_active',
        duplicate: true,
        foundingExpert: afterSummary,
        eligibility,
        trigger,
      };
    }

    return {
      enrolled: true,
      reason: 'enrolled',
      foundingExpert: summarizeFoundingExpert(feOut),
      eligibility,
      trigger,
      programId: feOut.programId || null,
      sequenceNumber:
        Number.isFinite(Number(feOut.sequenceNumber)) ? feOut.sequenceNumber : null,
    };
  } catch (error) {
    if (error instanceof FoundingExpertEnrollmentError && error.code === 'CAP_FULL') {
      await writeUserAuditLog({
        uid,
        actorUid: approvalActor,
        action: 'FOUNDING_EXPERT_AUTO_ENROLL_CAP_FULL',
        before: null,
        after: { trigger, enrolled: false, reason: 'cap_full' },
        req: undefined,
      }).catch(() => {});

      return { enrolled: false, reason: 'cap_full', eligibility, trigger };
    }

    throw error;
  }
}

async function scheduleMaybeAutoEnrollFoundingExpert(ctx) {
  try {
    await maybeAutoEnrollFoundingExpert(ctx);
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn('[founding-auto-enroll] unexpected failure', {
      expertUid: ctx.expertUid,
      trigger: ctx.trigger,
      message: e?.message || String(e),
    });
  }
}

module.exports = {
  foundingExpertAutoEnrollEnabled,
  DEFAULT_AUTO_ACTOR_UID,
  maybeAutoEnrollFoundingExpert,
  scheduleMaybeAutoEnrollFoundingExpert,
};
