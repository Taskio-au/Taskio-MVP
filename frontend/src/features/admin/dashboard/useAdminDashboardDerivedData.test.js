import React from 'react';
import { render, screen } from '@testing-library/react';
import useAdminDashboardDerivedData from './useAdminDashboardDerivedData';

function Harness({ jobs, jobStatusFilter = 'all' }) {
  const data = useAdminDashboardDerivedData({
    jobs,
    users: [],
    sortOrder: 'newest',
    quoteMeta: { knownJobIds: [], hasAnyByJobId: {} },
    jobSearchTerm: '',
    jobStatusFilter,
    jobQuickFilter: '',
    jobClientUidFilter: '',
    expertiseFilter: 'all',
    tradieSearchTerm: '',
    tradieQuickFilter: '',
    homeownerSearchTerm: '',
    homeownerQuickFilter: '',
  });

  return (
    <div>
      <div data-testid="filtered-jobs">{data.filteredJobs.length}</div>
      <div data-testid="open-jobs">{data.stats.openJobs}</div>
      <div data-testid="assigned-jobs">{data.stats.assignedJobs}</div>
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
});
