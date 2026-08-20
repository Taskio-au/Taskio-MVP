'use strict';

const express = require('express');

const { admin, db } = require('../firebaseAdmin');
const { constructWebhookEvent, getExpectedStripeLivemode, retrievePaymentIntent } = require('../services/stripe');
const { JOB_STATUSES, normalizeStatus, isValidTransition } = require('../constants/jobStatuses');
const { updateJobStatus } = require('../services/jobStatusUpdates');
const { evaluateJobRiskById } = require('../services/riskAutomationPipeline');
const { applyVariationPaymentSuccess, isVariationPaymentMetadata } = require('../services/variationPaymentCompletion');
const {
  applyBaseQuoteFundingFromPaymentIntentTx,
  applyBaseQuoteFundingFromPaymentIntentByLookupTx,
} = require('../services/baseQuoteFundingCompletion');
const {
  DEFAULT_AUTO_ACTOR_UID,
  foundingExpertAutoEnrollEnabled,
  scheduleMaybeAutoEnrollFoundingExpert,
} = require('../services/foundingExpertAutoEnrollmentService');
const { upsertWorkItemFromAutomation } = require('../services/adminWorkItemService');
const { refundAttemptFailedPatch } = require('../services/stripeIdempotency');
const { tryFinalizeAdminFullRefund } = require('../services/adminFullRefundService');
const {
  paymentIntentIdOf,
  evaluateChargeRefundedConfirmation,
  evaluateSucceededRefundObjectConfirmation,
  metadataLooksLikeVariation,
} = require('../services/stripeRefundConfirmation');

const router = express.Router();

function mapAccountOnboardingStatus(account) {
  const chargesEnabled = account?.charges_enabled === true;
  const payoutsEnabled = account?.payouts_enabled === true;
  const currentlyDue = account?.requirements?.currently_due || [];
  const eventuallyDue = account?.requirements?.eventually_due || [];

  if (chargesEnabled && payoutsEnabled) return 'completed';
  if (currentlyDue.length > 0) return 'action_required';
  if (eventuallyDue.length > 0) return 'pending';
  return 'pending';
}

function sanitizeEventForStorage(event) {
  const object = event?.data?.object || {};
  return {
    id: event.id,
    type: event.type,
    livemode: !!event.livemode,
    objectId: object.id || null,
    objectType: object.object || null,
    status: object.status || null,
    amount: typeof object.amount === 'number' ? object.amount : null,
    currency: typeof object.currency === 'string' ? object.currency : null,
    metadata: object.metadata || null,
  };
}

async function findFirstByField(collectionName, field, value) {
  if (!value) return null;
  const snap = await db.collection(collectionName).where(field, '==', value).limit(1).get();
  return snap.empty ? null : snap.docs[0];
}

async function flagJobPaymentIncident(jobDoc, incident) {
  if (!jobDoc) return;
  const job = jobDoc.data() || {};
  const incidentType = String(incident.type || 'payment_incident');
  const fields = {
    requiresAdminAttention: true,
    flagTypes: admin.firestore.FieldValue.arrayUnion('PAYMENT_ISSUE'),
    highestFlagSeverity: 'HIGH',
    paymentIncidentType: incidentType,
    paymentIncidentId: incident.id || null,
    paymentIncidentStatus: incident.status || null,
    paymentUpdatedAt: admin.firestore.FieldValue.serverTimestamp(),
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  };
  const current = normalizeStatus(job.status);
  if (current !== JOB_STATUSES.DISPUTED && isValidTransition(current, JOB_STATUSES.DISPUTED)) {
    await updateJobStatus(db, admin, jobDoc.ref, JOB_STATUSES.DISPUTED, {
      ...fields,
      preDisputeStatus: current,
      disputedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
  } else {
    await jobDoc.ref.set(fields, { merge: true });
  }

  await upsertWorkItemFromAutomation({
    entityType: 'job',
    entityId: jobDoc.id,
    category: 'payment',
    priority: 'critical',
    source: 'stripe_webhook',
    sourceReasonCodes: [incidentType.toUpperCase()],
    context: { stripeIncidentId: incident.id || null },
  });
}

function isVariationRefundMetadata(meta) {
  return metadataLooksLikeVariation(meta);
}

function partialRefundItemPatch(evaluation, refundId) {
  const ts = admin.firestore.FieldValue.serverTimestamp();
  return {
    refundPartial: true,
    requiresAdminAttention: true,
    lastPartialRefundAt: ts,
    ...(refundId ? { lastPartialRefundId: refundId } : {}),
    ...(Number.isFinite(evaluation.amountRefundedCents) ? { lastPartialRefundAmountCents: evaluation.amountRefundedCents } : {}),
    updatedAt: ts,
    paymentUpdatedAt: ts,
  };
}

async function confirmVariationFullyRefunded(jobRef, variationId, refundId) {
  const varRef = jobRef.collection('variations').doc(String(variationId));
  const ts = admin.firestore.FieldValue.serverTimestamp();
  await varRef.update({
    paymentState: 'refunded',
    refundStatus: 'succeeded',
    refundPartial: false,
    ...(refundId ? { refundId } : {}),
    updatedAt: ts,
  });
  await tryFinalizeAdminFullRefund({ jobRef });
}

async function confirmBaseFullyRefunded(jobRef, refundId) {
  const ts = admin.firestore.FieldValue.serverTimestamp();
  await jobRef.update({
    baseRefundConfirmed: true,
    refundStatus: 'succeeded',
    refundPartial: false,
    ...(refundId ? { refundId } : {}),
    paymentUpdatedAt: ts,
    updatedAt: ts,
  });
  await tryFinalizeAdminFullRefund({ jobRef });
}

async function recordPartialRefundOnJob(jobRef, evaluation, refundId) {
  await jobRef.update({
    ...partialRefundItemPatch(evaluation, refundId),
    requiresAdminAttention: true,
  });
}

async function applyChargeRefundedToDocs(charge) {
  const paymentIntentId = paymentIntentIdOf(charge?.payment_intent);
  const meta = charge?.metadata || {};
  const nestedRefundId =
    Array.isArray(charge?.refunds?.data) && charge.refunds.data[0]?.id
      ? charge.refunds.data[0].id
      : null;
  const amountRefundedCents = Math.floor(Number(charge?.amount_refunded));
  const evaluationExtras = {
    amountRefundedCents: Number.isFinite(amountRefundedCents) ? amountRefundedCents : undefined,
  };

  if (isVariationRefundMetadata(meta) && meta.jobId && meta.variationId) {
    const jobRef = db.collection('jobs').doc(String(meta.jobId));
    const varRef = jobRef.collection('variations').doc(String(meta.variationId));
    const varSnap = await varRef.get();
    if (!varSnap.exists) return;
    const variation = { id: varSnap.id, ...(varSnap.data() || {}) };
    const evaluation = {
      ...evaluateChargeRefundedConfirmation({ charge, item: variation, kind: 'variation' }),
      ...evaluationExtras,
    };
    if (evaluation.confirm) {
      await confirmVariationFullyRefunded(jobRef, varSnap.id, variation.refundId || nestedRefundId || null);
      return;
    }
    if (evaluation.partial) {
      await varRef.update(partialRefundItemPatch(evaluation, nestedRefundId));
      await recordPartialRefundOnJob(jobRef, evaluation, nestedRefundId);
    }
    return;
  }

  if (!paymentIntentId) return;
  const snap = await db.collection('jobs').where('paymentIntentId', '==', paymentIntentId).limit(1).get();
  if (snap.empty) return;
  const doc = snap.docs[0];
  const job = { paymentIntentId, ...(doc.data() || {}) };
  const evaluation = {
    ...evaluateChargeRefundedConfirmation({ charge, item: job, kind: 'base' }),
    ...evaluationExtras,
  };
  if (evaluation.confirm) {
    await confirmBaseFullyRefunded(doc.ref, job.refundId || nestedRefundId || null);
    return;
  }
  if (evaluation.partial) {
    await recordPartialRefundOnJob(doc.ref, evaluation, nestedRefundId);
  }
}

async function applySucceededRefundObjectToDocs(refund) {
  const paymentIntentId = paymentIntentIdOf(refund?.payment_intent);
  const meta = refund?.metadata || {};
  const refundId = String(refund?.id || '').trim() || null;
  const amountRefundedCents = Math.floor(Number(refund?.amount));
  const evaluationExtras = {
    amountRefundedCents: Number.isFinite(amountRefundedCents) ? amountRefundedCents : undefined,
  };

  if (isVariationRefundMetadata(meta) && meta.jobId && meta.variationId) {
    const jobRef = db.collection('jobs').doc(String(meta.jobId));
    const varRef = jobRef.collection('variations').doc(String(meta.variationId));
    const varSnap = await varRef.get();
    if (!varSnap.exists) return;
    const variation = { id: varSnap.id, ...(varSnap.data() || {}) };
    const evaluation = {
      ...evaluateSucceededRefundObjectConfirmation({ refund, item: variation, kind: 'variation' }),
      ...evaluationExtras,
    };
    if (evaluation.confirm) {
      await confirmVariationFullyRefunded(jobRef, varSnap.id, variation.refundId || refundId || null);
      return;
    }
    if (evaluation.partial) {
      await varRef.update(partialRefundItemPatch(evaluation, refundId));
      await recordPartialRefundOnJob(jobRef, evaluation, refundId);
    }
    return;
  }

  if (!paymentIntentId) return;
  const snap = await db.collection('jobs').where('paymentIntentId', '==', paymentIntentId).limit(1).get();
  if (snap.empty) return;
  const doc = snap.docs[0];
  const job = { paymentIntentId, ...(doc.data() || {}) };
  const evaluation = {
    ...evaluateSucceededRefundObjectConfirmation({ refund, item: job, kind: 'base' }),
    ...evaluationExtras,
  };
  if (evaluation.confirm) {
    await confirmBaseFullyRefunded(doc.ref, job.refundId || refundId || null);
    return;
  }
  if (evaluation.partial) {
    await recordPartialRefundOnJob(doc.ref, evaluation, refundId);
  }
}

async function handleOperationalStripeEvent(event) {
  const object = event?.data?.object || {};
  if (event.type === 'charge.dispute.created'
      || event.type === 'charge.dispute.updated'
      || event.type === 'charge.dispute.closed') {
    const pi = object.payment_intent;
    const paymentIntentId = typeof pi === 'string' ? pi : pi?.id;
    const jobDoc = await findFirstByField('jobs', 'paymentIntentId', paymentIntentId);
    await flagJobPaymentIncident(jobDoc, {
      type: event.type,
      id: object.id,
      status: object.status,
    });
    return true;
  }

  if (event.type === 'transfer.reversed' || event.type === 'transfer.failed') {
    const jobId = String(object?.metadata?.jobId || '').trim();
    const jobDoc = jobId ? await db.collection('jobs').doc(jobId).get() : null;
    await flagJobPaymentIncident(jobDoc?.exists ? jobDoc : null, {
      type: event.type,
      id: object.id,
      status: object.reversed === true ? 'reversed' : object.status,
    });
    return true;
  }

  if (event.type === 'payout.failed') {
    const accountId = String(event.account || object.destination || '').trim();
    const userDoc = await findFirstByField('users', 'stripeAccountId', accountId);
    if (userDoc) {
      await userDoc.ref.set({
        stripePayoutStatus: 'failed',
        stripePayoutFailureCode: object.failure_code || null,
        stripePayoutFailureMessage: object.failure_message || null,
        requiresAdminAttention: true,
        stripeUpdatedAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      }, { merge: true });
      await upsertWorkItemFromAutomation({
        entityType: 'expert',
        entityId: userDoc.id,
        category: 'payment',
        priority: 'critical',
        source: 'stripe_webhook',
        sourceReasonCodes: ['PAYOUT_FAILED'],
        context: { payoutId: object.id || null },
      });
    }
    return true;
  }

  return false;
}

/**
 * Central handler body. Idempotent where it touches jobs; throws on unexpected errors so Stripe retries.
 * @param {import('stripe').Stripe.Event} event
 */
async function dispatchStripeEventHandlers(event) {
  if (await handleOperationalStripeEvent(event)) return;

  if (event.type === 'account.updated') {
    const account = event.data?.object;
    const uid = account?.metadata?.taskioUid;
    if (uid) {
      const onboardingStatus = mapAccountOnboardingStatus(account);
      await db.collection('users').doc(uid).set(
        {
          stripeAccountId: account.id,
          stripeChargesEnabled: !!account.charges_enabled,
          stripePayoutsEnabled: !!account.payouts_enabled,
          stripeOnboardingStatus: onboardingStatus,
          stripeRequirements: account.requirements || null,
          stripeUpdatedAt: admin.firestore.FieldValue.serverTimestamp(),
        },
        { merge: true },
      );

      if (foundingExpertAutoEnrollEnabled()) {
        await scheduleMaybeAutoEnrollFoundingExpert({
          db,
          admin,
          expertUid: uid,
          trigger: 'stripe_webhook_account_updated',
          actorUidForApproval: DEFAULT_AUTO_ACTOR_UID,
        });
      }
    }
    return;
  }

  if (event.type === 'checkout.session.completed') {
    const session = event.data?.object;
    const meta = session?.metadata || {};
    if (
      session?.mode === 'payment'
      && isVariationPaymentMetadata(meta)
      && meta.jobId
      && meta.variationId
      && session.payment_status === 'paid'
    ) {
      const jobId = String(meta.jobId);
      const variationId = String(meta.variationId);
      const piRaw = session.payment_intent;
      const paymentIntentId = typeof piRaw === 'string' ? piRaw : piRaw?.id || null;
      await applyVariationPaymentSuccess(db, {
        jobId,
        variationId,
        paymentIntentId,
        checkoutSessionId: session.id,
        amountReceived: typeof session.amount_total === 'number' ? session.amount_total : null,
        currency: typeof session.currency === 'string' ? session.currency : null,
      });
      return;
    }

    /* Base quote Checkout (not variation metadata) */
    if (session?.mode === 'payment' && meta.jobId && !isVariationPaymentMetadata(meta)) {
      const jobRef = db.collection('jobs').doc(String(meta.jobId));
      let piRaw = session.payment_intent;
      let pi =
        typeof piRaw === 'string'
          ? await retrievePaymentIntent(piRaw)
          : piRaw && typeof piRaw === 'object'
            ? piRaw
            : null;
      const sessionPaid = session.payment_status === 'paid';
      if (!sessionPaid && (!pi || pi.status !== 'succeeded')) return;
      if (!pi?.id) return;
      if (pi.status !== 'succeeded') return;
      await applyBaseQuoteFundingFromPaymentIntentTx(db, admin, {
        jobRef,
        paymentIntent: pi,
        eventKind: 'succeeded',
        additionalFields: { paymentCheckoutSessionId: session.id },
      });
    }
    return;
  }

  if (event.type === 'payment_intent.succeeded' || event.type === 'payment_intent.payment_failed') {
    const pi = event.data?.object;
    const paymentIntentId = pi?.id;
    const status = pi?.status;
    const jobId = pi?.metadata?.jobId;
    const variationId = pi?.metadata?.variationId;
    const paymentType = pi?.metadata?.paymentType;
    const metaType = pi?.metadata?.type;

    const isVariationPi =
      (paymentType === 'variation' || metaType === 'variation_payment')
      && jobId
      && variationId
      && paymentIntentId
      && event.type === 'payment_intent.succeeded';

    if (isVariationPi) {
      await applyVariationPaymentSuccess(db, {
        jobId: String(jobId),
        variationId: String(variationId),
        paymentIntentId,
        amountReceived: typeof pi.amount === 'number' ? pi.amount : null,
        currency: typeof pi.currency === 'string' ? pi.currency : null,
      });
      return;
    }

    if (paymentIntentId) {
      const eventKind = event.type === 'payment_intent.succeeded' ? 'succeeded' : 'payment_failed';
      const paymentIntentForTx = { ...(pi || {}), id: paymentIntentId, status };

      const jobRef = jobId ? db.collection('jobs').doc(String(jobId)) : null;

      if (jobRef) {
        await applyBaseQuoteFundingFromPaymentIntentTx(db, admin, {
          jobRef,
          paymentIntent: paymentIntentForTx,
          eventKind,
        });
        if (event.type === 'payment_intent.payment_failed' && jobId) {
          try {
            await evaluateJobRiskById(jobId);
          } catch (e) {
            // eslint-disable-next-line no-console
            console.error('evaluateJobRiskById failed:', e);
          }
        }
      } else {
        await applyBaseQuoteFundingFromPaymentIntentByLookupTx(db, admin, paymentIntentId, paymentIntentForTx, eventKind);
      }
    }
    return;
  }

  if (event.type === 'charge.refunded') {
    await applyChargeRefundedToDocs(event.data?.object || {});
    return;
  }

  const refundUpdatedStatus = String(event.data?.object?.status || '').toLowerCase();
  if (
    event.type === 'refund.failed'
    || (event.type === 'refund.updated' && (refundUpdatedStatus === 'failed'
      || refundUpdatedStatus === 'canceled'
      || refundUpdatedStatus === 'cancelled'))
  ) {
    const refundObj = event.data.object;
    const pi = refundObj?.payment_intent;
    const paymentIntentId = typeof pi === 'string' ? pi : pi?.id;
    const meta = refundObj?.metadata || {};
    const eventRefundId = String(refundObj?.id || '').trim();
    if (isVariationRefundMetadata(meta) && meta.jobId && meta.variationId) {
      const varRef = db.collection('jobs').doc(String(meta.jobId)).collection('variations').doc(String(meta.variationId));
      const varSnap = await varRef.get();
      if (!varSnap.exists) return;
      const persistedRefundId = String((varSnap.data() || {}).refundId || '').trim();
      if (persistedRefundId && eventRefundId && persistedRefundId !== eventRefundId) {
        return;
      }
      await varRef.set({
        paymentState: 'refund_failed',
        refundFailureReason: refundObj?.failure_reason || refundObj?.description || 'refund_failed',
        ...refundAttemptFailedPatch(refundObj),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      }, { merge: true });
      const jobRef = db.collection('jobs').doc(String(meta.jobId));
      await jobRef.set({
        paymentState: 'refund_failed',
        requiresAdminAttention: true,
        refundFailedVariationId: String(meta.variationId),
        flagTypes: admin.firestore.FieldValue.arrayUnion('PAYMENT_ISSUE'),
        highestFlagSeverity: 'HIGH',
        paymentUpdatedAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      }, { merge: true });
      return;
    }
    if (paymentIntentId) {
      const snap = await db.collection('jobs').where('paymentIntentId', '==', paymentIntentId).limit(1).get();
      if (!snap.empty) {
        const doc = snap.docs[0];
        const persistedRefundId = String((doc.data() || {}).refundId || '').trim();
        if (persistedRefundId && eventRefundId && persistedRefundId !== eventRefundId) {
          return;
        }
        await doc.ref.update({
          paymentState: 'refund_failed',
          refundFailureReason: refundObj?.failure_reason || refundObj?.description || 'refund_failed',
          requiresAdminAttention: true,
          flagTypes: admin.firestore.FieldValue.arrayUnion('PAYMENT_ISSUE'),
          highestFlagSeverity: 'HIGH',
          paymentUpdatedAt: admin.firestore.FieldValue.serverTimestamp(),
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          ...refundAttemptFailedPatch(refundObj),
        });
        try {
          await evaluateJobRiskById(doc.id);
        } catch (e) {
          // eslint-disable-next-line no-console
          console.error('evaluateJobRiskById (refund_failed) failed:', e);
        }
      }
    }
    return;
  }

  if (event.type === 'refund.updated' && event.data?.object?.status === 'succeeded') {
    await applySucceededRefundObjectToDocs(event.data.object || {});
  }
}

router.post(
  '/api/stripe/webhook',
  express.raw({ type: 'application/json' }),
  async (req, res) => {
    try {
      if (process.env.STRIPE_ENABLED !== 'true') {
        return res.status(404).send({ message: 'Not found' });
      }

      const sig = req.headers['stripe-signature'];
      if (!sig) return res.status(400).send({ message: 'Missing Stripe-Signature header' });

      let event;
      try {
        event = constructWebhookEvent(req.body, sig);
      } catch (e) {
        // eslint-disable-next-line no-console
        console.error('Stripe webhook signature verification failed:', e.message);
        return res.status(400).send({ message: 'Invalid signature' });
      }

      const expectedLivemode = getExpectedStripeLivemode();
      if (expectedLivemode !== null && event.livemode !== expectedLivemode) {
        // eslint-disable-next-line no-console
        console.error('Stripe webhook livemode mismatch', {
          eventId: event.id,
          eventLivemode: event.livemode,
          expectedLivemode,
        });
        return res.status(400).send({ message: 'Stripe livemode mismatch' });
      }

      const eventRef = db.collection('stripe_events').doc(event.id);
      const existing = await eventRef.get();
      const existingData = existing.data() || {};

      if (existing.exists && existingData.processingState === 'processed') {
        return res.status(200).json({ received: true, duplicate: true });
      }

      const eventSummary = sanitizeEventForStorage(event);
      await eventRef.set(
        {
          ...eventSummary,
          created: event.created ? new Date(event.created * 1000) : admin.firestore.FieldValue.serverTimestamp(),
          receivedAt: admin.firestore.FieldValue.serverTimestamp(),
          processingState: 'processing',
          processingUpdatedAt: admin.firestore.FieldValue.serverTimestamp(),
        },
        { merge: true },
      );

      try {
        await dispatchStripeEventHandlers(event);
        await eventRef.set(
          {
            processingState: 'processed',
            processedAt: admin.firestore.FieldValue.serverTimestamp(),
          },
          { merge: true },
        );
        return res.status(200).json({ received: true });
      } catch (handlerErr) {
        await eventRef.set(
          {
            processingState: 'failed',
            failedAt: admin.firestore.FieldValue.serverTimestamp(),
            failureMessage: String(handlerErr?.message || handlerErr || 'error').slice(0, 480),
          },
          { merge: true },
        );
        throw handlerErr;
      }
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('Stripe webhook handler error:', err);
      return res.status(500).json({ message: 'Webhook handler failed' });
    }
  },
);

module.exports = router;
module.exports._test = {
  dispatchStripeEventHandlers,
  handleOperationalStripeEvent,
  sanitizeEventForStorage,
};
