'use strict';

const { workItemAllowsBulkResolve } = require('../src/services/adminWorkItemService');

describe('Step 19 bulk resolve rules', () => {
  it('blocks payment / dispute / high priority / overdue', () => {
    expect(workItemAllowsBulkResolve({ status: 'open', priority: 'low', category: 'risk', slaState: 'ok' })).toBe(true);
    expect(workItemAllowsBulkResolve({ status: 'open', priority: 'high', category: 'risk', slaState: 'ok' })).toBe(false);
    expect(workItemAllowsBulkResolve({ status: 'open', priority: 'low', category: 'payment', slaState: 'ok' })).toBe(false);
    expect(workItemAllowsBulkResolve({ status: 'open', priority: 'low', category: 'risk', slaState: 'overdue' })).toBe(false);
    expect(workItemAllowsBulkResolve({ status: 'resolved', priority: 'low', category: 'risk', slaState: 'ok' })).toBe(false);
  });
});
