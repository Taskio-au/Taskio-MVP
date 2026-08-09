import { JOB_STATUSES } from '../constants/jobStatuses';
import {
  filterExpertJobsBySearch,
  getExpertContextualBadge,
  getExpertDashboardCTA,
  getExpertJobCardStatusPill,
  getExpertJobStatus,
  getExpertNeedsAttentionTier,
  isExpertQuoteAttentionJob,
  selectNeedsAttentionJobs,
  sortExpertJobs,
} from './tradieDashboard';

describe('expert dashboard status labels', () => {
  it('reuses the shared lifecycle vocabulary for expert cards', () => {
    expect(getExpertJobStatus({ status: JOB_STATUSES.FUNDED })).toMatchObject({
      label: 'Payment secured',
    });
    expect(getExpertJobStatus({ status: JOB_STATUSES.IN_PROGRESS })).toMatchObject({
      label: 'Work in progress',
    });
    expect(getExpertJobStatus({ status: JOB_STATUSES.ASSIGNED })).toMatchObject({
      label: 'Expert selected',
    });
  });

  it('surfaces unread message badges ahead of generic status nudges', () => {
    expect(getExpertContextualBadge({ status: JOB_STATUSES.IN_PROGRESS }, 2)).toMatchObject({
      label: '2 new messages',
    });
  });
});

describe('getExpertDashboardCTA', () => {
  it('prefers Open messages when chat is enabled and there is unread activity', () => {
    expect(getExpertDashboardCTA({ status: JOB_STATUSES.IN_PROGRESS }, 2)).toMatchObject({
      label: 'Open messages',
      pathSuffix: '#chat',
    });
  });

  it('uses Review approval when work is completed and awaiting homeowner sign-off', () => {
    expect(getExpertDashboardCTA({ status: JOB_STATUSES.COMPLETED }, 0)).toMatchObject({
      label: 'Review approval',
      pathSuffix: '',
    });
  });

  it('uses Manage task for funded or in-progress work without unread messages', () => {
    expect(getExpertDashboardCTA({ status: JOB_STATUSES.FUNDED }, 0).label).toBe('Manage task');
    expect(getExpertDashboardCTA({ status: JOB_STATUSES.IN_PROGRESS }, 0).label).toBe('Manage task');
  });

  it('uses Submit quote when the expert still owes a quote or revision', () => {
    expect(
      getExpertDashboardCTA({ status: JOB_STATUSES.OPEN, expertNeedsQuoteAction: true }, 0).label
    ).toBe('Submit quote');
    expect(
      getExpertDashboardCTA({ status: JOB_STATUSES.QUOTED, expertNeedsQuoteAction: true }, 0).label
    ).toBe('Submit quote');
  });

  it('does not offer Submit quote once the server marks quoting complete', () => {
    expect(
      getExpertDashboardCTA({ status: JOB_STATUSES.OPEN, expertNeedsQuoteAction: false }, 0).label
    ).toBe('View task details');
    expect(
      getExpertDashboardCTA({ status: JOB_STATUSES.QUOTED, expertNeedsQuoteAction: false }, 0).label
    ).toBe('View task details');
  });
});

describe('getExpertJobCardStatusPill', () => {
  it('shows Quote requested when quoting is still required', () => {
    expect(
      getExpertJobCardStatusPill({ status: JOB_STATUSES.OPEN, expertNeedsQuoteAction: true }, 0).label
    ).toBe('Quote requested');
  });
});

describe('expert tasks list helpers', () => {
  const ts = (sec) => ({ _seconds: sec, _nanoseconds: 0 });

  it('filters by search across title and location', () => {
    const jobs = [
      { id: 'a', title: 'Paint fence', description: 'x', location: 'Brunswick', status: JOB_STATUSES.OPEN, createdAt: ts(1) },
      { id: 'b', title: 'TV mount', description: 'wall', location: 'St Kilda', status: JOB_STATUSES.OPEN, createdAt: ts(2) },
    ];
    expect(filterExpertJobsBySearch(jobs, 'kilda')).toHaveLength(1);
    expect(filterExpertJobsBySearch(jobs, 'tv').map((j) => j.id)).toEqual(['b']);
    expect(filterExpertJobsBySearch(jobs, '').length).toBe(2);
  });

  it('matches catalogue-backed wording when stored title is abbreviated', () => {
    const jobs = [
      {
        id: 'mirror-job',
        title: 'Mirrors in Docklands',
        jobType: 'mounting_mirrors',
        locationSuburb: 'Docklands',
        description: '',
        location: 'Docklands, VIC',
        status: JOB_STATUSES.OPEN,
        createdAt: ts(1),
      },
    ];
    expect(filterExpertJobsBySearch(jobs, 'hang mirrors').map((j) => j.id)).toEqual(['mirror-job']);
  });

  it('filters by short task reference and raw job id (compat)', () => {
    const jobs = [
      { id: 'job-alpha-1', title: 'Paint fence', description: '', location: '', status: JOB_STATUSES.OPEN, createdAt: ts(1) },
      { id: 'job-beta-2', title: 'Other', description: '', location: '', status: JOB_STATUSES.OPEN, createdAt: ts(2), taskNumber: 9001 },
    ];
    expect(filterExpertJobsBySearch(jobs, 'job-alpha-1')).toHaveLength(1);
    expect(filterExpertJobsBySearch(jobs, 'TSK-9001').map((j) => j.id)).toEqual(['job-beta-2']);
    expect(filterExpertJobsBySearch(jobs, '9001').map((j) => j.id)).toEqual(['job-beta-2']);
  });

  it('sorts by newest and title', () => {
    const jobs = [
      { id: 'old', title: 'Zebra', status: JOB_STATUSES.OPEN, createdAt: ts(10) },
      { id: 'new', title: 'Alpha', status: JOB_STATUSES.OPEN, createdAt: ts(99) },
    ];
    expect(sortExpertJobs(jobs, 'newest').map((j) => j.id)).toEqual(['new', 'old']);
    expect(sortExpertJobs(jobs, 'title').map((j) => j.id)).toEqual(['new', 'old']);
  });

  it('prioritises needs-attention queue with unread messages on chat-enabled tasks', () => {
    const jobs = [
      { id: 'u1', title: 'A', description: '', location: '', status: JOB_STATUSES.IN_PROGRESS, createdAt: ts(1) },
      { id: 'u2', title: 'B', description: '', location: '', status: JOB_STATUSES.IN_PROGRESS, createdAt: ts(2) },
    ];
    const unread = { u2: 2 };
    const picked = selectNeedsAttentionJobs(jobs, unread, { limit: 2 });
    expect(picked[0].id).toBe('u2');
  });

  it('surfaces new quote requests ahead of idle open invites and does not duplicate rows', () => {
    const jobs = [
      {
        id: 'wip',
        title: 'WIP',
        description: '',
        location: '',
        status: JOB_STATUSES.IN_PROGRESS,
        createdAt: ts(1),
        expertNeedsQuoteAction: false,
      },
      {
        id: 'quote',
        title: 'Quote me',
        description: '',
        location: '',
        status: JOB_STATUSES.OPEN,
        createdAt: ts(99),
        expertNeedsQuoteAction: true,
      },
      {
        id: 'idle',
        title: 'Idle open',
        description: '',
        location: '',
        status: JOB_STATUSES.OPEN,
        createdAt: ts(50),
        expertNeedsQuoteAction: false,
      },
    ];
    const picked = selectNeedsAttentionJobs(jobs, {}, { limit: 3 });
    expect(picked.map((j) => j.id)).toEqual(['wip', 'quote', 'idle']);
    expect(new Set(picked.map((j) => j.id)).size).toBe(picked.length);
  });

  it('ranks work in progress above quote requests', () => {
    expect(getExpertNeedsAttentionTier({ id: 'a', status: JOB_STATUSES.IN_PROGRESS }, {})).toBeGreaterThan(
      getExpertNeedsAttentionTier({ id: 'b', status: JOB_STATUSES.OPEN, expertNeedsQuoteAction: true }, {})
    );
  });

  it('reserves a slot so a quote-action job is not dropped when six higher-tier tasks fill the list', () => {
    const jobs = Array.from({ length: 6 }, (_, i) => ({
      id: `wip-${i}`,
      title: `W${i}`,
      description: '',
      location: '',
      status: JOB_STATUSES.IN_PROGRESS,
      expertNeedsQuoteAction: false,
      createdAt: ts(200 - i),
    }));
    jobs.push({
      id: 'quote-new',
      title: 'Quote me',
      description: '',
      location: '',
      status: JOB_STATUSES.OPEN,
      expertNeedsQuoteAction: true,
      createdAt: ts(9999),
    });
    const picked = selectNeedsAttentionJobs(jobs, {}, { limit: 6 });
    expect(picked.some((j) => j.id === 'quote-new')).toBe(true);
    expect(new Set(picked.map((j) => j.id)).size).toBe(6);
  });

  it('caps visible rows at the requested limit after sorting', () => {
    const jobs = Array.from({ length: 12 }, (_, i) => ({
      id: `j-${i}`,
      title: `T${i}`,
      description: '',
      location: '',
      status: JOB_STATUSES.OPEN,
      expertNeedsQuoteAction: false,
      createdAt: ts(1000 - i),
    }));
    const picked = selectNeedsAttentionJobs(jobs, {}, { limit: 4 });
    expect(picked).toHaveLength(4);
  });

  it('does not treat a submitted quote as quote-needed for inclusion', () => {
    expect(
      isExpertQuoteAttentionJob({
        id: 'x',
        status: JOB_STATUSES.QUOTED,
        expertNeedsQuoteAction: false,
      })
    ).toBe(false);
  });
});
