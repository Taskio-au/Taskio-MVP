import { buildDashboardTabUrl } from './adminDashboardTabUrl';

describe('buildDashboardTabUrl', () => {
  it('sets tab and preserves other params', () => {
    const u = buildDashboardTabUrl('?q=foo&status=OPEN', 'tradies');
    expect(u).toContain('tab=tradies');
    expect(u).toContain('q=foo');
    expect(u).toContain('status=OPEN');
  });
});
