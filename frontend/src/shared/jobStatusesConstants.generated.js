// AUTO-GENERATED from shared/jobStatusesCore.js — do not edit

export const JOB_STATUSES = {
  "OPEN": "OPEN",
  "QUOTED": "QUOTED",
  "ASSIGNED": "ASSIGNED",
  "AWAITING_FUNDING": "AWAITING_FUNDING",
  "FUNDED": "FUNDED",
  "IN_PROGRESS": "IN_PROGRESS",
  "COMPLETED": "COMPLETED",
  "PAID": "PAID",
  "DISPUTED": "DISPUTED",
  "CANCELLED": "CANCELLED",
  "REFUND_PENDING": "REFUND_PENDING",
  "REFUNDED": "REFUNDED"
};

export const LEGACY_STATUS_MAP = {
  "awaiting_quotes": "OPEN",
  "quoted": "QUOTED",
  "assigned": "ASSIGNED",
  "payment_required": "AWAITING_FUNDING",
  "awaiting_funding": "AWAITING_FUNDING",
  "pending_payment": "AWAITING_FUNDING",
  "funded": "FUNDED",
  "in_progress": "IN_PROGRESS",
  "in_escrow": "FUNDED",
  "awaiting_approval": "COMPLETED",
  "paid": "PAID",
  "disputed": "DISPUTED",
  "cancelled": "CANCELLED",
  "refund_pending": "REFUND_PENDING",
  "refunded": "REFUNDED",
  "open": "OPEN"
};

export const VALID_TRANSITIONS = {
  "OPEN": [
    "QUOTED",
    "CANCELLED"
  ],
  "QUOTED": [
    "ASSIGNED",
    "AWAITING_FUNDING",
    "OPEN",
    "CANCELLED"
  ],
  "ASSIGNED": [
    "AWAITING_FUNDING",
    "OPEN",
    "CANCELLED"
  ],
  "AWAITING_FUNDING": [
    "FUNDED",
    "CANCELLED",
    "REFUND_PENDING"
  ],
  "FUNDED": [
    "IN_PROGRESS",
    "COMPLETED",
    "DISPUTED",
    "REFUND_PENDING",
    "REFUNDED"
  ],
  "IN_PROGRESS": [
    "COMPLETED",
    "DISPUTED",
    "CANCELLED"
  ],
  "COMPLETED": [
    "PAID",
    "DISPUTED",
    "CANCELLED"
  ],
  "PAID": [
    "DISPUTED"
  ],
  "DISPUTED": [
    "IN_PROGRESS",
    "COMPLETED",
    "CANCELLED",
    "REFUNDED"
  ],
  "CANCELLED": [],
  "REFUND_PENDING": [
    "REFUNDED"
  ],
  "REFUNDED": []
};

export const VALID_STATUSES = Object.values(JOB_STATUSES);
