import React from 'react';
import { render, screen } from '@testing-library/react';
import DashboardOverview from './DashboardOverview';

const styles = {
  statsContainer: {},
  tabContainer: {},
  tab: {},
  tabActive: {},
  attentionStrip: {},
  attentionCard: {},
  attentionValue: {},
  attentionLabel: {},
};

function renderOverview(pilotSupply, loadState = 'ok') {
  return render(
    <DashboardOverview
      styles={styles}
      error=""
      showDebugPanel={false}
      apiBaseUrl="http://localhost:8000"
      currentUser={{ uid: 'admin-1' }}
      claims={{ admin: true }}
      adminAccess={{ isAdmin: true }}
      onRefresh={() => {}}
      attention={{ loading: true, noOffer6h: 0, staleOpen24h: 0, disputesUnreviewed: 0, profileRequests48h: 0 }}
      stats={{
        totalJobs: 3,
        openJobs: 1,
        assignedJobs: 2,
        totalTradies: 1,
        verifiedTradies: 1,
        activeTradies: 1,
        totalHomeowners: 4,
      }}
      opsKpis={{ loading: false, completed7d: 0, avgFirstOfferHours7d: null, adminInterventionPct7d: null }}
      opsSummary={{ loading: false, failedPayments: 0, refundsInProgress: 0, disputesAwaiting: 0, riskHighJobs: 0, riskCriticalJobs: 0 }}
      workflowSummary={{ loading: false, assignedToMe: 0, overdue: 0, unassignedHighPriority: 0 }}
      activeTab="jobs"
      onTabChange={() => {}}
      counts={{ jobs: 3, tradies: 1, homeowners: 4 }}
      pilotSupplyLoadState={loadState}
      pilotSupply={pilotSupply}
    />
  );
}

describe('DashboardOverview pilot supply card', () => {
  it('uses pilot-supply launch-ready counts instead of the paginated Experts table', () => {
    renderOverview({
      targets: { launchReady: 15, afterActivationFloor: 12, categoryCoverageMinimum: 4, categoryCoverageTarget: 5 },
      totals: { experts: 9, technicallyEligible: 6, launchReady: 4, truncated: false, scanComplete: true },
      categoryCoverage: [{ category: 'Mounting', launchReadyCount: 4, minimum: 4, target: 5 }],
      geographyCoverage: [{ area: 'Richmond', launchReadyCount: 4 }],
    });

    expect(screen.getAllByText('Launch-ready experts').length).toBeGreaterThan(0);
    expect(screen.getAllByText('9 total · 6 technically eligible').length).toBeGreaterThan(0);
    expect(screen.queryByText('Task experts')).not.toBeInTheDocument();
    expect(screen.queryByText('1 verified and 1 active')).not.toBeInTheDocument();
  });
});
