import React from 'react';
import { render, screen } from '@testing-library/react';
import useAdminDashboardDerivedData from './useAdminDashboardDerivedData';

function Harness({
  jobs,
  users = [],
  jobStatusFilter = 'all',
  tradieQuickFilter = '',
}) {
  const data = useAdminDashboardDerivedData({
    jobs,
    users,
    sortOrder: 'newest',
    quoteMeta: { knownJobIds: [], hasAnyByJobId: {} },
    jobSearchTerm: '',
    jobStatusFilter,
    jobQuickFilter: '',
    jobClientUidFilter: '',
    expertiseFilter: 'all',
    tradieSearchTerm: '',
    tradieQuickFilter,
    homeownerSearchTerm: '',
    homeownerQuickFilter: '',
  });

  return (
    <div>
      <div data-testid="filtered-jobs">{data.filteredJobs.length}</div>
      <div data-testid="open-jobs">{data.stats.openJobs}</div>
      <div data-testid="assigned-jobs">{data.stats.assignedJobs}</div>
      <div data-testid="filtered-tradies">{data.filteredTradies.map((t) => t.uid).join(',')}</div>
    </div>
  );
}

describe('useAdminDashboardDerivedData', () => {
  it('counts canonical and legacy open statuses together for admin metrics', () => {
    render(
      <Harness
        jobs={[
          { id: 'job-1', status: 'OPEN' },
          { id: 'job-2', status: 'open' },
          { id: 'job-3', status: 'ASSIGNED' },
        ]}
      />
    );

    expect(screen.getByTestId('open-jobs')).toHaveTextContent('2');
    expect(screen.getByTestId('assigned-jobs')).toHaveTextContent('1');
  });

  it('shows uppercase backend tasks when the admin filters to OPEN', () => {
    render(
      <Harness
        jobStatusFilter="OPEN"
        jobs={[
          { id: 'job-1', status: 'OPEN' },
          { id: 'job-2', status: 'open' },
          { id: 'job-3', status: 'ASSIGNED' },
        ]}
      />
    );

    expect(screen.getByTestId('filtered-jobs')).toHaveTextContent('2');
  });

  it('treats individuals without a business name as ABN-ready in ready_now', () => {
    render(
      <Harness
        jobs={[]}
        tradieQuickFilter="ready_now"
        users={[
          {
            uid: 'individual-1',
            role: 'tradie',
            status: 'active',
            verified: true,
            phoneVerified: true,
            abnVerified: false,
            businessType: 'individual',
            businessName: '',
            stripeOnboardingComplete: true,
            profileCompleted: true,
          },
          {
            uid: 'sole-1',
            role: 'tradie',
            status: 'active',
            verified: true,
            phoneVerified: true,
            abnVerified: false,
            businessType: 'sole_trader',
            businessName: '',
            stripeOnboardingComplete: true,
            profileCompleted: true,
          },
        ]}
      />
    );

    expect(screen.getByTestId('filtered-tradies')).toHaveTextContent('individual-1');
    expect(screen.getByTestId('filtered-tradies')).not.toHaveTextContent('sole-1');
  });
});
