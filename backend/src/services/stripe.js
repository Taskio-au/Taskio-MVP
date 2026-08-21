'use strict';

const Stripe = require('stripe');
const { requireStripeEnabled } = require('../config/stripeEnabled');
const { getExpectedStripeLivemode } = require('../config/stripeLivemode');

function getStripe() {
  requireStripeEnabled();
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) {
    const err = new Error('Stripe is not configured.');
    err.code = 'stripe_not_configured';
    throw err;
  }
  return new Stripe(key, {
    apiVersion: '2024-06-20',
  });
}

function constructWebhookEvent(rawBody, signatureHeader) {
  const secret = typeof process.env.STRIPE_WEBHOOK_SECRET === 'string'
    ? process.env.STRIPE_WEBHOOK_SECRET.trim()
    : '';
  if (!secret) {
    const err = new Error('Stripe webhook is not configured.');
    err.code = 'stripe_webhook_not_configured';
    throw err;
  }
  if (!signatureHeader) {
    const err = new Error('Missing Stripe-Signature header');
    err.code = 'stripe_signature_missing';
    throw err;
  }
  if (rawBody == null || (typeof rawBody !== 'string' && !Buffer.isBuffer(rawBody))) {
    const err = new Error('Stripe webhook raw body is invalid.');
    err.code = 'stripe_webhook_invalid_body';
    throw err;
  }

  // Local HMAC verification only. Do not instantiate a Stripe client (that would
  // require STRIPE_SECRET_KEY and network-capable API configuration).
  return Stripe.webhooks.constructEvent(rawBody, signatureHeader, secret);
}

async function createCheckoutSession({
  amountInCents,
  currency = 'aud',
  name,
  description,
  successUrl,
  cancelUrl,
  metadata,
  idempotencyKey,
  customerEmail,
}) {
  const stripe = getStripe();

  const session = await stripe.checkout.sessions.create(
    {
      mode: 'payment',
      success_url: successUrl,
      cancel_url: cancelUrl,
      payment_method_types: ['card'],
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency,
            unit_amount: amountInCents,
            product_data: {
              name: name || 'Taskio task payment',
              ...(description ? { description } : {}),
            },
          },
        },
      ],
      ...(customerEmail ? { customer_email: customerEmail } : {}),
      metadata: metadata || {},
      payment_intent_data: {
        metadata: metadata || {},
      },
    },
    idempotencyKey ? { idempotencyKey } : undefined
  );

  return session;
}

async function retrievePaymentIntent(paymentIntentId, options = {}) {
  const stripe = getStripe();
  const params = {};
  if (Array.isArray(options.expand) && options.expand.length > 0) {
    params.expand = options.expand;
  }
  return Object.keys(params).length > 0
    ? stripe.paymentIntents.retrieve(paymentIntentId, params)
    : stripe.paymentIntents.retrieve(paymentIntentId);
}

async function retrieveCheckoutSession(sessionId) {
  const stripe = getStripe();
  return stripe.checkout.sessions.retrieve(sessionId, {
    expand: ['payment_intent'],
  });
}

async function createExpressAccount({ taskioUid, email, idempotencyKey }) {
  const stripe = getStripe();
  const account = await stripe.accounts.create(
    {
      type: 'express',
      country: 'AU',
      email,
      metadata: {
        taskioUid,
      },
      capabilities: {
        transfers: { requested: true },
      },
      business_type: 'individual',
    },
    idempotencyKey ? { idempotencyKey } : undefined
  );
  return account;
}

async function retrieveAccount(accountId) {
  const stripe = getStripe();
  return stripe.accounts.retrieve(accountId);
}

async function createAccountLink({ accountId, refreshUrl, returnUrl }) {
  const stripe = getStripe();
  const link = await stripe.accountLinks.create({
    account: accountId,
    refresh_url: refreshUrl,
    return_url: returnUrl,
    type: 'account_onboarding',
  });
  return link;
}

/** Express Dashboard login link for a connected account (expert self-serve). */
async function createExpressDashboardLoginLink(accountId) {
  const stripe = getStripe();
  return stripe.accounts.createLoginLink(String(accountId).trim());
}

/**
 * Available / pending balance for a Connect account (cents per currency bucket).
 * @returns {Promise<{ available: Array<{ amount: number, currency: string }>, pending: Array<{ amount: number, currency: string }> }>}
 */
async function retrieveConnectAccountBalance(accountId) {
  const stripe = getStripe();
  return stripe.balance.retrieve({ stripeAccount: String(accountId).trim() });
}

/**
 * @param {object} args
 * @param {string} [args.sourceTransaction] — Stripe charge id; ties Connect transfer to the card charge (separate charges + transfers).
 * @param {string} [args.transferGroup] — Optional Stripe transfer_group (e.g. per-task grouping).
 */
async function createTransfer({
  amountInCents,
  currency = 'aud',
  destinationAccountId,
  metadata,
  idempotencyKey,
  sourceTransaction,
  transferGroup,
}) {
  const stripe = getStripe();
  const body = {
    amount: amountInCents,
    currency,
    destination: destinationAccountId,
    metadata: metadata || {},
  };
  if (sourceTransaction) {
    body.source_transaction = sourceTransaction;
  }
  if (transferGroup) {
    body.transfer_group = transferGroup;
  }
  const transfer = await stripe.transfers.create(
    body,
    idempotencyKey ? { idempotencyKey } : undefined
  );
  return transfer;
}

/**
 * For separate charges + transfers: read succeeded PaymentIntent and return charge id for source_transaction.
 * @returns {Promise<{ chargeId: string, paymentIntent: object } | { error: { httpStatus: number, message: string, code: string } }>}
 */
async function getSucceededChargeIdForConnectTransfer(paymentIntentId) {
  if (!paymentIntentId || !String(paymentIntentId).trim()) {
    return {
      error: {
        httpStatus: 400,
        message: 'No payment record found for this task. Cannot release payment.',
        code: 'missing_payment_intent',
      },
    };
  }
  const pi = await retrievePaymentIntent(String(paymentIntentId).trim(), { expand: ['latest_charge'] });
  if (pi.status !== 'succeeded') {
    return {
      error: {
        httpStatus: 409,
        message: `Payment is not in a releasable state (status: ${pi.status}).`,
        code: 'payment_intent_not_succeeded',
      },
    };
  }
  const lc = pi.latest_charge;
  const chargeId = typeof lc === 'string' ? lc : (lc && lc.id);
  if (!chargeId) {
    return {
      error: {
        httpStatus: 409,
        message: 'Could not read the card charge for this payment. Try again or contact support.',
        code: 'missing_charge',
      },
    };
  }
  return { chargeId, paymentIntent: pi };
}

async function createRefund({ paymentIntentId, amountInCents, reason, idempotencyKey, metadata }) {
  const stripe = getStripe();
  const refund = await stripe.refunds.create(
    {
      payment_intent: paymentIntentId,
      ...(amountInCents ? { amount: amountInCents } : {}),
      ...(reason ? { reason } : {}),
      ...(metadata && typeof metadata === 'object' ? { metadata } : {}),
    },
    idempotencyKey ? { idempotencyKey } : undefined
  );
  return refund;
}

async function cancelPaymentIntent(paymentIntentId) {
  const stripe = getStripe();
  return stripe.paymentIntents.cancel(paymentIntentId);
}

module.exports = {
  getStripe,
  constructWebhookEvent,
  createCheckoutSession,
  retrievePaymentIntent,
  retrieveCheckoutSession,
  createExpressAccount,
  retrieveAccount,
  createAccountLink,
  createExpressDashboardLoginLink,
  retrieveConnectAccountBalance,
  createTransfer,
  getSucceededChargeIdForConnectTransfer,
  createRefund,
  cancelPaymentIntent,
  getExpectedStripeLivemode,
};

