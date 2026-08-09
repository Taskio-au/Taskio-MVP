import {
  JOB_STATUSES,
  getStepperProgress,
  getPrimaryAction,
  isChatEnabled,
  normalizeStatus,
  getStatusLabel,
} from './jobStatuses';

describe('jobStatuses', () => {
  it('normalizes legacy statuses', () => {
    expect(normalizeStatus('in_escrow')).toBe(JOB_STATUSES.FUNDED);
    expect(normalizeStatus('awaiting_approval')).toBe(JOB_STATUSES.COMPLETED);
    expect(normalizeStatus('awaiting_quotes')).toBe(JOB_STATUSES.OPEN);
    expect(normalizeStatus('payment_required')).toBe(JOB_STATUSES.AWAITING_FUNDING);
    expect(normalizeStatus('completed')).toBe(JOB_STATUSES.PAID);
    expect(normalizeStatus('COMPLETED')).toBe(JOB_STATUSES.COMPLETED);
  });

  it('returns expected primary actions', () => {
    expect(getPrimaryAction(JOB_STATUSES.QUOTED, 'j1')).toEqual({
      label: 'View quotes',
      route: '/job/j1',
    });
    expect(getPrimaryAction(JOB_STATUSES.AWAITING_FUNDING, 'j2')).toEqual({
      label: 'Complete payment',
      route: '/job/j2',
    });
    expect(getPrimaryAction(JOB_STATUSES.FUNDED, 'j3')).toEqual({
      label: 'Message expert',
      route: '/job/j3#chat',
    });
  });

  it('gates chat on funded and later states only', () => {
    expect(isChatEnabled(JOB_STATUSES.OPEN)).toBe(false);
    expect(isChatEnabled(JOB_STATUSES.AWAITING_FUNDING)).toBe(false);
    expect(isChatEnabled(JOB_STATUSES.FUNDED)).toBe(true);
    expect(isChatEnabled(JOB_STATUSES.IN_PROGRESS)).toBe(true);
  });

  it('maps labels for user-facing badges', () => {
    expect(getStatusLabel(JOB_STATUSES.DISPUTED)).toBe('Under review');
    expect(getStatusLabel(JOB_STATUSES.PAID)).toBe('Completed');
    expect(getStatusLabel(JOB_STATUSES.ASSIGNED)).toBe('Expert selected');
    expect(getStatusLabel(JOB_STATUSES.IN_PROGRESS)).toBe('Work in progress');
  });

  it('uses state-based step labels and a completed final step', () => {
    const assigned = getStepperProgress(JOB_STATUSES.ASSIGNED);
    const paid = getStepperProgress(JOB_STATUSES.PAID);

    expect(assigned.steps.map((step) => step.label)).toEqual([
      'Awaiting quotes',
      'Quotes received',
      'Expert selected',
      'Payment secured',
      'Work in progress',
      'Awaiting approval',
      'Completed',
    ]);
    expect(assigned.currentStep).toBe(3);
    expect(paid.currentStep).toBe(7);
  });
});
