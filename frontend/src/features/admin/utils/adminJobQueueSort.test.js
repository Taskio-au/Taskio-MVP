import { compareJobsForQueueSort, jobAttentionScore } from './adminJobQueueSort';

describe('adminJobQueueSort', () => {
  const quoteMeta = { hasAnyByJobId: {}, knownJobIds: [] };

  it('sorts by created time primary for newest', () => {
    const a = { id: 'a', createdAt: { _seconds: 100 } };
    const b = { id: 'b', createdAt: { _seconds: 200 } };
    expect(compareJobsForQueueSort(a, b, 'newest', quoteMeta)).toBeGreaterThan(0);
    expect(compareJobsForQueueSort(b, a, 'newest', quoteMeta)).toBeLessThan(0);
  });

  it('sorts by created time primary for oldest', () => {
    const a = { id: 'a', createdAt: { _seconds: 100 } };
    const b = { id: 'b', createdAt: { _seconds: 200 } };
    expect(compareJobsForQueueSort(a, b, 'oldest', quoteMeta)).toBeLessThan(0);
  });

  it('uses attention as tie-breaker when timestamps equal', () => {
    const ts = { _seconds: Math.floor(Date.now() / 1000) - 60 };
    const low = { id: 'l', status: 'COMPLETED', createdAt: ts, requiresAdminAttention: false };
    const high = { id: 'h', status: 'COMPLETED', createdAt: ts, requiresAdminAttention: true };
    expect(jobAttentionScore(high, quoteMeta)).toBeGreaterThan(jobAttentionScore(low, quoteMeta));
    expect(compareJobsForQueueSort(low, high, 'newest', quoteMeta)).toBeGreaterThan(0);
  });
});
