'use strict';

const {
  calculateExpertFeeSnapshot,
  deriveReducedFeeEndsAt,
  STAGE,
} = require('./expertFeeProgram');

const BASE_FUNDING_SOURCE = 'base_job_funding';

/**
 * Inside an existing Firestore transaction: compute and persist base-job funding fee snapshot + optional slot consumption.
 * Idempotent when `jobData.feeSnapshot.source === 'base_job_funding'`.
 *
 * @param {FirebaseFirestore.Transaction} tx
 * @param {FirebaseFirestore.FirebaseFirestore} admin
 * @param {FirebaseFirestore.Firestore} db
 * @param {{
 *   jobRef: FirebaseFirestore.DocumentReference,
 *   jobData: object,
 *   nextJobPatch: object,
 *   grossAmountCents: number|null|undefined,
 *   now?: Date,
 * }} params
 * @returns {Promise<{
 *   idempotent?: boolean,
 *   feeSnapshot?: object|null,
 *   userWrite?: { ref: FirebaseFirestore.DocumentReference, mergeData: object },
 * }>}
 */
async function computeBaseJobFundingFeeSnapshotTx(tx, admin, db, params) {
  const { jobRef, jobData, nextJobPatch, grossAmountCents: grossInput, now: nowInput } = params;
  const now = nowInput instanceof Date && !Number.isNaN(nowInput.getTime()) ? nowInput : new Date();

  const existingSnap = jobData?.feeSnapshot;
  if (existingSnap && typeof existingSnap === 'object' && existingSnap.source === BASE_FUNDING_SOURCE) {
    return { idempotent: true, feeSnapshot: existingSnap };
  }

  const mergedPaymentState = nextJobPatch.paymentState ?? jobData.paymentState;
  const mergedPaymentStatus = nextJobPatch.paymentStatus ?? jobData.paymentStatus;

  if (mergedPaymentState !== 'in_escrow' || mergedPaymentStatus !== 'succeeded') {
    return {};
  }

  const gross =
    grossInput != null && Number.isFinite(Number(grossInput)) && Number(grossInput) > 0
      ? Math.round(Number(grossInput))
      : Math.round(Number(nextJobPatch.paymentAmountCents ?? jobData.paymentAmountCents));

  if (!Number.isFinite(gross) || gross <= 0) {
    return {};
  }

  const jobId = jobRef.id;
  const expertUidRaw = jobData.acceptedTradieUid ?? nextJobPatch.acceptedTradieUid;
  const expertUid = expertUidRaw != null ? String(expertUidRaw).trim() : '';
  if (!expertUid) {
    return {};
  }

  const userRef = db.collection('users').doc(expertUid);
  const userSnap = await tx.get(userRef);
  if (!userSnap.exists) {
    return {};
  }

  const expertProfile = userSnap.data() || {};

  const snapshotCore = calculateExpertFeeSnapshot({
    expertProfile,
    grossAmountCents: gross,
    jobId,
    now,
  });

  const consumeSlot = snapshotCore.stage === STAGE.FOUNDING_FIRST_THREE;

  const lockedAtIso = now.toISOString();
  const feeSnapshot = {
    ...snapshotCore,
    lockedAt: lockedAtIso,
    expertUid,
    source: BASE_FUNDING_SOURCE,
    version: 1,
    zeroFeeSlotConsumed: consumeSlot,
  };

  let userWrite = null;
  if (consumeSlot) {
    const fePrev =
      expertProfile.foundingExpert && typeof expertProfile.foundingExpert === 'object'
        ? expertProfile.foundingExpert
        : {};
    const prevUsedRaw = fePrev.zeroFeeSlotsUsed;
    const prevUsed =
      Number.isFinite(Number(prevUsedRaw)) && Number.isInteger(Number(prevUsedRaw))
        ? Math.max(0, Number(prevUsedRaw))
        : 0;
    const nextUsed = prevUsed + 1;

    const nextFe = {
      ...fePrev,
      zeroFeeSlotsUsed: nextUsed,
    };

    const hasStarts = fePrev.reducedFeeStartsAt != null;
    const hasEnds = fePrev.reducedFeeEndsAt != null;
    if (nextUsed === 3 && !hasStarts && !hasEnds) {
      nextFe.reducedFeeStartsAt = admin.firestore.Timestamp.fromDate(now);
      nextFe.reducedFeeEndsAt = admin.firestore.Timestamp.fromDate(deriveReducedFeeEndsAt(now));
    }

    userWrite = {
      ref: userRef,
      mergeData: {
        foundingExpert: nextFe,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
    };
  }

  return { feeSnapshot, userWrite };
}

/**
 * Standalone transaction for recovery paths after job payment fields are already persisted.
 *
 * @param {FirebaseFirestore.Firestore} db
 * @param {FirebaseFirestore.FirebaseFirestore} admin
 * @param {FirebaseFirestore.DocumentReference} jobRef
 * @param {{ grossAmountCents?: number|null, now?: Date }} [options]
 */
async function ensureBaseJobFeeSnapshotLocked(db, admin, jobRef, options = {}) {
  const now = options.now instanceof Date && !Number.isNaN(options.now.getTime()) ? options.now : new Date();

  await db.runTransaction(async (tx) => {
    const jobSnap = await tx.get(jobRef);
    if (!jobSnap.exists) return;
    const jobData = jobSnap.data() || {};

    const grossOpt =
      options.grossAmountCents != null && Number.isFinite(Number(options.grossAmountCents))
        ? Math.round(Number(options.grossAmountCents))
        : null;

    const result = await computeBaseJobFundingFeeSnapshotTx(tx, admin, db, {
      jobRef,
      jobData,
      nextJobPatch: {},
      grossAmountCents: grossOpt ?? jobData.paymentAmountCents,
      now,
    });

    if (result.idempotent || !result.feeSnapshot) return;

    tx.update(jobRef, {
      feeSnapshot: result.feeSnapshot,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    if (result.userWrite) {
      tx.set(result.userWrite.ref, result.userWrite.mergeData, { merge: true });
    }
  });
}

const RELEASE_SNAPSHOT_FEE_SOURCE = 'fee_snapshot_v1';

function lockedAtPresent(value) {
  if (value == null || value === '') return false;
  if (typeof value === 'string') return value.trim().length > 0;
  if (typeof value === 'number') return Number.isFinite(value);
  if (typeof value === 'object') {
    const sec = value._seconds ?? value.seconds;
    return sec != null && Number.isFinite(Number(sec));
  }
  return true;
}

/**
 * Validate persisted base-job funding fee snapshot for expert release (Stage 3B base slice only).
 *
 * @param {object|null|undefined} job — loaded job document
 * @param {string} jobId — Firestore document id for `jobs/{jobId}`
 * @returns { {{ ok: true, baseSlice: { grossCents: number, platformFeeCents: number, providerCents: number }, feeSource: string }} | {{ ok: false, reason: string }} }}
 */
function validateBaseJobFeeSnapshotForRelease(job, jobId) {
  const feeSource = RELEASE_SNAPSHOT_FEE_SOURCE;

  if (!job || typeof job !== 'object') {
    return { ok: false, reason: 'job_missing_or_invalid' };
  }

  const jid = jobId != null ? String(jobId) : '';
  if (!jid) {
    return { ok: false, reason: 'job_id_missing' };
  }

  const fs = job.feeSnapshot;
  if (!fs || typeof fs !== 'object') {
    return { ok: false, reason: 'fee_snapshot_missing' };
  }

  if (fs.source !== BASE_FUNDING_SOURCE) {
    return { ok: false, reason: 'fee_snapshot_wrong_source' };
  }
  if (fs.version !== 1) {
    return { ok: false, reason: 'fee_snapshot_wrong_version' };
  }
  if (String(fs.jobId || '') !== jid) {
    return { ok: false, reason: 'fee_snapshot_job_id_mismatch' };
  }

  const acceptedExpert = job.acceptedTradieUid != null ? String(job.acceptedTradieUid) : '';
  if (!acceptedExpert || String(fs.expertUid || '') !== acceptedExpert) {
    return { ok: false, reason: 'fee_snapshot_expert_uid_mismatch' };
  }

  const grossAmountCents = Math.round(Number(fs.grossAmountCents));
  const taskioFeeCents = Math.round(Number(fs.taskioFeeCents));
  const expertNetCents = Math.round(Number(fs.expertNetCents));

  if (!Number.isFinite(grossAmountCents) || !Number.isInteger(grossAmountCents) || grossAmountCents <= 0) {
    return { ok: false, reason: 'fee_snapshot_invalid_gross' };
  }
  if (!Number.isFinite(taskioFeeCents) || !Number.isInteger(taskioFeeCents) || taskioFeeCents < 0) {
    return { ok: false, reason: 'fee_snapshot_invalid_taskio_fee' };
  }
  if (!Number.isFinite(expertNetCents) || !Number.isInteger(expertNetCents) || expertNetCents <= 0) {
    return { ok: false, reason: 'fee_snapshot_invalid_expert_net' };
  }
  if (taskioFeeCents + expertNetCents !== grossAmountCents) {
    return { ok: false, reason: 'fee_snapshot_fee_parts_sum_mismatch' };
  }

  const paymentGross = Math.round(Number(job.paymentAmountCents));
  if (!Number.isFinite(paymentGross) || paymentGross <= 0 || grossAmountCents !== paymentGross) {
    return { ok: false, reason: 'fee_snapshot_gross_payment_mismatch' };
  }

  if (!lockedAtPresent(fs.lockedAt)) {
    return { ok: false, reason: 'fee_snapshot_locked_at_missing' };
  }

  const stage = fs.stage;
  if (stage == null || typeof stage !== 'string' || !stage.trim()) {
    return { ok: false, reason: 'fee_snapshot_stage_missing' };
  }

  const expertFeeBpsRaw = fs.expertFeeBps;
  if (
    expertFeeBpsRaw == null
    || !Number.isFinite(Number(expertFeeBpsRaw))
    || !Number.isInteger(Number(expertFeeBpsRaw))
    || Number(expertFeeBpsRaw) < 0
    || Number(expertFeeBpsRaw) > 10000
  ) {
    return { ok: false, reason: 'fee_snapshot_expert_fee_bps_invalid' };
  }

  return {
    ok: true,
    baseSlice: {
      grossCents: grossAmountCents,
      platformFeeCents: taskioFeeCents,
      providerCents: expertNetCents,
    },
    feeSource,
  };
}

module.exports = {
  computeBaseJobFundingFeeSnapshotTx,
  ensureBaseJobFeeSnapshotLocked,
  BASE_FUNDING_SOURCE,
  validateBaseJobFeeSnapshotForRelease,
  RELEASE_SNAPSHOT_FEE_SOURCE,
  lockedAtPresent,
};
