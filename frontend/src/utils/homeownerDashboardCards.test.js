import { JOB_STATUSES } from '../constants/jobStatuses';
import {
  deriveClientDashboardNormalizedStatus,
  getClientDashboardCtaLabel,
  getClientDashboardStatusPresentation,
  getClientFourStepIndex,
  getClientProgressLine,
  getNeedsActionStaleLabel,
  getShortJobRef,
  groupClientDashboardJobs,
  selectVisibleClientNeedsActionJobs,
} from './homeownerDashboardCards';

describe('homeownerDashboardCards', () => {
  it('maps lifecycle to four steps', () => {
    expect(getClientFourStepIndex(JOB_STATUSES.OPEN)).toBe(1);
    expect(getClientFourStepIndex(JOB_STATUSES.AWAITING_FUNDING)).toBe(2);
    expect(getClientFourStepIndex(JOB_STATUSES.IN_PROGRESS)).toBe(3);
    expect(getClientFourStepIndex(JOB_STATUSES.PAID)).toBe(4);
    expect(getClientFourStepIndex(JOB_STATUSES.CANCELLED)).toBeNull();
  });

  it('groups jobs into action / progress / completed', () => {
    const jobs = [
      { id: '1', status: JOB_STATUSES.OPEN, createdAt: { _seconds: 1 } },
      { id: '2', status: JOB_STATUSES.AWAITING_FUNDING, acceptedQuoteId: 'q', createdAt: { _seconds: 2 } },
      { id: '3', status: JOB_STATUSES.FUNDED, createdAt: { _seconds: 3 } },
      { id: '4', status: JOB_STATUSES.PAID, createdAt: { _seconds: 4 } },
    ];
    const g = groupClientDashboardJobs(jobs);
    expect(g.needsAction.map((j) => j.id)).toContain('2');
    expect(g.inProgress.map((j) => j.id).sort()).toEqual(['1', '3']);
    expect(g.completed.map((j) => j.id)).toContain('4');
  });

  it('derives quoted vs open for invites', () => {
    const quoted = deriveClientDashboardNormalizedStatus({
      status: JOB_STATUSES.ASSIGNED,
      quoteCount: 2,
      acceptedQuoteId: null,
    });
    expect(quoted).toBe(JOB_STATUSES.QUOTED);
  });

  it('formats progress line with human copy', () => {
    expect(getClientProgressLine(JOB_STATUSES.FUNDED)).toContain('Your expert is working on this task');
    expect(getClientProgressLine(JOB_STATUSES.OPEN)).toContain('Experts are reviewing');
    expect(getClientProgressLine(JOB_STATUSES.OPEN, { quoteCount: 0 })).toBe('');
    expect(getClientProgressLine(JOB_STATUSES.AWAITING_FUNDING)).toContain('Complete payment to secure your booking');
    expect(getClientProgressLine(JOB_STATUSES.AWAITING_FUNDING, { paymentState: 'in_escrow' })).toBe('');
  });

  it('formats stale nudge copy for needs-action statuses', () => {
    expect(getNeedsActionStaleLabel(JOB_STATUSES.AWAITING_FUNDING, 4)).toBe('Pending your action • 4 days');
    expect(getNeedsActionStaleLabel(JOB_STATUSES.COMPLETED, 4)).toBe('Waiting for your approval • 4 days');
    expect(getNeedsActionStaleLabel(JOB_STATUSES.DISPUTED, 5)).toBe('Pending your action • 5 days');
  });

  it('formats card reference as TSK-', () => {
    expect(getShortJobRef('abc')).toMatch(/^TSK-\d{4}$/);
    expect(getShortJobRef('abc')).toBe(getShortJobRef('abc'));
    expect(getShortJobRef({ id: 'abc', taskNumber: 1042 })).toBe('TSK-1042');
  });

  it('uses dashboard CTA labels', () => {
    expect(getClientDashboardCtaLabel(JOB_STATUSES.AWAITING_FUNDING, 'j')).toBe('Pay & start job');
    expect(
      getClientDashboardCtaLabel(JOB_STATUSES.AWAITING_FUNDING, 'j', { paymentState: 'in_escrow' }),
    ).toBe('Chat with Expert');
    expect(getClientDashboardCtaLabel(JOB_STATUSES.COMPLETED, 'j')).toBe('Approve & release payment');
    expect(getClientDashboardCtaLabel(JOB_STATUSES.FUNDED, 'j')).toBe('Chat with Expert');
  });

  it('uses dashboard microcopy for payment status', () => {
    const p = getClientDashboardStatusPresentation(JOB_STATUSES.AWAITING_FUNDING);
    expect(p.label).toBe('Payment required');
  });

  it('sorts needs-action with unread messages ahead of same-rank payment tasks', () => {
    const jobs = [
      {
        id: 'pay',
        status: JOB_STATUSES.AWAITING_FUNDING,
        acceptedQuoteId: 'q',
        createdAt: { _seconds: 100 },
      },
      {
        id: 'pay-unread',
        status: JOB_STATUSES.AWAITING_FUNDING,
        acceptedQuoteId: 'q',
        createdAt: { _seconds: 50 },
      },
    ];
    const unread = { 'pay-unread': 2 };
    const g = groupClientDashboardJobs(jobs, unread);
    expect(g.needsAction[0].id).toBe('pay-unread');
  });

  it('selectVisibleClientNeedsActionJobs slices after sort order and preserves length', () => {
    const list = Array.from({ length: 10 }, (_, i) => ({
      id: `n-${i}`,
      status: JOB_STATUSES.COMPLETED,
      acceptedQuoteId: 'q',
      createdAt: { _seconds: 200 - i },
    }));
    const visible = selectVisibleClientNeedsActionJobs(list, {}, 6);
    expect(visible).toHaveLength(6);
    expect(visible[0].id).toBe('n-0');
    const ids = visible.map((j) => j.id);
    expect(new Set(ids).size).toBe(6);
  });

  it('reserves a slot for an unread needs-action job that would fall outside the cap', () => {
    const list = Array.from({ length: 8 }, (_, i) => ({
      id: `c-${i}`,
      status: JOB_STATUSES.COMPLETED,
      acceptedQuoteId: 'q',
      createdAt: { _seconds: 300 - i },
    }));
    const unread = { 'c-7': 1 };
    const visible = selectVisibleClientNeedsActionJobs(list, unread, 6);
    expect(visible).toHaveLength(6);
    expect(visible.some((j) => j.id === 'c-7')).toBe(true);
    expect(new Set(visible.map((j) => j.id)).size).toBe(6);
  });
});
