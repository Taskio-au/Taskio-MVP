export function getNotificationKind(type) {
  const t = String(type || '');
  if (t === 'escrow_funded') {
    return { label: 'Payment', accent: '#065f46', bg: '#ECFDF5', border: '#A7F3D0' };
  }
  if (t === 'quote_submitted') {
    return { label: 'Quote', accent: '#075985', bg: '#E0F2FE', border: '#BAE6FD' };
  }
  if (t === 'task_completed') {
    return { label: 'Task', accent: '#1D4ED8', bg: '#EFF6FF', border: '#BFDBFE' };
  }
  if (t === 'payment_released') {
    return { label: 'Payment', accent: '#065f46', bg: '#ECFDF5', border: '#A7F3D0' };
  }
  if (t === 'refund_completed') {
    return { label: 'Refund', accent: '#9A3412', bg: '#FFF7ED', border: '#FED7AA' };
  }
  if (t === 'message_received') {
    return { label: 'Message', accent: '#B45309', bg: '#FFFBEB', border: '#FDE68A' };
  }
  return { label: 'Update', accent: '#4B5563', bg: '#F3F4F6', border: '#E5E7EB' };
}
