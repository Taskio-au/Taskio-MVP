import React from 'react';
import Banner from '../../../design/components/Banner';
import { getStatusLabel } from '../../../constants/jobStatuses';
import { formatAgePrecise } from '../../../utils/adminOps';
import './JobAttentionQueue.css';

function priorityClass(priority) {
  const key = String(priority || '').toLowerCase();
  if (key === 'critical') return 'critical';
  if (key === 'high') return 'high';
  if (key === 'medium') return 'medium';
  return 'low';
}

function JobAttentionRow({ job, nowMs }) {
  const createdLabel = job.createdAtMs ? new Date(job.createdAtMs).toISOString() : '';
  const suitable = job.suitableSupplyReliable
    ? String(job.suitableLaunchReadyCount)
    : '—';
  const payment = job.paymentState ? String(job.paymentState).replace(/_/g, ' ') : '—';
  return (
    <article className="ad-job-attention__row" role="row">
      <p className={`ad-job-attention__priority ad-job-attention__priority--${priorityClass(job.priority)}`} role="cell">
        {job.priority}
      </p>
      <div role="cell">
        <p className="ad-job-attention__ref">{job.reference}</p>
        <p className="ad-job-attention__meta">{job.category} · {job.area}</p>
      </div>
      <p className="ad-job-attention__age" title={createdLabel || undefined} role="cell">
        <span className="ad-job-attention__sr">Age </span>
        {formatAgePrecise(job.createdAtMs, nowMs)}
      </p>
      <p className="ad-job-attention__counts" role="cell">
        Invited {job.inviteCount} · Suitable {suitable} · Quotes {job.quoteCount}
      </p>
      <p className="ad-job-attention__status" role="cell">
        {getStatusLabel(job.jobStatus)} · {payment}
      </p>
      <div role="cell">
        <p className="ad-job-attention__reason">{job.reasonLabel}</p>
        {job.secondary?.length ? (
          <p className="ad-job-attention__secondary">
            {job.secondary.map((row) => row.label).join(' · ')}
          </p>
        ) : null}
      </div>
      <div className="ad-job-attention__actions" role="cell">
        <a className="ad-job-attention__action" href={`/admin/job/${encodeURIComponent(job.jobId)}`}>
          View job
        </a>
        {job.action === 'invite_experts' ? (
          <a className="ad-job-attention__action" href={`/admin/job/${encodeURIComponent(job.jobId)}`}>
            Invite Experts
          </a>
        ) : null}
        {job.action === 'review_payment' ? (
          <a className="ad-job-attention__action" href={`/admin/job/${encodeURIComponent(job.jobId)}`}>
            Review payment
          </a>
        ) : null}
        {job.action === 'review_completion' ? (
          <a className="ad-job-attention__action" href={`/admin/job/${encodeURIComponent(job.jobId)}`}>
            Review completion
          </a>
        ) : null}
      </div>
    </article>
  );
}

export default function JobAttentionQueue({ loadState = 'loading', snapshot = null, nowMs = Date.now() }) {
  if (loadState === 'loading') {
    return (
      <section className="ad-job-attention" aria-labelledby="ad-job-attention-heading" aria-busy="true">
        <h2 id="ad-job-attention-heading" className="ad-job-attention__eyebrow">Job attention queue</h2>
        <p className="ad-job-attention__helper">Loading jobs that need operator action…</p>
        <div className="ad-job-attention__skeleton" aria-hidden="true" />
      </section>
    );
  }

  if (loadState === 'error' || !snapshot) {
    return (
      <section className="ad-job-attention" aria-labelledby="ad-job-attention-heading">
        <h2 id="ad-job-attention-heading" className="ad-job-attention__eyebrow">Job attention queue</h2>
        <Banner tone="danger" title="ATTENTION DATA UNAVAILABLE" message="Pilot job attention data could not be loaded." />
      </section>
    );
  }

  const incomplete = snapshot.totals?.scanComplete === false || snapshot.totals?.truncated === true;
  const jobs = Array.isArray(snapshot.jobs) ? snapshot.jobs : [];

  return (
    <section className="ad-job-attention" aria-labelledby="ad-job-attention-heading">
      <h2 id="ad-job-attention-heading" className="ad-job-attention__eyebrow">Job attention queue</h2>
      <p className="ad-job-attention__helper">
        Internal pilot triggers: 0 quotes after 60 minutes, or exactly 1 quote after 3 hours.
        These are not customer SLAs. Funded jobs are not flagged from funding age alone.
        Completed and released jobs are excluded.
      </p>

      {incomplete ? (
        <Banner
          tone="warning"
          title="ATTENTION DATA INCOMPLETE"
          message="The job attention scan hit its current cap, so this queue is not exhaustive."
        />
      ) : null}

      {!incomplete && jobs.length === 0 ? (
        <p className="ad-job-attention__empty">No active pilot jobs currently need attention.</p>
      ) : null}

      {jobs.length > 0 ? (
        <div className="ad-job-attention__table" role="table" aria-label="Jobs needing attention">
          <div className="ad-job-attention__head" role="row">
            <span role="columnheader">Priority</span>
            <span role="columnheader">Job</span>
            <span role="columnheader">Age</span>
            <span role="columnheader">Coverage</span>
            <span role="columnheader">Status</span>
            <span role="columnheader">Reason</span>
            <span role="columnheader">Action</span>
          </div>
          {jobs.map((job) => (
            <JobAttentionRow key={job.jobId} job={job} nowMs={nowMs} />
          ))}
        </div>
      ) : null}
    </section>
  );
}
