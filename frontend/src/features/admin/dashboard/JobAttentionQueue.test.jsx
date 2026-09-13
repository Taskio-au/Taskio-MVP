import React from 'react';
import { render, screen } from '@testing-library/react';
import JobAttentionQueue from './JobAttentionQueue';

const nowMs = Date.UTC(2026, 8, 13, 12, 0, 0);

function renderQueue(loadState, snapshot) {
  return render(<JobAttentionQueue loadState={loadState} snapshot={snapshot} nowMs={nowMs} />);
}

describe('JobAttentionQueue', () => {
  it('shows ATTENTION DATA UNAVAILABLE on API error without a fake empty queue', () => {
    renderQueue('error', null);
    expect(screen.getByText('ATTENTION DATA UNAVAILABLE')).toBeInTheDocument();
    expect(screen.queryByText('No active pilot jobs currently need attention.')).not.toBeInTheDocument();
    expect(screen.queryByText('0 jobs need attention')).not.toBeInTheDocument();
  });

  it('shows ATTENTION DATA INCOMPLETE when the scan is truncated', () => {
    renderQueue('ok', {
      totals: { truncated: true, scanComplete: false },
      jobs: [],
    });
    expect(screen.getByText('ATTENTION DATA INCOMPLETE')).toBeInTheDocument();
    expect(screen.queryByText('No active pilot jobs currently need attention.')).not.toBeInTheDocument();
  });

  it('shows a calm empty state when the scan is complete and nothing needs attention', () => {
    renderQueue('ok', {
      totals: { truncated: false, scanComplete: true },
      jobs: [],
    });
    expect(screen.getByText('No active pilot jobs currently need attention.')).toBeInTheDocument();
  });

  it('renders priority text, reason, age, and safe job-detail actions', () => {
    renderQueue('ok', {
      totals: { truncated: false, scanComplete: true },
      jobs: [{
        jobId: 'job-1',
        reference: 'TSK-1042',
        category: 'Mounting',
        area: 'Richmond',
        createdAtMs: nowMs - (90 * 60 * 1000),
        inviteCount: 0,
        quoteCount: 0,
        suitableLaunchReadyCount: 3,
        suitableSupplyReliable: true,
        jobStatus: 'OPEN',
        paymentState: null,
        priority: 'HIGH',
        reasonKey: 'ZERO_QUOTES_60M',
        reasonLabel: '0 quotes after 60 minutes',
        action: 'invite_experts',
        secondary: [],
      }],
    });
    expect(screen.getByText('HIGH')).toBeInTheDocument();
    expect(screen.getByText('TSK-1042')).toBeInTheDocument();
    expect(screen.getByText('0 quotes after 60 minutes')).toBeInTheDocument();
    expect(screen.getByText('1h 30m')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'View job' })).toHaveAttribute('href', '/admin/job/job-1');
    expect(screen.getByRole('link', { name: 'Invite Experts' })).toHaveAttribute('href', '/admin/job/job-1');
    expect(screen.queryByRole('button', { name: /refund|release|cancel|open posting/i })).toBeNull();
  });
});
