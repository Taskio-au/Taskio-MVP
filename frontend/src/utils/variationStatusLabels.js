/**
 * Client-facing labels for job variation lifecycle (aligned with backend statuses).
 */

export function getVariationStatusLabel(status, paymentState) {
  const s = String(status || '');
  const ps = String(paymentState || '');
  if (s === 'awaiting_payment') return 'Payment required';
  if (s === 'approved' && ps === 'in_escrow') return 'Payment secured';
  if (s === 'pending') return 'Variation requested';
  if (s === 'approved') return 'Approved';
  if (s === 'declined') return 'Declined';
  if (s === 'cancelled') return 'Cancelled';
  return s ? s.replace(/_/g, ' ') : 'Unknown';
}
