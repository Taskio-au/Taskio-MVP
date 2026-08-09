import React from 'react';
import AttentionStrip from './AttentionStrip';
import { Banner, Button, Card, PageHeader } from '../../../design/components';
import { colors, spacing } from '../../../design/tokens';

function MetricCard({ value, label, subtext, beta = false }) {
  return (
    <Card
      tone="default"
      padding={spacing.xl}
      style={{ display: 'grid', gap: 6, minHeight: 148 }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <div style={{ fontSize: 32, fontWeight: 800, color: colors.text }}>{value}</div>
        {beta ? <span style={{ fontSize: 11, fontWeight: 900, color: colors.textSubtle }}>beta</span> : null}
      </div>
      <div style={{ fontSize: 14, fontWeight: 700, color: colors.text }}>{label}</div>
      {subtext ? <div style={{ fontSize: 13, lineHeight: 1.5, color: colors.textSubtle }}>{subtext}</div> : null}
    </Card>
  );
}

export default function DashboardOverview({
  styles,
  error,
  showDebugPanel,
  apiBaseUrl,
  currentUser,
  claims,
  adminAccess,
  onRefresh,
  attention,
  onGoAttention,
  onGoStaleProfileRequests,
  onGoWorkflowQueue,
  stats,
  opsKpis,
  opsSummary,
  workflowSummary,
  activeTab,
  onTabChange,
  counts,
}) {
  return (
    <>
      <PageHeader
        eyebrow="Operations"
        title="Admin dashboard"
        description="Monitor task flow, triage issues, and keep the marketplace healthy with clearer operational signals."
        actions={<Button variant="secondary" onClick={onRefresh}>Refresh data</Button>}
        style={{ marginBottom: spacing.xl }}
      />

      {error ? (
        <Banner
          tone="danger"
          title="Admin data needs attention"
          message={error}
          style={{ marginBottom: spacing.lg }}
        />
      ) : null}

      {showDebugPanel ? (
        <Card tone="muted" style={{ marginBottom: spacing.lg }}>
          <div style={{ display: 'grid', gap: 6, fontSize: 13, color: colors.textMuted }}>
            <div><strong>API:</strong> {apiBaseUrl}</div>
            <div><strong>UID:</strong> {currentUser?.uid || '-'}</div>
            <div><strong>Claims:</strong> {claims ? JSON.stringify(claims) : 'No claims loaded'}</div>
            {process.env.NODE_ENV === 'development' && adminAccess ? (
              <>
                <div>
                  <strong>Resolved access:</strong>{' '}
                  role={adminAccess.role || '—'} · superAdmin={String(!!adminAccess.isSuperAdmin)} · source={adminAccess.source || '—'}
                </div>
                {adminAccess.claimMismatchWarning ? (
                  <div style={{ color: colors.text, fontWeight: 700 }}>
                    Mismatch: {adminAccess.claimMismatchWarning}
                  </div>
                ) : null}
              </>
            ) : null}
          </div>
        </Card>
      ) : null}

      <div style={{ marginBottom: spacing.xl }}>
        <div style={{ marginBottom: 12, fontSize: 12, fontWeight: 900, letterSpacing: '0.08em', textTransform: 'uppercase', color: colors.primaryHover }}>
          Immediate attention
        </div>
        <AttentionStrip
          attention={attention}
          opsSummary={opsSummary}
          onGoAttention={onGoAttention}
          onGoStaleProfileRequests={onGoStaleProfileRequests}
          styles={styles}
        />
        <div style={{ marginTop: 14, display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center' }}>
          <span style={{ fontSize: 12, fontWeight: 900, letterSpacing: '0.06em', textTransform: 'uppercase', color: colors.textSubtle }}>
            Workflow
          </span>
          <button
            type="button"
            onClick={() => onGoWorkflowQueue?.({ owner: 'me' })}
            style={{ fontSize: 13, color: colors.text, fontWeight: 700, background: 'none', border: 'none', padding: 0, cursor: 'pointer', textDecoration: 'underline' }}
          >
            Assigned to me:{' '}
            <strong>{workflowSummary?.loading ? '—' : (workflowSummary?.assignedToMe ?? 0)}</strong>
          </button>
          <button
            type="button"
            onClick={() => onGoWorkflowQueue?.({ sla: 'overdue' })}
            style={{ fontSize: 13, color: colors.text, fontWeight: 700, background: 'none', border: 'none', padding: 0, cursor: 'pointer', textDecoration: 'underline' }}
          >
            Overdue:{' '}
            <strong style={{ color: (workflowSummary?.overdue || 0) > 0 ? '#b91c1c' : colors.text }}>
              {workflowSummary?.loading ? '—' : (workflowSummary?.overdue ?? 0)}
            </strong>
          </button>
          <button
            type="button"
            onClick={() => onGoWorkflowQueue?.({ owner: 'unassigned', wfPriority: 'high' })}
            style={{ fontSize: 13, color: colors.text, fontWeight: 700, background: 'none', border: 'none', padding: 0, cursor: 'pointer', textDecoration: 'underline' }}
          >
            Unassigned (high+):{' '}
            <strong>{workflowSummary?.loading ? '—' : (workflowSummary?.unassignedHighPriority ?? 0)}</strong>
          </button>
        </div>
      </div>

      <div style={{ marginBottom: spacing.xl }}>
        <div style={{ marginBottom: 12, fontSize: 12, fontWeight: 900, letterSpacing: '0.08em', textTransform: 'uppercase', color: colors.textSubtle }}>
          Risk & payments
        </div>
        <div style={styles.statsContainer}>
          <MetricCard
            value={opsSummary?.loading ? '—' : (opsSummary?.failedPayments ?? '—')}
            label="Failed payments"
            subtext="Funding or refund failures needing review."
          />
          <MetricCard
            value={opsSummary?.loading ? '—' : (opsSummary?.refundsInProgress ?? '—')}
            label="Refunds in progress"
            subtext="Tasks in refund pending."
          />
          <MetricCard
            value={opsSummary?.loading ? '—' : (opsSummary?.disputesAwaiting ?? '—')}
            label="Open disputes"
            subtext="All tasks currently disputed."
          />
          <MetricCard
            value={opsSummary?.loading ? '—' : (Number(opsSummary?.riskHighJobs || 0) + Number(opsSummary?.riskCriticalJobs || 0))}
            label="Elevated risk tasks"
            subtext={`Automated score: high ${opsSummary?.riskHighJobs ?? 0} · critical ${opsSummary?.riskCriticalJobs ?? 0}`}
          />
        </div>
      </div>

      <div style={{ marginBottom: spacing.xl }}>
        <div style={{ marginBottom: 12, fontSize: 12, fontWeight: 900, letterSpacing: '0.08em', textTransform: 'uppercase', color: colors.textSubtle }}>
          Marketplace overview
        </div>
        <div style={styles.statsContainer}>
          <MetricCard
            value={stats.totalJobs}
            label="Total tasks"
            subtext={`${stats.openJobs} open and ${stats.assignedJobs} quote accepted`}
          />
          <MetricCard
            value={stats.totalTradies}
            label="Task experts"
            subtext={`${stats.verifiedTradies} verified and ${stats.activeTradies} active`}
          />
          <MetricCard
            value={stats.totalHomeowners}
            label="Clients"
            subtext="All client accounts currently visible to operations."
          />
        </div>
      </div>

      <div style={{ marginBottom: spacing.xl }}>
        <div style={{ marginBottom: 12, fontSize: 12, fontWeight: 900, letterSpacing: '0.08em', textTransform: 'uppercase', color: colors.textSubtle }}>
          Last 7 days
        </div>
        <div style={styles.statsContainer}>
          <MetricCard
            value={opsKpis.loading ? '—' : (opsKpis.avgFirstOfferHours7d ?? '—')}
            label="Average time to first offer"
            subtext="Best-effort operational KPI from quote timestamps."
            beta
          />
          <MetricCard
            value={opsKpis.loading ? '—' : opsKpis.completed7d}
            label="Tasks completed"
            subtext="Completed or paid in the last 7 days."
          />
          <MetricCard
            value={opsKpis.loading ? '—' : (opsKpis.adminInterventionPct7d === null ? '—' : `${opsKpis.adminInterventionPct7d}%`)}
            label="Tasks needing admin intervention"
            subtext="Based on disputes and admin-attention flags."
            beta
          />
        </div>
      </div>

      <div style={{ ...styles.tabContainer, marginTop: 28 }} role="tablist" aria-label="Admin dashboard views">
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'jobs'}
          style={activeTab === 'jobs' ? styles.tabActive : styles.tab}
          onClick={() => onTabChange('jobs')}
        >
          Tasks ({counts.jobs})
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'tradies'}
          style={activeTab === 'tradies' ? styles.tabActive : styles.tab}
          onClick={() => onTabChange('tradies')}
        >
          Experts ({counts.tradies})
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'homeowners'}
          style={activeTab === 'homeowners' ? styles.tabActive : styles.tab}
          onClick={() => onTabChange('homeowners')}
        >
          Clients ({counts.homeowners})
        </button>
      </div>
    </>
  );
}
