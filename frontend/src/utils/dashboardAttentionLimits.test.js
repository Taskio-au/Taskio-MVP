import {
  getDashboardAttentionLimit,
  DASHBOARD_ATTENTION_BREAKPOINT_DESKTOP,
  DASHBOARD_ATTENTION_BREAKPOINT_TABLET,
} from './dashboardAttentionLimits';

describe('getDashboardAttentionLimit', () => {
  it('returns 6 at desktop breakpoint and above', () => {
    expect(getDashboardAttentionLimit(DASHBOARD_ATTENTION_BREAKPOINT_DESKTOP)).toBe(6);
    expect(getDashboardAttentionLimit(DASHBOARD_ATTENTION_BREAKPOINT_DESKTOP + 400)).toBe(6);
  });

  it('returns 4 for tablet widths', () => {
    expect(getDashboardAttentionLimit(DASHBOARD_ATTENTION_BREAKPOINT_TABLET)).toBe(4);
    expect(getDashboardAttentionLimit(DASHBOARD_ATTENTION_BREAKPOINT_DESKTOP - 1)).toBe(4);
  });

  it('returns 3 below tablet breakpoint', () => {
    expect(getDashboardAttentionLimit(DASHBOARD_ATTENTION_BREAKPOINT_TABLET - 1)).toBe(3);
    expect(getDashboardAttentionLimit(320)).toBe(3);
  });

  it('defaults wide width when innerWidth is not a finite number', () => {
    expect(getDashboardAttentionLimit(Number.NaN)).toBe(6);
  });
});
