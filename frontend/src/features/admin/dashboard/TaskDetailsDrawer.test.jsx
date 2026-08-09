import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import TaskDetailsDrawer from './TaskDetailsDrawer';
import { dashboardStyles } from '../../../styles/dashboardStyles';

const quoteMetaEmpty = { knownJobIds: [], hasAnyByJobId: {} };

function minimalJob(overrides = {}) {
  return {
    id: 'drawer-job-1',
    status: 'PAID',
    createdAt: { _seconds: 1000 },
    updatedAt: { _seconds: 1000 },
    paymentState: 'released',
    paymentAmountCents: 11650,
    providerAmount: 14050,
    platformFeeAmount: 0,
    homeownerUid: 'h1',
    ...overrides,
  };
}

function renderDrawer({ api, drawerTask }) {
  return render(
    <TaskDetailsDrawer
      open
      onClose={jest.fn()}
      drawerTask={drawerTask}
      drawerJobId={drawerTask?.id || 'drawer-job-1'}
      quoteMeta={quoteMetaEmpty}
      users={[]}
      styles={dashboardStyles}
      formatAgeShort={() => '—'}
      getTaskCreatedAtMs={() => null}
      healthLabelForTask={() => ({ label: '', tone: 'success' })}
      onInviteExperts={jest.fn()}
      onViewTask={jest.fn()}
      onAddInternalNote={jest.fn()}
      api={api}
      isSuperAdmin={false}
      currentUserUid="admin-test"
    />,
  );
}

describe('TaskDetailsDrawer Financials', () => {
  it('with paymentFeeSummary shows compact totals and Released to Stripe; hides legacy labels', async () => {
    const drawerTask = minimalJob({
      paymentAmountCents: 11650,
      providerAmount: 14050,
    });

    const paymentFeeSummary = {
      available: true,
      paymentState: 'released',
      paymentStatus: '',
      releasedToStripe: true,
      clientPaidCents: 14050,
      baseClientPaidCents: 11650,
      variationClientPaidCents: 2400,
      taskioFeeCents: 0,
      expertReleasedCents: 14050,
      feeBenefitLabel: 'Founding Expert offer applied',
    };

    const api = {
      get: jest.fn().mockResolvedValue({
        data: {
          job: drawerTask,
          events: [],
          paymentFeeSummary,
        },
      }),
    };

    renderDrawer({ api, drawerTask });

    await waitFor(() => {
      expect(api.get).toHaveBeenCalledWith(`/api/admin/jobs/${drawerTask.id}`);
    });

    expect(await screen.findByText('Financials')).toBeInTheDocument();
    expect(screen.getByText('Client paid')).toBeInTheDocument();
    expect(screen.getByText('Base task amount')).toBeInTheDocument();
    expect(screen.getByText('Approved paid variations')).toBeInTheDocument();
    expect(screen.getByText('Taskio fee')).toBeInTheDocument();
    expect(screen.getByText('Expert released amount')).toBeInTheDocument();
    expect(screen.getByText('Release status')).toBeInTheDocument();
    expect(screen.getByText('Released to Stripe')).toBeInTheDocument();

    expect(screen.getAllByText(/\$116\.50/).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText(/\$24\.00/).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText(/\$140\.50/).length).toBeGreaterThanOrEqual(1);

    expect(screen.queryByText('Total')).not.toBeInTheDocument();
    expect(screen.queryByText('Platform fee')).not.toBeInTheDocument();
    expect(screen.queryByText('Expert payout')).not.toBeInTheDocument();
  });

  it('without paymentFeeSummary uses legacy fallback with Total row', async () => {
    const drawerTask = minimalJob();
    const api = {
      get: jest.fn().mockResolvedValue({
        data: {
          job: drawerTask,
          events: [],
        },
      }),
    };

    renderDrawer({ api, drawerTask });

    await waitFor(() => expect(api.get).toHaveBeenCalled());

    expect(await screen.findByText('Total')).toBeInTheDocument();
    expect(screen.getByText('Platform fee')).toBeInTheDocument();
    expect(screen.getByText('Expert payout')).toBeInTheDocument();
  });

  it('ignores bundle from another job until matching fetch completes', async () => {
    const taskA = minimalJob({
      id: 'job-a',
      paymentAmountCents: 9999,
      providerAmount: 8888,
    });
    const taskB = minimalJob({
      id: 'job-b',
      paymentAmountCents: 11650,
      providerAmount: 14050,
    });

    const api = jest.fn();

    api.mockResolvedValueOnce({
      data: {
        job: taskA,
        events: [],
        paymentFeeSummary: {
          available: true,
          paymentState: 'released',
          releasedToStripe: true,
          clientPaidCents: 8888,
          baseClientPaidCents: 8888,
          variationClientPaidCents: 0,
          taskioFeeCents: 0,
          expertReleasedCents: 8888,
        },
      },
    });

    api.mockResolvedValueOnce({
      data: {
        job: taskB,
        events: [],
        paymentFeeSummary: {
          available: true,
          paymentState: 'released',
          releasedToStripe: true,
          clientPaidCents: 14050,
          baseClientPaidCents: 11650,
          variationClientPaidCents: 2400,
          taskioFeeCents: 0,
          expertReleasedCents: 14050,
        },
      },
    });

    const { rerender } = render(
      <TaskDetailsDrawer
        open
        onClose={jest.fn()}
        drawerTask={taskA}
        drawerJobId="job-a"
        quoteMeta={quoteMetaEmpty}
        users={[]}
        styles={dashboardStyles}
        formatAgeShort={() => '—'}
        getTaskCreatedAtMs={() => null}
        healthLabelForTask={() => ({ label: '', tone: 'success' })}
        onInviteExperts={jest.fn()}
        onViewTask={jest.fn()}
        onAddInternalNote={jest.fn()}
        api={{ get: api }}
        isSuperAdmin={false}
        currentUserUid="admin-test"
      />,
    );

    await waitFor(() => expect(api).toHaveBeenCalledWith('/api/admin/jobs/job-a'));
    await waitFor(() => expect(screen.getAllByText(/\$88\.88/).length).toBeGreaterThan(0));

    rerender(
      <TaskDetailsDrawer
        open
        onClose={jest.fn()}
        drawerTask={taskB}
        drawerJobId="job-b"
        quoteMeta={quoteMetaEmpty}
        users={[]}
        styles={dashboardStyles}
        formatAgeShort={() => '—'}
        getTaskCreatedAtMs={() => null}
        healthLabelForTask={() => ({ label: '', tone: 'success' })}
        onInviteExperts={jest.fn()}
        onViewTask={jest.fn()}
        onAddInternalNote={jest.fn()}
        api={{ get: api }}
        isSuperAdmin={false}
        currentUserUid="admin-test"
      />,
    );

    await waitFor(() => expect(api).toHaveBeenCalledWith('/api/admin/jobs/job-b'));

    await waitFor(() => {
      expect(screen.getAllByText(/\$140\.50/).length).toBeGreaterThan(0);
      expect(screen.queryByText(/\$88\.88/)).not.toBeInTheDocument();
    });
  });
});
