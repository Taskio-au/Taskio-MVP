'use strict';

const express = require('express');

const { admin, db } = require('../firebaseAdmin');
const { constructWebhookEvent, getExpectedStripeLivemode, retrievePaymentIntent } = require('../services/stripe');
const { JOB_STATUSES, normalizeStatus } = require('../constants/jobStatuses');
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

/**
 * Central handler body. Idempotent where it touches jobs; throws on unexpected errors so Stripe retries.
 * @param {import('stripe').Stripe.Event} event
 */
async function dispatchStripeEventHandlers(event) {
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
    const charge = event.data?.object;
    const pi = charge?.payment_intent;
    const paymentIntentId = typeof pi === 'string' ? pi : pi?.id;
    if (paymentIntentId) {
      const snap = await db.collection('jobs').where('paymentIntentId', '==', paymentIntentId).limit(1).get();
      if (!snap.empty) {
        const doc = snap.docs[0];
        const jobData = doc.data();
        const currentJobStatus = normalizeStatus(jobData.status);
        if (currentJobStatus === JOB_STATUSES.REFUND_PENDING) {
          const refundId =
            Array.isArray(charge.refunds?.data) && charge.refunds.data[0]?.id
              ? charge.refunds.data[0].id
              : jobData.refundId || null;
          try {
            await updateJobStatus(db, admin, doc.ref, JOB_STATUSES.REFUNDED, {
              paymentState: 'refunded',
              ...(refundId ? { refundId } : {}),
              refundedAt: admin.firestore.FieldValue.serverTimestamp(),
            });
          } catch (e) {
            if (e?.code !== 'invalid_status_transition') {
              throw e;
            }
          }
        }
      }
    }
    return;
  }

  if (event.type === 'refund.updated' && event.data?.object?.status === 'failed') {
    const refundObj = event.data.object;
    const pi = refundObj?.payment_intent;
    const paymentIntentId = typeof pi === 'string' ? pi : pi?.id;
    if (paymentIntentId) {
      const snap = await db.collection('jobs').where('paymentIntentId', '==', paymentIntentId).limit(1).get();
      if (!snap.empty) {
        const doc = snap.docs[0];
        await doc.ref.update({
          paymentState: 'refund_failed',
          refundFailureReason: refundObj?.failure_reason || refundObj?.description || 'refund_failed',
          requiresAdminAttention: true,
          flagTypes: admin.firestore.FieldValue.arrayUnion('PAYMENT_ISSUE'),
          highestFlagSeverity: 'HIGH',
          paymentUpdatedAt: admin.firestore.FieldValue.serverTimestamp(),
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
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
    const refundObj = event.data.object;
    const pi = refundObj?.payment_intent;
    const paymentIntentId = typeof pi === 'string' ? pi : pi?.id;
    if (paymentIntentId) {
      const snap = await db.collection('jobs').where('paymentIntentId', '==', paymentIntentId).limit(1).get();
      if (!snap.empty) {
        const doc = snap.docs[0];
        const jobData = doc.data();
        const currentJobStatus = normalizeStatus(jobData.status);
        if (currentJobStatus === JOB_STATUSES.REFUND_PENDING) {
          const refundId = refundObj.id || jobData.refundId || null;
          try {
            await updateJobStatus(db, admin, doc.ref, JOB_STATUSES.REFUNDED, {
              paymentState: 'refunded',
              ...(refundId ? { refundId } : {}),
              refundedAt: admin.firestore.FieldValue.serverTimestamp(),
            });
          } catch (e) {
            if (e?.code !== 'invalid_status_transition') {
              throw e;
            }
          }
        }
      }
    }
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
