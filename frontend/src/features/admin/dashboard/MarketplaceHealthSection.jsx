import React, { useMemo, useState } from 'react';
import Banner from '../../../design/components/Banner';
import {
  MARKETPLACE_RANGES,
  formatFraction,
  formatLastActive,
  formatMinutes,
  formatPct,
  toneClass,
} from './marketplaceMetricsDisplay';
import './MarketplaceHealthSection.css';

function HealthCard({ label, fraction, percent, detail, tone }) {
  return (
    <article className="ad-mkt-health__card">
      <h3 className="ad-mkt-health__card-label">{label}</h3>
      {fraction ? <p className="ad-mkt-health__card-fraction">{fraction}</p> : null}
      {percent ? <p className="ad-mkt-health__card-pct">{percent}</p> : null}
      {detail ? <p className="ad-mkt-health__card-detail">{detail}</p> : null}
      {tone ? (
        <p className={`ad-mkt-health__tone ad-mkt-health__tone--${toneClass(tone)}`}>{tone}</p>
      ) : null}
    </article>
  );
}

function compareExperts(a, b, sortKey) {
  if (sortKey === 'invitations') {
    if (b.invitations !== a.invitations) return b.invitations - a.invitations;
  } else if (sortKey === 'lastActivityAt') {
    if ((b.lastActivityAtMs || 0) !== (a.lastActivityAtMs || 0)) {
      return (b.lastActivityAtMs || 0) - (a.lastActivityAtMs || 0);
    }
  } else {
    const ar = a.responseRate == null ? 2 : a.responseRate;
    const br = b.responseRate == null ? 2 : b.responseRate;
    if (ar !== br) return ar - br;
  }
  if (b.invitations !== a.invitations) return b.invitations - a.invitations;
  return (b.lastActivityAtMs || 0) - (a.lastActivityAtMs || 0);
}

export default function MarketplaceHealthSection({
  loadState = 'loading',
  snapshot = null,
  range = '7d',
  onRangeChange,
  nowMs = Date.now(),
}) {
  const [sortKey, setSortKey] = useState('responseRate');
  const experts = useMemo(() => {
    const rows = Array.isArray(snapshot?.experts) ? snapshot.experts.slice() : [];
    return rows.sort((a, b) => compareExperts(a, b, sortKey));
  }, [snapshot, sortKey]);

  const rangeButtons = (
    <div className="ad-mkt-health__ranges" role="group" aria-label="Marketplace metrics range">
      {MARKETPLACE_RANGES.map((item) => (
        <button
          key={item.key}
          type="button"
          className={`ad-mkt-health__range${range === item.key ? ' ad-mkt-health__range--active' : ''}`}
          aria-pressed={range === item.key}
          onClick={() => onRangeChange?.(item.key)}
        >
          {item.label}
        </button>
      ))}
    </div>
  );

  if (loadState === 'loading') {
    return (
      <section className="ad-mkt-health" aria-labelledby="ad-mkt-health-heading" aria-busy="true">
        <h2 id="ad-mkt-health-heading" className="ad-mkt-health__eyebrow">Marketplace health</h2>
        {rangeButtons}
        <p className="ad-mkt-health__helper">Loading quote coverage, funnel, and Expert responsiveness…</p>
        <div className="ad-mkt-health__skeleton" aria-hidden="true" />
      </section>
    );
  }

  if (loadState === 'error' || !snapshot) {
    return (
      <section className="ad-mkt-health" aria-labelledby="ad-mkt-health-heading">
        <h2 id="ad-mkt-health-heading" className="ad-mkt-health__eyebrow">Marketplace health</h2>
        {rangeButtons}
        <Banner tone="danger" title="METRICS DATA UNAVAILABLE" message="Marketplace health metrics could not be loaded." />
      </section>
    );
  }

  const incomplete = snapshot.scanComplete === false || snapshot.truncated === true
    || snapshot.totals?.scanComplete === false || snapshot.totals?.truncated === true;
  const health = snapshot.quoteHealth || {};
  const funnel = snapshot.funnel || {};
  const stages = Array.isArray(funnel.stages) ? funnel.stages : [];

  return (
    <section className="ad-mkt-health" aria-labelledby="ad-mkt-health-heading">
      <h2 id="ad-mkt-health-heading" className="ad-mkt-health__eyebrow">Marketplace health</h2>
      <p className="ad-mkt-health__helper">
        Quote-ready job cohort for {snapshot.rangeLabel || 'the selected range'}.
        Coverage uses visible quotes (submitted or accepted). First response is median time
        from quote-ready to the first submitted quote. Internal operating targets, not customer guarantees.
      </p>
      {rangeButtons}

      {incomplete ? (
        <Banner
          tone="warning"
          title="METRICS DATA INCOMPLETE"
          message="The marketplace scan hit its current cap, so these percentages and the funnel are not exhaustive."
        />
      ) : null}

      <div className="ad-mkt-health__cards">
        <HealthCard
          label="Quote coverage"
          fraction={formatFraction(health.oneQuoteJobs, health.quoteReadyJobs)}
          percent={`${formatPct(health.oneQuoteRate)} of quote-ready jobs received ≥1 quote`}
          tone={health.oneQuoteTone}
        />
        <HealthCard
          label="Choice coverage"
          fraction={formatFraction(health.twoQuoteJobs, health.quoteReadyJobs)}
          percent={`${formatPct(health.twoQuoteRate)} received ≥2 quotes`}
          tone={null}
        />
        <HealthCard
          label="First response"
          fraction={health.medianFirstResponseMinutes == null ? '—' : `median ${formatMinutes(health.medianFirstResponseMinutes)}`}
          percent={formatFraction(health.within60MinutesJobs, health.timingSampleCount)}
          detail={`${formatPct(health.within60MinutesRate)} of timed jobs received a first quote within 60 minutes`}
          tone={health.within60Tone}
        />
        <HealthCard
          label="Zero-quote rate"
          fraction={formatFraction(health.zeroQuoteJobs, health.quoteReadyJobs)}
          percent={`${formatPct(health.zeroQuoteRate)} received no visible quote`}
          tone={health.zeroQuoteTone}
        />
      </div>

      <div className="ad-mkt-health__funnel-wrap">
        <h3 className="ad-mkt-health__funnel-title">Marketplace funnel</h3>
        <p className="ad-mkt-health__funnel-note">
          Same quote-ready cohort, followed through later stages. Recent jobs may still be in progress.
          Released means Taskio payment release, not a connected-account bank payout.
        </p>
        {stages.length ? (
          <ol className="ad-mkt-health__funnel">
            {stages.map((stage) => (
              <li key={stage.key} className="ad-mkt-health__funnel-row">
                <span>{stage.label}</span>
                <span className="ad-mkt-health__funnel-count">{stage.count}</span>
                <span className="ad-mkt-health__funnel-pct">
                  {formatPct(stage.fromQuoteReady?.rate)}
                  <span className="ad-mkt-health__sr">
                    {` ${formatFraction(stage.fromQuoteReady?.numerator, stage.fromQuoteReady?.denominator)} of quote-ready jobs`}
                  </span>
                </span>
                <span className="ad-mkt-health__funnel-prev">
                  {stage.key === 'quoteReady' ? 'cohort' : `${formatPct(stage.fromPrevious?.rate)} from previous`}
                </span>
              </li>
            ))}
          </ol>
        ) : (
          <p className="ad-mkt-health__empty">No quote-ready jobs in this range.</p>
        )}
      </div>

      <div className="ad-mkt-health__table-wrap">
        <h3 className="ad-mkt-health__table-title">Expert responsiveness</h3>
        <p className="ad-mkt-health__funnel-note">
          Operational invitation and quote counts for this cohort. Not a ranking or reputation score.
          Response time is shown only when a per-Expert invitation timestamp exists.
        </p>
        {experts.length ? (
          <table className="ad-mkt-health__table">
            <thead>
              <tr>
                <th scope="col">Expert</th>
                <th scope="col">Launch ready</th>
                <th scope="col">
                  <button type="button" className="ad-mkt-health__sort" onClick={() => setSortKey('invitations')}>
                    Invites
                  </button>
                </th>
                <th scope="col">Quoted</th>
                <th scope="col">
                  <button type="button" className="ad-mkt-health__sort" onClick={() => setSortKey('responseRate')}>
                    Response rate
                  </button>
                </th>
                <th scope="col">Response time</th>
                <th scope="col">Awarded</th>
                <th scope="col">Completed</th>
                <th scope="col">
                  <button type="button" className="ad-mkt-health__sort" onClick={() => setSortKey('lastActivityAt')}>
                    Last active
                  </button>
                </th>
              </tr>
            </thead>
            <tbody>
              {experts.map((row) => (
                <tr key={row.uid}>
                  <td>{row.displayName || row.uid}</td>
                  <td>{row.launchReady ? 'Yes' : 'No'}</td>
                  <td>{row.invitations}</td>
                  <td>{row.quotedJobs}</td>
                  <td>
                    {formatFraction(row.responseNumerator, row.responseDenominator)}
                    {row.responseRate == null ? '' : ` · ${formatPct(row.responseRate)}`}
                  </td>
                  <td>
                    {row.responseTimeAvailable
                      ? formatMinutes(row.responseTimeMinutes)
                      : '—'}
                    {!row.responseTimeAvailable ? (
                      <span className="ad-mkt-health__sr"> Invitation timestamp unavailable</span>
                    ) : null}
                  </td>
                  <td>{row.awarded}</td>
                  <td>{row.completed}</td>
                  <td>{formatLastActive(row.lastActivityAtMs, nowMs)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="ad-mkt-health__empty">No invited or quoting Experts in this quote-ready cohort.</p>
        )}
      </div>
    </section>
  );
}
