/**
 * Consistent secured-payment language for Client vs Expert surfaces.
 * Maps backend `paymentState` values only — does not infer money flow from job.status.
 */

const CLIENT_PAYMENT_LABELS = {
  awaiting_funding: 'Awaiting payment',
  pending_payment: 'Payment processing',
  in_escrow: 'Payment secured',
  released: 'Payment released',
  pending: 'Processing',
  disputed: 'In dispute',
  refunded: 'Refunded',
  refund_pending: 'Refund in progress',
  not_required: 'No payment',
};

const EXPERT_PAYMENT_LABELS = {
  awaiting_funding: 'Awaiting Client payment',
  pending_payment: 'Payment processing',
  in_escrow: 'Secured until Client approves',
  released: 'Released to your Stripe account',
  pending: 'Processing',
  disputed: 'In dispute',
  refunded: 'Refunded',
  refund_pending: 'Refund in progress',
  not_required: 'No payment on this task',
};

function formatPaymentStateLabel(raw, map) {
  const k = String(raw || '').trim().toLowerCase();
  if (!k) return 'Not yet';
  if (map[k]) return map[k];
  return k
    .split('_')
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

/** Client task detail / billing — funds are theirs until release. */
export function getClientPaymentStateLabel(paymentState) {
  return formatPaymentStateLabel(paymentState, CLIENT_PAYMENT_LABELS);
}

/** Expert task summary chip — earnings and secured payment state from Expert perspective. */
export function getExpertPaymentStateLabel(paymentState) {
  return formatPaymentStateLabel(paymentState, EXPERT_PAYMENT_LABELS);
}
