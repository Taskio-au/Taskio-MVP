'use strict';

const {
  testProgramId,
  foundingExpertCap,
  foundingExpertZeroFeeTaskLimit,
  foundingExpertReducedFeeBps,
  standardLaunchFeeBps,
  getActiveFoundingExpertProgramId,
  isKnownFoundingExpertProgramId,
} = require('../../../shared/feePlans');

const COUNTER_COLLECTION = 'admin_config';
const CITY_MELBOURNE = 'Melbourne';

function counterDocRef(db, programId) {
  const safeId = String(programId || '').trim();
  return db.collection(COUNTER_COLLECTION).doc(`foundingExpertPrograms__${safeId}`);
}

class FoundingExpertEnrollmentError extends Error {
  constructor(message, { code, statusCode }) {
    super(message);
    this.name = 'FoundingExpertEnrollmentError';
    this.code = code;
    this.statusCode = statusCode;
  }
}

function assertTradieExpert(userData) {
  if (!userData || typeof userData !== 'object') {
    throw new FoundingExpertEnrollmentError('User not found.', { code: 'USER_NOT_FOUND', statusCode: 404 });
  }
  if (userData.role !== 'tradie') {
    throw new FoundingExpertEnrollmentError('User is not an Expert (tradie).', { code: 'NOT_TRADIE', statusCode: 400 });
  }
  const st = userData.status;
  if (st === 'disabled' || st === 'deleted' || st === 'pending_deletion') {
    throw new FoundingExpertEnrollmentError('User account is not eligible for approval.', {
      code: 'USER_NOT_ELIGIBLE',
      statusCode: 400,
    });
  }
}

function resolveApproveProgramId(explicitProgramId) {
  if (explicitProgramId != null && String(explicitProgramId).trim()) {
    const id = String(explicitProgramId).trim();
    if (!isKnownFoundingExpertProgramId(id)) {
      throw new FoundingExpertEnrollmentError('Invalid founding expert programId.', {
        code: 'INVALID_PROGRAM_ID',
        statusCode: 400,
      });
    }
    return id;
  }
  return getActiveFoundingExpertProgramId();
}

function resolveRemoveProgramId(bodyProgramId) {
  if (bodyProgramId != null && String(bodyProgramId).trim()) {
    const id = String(bodyProgramId).trim();
    if (!isKnownFoundingExpertProgramId(id)) {
      throw new FoundingExpertEnrollmentError('Invalid founding expert programId.', {
        code: 'INVALID_PROGRAM_ID',
        statusCode: 400,
      });
    }
    return id;
  }
  return getActiveFoundingExpertProgramId();
}

function buildApprovedFoundingExpertShape({ programId, adminUid, sequenceNumber, serverTimestamp }) {
  return {
    status: 'active',
    programId,
    approvedAt: serverTimestamp(),
    approvedBy: adminUid,
    sequenceNumber,
    city: CITY_MELBOURNE,
    zeroFeeTaskLimit: foundingExpertZeroFeeTaskLimit,
    zeroFeeSlotsUsed: 0,
    reducedFeeBps: foundingExpertReducedFeeBps,
    reducedFeeStartsAt: null,
    reducedFeeEndsAt: null,
    standardFeeBpsAfter: standardLaunchFeeBps,
  };
}

/**
 * @returns {Promise<{ duplicate?: boolean, foundingExpert: object }>}
 */
async function approveFoundingExpert(db, admin, { expertUid, adminUid, programId: explicitProgramId }) {
  const programId = resolveApproveProgramId(explicitProgramId);
  const userRef = db.collection('users').doc(expertUid);
  const counterRef = counterDocRef(db, programId);
  const sv = () => admin.firestore.FieldValue.serverTimestamp();

  return db.runTransaction(async (tx) => {
    const userSnap = await tx.get(userRef);
    if (!userSnap.exists) {
      throw new FoundingExpertEnrollmentError('User not found.', { code: 'USER_NOT_FOUND', statusCode: 404 });
    }
    const userData = userSnap.data() || {};
    assertTradieExpert(userData);

    const existingFe = userData.foundingExpert && typeof userData.foundingExpert === 'object' ? userData.foundingExpert : {};
    const existingStatus = typeof existingFe.status === 'string' ? existingFe.status.trim().toLowerCase() : '';

    if (existingStatus === 'active' && existingFe.programId === programId) {
      return { duplicate: true, foundingExpert: existingFe };
    }
    if (existingStatus === 'active' && existingFe.programId && existingFe.programId !== programId) {
      throw new FoundingExpertEnrollmentError('Expert is already active in another founding program.', {
        code: 'ACTIVE_OTHER_PROGRAM',
        statusCode: 409,
      });
    }

    const counterSnap = await tx.get(counterRef);
    let activeApprovedCount = 0;
    let nextSequenceNumber = 1;

    if (counterSnap.exists) {
      const c = counterSnap.data() || {};
      activeApprovedCount = Number(c.activeApprovedCount);
      nextSequenceNumber = Number(c.nextSequenceNumber);
    }
    if (!Number.isFinite(activeApprovedCount) || activeApprovedCount < 0) activeApprovedCount = 0;
    if (!Number.isFinite(nextSequenceNumber) || nextSequenceNumber < 1) nextSequenceNumber = 1;

    if (activeApprovedCount >= foundingExpertCap) {
      throw new FoundingExpertEnrollmentError('Founding Expert cohort is full (active cap reached).', {
        code: 'CAP_FULL',
        statusCode: 409,
      });
    }

    const sequenceNumber = nextSequenceNumber;

    tx.set(
      counterRef,
      {
        programId,
        city: CITY_MELBOURNE,
        cap: foundingExpertCap,
        activeApprovedCount: activeApprovedCount + 1,
        nextSequenceNumber: nextSequenceNumber + 1,
        updatedAt: sv(),
        ...(!counterSnap.exists ? { createdAt: sv() } : {}),
      },
      { merge: true }
    );

    const foundingExpert = buildApprovedFoundingExpertShape({
      programId,
      adminUid,
      sequenceNumber,
      serverTimestamp: sv,
    });

    tx.update(
      userRef,
      {
        foundingExpert,
        adminLastTouchAt: sv(),
        adminLastTouchBy: adminUid,
        updatedAt: sv(),
      }
    );

    return { duplicate: false, foundingExpert };
  });
}

/**
 * @returns {Promise<{ alreadyRemoved?: boolean, foundingExpert: object|null }>}
 */
async function removeFoundingExpert(db, admin, { expertUid, adminUid, programId: bodyProgramId }) {
  const programId = resolveRemoveProgramId(bodyProgramId);
  const userRef = db.collection('users').doc(expertUid);
  const counterRef = counterDocRef(db, programId);
  const sv = () => admin.firestore.FieldValue.serverTimestamp();

  return db.runTransaction(async (tx) => {
    const userSnap = await tx.get(userRef);
    if (!userSnap.exists) {
      throw new FoundingExpertEnrollmentError('User not found.', { code: 'USER_NOT_FOUND', statusCode: 404 });
    }
    const userData = userSnap.data() || {};
    const fe = userData.foundingExpert && typeof userData.foundingExpert === 'object' ? userData.foundingExpert : {};

    if (!fe.programId || fe.programId !== programId) {
      return { alreadyRemoved: true, foundingExpert: Object.keys(fe).length ? fe : null };
    }

    const st = typeof fe.status === 'string' ? fe.status.trim().toLowerCase() : '';
    if (st !== 'active') {
      return { alreadyRemoved: true, foundingExpert: fe };
    }

    const counterSnap = await tx.get(counterRef);
    if (counterSnap.exists) {
      const c = counterSnap.data() || {};
      let activeApprovedCount = Number(c.activeApprovedCount);
      if (!Number.isFinite(activeApprovedCount) || activeApprovedCount < 0) activeApprovedCount = 0;
      const nextCount = Math.max(0, activeApprovedCount - 1);
      tx.set(
        counterRef,
        {
          activeApprovedCount: nextCount,
          updatedAt: sv(),
        },
        { merge: true }
      );
    }

    const mergedFe = {
      ...fe,
      status: 'removed',
      removedAt: sv(),
      removedBy: adminUid,
    };

    tx.update(
      userRef,
      {
        foundingExpert: mergedFe,
        adminLastTouchAt: sv(),
        adminLastTouchBy: adminUid,
        updatedAt: sv(),
      }
    );

    return { alreadyRemoved: false, foundingExpert: mergedFe };
  });
}

function foundingExpertTestResetAllowed() {
  return process.env.FOUNDING_EXPERT_TEST_MODE === 'true' || process.env.NODE_ENV !== 'production';
}

/**
 * Reset sandbox test cohort only (never production).
 */
async function resetFoundingExpertTestProgram(db, admin, { adminUid }) {
  const programId = testProgramId;
  const counterRef = counterDocRef(db, programId);
  const sv = admin.firestore.FieldValue.serverTimestamp();

  const snap = await db.collection('users').where('foundingExpert.programId', '==', programId).get();

  const docs = snap.docs || [];
  const chunkSize = 400;
  for (let i = 0; i < docs.length; i += chunkSize) {
    const slice = docs.slice(i, i + chunkSize);
    const batch = db.batch();
    for (const doc of slice) {
      const data = doc.data() || {};
      const fe = data.foundingExpert && typeof data.foundingExpert === 'object' ? data.foundingExpert : {};
      batch.update(
        doc.ref,
        {
          foundingExpert: {
            ...fe,
            status: 'test_reset',
            programId,
            testResetAt: sv,
            testResetBy: adminUid,
          },
          updatedAt: sv,
        }
      );
    }
    await batch.commit();
  }

  await counterRef.set(
    {
      programId,
      city: CITY_MELBOURNE,
      cap: foundingExpertCap,
      activeApprovedCount: 0,
      nextSequenceNumber: 1,
      updatedAt: sv,
    },
    { merge: true }
  );

  return { usersUpdated: docs.length };
}

module.exports = {
  approveFoundingExpert,
  removeFoundingExpert,
  resetFoundingExpertTestProgram,
  foundingExpertTestResetAllowed,
  FoundingExpertEnrollmentError,
  counterDocRef,
  testProgramId,
};
