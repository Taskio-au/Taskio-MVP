'use strict';

const crypto = require('crypto');
const { admin, db } = require('../firebaseAdmin');

const DEFAULT_LEASE_MS = 60 * 1000;
const STRIPE_EVENTS = 'stripe_events';

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

function toExpiryMs(value) {
  if (value == null) return 0;
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (value instanceof Date) return value.getTime();
  if (typeof value.toMillis === 'function') return value.toMillis();
  if (typeof value._seconds === 'number') return value._seconds * 1000;
  if (typeof value.seconds === 'number') return value.seconds * 1000;
  const parsed = Date.parse(String(value));
  return Number.isFinite(parsed) ? parsed : 0;
}

function hasValidLease(data, nowMs) {
  if (!data || data.processingState !== 'processing') return false;
  if (!data.claimId) return false;
  return toExpiryMs(data.claimExpiresAtMs) > nowMs;
}

function generateClaimId() {
  return crypto.randomUUID();
}

/**
 * Atomically claim a Stripe event for processing.
 * @returns {Promise<{ outcome: 'claimed'|'duplicate'|'in_flight', claimId?: string }>}
 */
async function claimStripeEvent(event, options = {}) {
  const eventId = String(event?.id || '').trim();
  if (!eventId) {
    const err = new Error('Stripe event id is required.');
    err.code = 'stripe_event_id_missing';
    throw err;
  }

  const nowMs = Number.isFinite(options.nowMs) ? options.nowMs : Date.now();
  const leaseMs = Number.isFinite(options.leaseMs) && options.leaseMs > 0
    ? options.leaseMs
    : DEFAULT_LEASE_MS;
  const claimId = options.claimId || generateClaimId();

  return db.runTransaction(async (tx) => {
    const ref = db.collection(STRIPE_EVENTS).doc(eventId);
    const snap = await tx.get(ref);
    const data = snap.exists ? (snap.data() || {}) : {};

    if (data.processingState === 'processed') {
      return { outcome: 'duplicate' };
    }

    if (hasValidLease(data, nowMs)) {
      return { outcome: 'in_flight' };
    }

    const claimExpiresAtMs = nowMs + leaseMs;
    const summary = sanitizeEventForStorage(event);
    tx.set(ref, {
      ...summary,
      created: event.created ? new Date(event.created * 1000) : admin.firestore.FieldValue.serverTimestamp(),
      receivedAt: admin.firestore.FieldValue.serverTimestamp(),
      processingState: 'processing',
      processingStartedAt: admin.firestore.FieldValue.serverTimestamp(),
      processingUpdatedAt: admin.firestore.FieldValue.serverTimestamp(),
      claimId,
      claimExpiresAtMs,
      failureMessage: null,
    }, { merge: true });

    return { outcome: 'claimed', claimId };
  });
}

/**
 * Settle a claim. No-ops when claimId does not match (stale worker).
 * @returns {Promise<{ outcome: 'settled'|'stale' }>}
 */
async function settleStripeEvent({ eventId, claimId, result, failureMessage }) {
  const id = String(eventId || '').trim();
  const token = String(claimId || '').trim();
  if (!id || !token) {
    return { outcome: 'stale' };
  }

  return db.runTransaction(async (tx) => {
    const ref = db.collection(STRIPE_EVENTS).doc(id);
    const snap = await tx.get(ref);
    if (!snap.exists) return { outcome: 'stale' };
    const data = snap.data() || {};
    if (String(data.claimId || '') !== token) {
      return { outcome: 'stale' };
    }

    const ts = admin.firestore.FieldValue.serverTimestamp();
    if (result === 'processed') {
      tx.set(ref, {
        processingState: 'processed',
        processedAt: ts,
        processingUpdatedAt: ts,
        claimId: null,
        claimExpiresAtMs: null,
        failureMessage: null,
      }, { merge: true });
    } else {
      tx.set(ref, {
        processingState: 'failed',
        failedAt: ts,
        processingUpdatedAt: ts,
        claimId: null,
        claimExpiresAtMs: null,
        failureMessage: String(failureMessage || 'error').slice(0, 480),
      }, { merge: true });
    }
    return { outcome: 'settled' };
  });
}

module.exports = {
  DEFAULT_LEASE_MS,
  sanitizeEventForStorage,
  hasValidLease,
  claimStripeEvent,
  settleStripeEvent,
  generateClaimId,
};
