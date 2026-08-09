import { jobIdsMatchingWorkflowFilters } from './workflowQueueFilters';

describe('workflowQueueFilters', () => {
  it('matches owner=me and sla=overdue', () => {
    const items = [
      { entityId: 'j1', assignedTo: 'u1', slaState: 'overdue', status: 'open' },
      { entityId: 'j2', assignedTo: 'u2', slaState: 'overdue', status: 'open' },
    ];
    const set = jobIdsMatchingWorkflowFilters(items, { owner: 'me', sla: 'overdue' }, 'u1');
    expect(set.has('j1')).toBe(true);
    expect(set.has('j2')).toBe(false);
  });
});
