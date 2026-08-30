import { getNotificationKind } from './getNotificationKind';

describe('getNotificationKind', () => {
  it('maps quote, funding, chat, and unknown types', () => {
    expect(getNotificationKind('quote_submitted').label).toBe('Quote');
    expect(getNotificationKind('escrow_funded').label).toBe('Payment');
    expect(getNotificationKind('message_received').label).toBe('Message');
    expect(getNotificationKind('').label).toBe('Update');
    expect(getNotificationKind(null).label).toBe('Update');
  });

  it('maps completion, release, and refund kinds for E03–E05', () => {
    expect(getNotificationKind('task_completed')).toEqual({
      label: 'Task',
      accent: '#1D4ED8',
      bg: '#EFF6FF',
      border: '#BFDBFE',
    });
    expect(getNotificationKind('payment_released').label).toBe('Payment');
    expect(getNotificationKind('refund_completed').label).toBe('Refund');
  });
});
