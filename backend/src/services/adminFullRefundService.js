'use strict';

const { admin, db } = require('../firebaseAdmin');
const { JOB_STATUSES, normalizeStatus } = require('../constants/jobStatuses');
const {
  refundIdempotencyKey,
  adminVariationRefundIdempotencyKey,
  allocateRefundAttempt,
  refundAttemptSettledPatch,
  classifyStripeRefundCreateError,
  refundCreateErrorHttpStatus,
  refundCreateDefinitiveFailurePatch,
} = require('./stripeIdempotency');
const {
  buildAdminFullRefundPlan,
  planOutstandingItems,
  planHadFundedPayment,
  allRequiredRefundsConfirmed,
  classifyStripeRefundCreateStatus,
  normalizeStripeRefundStatus,
} = require('./jobRefundPlan');

function metadataStrings(fields) {
  const out = {};
  for (const [key, value] of Object.entries(fields || {})) {
    if (value == null || value === '') continue;
    out[key] = String(value);
  }
  return out;
}

async function loadVariationEntries(jobRef) {
  const snap = await jobRef.collection('variations').get();
  return snap.docs.map((doc) => ({ id: doc.id, data: doc.data() || {} }));
}

function collectVariationRefundIds(variationEntries) {
  const variationRefundIds = {};
  for (const row of variationEntries || []) {
    const id = row.id;
    const data = row.data || {};
    if (data.refundId) variationRefundIds[id] = data.refundId;
  }
  return variationRefundIds;
}

function isDisputeRefundJob(job, isDispute) {
  if (isDispute === true) return true;
  const data = job || {};
  return data.disputeFlag === true || normalizeStatus(data.status) === JOB_STATUSES.DISPUTED;
}

async function allocateAttemptOnRef(docRef) {
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(docRef);
    if (!snap.exists) {
      const err = new Error('not_found');
      err.code = 'not_found';
      throw err;
    }
    const current = snap.data() || {};
    const mode = String(current.paymentState || '').toLowerCase() === 'refund_failed'
      ? 'retry_failed'
      : 'initial';
    const alloc = allocateRefundAttempt(current, { mode });
    if (alloc.error) {
      const err = new Error(alloc.error.code);
      err.code = alloc.error.code;
      throw err;
    }
    if (alloc.patch) {
      tx.update(docRef, {
        ...alloc.patch,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
    }
    return alloc.attempt;
  });
}

function completionJobPatch({ isDispute, actorUid, variationRefundIds, refundId }) {
  const ts = admin.firestore.FieldValue.serverTimestamp();
  const patch = {
    paymentState: 'refunded',
    ...(refundId ? { refundId } : {}),
    variationRefundIds,
    refundedAt: ts,
    requiresAdminAttention: false,
    lastAdminActionAt: ts,
    lastAdminActionBy: actorUid,
    ...refundAttemptSettledPatch(),
    refundLastFailureCategory: null,
    refundLastFailureCode: null,
  };
  if (isDispute) {
    patch.status = JOB_STATUSES.DISPUTED;
    patch.disputeResolvedAt = ts;
    patch.disputeResolution = 'refunded';
    patch.disputeResolvedBy = actorUid;
  } else {
    patch.status = JOB_STATUSES.REFUNDED;
  }
  return patch;
}

async function tryFinalizeAdminFullRefund({ jobRef, isDispute, actorUid } = {}) {
  if (!jobRef) return { finalized: false };
  const jobSnap = await jobRef.get();
  if (!jobSnap.exists) return { finalized: false };
  const job = jobSnap.data() || {};
  const variationEntries = await loadVariationEntries(jobRef);
  if (!allRequiredRefundsConfirmed(job, variationEntries)) {
    return { finalized: false, job, variationEntries };
  }
  const dispute = isDisputeRefundJob(job, isDispute);
  const variationRefundIds = collectVariationRefundIds(variationEntries);
  await jobRef.update(completionJobPatch({
    isDispute: dispute,
    actorUid: actorUid || job.lastAdminActionBy || 'system',
    variationRefundIds,
    refundId: job.refundId || null,
  }));
  return { finalized: true, job, variationEntries, variationRefundIds };
}

function logRefundCreateError(label, error, classified) {
  // eslint-disable-next-line no-console
  console.error(label, {
    outcome: classified?.outcome,
    category: classified?.category,
    code: classified?.code,
    stripeType: error?.type || error?.name || null,
    stripeRawType: error?.rawType || null,
    statusCode: error?.statusCode || error?.status || null,
    requestId: error?.requestId || null,
  });
}

async function persistItemStripeFailure(docRef, error, classified) {
  const ts = admin.firestore.FieldValue.serverTimestamp();
  if (classified.outcome === 'definitive') {
    await docRef.update({
      ...refundCreateDefinitiveFailurePatch(classified),
      requiresAdminAttention: true,
      paymentUpdatedAt: ts,
      updatedAt: ts,
    });
    return;
  }
  await docRef.update({
    paymentUpdatedAt: ts,
    updatedAt: ts,
  });
}

function createdRefundItemPatch(kind, refund, attempt) {
  const outcome = classifyStripeRefundCreateStatus(refund?.status);
  const refundStatus = normalizeStripeRefundStatus(refund?.status) || 'pending';
  const ts = admin.firestore.FieldValue.serverTimestamp();
  const patch = {
    refundId: refund.id,
    refundStatus,
    refundAttempt: attempt,
    ...refundAttemptSettledPatch(),
    paymentUpdatedAt: ts,
    updatedAt: ts,
  };
  if (kind === 'variation') {
    patch.refundRequestedAt = ts;
    if (outcome === 'succeeded') patch.paymentState = 'refunded';
    else if (outcome === 'failed') {
      patch.paymentState = 'refund_failed';
      patch.requiresAdminAttention = true;
    } else {
      patch.paymentState = 'refund_pending';
    }
  } else if (outcome === 'succeeded') {
    patch.baseRefundConfirmed = true;
  } else if (outcome === 'failed') {
    patch.paymentState = 'refund_failed';
    patch.requiresAdminAttention = true;
  }
  return { outcome, refundStatus, patch };
}

async function persistOverallIncomplete(jobRef, {
  actorUid,
  isDispute,
  refundId,
  variationRefundIds,
  classified,
  failedVariationId,
}) {
  const ts = admin.firestore.FieldValue.serverTimestamp();
  const incompleteState = classified?.outcome === 'definitive' ? 'refund_failed' : 'refund_pending';
  const patch = {
    paymentState: incompleteState,
    variationRefundIds,
    lastAdminActionAt: ts,
    lastAdminActionBy: actorUid,
    updatedAt: ts,
    paymentUpdatedAt: ts,
    requiresAdminAttention: true,
    ...(refundId ? { refundId } : {}),
    ...(failedVariationId ? { refundFailedVariationId: failedVariationId } : {}),
  };
  if (classified?.outcome === 'definitive') {
    Object.assign(patch, refundCreateDefinitiveFailurePatch(classified));
    patch.paymentState = 'refund_failed';
  } else if (classified) {
    if (!refundId) patch.refundAttemptOpen = true;
    patch.refundLastFailureCategory = classified.category;
    patch.refundLastFailureCode = classified.code;
  }
  if (isDispute) {
    patch.status = JOB_STATUSES.DISPUTED;
  } else if (normalizeStatus((await jobRef.get()).data()?.status) !== JOB_STATUSES.DISPUTED) {
    patch.status = JOB_STATUSES.REFUND_PENDING;
  }
  await jobRef.update(patch);
}

async function persistOverallAwaitingConfirmation(jobRef, {
  actorUid,
  isDispute,
  refundId,
  variationRefundIds,
}) {
  const ts = admin.firestore.FieldValue.serverTimestamp();
  const patch = {
    paymentState: 'refund_pending',
    variationRefundIds,
    lastAdminActionAt: ts,
    lastAdminActionBy: actorUid,
    updatedAt: ts,
    paymentUpdatedAt: ts,
    requiresAdminAttention: false,
    ...(refundId ? { refundId } : {}),
  };
  if (isDispute) {
    patch.status = JOB_STATUSES.DISPUTED;
  } else if (normalizeStatus((await jobRef.get()).data()?.status) !== JOB_STATUSES.DISPUTED) {
    patch.status = JOB_STATUSES.REFUND_PENDING;
  }
  await jobRef.update(patch);
}

function alreadyRefundedResponse() {
  return { ok: false, httpStatus: 400, body: { message: 'Already refunded.' } };
}

function initiatedResponse(refundId, variationRefundIds) {
  return {
    ok: true,
    httpStatus: 200,
    body: {
      message: 'Refund initiated.',
      refundId,
      variationRefundIds,
    },
  };
}

async function executeAdminFullRefund({
  jobRef,
  jobId,
  actorUid,
  isDispute = false,
  createRefund,
}) {
  const jobSnap = await jobRef.get();
  if (!jobSnap.exists) {
    return { ok: false, httpStatus: 404, body: { message: 'Task not found.' } };
  }
  let job = jobSnap.data() || {};
  let variationEntries = await loadVariationEntries(jobRef);
  let plan = buildAdminFullRefundPlan(job, variationEntries);

  if (plan.blocked?.code === 'funds_already_released') {
    await jobRef.update({
      requiresAdminAttention: true,
      refundBlockedReason: 'funds_already_released',
      refundBlockedVariationIds: plan.blocked.releasedVariationIds || [],
      paymentUpdatedAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    return {
      ok: false,
      httpStatus: 409,
      body: {
        message: 'Funds were already released to the expert. Transfer reversal is not available; ops review is required.',
        code: 'funds_already_released',
        requiresAdminAttention: true,
        releasedVariationIds: plan.blocked.releasedVariationIds || [],
        baseReleased: plan.blocked.baseReleased === true,
      },
    };
  }

  const overallPs = String(job.paymentState || '').toLowerCase();
  const overallStatus = normalizeStatus(job.status);
  const confirmedAtStart = allRequiredRefundsConfirmed(job, variationEntries);
  if (confirmedAtStart && (overallPs === 'refunded' || overallStatus === JOB_STATUSES.REFUNDED)) {
    return alreadyRefundedResponse();
  }
  if (confirmedAtStart && overallPs === 'refunded' && isDisputeRefundJob(job, isDispute)) {
    return alreadyRefundedResponse();
  }

  if (!planHadFundedPayment(plan) && !plan.base.paymentIntentId) {
    return { ok: false, httpStatus: 400, body: { message: 'No payment intent found for this task.' } };
  }

  const outstanding = planOutstandingItems(plan);
  if (outstanding.length === 0) {
    if (confirmedAtStart) {
      const finalized = await tryFinalizeAdminFullRefund({ jobRef, isDispute, actorUid });
      if (finalized.finalized) {
        return initiatedResponse(job.refundId || plan.base.refundId || null, finalized.variationRefundIds || {});
      }
    }
    if (plan.base.confirmation === 'pending' || plan.variations.some((v) => v.confirmation === 'pending')) {
      return initiatedResponse(job.refundId || plan.base.refundId || null, collectVariationRefundIds(variationEntries));
    }
    if (plan.base.settled || plan.variations.some((v) => v.settled)) {
      const finalized = await tryFinalizeAdminFullRefund({ jobRef, isDispute, actorUid });
      if (finalized.finalized) {
        return initiatedResponse(job.refundId || plan.base.refundId || null, finalized.variationRefundIds || {});
      }
    }
    return { ok: false, httpStatus: 400, body: { message: 'No payment intent found for this task.' } };
  }

  const variationRefundIds = collectVariationRefundIds(variationEntries);
  let baseRefundId = job.refundId || null;
  let firstFailure = null;

  if (plan.base.refundable) {
    const attempt = await allocateAttemptOnRef(jobRef);
    try {
      const refund = await createRefund({
        paymentIntentId: plan.base.paymentIntentId,
        amountInCents: null,
        reason: 'requested_by_customer',
        idempotencyKey: refundIdempotencyKey(jobId, attempt),
        metadata: metadataStrings({
          type: 'job_refund',
          paymentType: 'base',
          jobId,
        }),
      });
      const applied = createdRefundItemPatch('base', refund, attempt);
      baseRefundId = refund.id;
      await jobRef.update(applied.patch);
      if (applied.outcome === 'failed') {
        firstFailure = {
          classified: {
            outcome: 'definitive',
            category: 'refund_object_failed',
            code: applied.refundStatus || 'failed',
          },
          variationId: null,
        };
      }
    } catch (error) {
      const classified = classifyStripeRefundCreateError(error);
      logRefundCreateError('admin full refund base', error, classified);
      await persistItemStripeFailure(jobRef, error, classified);
      firstFailure = { classified, error, variationId: null };
    }
  }

  for (const item of plan.variations) {
    if (!item.refundable) continue;
    const varRef = jobRef.collection('variations').doc(item.variationId);
    const attempt = await allocateAttemptOnRef(varRef);
    try {
      const refund = await createRefund({
        paymentIntentId: item.paymentIntentId,
        amountInCents: null,
        reason: 'requested_by_customer',
        idempotencyKey: adminVariationRefundIdempotencyKey(jobId, item.variationId, attempt),
        metadata: metadataStrings({
          type: 'variation_refund',
          paymentType: 'variation',
          jobId,
          variationId: item.variationId,
        }),
      });
      const applied = createdRefundItemPatch('variation', refund, attempt);
      variationRefundIds[item.variationId] = refund.id;
      await varRef.update(applied.patch);
      if (applied.outcome === 'failed' && !firstFailure) {
        firstFailure = {
          classified: {
            outcome: 'definitive',
            category: 'refund_object_failed',
            code: applied.refundStatus || 'failed',
          },
          variationId: item.variationId,
        };
      }
    } catch (error) {
      const classified = classifyStripeRefundCreateError(error);
      logRefundCreateError('admin full refund variation', error, classified);
      await persistItemStripeFailure(varRef, error, classified);
      if (!firstFailure) firstFailure = { classified, error, variationId: item.variationId };
    }
  }

  const finalized = await tryFinalizeAdminFullRefund({ jobRef, isDispute, actorUid });
  if (finalized.finalized && !firstFailure) {
    return initiatedResponse(baseRefundId, finalized.variationRefundIds || variationRefundIds);
  }

  if (firstFailure) {
    await persistOverallIncomplete(jobRef, {
      actorUid,
      isDispute,
      refundId: baseRefundId,
      variationRefundIds,
      classified: firstFailure.classified || { outcome: 'ambiguous', category: 'unknown', code: 'unknown' },
      failedVariationId: firstFailure.variationId || null,
    });
    const classified = firstFailure.classified || { outcome: 'ambiguous', category: 'unknown', code: 'unknown' };
    const httpStatus = refundCreateErrorHttpStatus(classified);
    if (classified.outcome === 'definitive') {
      return {
        ok: false,
        httpStatus,
        body: {
          message: 'Stripe rejected a refund request. Successful items were kept; this attempt was closed. An authorised retry can continue remaining items.',
          code: 'refund_request_rejected',
          failureCategory: classified.category,
          failureCode: classified.code,
          requiresAdminAttention: true,
          refundId: baseRefundId,
          variationRefundIds,
          failedVariationId: firstFailure.variationId || null,
        },
      };
    }
    return {
      ok: false,
      httpStatus,
      body: {
        message: 'Refund status is still being confirmed. Retry this action; successful items will not be refunded twice.',
        code: 'refund_status_uncertain',
        requiresAdminAttention: true,
        refundId: baseRefundId,
        variationRefundIds,
        failedVariationId: firstFailure.variationId || null,
      },
    };
  }

  await persistOverallAwaitingConfirmation(jobRef, {
    actorUid,
    isDispute,
    refundId: baseRefundId,
    variationRefundIds,
  });
  return initiatedResponse(baseRefundId, variationRefundIds);
}

module.exports = {
  executeAdminFullRefund,
  tryFinalizeAdminFullRefund,
  loadVariationEntries,
};
