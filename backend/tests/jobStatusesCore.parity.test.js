'use strict';

const core = require('../../shared/jobStatusesCore');
const backend = require('../src/constants/jobStatuses');

describe('jobStatuses parity (shared vs backend wrapper)', () => {
  it('exports identical JOB_STATUSES values', () => {
    expect(backend.JOB_STATUSES).toEqual(core.JOB_STATUSES);
  });

  it('normalizeStatus matches resolveJobStatus.status for samples', () => {
    const samples = ['OPEN', 'completed', 'awaiting_quotes', 'payment_required', 'garbage_xyz', '', null];
    for (const s of samples) {
      const r = core.resolveJobStatus(s);
      expect(backend.normalizeStatus(s)).toBe(r.status);
    }
  });

  it('keeps completed distinct from paid for every case variant', () => {
    expect(core.resolveJobStatus('completed').status).toBe(core.JOB_STATUSES.COMPLETED);
    expect(core.resolveJobStatus('Completed').status).toBe(core.JOB_STATUSES.COMPLETED);
    expect(core.resolveJobStatus('COMPLETED').status).toBe(core.JOB_STATUSES.COMPLETED);
    expect(core.resolveJobStatus('paid').status).toBe(core.JOB_STATUSES.PAID);
  });
});
