import React, { useMemo } from 'react';
import Banner from '../../../design/components/Banner';
import { spacing } from '../../../design/tokens';
import {
  GEOGRAPHY_HEURISTIC_COPY,
  INCOMPLETE_COPY,
  PILOT_STATUS,
  POSTING_CLOSED_COPY,
  READY_TO_OPEN_COPY,
  UNAVAILABLE_COPY,
  ZERO_EXPERTS_COPY,
  derivePilotReadiness,
  statusLabel,
} from './pilotReadinessDisplay';
import './PilotReadinessSection.css';

function statusTone(status) {
  if (status === 'HEALTHY' || status === 'TARGET MET' || status === 'AT OR ABOVE FLOOR' || status === 'COVERED' || status === 'READY TO OPEN') {
    return 'ok';
  }
  if (status === 'ADEQUATE' || status === 'BELOW LAUNCH TARGET') return 'watch';
  if (status === 'UNDER-COVERED' || status === 'UNCOVERED' || status === 'BELOW OPERATING FLOOR' || status === 'NOT READY' || status === 'DATA INCOMPLETE') {
    return 'alert';
  }
  if (status === 'DATA UNAVAILABLE') return 'info';
  return 'muted';
}

function ReadinessCard({ label, value, status, note }) {
  return (
    <article className="ad-pilot-readiness__card">
      <p className="ad-pilot-readiness__value">{value}</p>
      <h3 className="ad-pilot-readiness__label">{label}</h3>
      {status ? (
        <p className={`ad-pilot-readiness__status ad-pilot-readiness__status--${statusTone(status)}`}>
          {status}
        </p>
      ) : null}
      {note ? <p className="ad-pilot-readiness__note">{note}</p> : null}
    </article>
  );
}

export default function PilotReadinessSection({ loadState = 'loading', snapshot = null }) {
  const view = useMemo(() => derivePilotReadiness(snapshot, loadState), [snapshot, loadState]);

  if (view.status === PILOT_STATUS.LOADING) {
    return (
      <section className="ad-pilot-readiness" aria-labelledby="ad-pilot-readiness-heading" aria-busy="true">
        <h2 id="ad-pilot-readiness-heading" className="ad-pilot-readiness__eyebrow">Pilot readiness</h2>
        <div className="ad-pilot-readiness__grid" aria-hidden="true">
          {[0, 1, 2, 3].map((key) => (
            <div key={key} className="ad-pilot-readiness__skeleton" />
          ))}
        </div>
        <p className="ad-pilot-readiness__note" style={{ marginTop: spacing.sm }}>Loading pilot supply…</p>
      </section>
    );
  }

  if (view.status === PILOT_STATUS.UNAVAILABLE) {
    return (
      <section className="ad-pilot-readiness" aria-labelledby="ad-pilot-readiness-heading">
        <h2 id="ad-pilot-readiness-heading" className="ad-pilot-readiness__eyebrow">Pilot readiness</h2>
        <Banner
          tone="danger"
          title={statusLabel(PILOT_STATUS.UNAVAILABLE)}
          message={UNAVAILABLE_COPY}
        />
      </section>
    );
  }

  const { targets, totals, categoryRows, geographyRows } = view;

  return (
    <section className="ad-pilot-readiness" aria-labelledby="ad-pilot-readiness-heading">
      <h2 id="ad-pilot-readiness-heading" className="ad-pilot-readiness__eyebrow">Pilot readiness</h2>

      <div className="ad-pilot-readiness__grid">
        <ReadinessCard
          label="Pilot status"
          value={statusLabel(view.status)}
          status={statusLabel(view.status)}
          note={view.status === PILOT_STATUS.READY_TO_OPEN ? READY_TO_OPEN_COPY : null}
        />
        <ReadinessCard
          label="Launch-ready experts"
          value={`${totals.launchReady} / ${targets.launchReady}`}
          status={view.launchReadyBand}
          note={`${totals.experts} total · ${totals.technicallyEligible} technically eligible`}
        />
        <ReadinessCard
          label="Operating floor"
          value={`${totals.launchReady} / ${targets.afterActivationFloor}`}
          status={view.operatingFloorBand}
        />
        <ReadinessCard
          label="Category coverage"
          value={`${view.categoriesAdequateCount} / ${view.categoriesTotal}`}
          status={
            view.categoriesTotal > 0 && categoryRows.every((row) => row.status === 'HEALTHY')
              ? 'HEALTHY'
              : view.categoriesAdequateCount === view.categoriesTotal && view.categoriesTotal > 0
                ? 'ADEQUATE'
                : 'UNDER-COVERED'
          }
          note={`Categories at least adequate (minimum ${targets.categoryCoverageMinimum})`}
        />
        <ReadinessCard
          label="Geography coverage"
          value={`${view.geographyCoveredCount} / ${view.geographyTotal}`}
          status={view.geographyCoveredCount === view.geographyTotal && view.geographyTotal > 0 ? 'COVERED' : 'UNCOVERED'}
          note="Pilot areas with at least one launch-ready Expert"
        />
        <ReadinessCard
          label="Homeowner posting"
          value="CLOSED"
          status="CLOSED"
          note={POSTING_CLOSED_COPY}
        />
      </div>

      {view.status === PILOT_STATUS.INCOMPLETE ? (
        <Banner
          className="ad-pilot-readiness__banner"
          tone="warning"
          title="DATA INCOMPLETE"
          message={INCOMPLETE_COPY}
          style={{ marginTop: spacing.md }}
        />
      ) : null}

      {totals.experts === 0 && view.status !== PILOT_STATUS.INCOMPLETE ? (
        <Banner
          tone="info"
          title="No Experts yet"
          message={ZERO_EXPERTS_COPY}
          style={{ marginTop: spacing.md }}
        />
      ) : null}

      <div className="ad-pilot-readiness__panels">
        <div className="ad-pilot-readiness__panel">
          <h3 className="ad-pilot-readiness__panel-title">Category coverage</h3>
          <p className="ad-pilot-readiness__helper">
            Minimum adequate is {targets.categoryCoverageMinimum}. Healthy target is {targets.categoryCoverageTarget}.
            These counts are readiness indicators, not a category-by-area proof.
          </p>
          {categoryRows.map((row) => {
            const pct = Math.min(100, Math.round((row.launchReadyCount / row.target) * 100));
            return (
              <div key={row.category} className="ad-pilot-readiness__row">
                <div className="ad-pilot-readiness__row-name">{row.category}</div>
                <div className="ad-pilot-readiness__row-count">{row.launchReadyCount}</div>
                <p className={`ad-pilot-readiness__status ad-pilot-readiness__status--${statusTone(row.status)}`}>
                  {row.status}
                </p>
                <div
                  className="ad-pilot-readiness__bar"
                  role="progressbar"
                  aria-valuemin={0}
                  aria-valuemax={row.target}
                  aria-valuenow={row.launchReadyCount}
                  aria-label={`${row.category}: ${row.launchReadyCount} launch-ready Experts, minimum ${row.minimum}, target ${row.target}, ${row.status}`}
                >
                  <div className="ad-pilot-readiness__bar-fill" style={{ width: `${pct}%` }} />
                </div>
              </div>
            );
          })}
        </div>

        <div className="ad-pilot-readiness__panel">
          <h3 className="ad-pilot-readiness__panel-title">Geography coverage</h3>
          <p className="ad-pilot-readiness__helper">{GEOGRAPHY_HEURISTIC_COPY}</p>
          {geographyRows.map((row) => (
            <div key={row.area} className="ad-pilot-readiness__row">
              <div className="ad-pilot-readiness__row-name">{row.area}</div>
              <div className="ad-pilot-readiness__row-count">{row.launchReadyCount}</div>
              <p className={`ad-pilot-readiness__status ad-pilot-readiness__status--${statusTone(row.status)}`}>
                {row.status}
              </p>
            </div>
          ))}
        </div>
      </div>

      <details className="ad-pilot-readiness__explain">
        <summary>What counts as launch-ready?</summary>
        <div className="ad-pilot-readiness__explain-body">
          <p>An Expert counts toward supply only when they are technically eligible, accepting Taskio jobs, and serving at least one approved pilot area.</p>
          <ul>
            <li>15 Experts alone does not open Taskio.</li>
            <li>Homeowner posting stays closed until remaining launch gates and explicit owner activation.</li>
            <li>This display is not a persisted OPEN or PAUSED control.</li>
          </ul>
        </div>
      </details>
    </section>
  );
}
