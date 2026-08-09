'use strict';

/**
 * Shared idempotent logic for base-quote Checkout funding:
 * Stripe payment_intent.succeeded / payment_intent.payment_failed,
 * checkout.session.completed (non-variation), and POST payment-confirmed.
 */

const { JOB_STATUSES, normalizeStatus } = require('../constants/jobStatuses');
const { validateJobTransitionOrThrow } = require('./jobStatusUpdates');
const { computeBaseJobFundingFeeSnapshotTx } = require('./jobFeeSnapshotService');

function mapPaymentStateFromIntentStatus(status) {
  if (status === 'succeeded') return 'in_escrow';
  if (status === 'failed') return 'payment_failed';
  if (status === 'requires_payment_method' || status === 'requires_confirmation' || status === 'requires_action') {
    return 'pending_payment';
  }
  if (status === 'processing') return 'pending_payment';
  if (status === 'canceled') return 'cancelled';
  return 'pending_payment';
}

function isTerminalFundingState(jobData) {
  const ps = jobData?.paymentState;
  return ps === 'released' || ps === 'refunded';
}

/**
 * Idempotent funded/progress outcome (Firestore already reflects secured payment).
 */
function isAlreadyFundingComplete(jobData) {
  const st = normalizeStatus(jobData?.status);
  const ps = jobData?.paymentState;
  const paySt = jobData?.paymentStatus;
  if ([JOB_STATUSES.FUNDED, JOB_STATUSES.IN_PROGRESS, JOB_STATUSES.COMPLETED, JOB_STATUSES.PAID].includes(st)) {
    return true;
  }
  if (ps === 'in_escrow' || paySt === 'succeeded') return true;
  return false;
}

function extractPaymentIntentId(raw) {
  if (!raw) return null;
  if (typeof raw === 'string') return raw;
  if (typeof raw === 'object' && raw.id) return String(raw.id);
  return null;
}

/**
 * @param {'succeeded' | 'payment_failed'} eventKind Stripe PI webhook kind (recovery always uses succeeded.)
 * @param {object} [additionalFields] merged into the job update (e.g. paymentCheckoutSessionId).
 */
async function evaluateBaseFundingTxnBody(tx, admin, db, jobRef, jobData, pi, eventKind, additionalFields = {}) {
  const paymentIntentId = pi?.id;
  const status = pi?.status;
  const amount = typeof pi?.amount === 'number' ? pi.amount : null;
  const currency = typeof pi?.currency === 'string' ? pi.currency : null;

  if (!paymentIntentId || !status) return { applied: false, reason: 'missing_pi_fields' };

  if (jobData.paymentIntentId && jobData.paymentIntentId !== paymentIntentId) {
    return { applied: false, reason: 'payment_intent_mismatch' };
  }
  if (isTerminalFundingState(jobData)) return { applied: false, reason: 'terminal_payment_state' };

  if (eventKind === 'succeeded' && status === 'succeeded' && isAlreadyFundingComplete(jobData)) {
    return { applied: false, reason: 'already_complete' };
  }

  if (eventKind === 'succeeded' && status !== 'succeeded') {
    return { applied: false, reason: 'intent_not_succeeded' };
  }

  let paymentState = mapPaymentStateFromIntentStatus(status);
  if (eventKind === 'payment_failed') {
    paymentState = 'payment_failed';
  }

  const currentJobStatus = normalizeStatus(jobData.status);

  const update = {
    paymentIntentId,
    paymentStatus: status,
    paymentState,
    ...(amount !== null ? { paymentAmountCents: amount } : {}),
    ...(currency ? { paymentCurrency: currency } : {}),
    paymentUpdatedAt: admin.firestore.FieldValue.serverTimestamp(),
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  };

  if (eventKind === 'payment_failed') {
    update.requiresAdminAttention = true;
    update.flagTypes = admin.firestore.FieldValue.arrayUnion('PAYMENT_ISSUE');
    update.highestFlagSeverity = 'HIGH';
    update.paymentFailureReason = pi?.last_payment_error?.message || null;
  }

  if (eventKind === 'succeeded' && status === 'succeeded' && currentJobStatus === JOB_STATUSES.AWAITING_FUNDING) {
    validateJobTransitionOrThrow(currentJobStatus, JOB_STATUSES.FUNDED, { jobId: jobRef.id });
    update.status = JOB_STATUSES.FUNDED;
    update.fundedAt = admin.firestore.FieldValue.serverTimestamp();
  }

  let fundingSnap = {};
  if (eventKind === 'succeeded' && status === 'succeeded') {
    fundingSnap = await computeBaseJobFundingFeeSnapshotTx(tx, admin, db, {
      jobRef,
      jobData,
      nextJobPatch: update,
      grossAmountCents: amount,
      now: new Date(),
    });
  }

  if (fundingSnap.userWrite) {
    tx.set(fundingSnap.userWrite.ref, fundingSnap.userWrite.mergeData, { merge: true });
  }
  if (fundingSnap.feeSnapshot && !fundingSnap.idempotent) {
    update.feeSnapshot = fundingSnap.feeSnapshot;
  }

  Object.assign(update, additionalFields && typeof additionalFields === 'object' ? additionalFields : {});

  tx.update(jobRef, update);
  return { applied: true, update };
}

async function applyBaseQuoteFundingFromPaymentIntentTx(db, admin, { jobRef, paymentIntent, eventKind, additionalFields }) {
  return db.runTransaction(async (tx) => {
    const jobDoc = await tx.get(jobRef);
    if (!jobDoc.exists) return { applied: false, reason: 'job_missing' };
    const jobData = jobDoc.data() || {};
    return evaluateBaseFundingTxnBody(tx, admin, db, jobRef, jobData, paymentIntent, eventKind, additionalFields);
  });
}

async function applyBaseQuoteFundingFromPaymentIntentByLookupTx(
  db,
  admin,
  paymentIntentId,
  paymentIntent,
  eventKind,
  additionalFields = {},
) {
  const snap = await db.collection('jobs').where('paymentIntentId', '==', paymentIntentId).limit(1).get();
  if (snap.empty) return { applied: false, reason: 'job_lookup_empty' };

  const docRef = snap.docs[0].ref;
  return db.runTransaction(async (tx) => {
    const jobDoc = await tx.get(docRef);
    if (!jobDoc.exists) return { applied: false, reason: 'job_missing' };
    const jobDataInner = jobDoc.data() || {};
    return evaluateBaseFundingTxnBody(tx, admin, db, docRef, jobDataInner, paymentIntent, eventKind, additionalFields);
  });
}

/**
 * Recovery / confirm path: Stripe reports succeeded — never pass payment_failed.
 * If Firestore already shows funding complete, noop without overwriting amounts.
 */
async function confirmBaseQuoteFundingIfSucceededTx(db, admin, jobRef, paymentIntent, extras = {}) {
  const checkoutSessionId = extras.paymentCheckoutSessionId;
  return db.runTransaction(async (tx) => {
    const jobDoc = await tx.get(jobRef);
    if (!jobDoc.exists) return { applied: false, confirmed: false, reason: 'job_missing' };
    const jobData = jobDoc.data() || {};

    if (isAlreadyFundingComplete(jobData)) {
      const st = normalizeStatus(jobData.status);
      return {
        applied: false,
        confirmed: true,
        alreadyComplete: true,
        status: st,
        paymentState: jobData.paymentState || null,
        paymentStatus: jobData.paymentStatus || null,
      };
    }

    const pi = paymentIntent;
    if (!pi?.id || pi.status !== 'succeeded') {
      return { applied: false, confirmed: false, reason: 'intent_not_succeeded' };
    }

    if (jobData.paymentIntentId && jobData.paymentIntentId !== pi.id) {
      return { applied: false, confirmed: false, reason: 'payment_intent_mismatch' };
    }

    const additionalFields = {};
    if (checkoutSessionId && (!jobData.paymentCheckoutSessionId || jobData.paymentCheckoutSessionId !== checkoutSessionId)) {
      additionalFields.paymentCheckoutSessionId = checkoutSessionId;
    }

    const r = await evaluateBaseFundingTxnBody(tx, admin, db, jobRef, jobData, pi, 'succeeded', additionalFields);
    if (!r.applied) return { ...r, confirmed: false };

    return {
      applied: true,
      confirmed: true,
      status: r.update.status || normalizeStatus(jobData.status),
      paymentState: r.update.paymentState,
      paymentStatus: r.update.paymentStatus,
    };
  });
}

module.exports = {
  mapPaymentStateFromIntentStatus,
  isTerminalFundingState,
  isAlreadyFundingComplete,
  applyBaseQuoteFundingFromPaymentIntentTx,
  applyBaseQuoteFundingFromPaymentIntentByLookupTx,
  confirmBaseQuoteFundingIfSucceededTx,
  evaluateBaseFundingTxnBody,
  extractPaymentIntentId,
};
