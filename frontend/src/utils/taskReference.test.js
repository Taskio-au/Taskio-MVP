import { formatTaskRefRowLabel, formatTaskReferenceLabel, getTaskReferenceCode } from './taskReference';

describe('taskReference', () => {
  it('returns deterministic TSK codes', () => {
    expect(getTaskReferenceCode('abc')).toBe(getTaskReferenceCode('abc'));
    expect(getTaskReferenceCode('abc')).toMatch(/^TSK-\d{4}$/);
  });

  it('formats label with hash prefix', () => {
    expect(formatTaskReferenceLabel('job-id-1')).toMatch(/^Task #TSK-\d{4}$/);
  });

  it('formats compact list ref', () => {
    expect(formatTaskRefRowLabel('job-id-1')).toMatch(/^Ref: TSK-\d{4}$/);
    expect(formatTaskRefRowLabel('')).toBe('');
  });
});
