'use strict';

/**
 * Canonical job lifecycle enums and normalization (shared by backend + frontend build sync).
 * Keep in sync with frontend/src/shared/jobStatusesConstants.generated.js (constants only).
 */

const JOB_STATUSES = {
  OPEN: 'OPEN',
  QUOTED: 'QUOTED',
  ASSIGNED: 'ASSIGNED',
  AWAITING_FUNDING: 'AWAITING_FUNDING',
  FUNDED: 'FUNDED',
  IN_PROGRESS: 'IN_PROGRESS',
  COMPLETED: 'COMPLETED',
  PAID: 'PAID',
  DISPUTED: 'DISPUTED',
  CANCELLED: 'CANCELLED',
  REFUND_PENDING: 'REFUND_PENDING',
  REFUNDED: 'REFUNDED',
};

const VALID_STATUSES = Object.values(JOB_STATUSES);

const LEGACY_STATUS_MAP = {
  awaiting_quotes: JOB_STATUSES.OPEN,
  quoted: JOB_STATUSES.QUOTED,
  assigned: JOB_STATUSES.ASSIGNED,
  payment_required: JOB_STATUSES.AWAITING_FUNDING,
  awaiting_funding: JOB_STATUSES.AWAITING_FUNDING,
  pending_payment: JOB_STATUSES.AWAITING_FUNDING,
  funded: JOB_STATUSES.FUNDED,
  in_progress: JOB_STATUSES.IN_PROGRESS,
  in_escrow: JOB_STATUSES.FUNDED,
  awaiting_approval: JOB_STATUSES.COMPLETED,
  paid: JOB_STATUSES.PAID,
  disputed: JOB_STATUSES.DISPUTED,
  cancelled: JOB_STATUSES.CANCELLED,
  refund_pending: JOB_STATUSES.REFUND_PENDING,
  refunded: JOB_STATUSES.REFUNDED,
  open: JOB_STATUSES.OPEN,
};

/** Allowed next statuses (matches routes/jobs.js, stripeWebhook, admin flows). */
const VALID_TRANSITIONS = {
  [JOB_STATUSES.OPEN]: [JOB_STATUSES.QUOTED, JOB_STATUSES.CANCELLED],
  // QUOTED: can accept checkout (→ AWAITING_FUNDING), assign expert, go back to OPEN when last quote withdrawn
  [JOB_STATUSES.QUOTED]: [
    JOB_STATUSES.ASSIGNED,
    JOB_STATUSES.AWAITING_FUNDING,
    JOB_STATUSES.OPEN,
    JOB_STATUSES.CANCELLED,
  ],
  [JOB_STATUSES.ASSIGNED]: [
    JOB_STATUSES.AWAITING_FUNDING,
    JOB_STATUSES.OPEN,
    JOB_STATUSES.CANCELLED,
  ],
  [JOB_STATUSES.AWAITING_FUNDING]: [JOB_STATUSES.FUNDED, JOB_STATUSES.CANCELLED, JOB_STATUSES.REFUND_PENDING],
  // FUNDED: tradie may mark complete before marking IN_PROGRESS (see POST /complete)
  [JOB_STATUSES.FUNDED]: [
    JOB_STATUSES.IN_PROGRESS,
    JOB_STATUSES.COMPLETED,
    JOB_STATUSES.DISPUTED,
    JOB_STATUSES.REFUND_PENDING,
    JOB_STATUSES.REFUNDED,
  ],
  [JOB_STATUSES.IN_PROGRESS]: [JOB_STATUSES.COMPLETED, JOB_STATUSES.DISPUTED, JOB_STATUSES.CANCELLED],
  [JOB_STATUSES.COMPLETED]: [JOB_STATUSES.PAID, JOB_STATUSES.DISPUTED, JOB_STATUSES.CANCELLED],
  [JOB_STATUSES.PAID]: [JOB_STATUSES.DISPUTED],
  [JOB_STATUSES.DISPUTED]: [
    JOB_STATUSES.IN_PROGRESS,
    JOB_STATUSES.COMPLETED,
    JOB_STATUSES.CANCELLED,
    JOB_STATUSES.REFUNDED,
  ],
  [JOB_STATUSES.CANCELLED]: [],
  [JOB_STATUSES.REFUND_PENDING]: [JOB_STATUSES.REFUNDED],
  [JOB_STATUSES.REFUNDED]: [],
};

function isValidStatus(status) {
  return VALID_STATUSES.includes(status);
}

/**
 * Resolve raw status string to canonical enum.
 * @returns {{ status: string, unknown: boolean, rawInput: string }}
 */
function resolveJobStatus(raw) {
  const rawInput = raw === undefined || raw === null ? '' : String(raw);
  const cleaned = rawInput.trim();

  if (!cleaned) {
    return { status: JOB_STATUSES.OPEN, unknown: false, rawInput };
  }

  if (cleaned === 'completed') {
    return { status: JOB_STATUSES.PAID, unknown: false, rawInput };
  }

  const upperStatus = cleaned.toUpperCase();
  if (VALID_STATUSES.includes(upperStatus)) {
    return { status: upperStatus, unknown: false, rawInput };
  }

  const lowerStatus = cleaned.toLowerCase();
  if (LEGACY_STATUS_MAP[lowerStatus]) {
    return { status: LEGACY_STATUS_MAP[lowerStatus], unknown: false, rawInput };
  }

  return { status: JOB_STATUSES.OPEN, unknown: true, rawInput };
}

function isValidTransition(currentStatus, newStatus) {
  if (!isValidStatus(currentStatus) || !isValidStatus(newStatus)) {
    return false;
  }
  const allowed = VALID_TRANSITIONS[currentStatus] || [];
  return allowed.includes(newStatus);
}

module.exports = {
  JOB_STATUSES,
  VALID_STATUSES,
  LEGACY_STATUS_MAP,
  VALID_TRANSITIONS,
  resolveJobStatus,
  isValidStatus,
  isValidTransition,
};
