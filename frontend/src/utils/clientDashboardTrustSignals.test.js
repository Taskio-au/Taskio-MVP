import { JOB_STATUSES } from '../constants/jobStatuses';
import {
  expertTrustBadgeLabel,
  formatAssignedExpertLine,
  hasExpertRatingRow,
  showAwaitingQuotesResponseLine,
} from './clientDashboardTrustSignals';

describe('clientDashboardTrustSignals', () => {
  it('shows response line only when label exists from API', () => {
    expect(
      showAwaitingQuotesResponseLine({ quoteCount: 0, avgResponseTimeLabel: '2 hrs' }, JOB_STATUSES.OPEN)
    ).toBe(true);
    expect(showAwaitingQuotesResponseLine({ quoteCount: 0 }, JOB_STATUSES.OPEN)).toBe(false);
  });

  it('formats assigned line from firstName and lastInitial', () => {
    expect(formatAssignedExpertLine({ firstName: 'John', lastInitial: 'D.' })).toBe('Assigned to John D.');
    expect(formatAssignedExpertLine({ name: 'Jane Smith' })).toBe('Assigned to Jane Smith');
  });

  it('requires rating and positive reviewsCount for rating row', () => {
    expect(hasExpertRatingRow({ rating: 4.8, reviewsCount: 3 })).toBe(true);
    expect(hasExpertRatingRow({ rating: 4.8, reviewsCount: 0 })).toBe(false);
    expect(hasExpertRatingRow({})).toBe(false);
  });

  it('badge labels from real rating only', () => {
    expect(expertTrustBadgeLabel(4.9)).toBe('Top rated');
    expect(expertTrustBadgeLabel(4.6)).toBe('Highly rated');
    expect(expertTrustBadgeLabel(4.0)).toBe(null);
  });
});
