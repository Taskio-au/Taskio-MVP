'use strict';

const { stableWorkItemId } = require('../src/services/adminWorkItemService');
const { computeDueAtMs, computeSlaState } = require('../src/services/workflowSlaService');

describe('Step 18 work items', () => {
  it('stableWorkItemId is deterministic', () => {
    const a = stableWorkItemId('job', 'j1', 'payment');
    const b = stableWorkItemId('job', 'j1', 'payment');
    expect(a).toBe(b);
    expect(a.startsWith('wi_')).toBe(true);
  });

  it('different categories get different ids', () => {
    expect(stableWorkItemId('job', 'j1', 'payment')).not.toBe(stableWorkItemId('job', 'j1', 'dispute'));
  });
});

describe('Step 18 SLA', () => {
  it('computeDueAtMs extends from createdAt', () => {
    const created = Date.now() - 3600000;
    const due = computeDueAtMs({
      category: 'payment',
      createdAtMs: created,
      nowMs: Date.now(),
      context: {},
    });
    expect(due).toBeGreaterThan(created);
  });

  it('computeSlaState marks overdue after dueAt', () => {
    const past = Date.now() - 60000;
    const r = computeSlaState({
      dueAtMs: past,
      snoozedUntilMs: null,
      nowMs: Date.now(),
      status: 'open',
      category: 'payment',
    });
    expect(r.slaState).toBe('overdue');
  });
});
