import React, { useMemo } from 'react';
import Banner from '../../../design/components/Banner';
import {
  LAUNCH_STATUS,
  READY_TO_OPEN_POSTING_COPY,
  resolveLaunchView,
  toneForStatus,
} from './launchReadinessDisplay';
import './LaunchReadinessSection.css';

function headlineTone(status) {
  if (status === LAUNCH_STATUS.READY_TO_OPEN) return 'ok';
  if (status === LAUNCH_STATUS.DATA_UNAVAILABLE) return 'info';
  if (status === LAUNCH_STATUS.DATA_INCOMPLETE) return 'watch';
  return 'alert';
}

export default function LaunchReadinessSection({ loadState = 'loading', snapshot = null }) {
  const view = useMemo(() => resolveLaunchView(snapshot, loadState), [snapshot, loadState]);

  if (view.status === LAUNCH_STATUS.LOADING) {
    return (
      <section className="ad-launch-status" aria-labelledby="ad-launch-status-heading" aria-busy="true">
        <h2 id="ad-launch-status-heading" className="ad-launch-status__eyebrow">Launch readiness</h2>
        <p className="ad-launch-status__helper">Loading Taskio pilot status…</p>
        <div className="ad-launch-status__skeleton" aria-hidden="true" />
      </section>
    );
  }

  if (view.status === LAUNCH_STATUS.DATA_UNAVAILABLE) {
    return (
      <section className="ad-launch-status" aria-labelledby="ad-launch-status-heading">
        <h2 id="ad-launch-status-heading" className="ad-launch-status__eyebrow">Launch readiness</h2>
        <Banner
          tone="danger"
          title="DATA UNAVAILABLE"
          message="Pilot launch-gate status could not be loaded. Readiness cannot be proven."
        />
      </section>
    );
  }

  const gates = Array.isArray(view.snapshot?.gates) ? view.snapshot.gates : [];
  const blockers = Array.isArray(view.snapshot?.blockers) ? view.snapshot.blockers : [];
  const supplyLabel = view.snapshot?.supply?.status || '—';

  return (
    <section className="ad-launch-status" aria-labelledby="ad-launch-status-heading">
      <h2 id="ad-launch-status-heading" className="ad-launch-status__eyebrow">Launch readiness</h2>
      <p className="ad-launch-status__helper">
        Full launch-gate evaluation. This is separate from Expert supply readiness
        and does not open homeowner posting.
      </p>

      <div className="ad-launch-status__headline">
        <p className="ad-launch-status__headline-label">Taskio pilot status</p>
        <p className={`ad-launch-status__headline-value ad-launch-status__headline-value--${headlineTone(view.status)}`}>
          {view.status}
        </p>
      </div>

      {view.status === LAUNCH_STATUS.DATA_INCOMPLETE ? (
        <Banner
          tone="warning"
          title="DATA INCOMPLETE"
          message="The Expert supply scan is incomplete, so overall launch readiness cannot be proven."
        />
      ) : null}

      {view.status === LAUNCH_STATUS.NOT_READY && blockers.length ? (
        <>
          <h3 className="ad-launch-status__headline-label">Blocking gates</h3>
          <ul className="ad-launch-status__blockers">
            {blockers.map((row) => (
              <li key={`${row.id}-${row.label}`}>{row.label}</li>
            ))}
          </ul>
        </>
      ) : null}

      <table className="ad-launch-status__table">
        <caption className="ad-launch-status__helper">Required launch gates and current reviewed status</caption>
        <thead>
          <tr>
            <th scope="col">Gate</th>
            <th scope="col">Area</th>
            <th scope="col">Status</th>
          </tr>
        </thead>
        <tbody>
          {gates.filter((gate) => gate.id !== 'P11').map((gate) => (
            <tr key={gate.id}>
              <th scope="row">{gate.id} {gate.label}</th>
              <td>{gate.group}</td>
              <td className={`ad-launch-status__tone ad-launch-status__tone--${toneForStatus(gate.status)}`}>
                {gate.status}
              </td>
            </tr>
          ))}
          <tr>
            <th scope="row">Supply</th>
            <td>Supply</td>
            <td className={`ad-launch-status__tone ad-launch-status__tone--${toneForStatus(supplyLabel)}`}>
              {supplyLabel}
            </td>
          </tr>
        </tbody>
      </table>

      <p className="ad-launch-status__note">
        <strong>Homeowner posting:</strong> CLOSED.
        {' '}
        {view.status === LAUNCH_STATUS.READY_TO_OPEN
          ? READY_TO_OPEN_POSTING_COPY
          : 'Posting stays closed until every required gate is satisfied and the owner explicitly activates it.'}
      </p>
    </section>
  );
}
