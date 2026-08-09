import React, { memo, useMemo } from 'react';
import { Link } from 'react-router-dom';
import StatusTag from '../../../StatusTag';
import { getStatusLabel, JOB_STATUSES, normalizeStatus } from '../../../constants/jobStatuses';
import { getTaskReferenceCode } from '../../../utils/taskReference';
import { toMillis, hasAdminPaymentIssue } from '../../../utils/adminOps';
import { topRiskTags } from '../../../utils/adminRiskSignals';
import { fullTaskDisplayTitle, getJobDisplayLayers } from '../../../utils/jobDisplayFromJob';

const JOB_STATUS_OPTIONS = [
  'all',
  JOB_STATUSES.OPEN,
  JOB_STATUSES.QUOTED,
  JOB_STATUSES.ASSIGNED,
  JOB_STATUSES.AWAITING_FUNDING,
  JOB_STATUSES.FUNDED,
  JOB_STATUSES.IN_PROGRESS,
  JOB_STATUSES.COMPLETED,
  JOB_STATUSES.PAID,
  JOB_STATUSES.CANCELLED,
  JOB_STATUSES.DISPUTED,
  JOB_STATUSES.REFUND_PENDING,
  JOB_STATUSES.REFUNDED,
];

function displayNameForUid(users, uid) {
  if (!uid || !Array.isArray(users)) return '—';
  const u = users.find((x) => String(x.uid) === String(uid));
  if (!u) return '—';
  const n = `${u.firstName || ''} ${u.lastName || ''}`.trim();
  return (u.displayName || u.name || n || u.email || '—').trim() || '—';
}

function fmtTs(job, field) {
  const ms = toMillis(job?.[field]);
  if (!ms) return '—';
  return new Date(ms).toLocaleString();
}

function statusLabel(status) {
  if (status === 'all') return 'All';
  return getStatusLabel(status);
}

const wfPillStyle = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 4,
  fontSize: 11,
  fontWeight: 700,
  padding: '3px 8px',
  borderRadius: 999,
  border: '1px solid #e5e7eb',
  background: '#f9fafb',
  color: '#374151',
};

function AdminJobQueuePanel({
  visible,
  variant = 'preview',
  styles,
  filteredJobs,
  totalMatchingCount,
  sortedJobs,
  jobSearchTerm,
  onJobSearchTermChange,
  jobQuickFilter,
  onClearJobQuickFilter,
  jobClientUidFilter,
  jobClientLabel,
  onClearJobClientFilter,
  sortOrder,
  onToggleSortOrder,
  jobStatusFilter,
  onJobStatusFilterChange,
  onApplyQuickNeedsAttention,
  onApplyQuickWaitingTooLong,
  onApplyQuickFlagged,
  onApplyQuickPaymentIssues,
  onApplyQuickDisputesStale,
  getTaskCreatedAtMs,
  quoteMeta,
  healthLabelForTask,
  formatAgeShort,
  onOpenTaskDrawer,
  onInviteExperts,
  users = [],
  jobWfOwner = '',
  jobWfSla = '',
  jobWfFollowup = '',
  jobWfPriority = '',
  onToggleJobWorkflow,
  onClearWorkflowFilters,
  onClearQueueFilters,
  jobWorkItemsLoading = false,
  teamLoad = null,
  selectedJobIds,
  onToggleSelectJob,
  onSelectAllVisible,
  onClearSelection,
  onBulkRequest,
  onOpenFullQueue,
}) {
  const isFull = variant === 'full';
  const known = useMemo(
    () => new Set(Array.isArray(quoteMeta?.knownJobIds) ? quoteMeta.knownJobIds : []),
    [quoteMeta?.knownJobIds]
  );
  const countsByStatus = useMemo(() => {
    const counts = {};
    for (const job of sortedJobs) {
      const normalized = normalizeStatus(job?.status);
      counts[normalized] = (counts[normalized] || 0) + 1;
    }
    return counts;
  }, [sortedJobs]);
  const hasAny = quoteMeta?.hasAnyByJobId || {};

  const hasWorkflowActive = Boolean(jobWfOwner || jobWfSla || jobWfFollowup || jobWfPriority);
  const hasExtraFilters = Boolean(
    jobQuickFilter || jobClientUidFilter || jobSearchTerm || jobStatusFilter !== 'all' || hasWorkflowActive
  );

  const wfPills = [];
  if (jobWfOwner === 'me') wfPills.push({ key: 'owner', label: 'Assigned to me', clear: () => onToggleJobWorkflow('owner', 'me') });
  if (jobWfOwner === 'unassigned') wfPills.push({ key: 'ou', label: 'Unassigned', clear: () => onToggleJobWorkflow('owner', 'unassigned') });
  if (jobWfSla === 'overdue') wfPills.push({ key: 'sla1', label: 'Overdue', clear: () => onToggleJobWorkflow('sla', 'overdue') });
  if (jobWfSla === 'due_soon') wfPills.push({ key: 'sla2', label: 'Due soon', clear: () => onToggleJobWorkflow('sla', 'due_soon') });
  if (jobWfFollowup === 'due') wfPills.push({ key: 'fu', label: 'Follow-up due', clear: () => onToggleJobWorkflow('followup', 'due') });
  if (jobWfPriority === 'high') wfPills.push({ key: 'pr', label: 'High priority', clear: () => onToggleJobWorkflow('wfPriority', 'high') });

  if (!visible) return null;

  const title = isFull ? 'Task queue' : 'Queue preview';
  const subtitle = isFull
    ? 'Full queue — search, filter, and bulk actions.'
    : 'Latest tasks matching your filters. Open the full queue for bulk actions and deeper triage.';

  const total = typeof totalMatchingCount === 'number' ? totalMatchingCount : filteredJobs.length;

  return (
    <div style={{ ...styles.card, ...(isFull ? {} : { marginTop: 8 }) }}>
      <div style={styles.cardHeader}>
        <div>
          <h2 style={{ ...styles.sectionTitle, fontSize: isFull ? 20 : 18 }}>{title}</h2>
          <p style={{ margin: '6px 0 0', fontSize: 13, color: '#6B7280', maxWidth: 720 }}>
            {subtitle}
          </p>
          {!isFull && typeof onOpenFullQueue === 'function' ? (
            <div style={{ marginTop: 10 }}>
              <button type="button" onClick={onOpenFullQueue} style={{ ...styles.button, borderRadius: 8 }}>
                Open full task queue
              </button>
            </div>
          ) : null}
        </div>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
          <input
            type="text"
            placeholder="Search title, ID, or TSK-xxxx"
            value={jobSearchTerm}
            onChange={(e) => onJobSearchTermChange(e.target.value)}
            style={styles.searchInput}
          />
          {!!jobQuickFilter && (
            <button
              type="button"
              onClick={onClearJobQuickFilter}
              style={{ ...styles.button, borderRadius: 999, background: '#111827', color: '#fff' }}
              title="Clear quick filter"
            >
              Quick filter on ×
            </button>
          )}
          {!!jobClientUidFilter && (
            <button
              type="button"
              onClick={onClearJobClientFilter}
              style={{ ...styles.buttonSecondary, borderRadius: 999 }}
              title={`Filtered by client: ${jobClientLabel}`}
            >
              Filtered by client: {jobClientLabel} ×
            </button>
          )}
          <button type="button" onClick={onToggleSortOrder} style={styles.button}>
            Sort: {sortOrder === 'newest' ? 'Newest' : 'Oldest'}
          </button>
        </div>
      </div>

      <div style={styles.filterPillsContainer}>
        {JOB_STATUS_OPTIONS.map((status) => (
          <button
            key={status}
            type="button"
            onClick={() => onJobStatusFilterChange(status)}
            style={jobStatusFilter === status ? styles.filterPillActive : styles.filterPill}
          >
            {statusLabel(status)}
            {status === 'all' && ` (${sortedJobs.length})`}
            {status !== 'all' && ` (${countsByStatus[status] || 0})`}
          </button>
        ))}
      </div>

      <div style={styles.quickFiltersRow}>
        <button
          type="button"
          onClick={onApplyQuickNeedsAttention}
          style={jobQuickFilter === 'no_offer_6h' ? styles.quickFilterActive : styles.quickFilter}
        >
          Needs attention
        </button>
        {isFull ? (
          <button
            type="button"
            onClick={onApplyQuickWaitingTooLong}
            style={jobQuickFilter === 'stale_open_24h' ? styles.quickFilterActive : styles.quickFilter}
          >
            Waiting too long
          </button>
        ) : null}
        <button
          type="button"
          onClick={onApplyQuickFlagged}
          style={jobQuickFilter === 'flagged' ? styles.quickFilterActive : styles.quickFilter}
          title="flaggedChatCount > 0 or disputeFlag"
        >
          Flagged
        </button>
        <button
          type="button"
          onClick={onApplyQuickPaymentIssues}
          style={jobQuickFilter === 'payment_issues' ? styles.quickFilterActive : styles.quickFilter}
          title="payment_failed or refund_failed"
        >
          Payment issues
        </button>
        <button
          type="button"
          onClick={onApplyQuickDisputesStale}
          style={jobQuickFilter === 'disputes_stale_24h' ? styles.quickFilterActive : styles.quickFilter}
          title="DISPUTED for more than 24h"
        >
          Disputes &gt;24h
        </button>
        {typeof onClearQueueFilters === 'function' && hasExtraFilters ? (
          <button type="button" onClick={onClearQueueFilters} style={styles.quickFilterClear}>
            Clear filters
          </button>
        ) : null}
      </div>

      {typeof onToggleJobWorkflow === 'function' ? (
        <div style={{ marginBottom: 10, marginTop: 4 }}>
          <details style={{ border: '1px solid #e5e7eb', borderRadius: 10, padding: '8px 12px', background: '#fafafa' }}>
            <summary style={{ cursor: 'pointer', fontWeight: 800, fontSize: 13, color: '#374151' }}>
              Workflow filters
              {hasWorkflowActive ? (
                <span style={{ marginLeft: 8, fontSize: 11, fontWeight: 700, color: '#2563eb' }}>(active)</span>
              ) : null}
            </summary>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 10 }}>
              <button type="button" onClick={() => onToggleJobWorkflow('owner', 'me')} style={jobWfOwner === 'me' ? styles.quickFilterActive : styles.quickFilter}>Assigned to me</button>
              <button type="button" onClick={() => onToggleJobWorkflow('owner', 'unassigned')} style={jobWfOwner === 'unassigned' ? styles.quickFilterActive : styles.quickFilter}>Unassigned</button>
              <button type="button" onClick={() => onToggleJobWorkflow('sla', 'overdue')} style={jobWfSla === 'overdue' ? styles.quickFilterActive : styles.quickFilter}>Overdue</button>
              <button type="button" onClick={() => onToggleJobWorkflow('sla', 'due_soon')} style={jobWfSla === 'due_soon' ? styles.quickFilterActive : styles.quickFilter}>Due soon</button>
              <button type="button" onClick={() => onToggleJobWorkflow('followup', 'due')} style={jobWfFollowup === 'due' ? styles.quickFilterActive : styles.quickFilter}>Follow-up due</button>
              <button type="button" onClick={() => onToggleJobWorkflow('wfPriority', 'high')} style={jobWfPriority === 'high' ? styles.quickFilterActive : styles.quickFilter}>High priority</button>
              {typeof onClearWorkflowFilters === 'function' && hasWorkflowActive ? (
                <button type="button" onClick={onClearWorkflowFilters} style={styles.quickFilterClear}>Clear workflow</button>
              ) : null}
            </div>
          </details>
          {wfPills.length > 0 ? (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8, alignItems: 'center' }}>
              <span style={{ fontSize: 11, color: '#9ca3af', fontWeight: 700 }}>Active</span>
              {wfPills.map((p) => (
                <button
                  key={p.key}
                  type="button"
                  onClick={p.clear}
                  style={wfPillStyle}
                  title="Remove filter"
                >
                  {p.label} <span aria-hidden="true">×</span>
                </button>
              ))}
            </div>
          ) : null}
          {jobWorkItemsLoading ? <span style={{ fontSize: 11, color: '#9ca3af' }}>Loading workflow…</span> : null}
        </div>
      ) : null}

      {isFull && teamLoad && (teamLoad.unassignedHighPriority > 0 || teamLoad.overdueAssigned > 0) ? (
        <div style={{ fontSize: 11, color: '#6b7280', marginBottom: 8 }}>
          Queue load: {teamLoad.unassignedHighPriority ?? 0} unassigned high-priority · {teamLoad.overdueAssigned ?? 0} overdue (assigned)
        </div>
      ) : null}

      {isFull && selectedJobIds && selectedJobIds.size > 0 && typeof onBulkRequest === 'function' ? (
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: 8,
            alignItems: 'center',
            padding: '10px 12px',
            marginBottom: 10,
            borderRadius: 10,
            border: '1px solid #e5e7eb',
            background: '#f9fafb',
          }}
        >
          <span style={{ fontSize: 12, fontWeight: 800 }}>{selectedJobIds.size} selected</span>
          <button type="button" style={styles.buttonSecondary} onClick={() => onBulkRequest('assign_to_me', 'Assign to me')}>Assign to me</button>
          <button type="button" style={styles.buttonSecondary} onClick={() => onBulkRequest('unassign', 'Unassign')}>Unassign</button>
          <button type="button" style={styles.buttonSecondary} onClick={() => onBulkRequest('mark_waiting', 'Mark waiting')}>Waiting</button>
          <button type="button" style={styles.buttonSecondary} onClick={() => onBulkRequest('snooze', 'Snooze 4h')}>Snooze 4h</button>
          <button type="button" style={styles.button} onClick={() => onBulkRequest('resolve', 'Resolve low-risk')}>Resolve (safe)</button>
          <button type="button" style={styles.quickFilterClear} onClick={onClearSelection}>Clear selection</button>
          <button type="button" style={styles.quickFilterClear} onClick={onSelectAllVisible}>Select visible</button>
        </div>
      ) : null}

      <div style={styles.scrollableList}>
        {filteredJobs.length > 0 ? (
          <ul style={styles.list}>
            {filteredJobs.map((job) => (
              <li
                key={job.id}
                style={{
                  ...styles.listItem,
                  ...(hasAdminPaymentIssue(job)
                    ? { backgroundColor: '#fff1f2', borderRadius: 8, padding: 8, marginBottom: 6 }
                    : {}),
                }}
              >
                {(() => {
                  const jid = String(job.id || '');
                  const sel = selectedJobIds && selectedJobIds.has(jid);
                  const nowMs = Date.now();
                  const createdMs = getTaskCreatedAtMs(job);
                  const ageH = createdMs ? (nowMs - createdMs) / (1000 * 60 * 60) : 0;
                  const hasOffer = known.has(String(job.id)) ? (hasAny[String(job.id)] === true) : true;
                  const health = healthLabelForTask({ job, hasOffer, nowMs });
                  const invites = Array.isArray(job.invitedTradieUids) ? job.invitedTradieUids.length : 0;
                  const offers = typeof job.offersCount === 'number'
                    ? job.offersCount
                    : (hasOffer ? '1+' : 0);
                  const risks = topRiskTags(job, 2);
                  return (
                    <>
                      <div style={styles.jobInfo}>
                        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                          {isFull && typeof onToggleSelectJob === 'function' ? (
                            <input
                              type="checkbox"
                              checked={!!sel}
                              onChange={() => onToggleSelectJob(jid)}
                              aria-label="Select task for bulk actions"
                            />
                          ) : null}
                          <Link to={`/admin/job/${job.id}`} style={styles.jobLink}>
                            {fullTaskDisplayTitle(job) || '(Untitled task)'}
                          </Link>
                          {(() => {
                            const tx = getJobDisplayLayers(job);
                            const line = [tx.categoryDisplayLabel, tx.taskTypeDisplayLabel].filter(Boolean).join(' · ');
                            return line ? (
                              <span style={{ fontSize: 11, color: '#6b7280', fontWeight: 600 }} title="Task taxonomy">
                                {line}
                              </span>
                            ) : null;
                          })()}
                          <span
                            style={{
                              ...styles.healthBadge,
                              ...(health.tone === 'danger' ? styles.healthDanger : null),
                              ...(health.tone === 'warning' ? styles.healthWarning : null),
                              ...(health.tone === 'info' ? styles.healthInfo : null),
                              ...(health.tone === 'success' ? styles.healthSuccess : null),
                            }}
                          >
                            {health.label}
                          </span>
                          {risks.map((r) => (
                            <span
                              key={r.label}
                              style={{
                                fontSize: 10,
                                fontWeight: 900,
                                padding: '2px 8px',
                                borderRadius: 999,
                                border: r.severity === 'HIGH' ? '1px solid #fecdd3' : '1px solid #fed7aa',
                                background: r.severity === 'HIGH' ? '#fff1f2' : '#fffbeb',
                                color: r.severity === 'HIGH' ? '#9f1239' : '#92400e',
                              }}
                            >
                              {r.label}
                            </span>
                          ))}
                        </div>
                        <div style={styles.jobMeta}>
                          <StatusTag status={job.status} />
                          <span style={styles.smallText}>• Ref: {getTaskReferenceCode(String(job.id))}</span>
                          <span style={styles.smallText}>
                            • Client:{' '}
                            {(job.homeownerName != null && String(job.homeownerName).trim() !== '')
                              ? job.homeownerName
                              : displayNameForUid(users, job.homeownerUid)}
                          </span>
                          <span style={styles.smallText}>
                            • Expert:{' '}
                            {(job.expertName != null && String(job.expertName).trim() !== '')
                              ? job.expertName
                              : displayNameForUid(users, job.acceptedTradieUid)}
                          </span>
                        </div>
                        <div style={{ ...styles.jobMeta, marginTop: 4 }}>
                          <span style={styles.smallText}>Created: {fmtTs(job, 'createdAt')}</span>
                          <span style={styles.smallText}> · Updated: {fmtTs(job, 'updatedAt')}</span>
                          <span style={styles.smallText}> · {Math.round(ageH)}h</span>
                          <span style={styles.smallText}> · Offers: {offers}</span>
                          <span style={styles.smallText}> · Invited: {invites}</span>
                          <span style={styles.smallText}> · Admin: {formatAgeShort(job.lastAdminActionAt)}</span>
                        </div>
                        <p style={styles.jobDescription}>
                          {(job.description || '').slice(0, 150)}
                          {job.description && job.description.length > 150 ? '...' : ''}
                        </p>
                      </div>

                      <div style={styles.rowActions}>
                        <button type="button" style={styles.rowActionBtn} onClick={() => onInviteExperts(job)}>
                          Invite experts
                        </button>
                        <button type="button" style={styles.rowActionBtnSecondary} onClick={() => onOpenTaskDrawer(job)}>
                          Details
                        </button>
                      </div>
                    </>
                  );
                })()}
              </li>
            ))}
          </ul>
        ) : (
          <p style={{ padding: 16, textAlign: 'center', opacity: 0.6 }}>
            {jobSearchTerm || jobStatusFilter !== 'all' ? 'No tasks match your filters.' : 'No tasks found.'}
          </p>
        )}
        {!isFull && total > filteredJobs.length ? (
          <p style={{ padding: '8px 16px 0', fontSize: 12, color: '#6b7280', textAlign: 'center' }}>
            Showing {filteredJobs.length} of {total} matching tasks
          </p>
        ) : null}
      </div>
    </div>
  );
}

export default memo(AdminJobQueuePanel);
