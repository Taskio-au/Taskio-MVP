'use strict';

function isStripeEventId(value) {
  return typeof value === 'string' && /^evt_[A-Za-z0-9_]+$/.test(value);
}

function validateForwardedStripeEvent(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return { ok: false };
  }
  if (body.object !== 'event') return { ok: false };
  if (!isStripeEventId(body.id)) return { ok: false };
  if (typeof body.type !== 'string' || body.type.length === 0 || body.type !== body.type.trim()) {
    return { ok: false };
  }
  if (typeof body.livemode !== 'boolean') return { ok: false };
  if (!body.data || typeof body.data !== 'object' || Array.isArray(body.data)) {
    return { ok: false };
  }
  if (!body.data.object || typeof body.data.object !== 'object' || Array.isArray(body.data.object)) {
    return { ok: false };
  }
  return { ok: true };
}

module.exports = {
  isStripeEventId,
  validateForwardedStripeEvent,
};
