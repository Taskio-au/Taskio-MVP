import React, { useMemo, useState } from 'react';
import Banner from '../../../design/components/Banner';
import Button from '../../../design/components/Button';
import ConfirmDialog from '../../../design/components/ConfirmDialog';
import { LAUNCH_STATUS, resolveLaunchView } from './launchReadinessDisplay';
import './PilotSettingsSection.css';

export const OPERATIONAL_GUIDANCE =
  'Operational state controls new homeowner posting. Existing jobs continue to operate when posting is paused or closed.';

const OPEN_CONFIRM =
  'Opening the pilot allows supported homeowners in the approved pilot area to submit new jobs. Existing category, geography, authentication and validation rules still apply.';
const PAUSE_CONFIRM =
  'Pause new homeowner job posts. Existing jobs and Expert workflows continue. Homeowners will be directed to the waitlist.';
const CLOSE_CONFIRM =
  'Close the pilot to new homeowner job posts. Existing jobs continue. This is a closed state, not a deletion or shutdown.';

function toneForOperational(state) {
  if (state === 'OPEN') return 'ok';
  if (state === 'PAUSED') return 'watch';
  return 'alert';
}

function toneForLaunch(status) {
  if (status === LAUNCH_STATUS.READY_TO_OPEN) return 'ok';
  if (status === LAUNCH_STATUS.DATA_UNAVAILABLE) return 'info';
  if (status === LAUNCH_STATUS.DATA_INCOMPLETE) return 'watch';
  return 'alert';
}

function formatWhen(value) {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toLocaleString() : String(value);
}

export default function PilotSettingsSection({
  loadState = 'loading',
  settings = null,
  launchLoadState = 'loading',
  launch = null,
  busy = false,
  mutationError = null,
  onChangeState,
}) {
  const launchView = useMemo(
    () => resolveLaunchView(launch, launchLoadState),
    [launch, launchLoadState]
  );
  const [confirm, setConfirm] = useState(null);
  const [reason, setReason] = useState('');

  if (loadState === 'loading') {
    return (
      <section className="ad-pilot-settings" aria-labelledby="ad-pilot-settings-heading" aria-busy="true">
        <h2 id="ad-pilot-settings-heading" className="ad-pilot-settings__eyebrow">Pilot settings</h2>
        <p className="ad-pilot-settings__helper">Loading operational state…</p>
        <div className="ad-pilot-settings__skeleton" aria-hidden="true" />
      </section>
    );
  }

  if (loadState === 'error' || !settings) {
    return (
      <section className="ad-pilot-settings" aria-labelledby="ad-pilot-settings-heading">
        <h2 id="ad-pilot-settings-heading" className="ad-pilot-settings__eyebrow">Pilot settings</h2>
        <Banner
          tone="danger"
          title="DATA UNAVAILABLE"
          message="Pilot operational state could not be loaded. Effective control remains CLOSED."
        />
      </section>
    );
  }

  const operational = settings.effectiveState || 'CLOSED';
  const posting = operational;
  const launchStatus = launchView.status;
  const ready = launchStatus === LAUNCH_STATUS.READY_TO_OPEN;
  const blockers = Array.isArray(launch?.blockers) ? launch.blockers : [];
  const canOpen = operational === 'CLOSED' && ready;
  const canResume = operational === 'PAUSED' && ready;
  const degradedOpen = operational === 'OPEN' && launchStatus !== LAUNCH_STATUS.LOADING && launchStatus !== LAUNCH_STATUS.READY_TO_OPEN;
  const attentionOpen = operational === 'OPEN' && (
    launchStatus === LAUNCH_STATUS.DATA_UNAVAILABLE || launchStatus === LAUNCH_STATUS.DATA_INCOMPLETE
  );

  function requestChange(nextState, title, message, confirmLabel, danger = false) {
    setReason('');
    setConfirm({ nextState, title, message, confirmLabel, danger });
  }

  async function confirmChange() {
    if (!confirm || !onChangeState) return;
    const result = await onChangeState(confirm.nextState, reason);
    if (result?.ok !== false) {
      setConfirm(null);
      setReason('');
    }
  }

  return (
    <section className="ad-pilot-settings" aria-labelledby="ad-pilot-settings-heading">
      <h2 id="ad-pilot-settings-heading" className="ad-pilot-settings__eyebrow">Pilot settings</h2>
      <p className="ad-pilot-settings__helper">
        Persisted operational control. This is separate from derived launch readiness.
        New homeowner posting follows the effective operational state.
      </p>

      <Banner tone="info" title="Posting control" message={OPERATIONAL_GUIDANCE} />

      <div className="ad-pilot-settings__grid">
        <article className="ad-pilot-settings__card">
          <h3 className="ad-pilot-settings__label">Operational state</h3>
          <p className={`ad-pilot-settings__value ad-pilot-settings__value--${toneForOperational(operational)}`}>
            {operational}
          </p>
        </article>
        <article className="ad-pilot-settings__card">
          <h3 className="ad-pilot-settings__label">Current launch readiness</h3>
          <p className={`ad-pilot-settings__value ad-pilot-settings__value--${toneForLaunch(launchStatus)}`}>
            {launchStatus === LAUNCH_STATUS.LOADING ? 'LOADING' : launchStatus}
          </p>
        </article>
        <article className="ad-pilot-settings__card">
          <h3 className="ad-pilot-settings__label">Homeowner posting</h3>
          <p className={`ad-pilot-settings__value ad-pilot-settings__value--${toneForOperational(posting)}`}>
            {posting}
          </p>
          <p className="ad-pilot-settings__note">
            {posting === 'OPEN'
              ? 'Supported homeowners can submit new jobs.'
              : posting === 'PAUSED'
                ? 'New posting blocked. Existing jobs continue.'
                : 'New posting blocked / waitlist path.'}
          </p>
        </article>
      </div>

      <p className="ad-pilot-settings__meta">
        <strong>Last changed:</strong> {formatWhen(settings.updatedAt)}
        {settings.updatedByUid ? ` · ${settings.updatedByUid}` : ''}
      </p>
      {settings.reason ? (
        <p className="ad-pilot-settings__meta"><strong>Reason:</strong> {settings.reason}</p>
      ) : null}
      {!settings.configurationValid ? (
        <Banner
          tone="warning"
          title="Configuration invalid"
          message={settings.configurationWarning || 'Stored operational state is invalid. Effective state is CLOSED.'}
        />
      ) : null}

      {attentionOpen ? (
        <Banner
          tone="danger"
          title="Readiness data is not complete"
          message="Launch readiness is DATA UNAVAILABLE or DATA INCOMPLETE while operational state is OPEN. The persisted state was not changed automatically."
        />
      ) : degradedOpen ? (
        <Banner
          tone="warning"
          title="Readiness degraded"
          message="Launch readiness has degraded while operational state is OPEN."
        />
      ) : null}

      {mutationError ? (
        <Banner
          tone="danger"
          title={mutationError.code || 'UPDATE FAILED'}
          message={mutationError.message || 'Could not update pilot operational state.'}
        />
      ) : null}

      <div className="ad-pilot-settings__actions">
        {operational === 'CLOSED' ? (
          <Button
            variant="primary"
            disabled={!canOpen || busy}
            onClick={() => requestChange('OPEN', 'Open Pilot?', OPEN_CONFIRM, 'Open Pilot')}
          >
            Open Pilot
          </Button>
        ) : null}
        {operational === 'OPEN' ? (
          <>
            <Button
              variant="secondary"
              disabled={busy}
              onClick={() => requestChange('PAUSED', 'Pause Pilot?', PAUSE_CONFIRM, 'Pause Pilot')}
            >
              Pause Pilot
            </Button>
            <Button
              variant="danger"
              disabled={busy}
              onClick={() => requestChange('CLOSED', 'Close Pilot?', CLOSE_CONFIRM, 'Close Pilot', true)}
            >
              Close Pilot
            </Button>
          </>
        ) : null}
        {operational === 'PAUSED' ? (
          <>
            <Button
              variant="primary"
              disabled={!canResume || busy}
              onClick={() => requestChange('OPEN', 'Resume Pilot?', OPEN_CONFIRM, 'Resume Pilot')}
            >
              Resume Pilot
            </Button>
            <Button
              variant="danger"
              disabled={busy}
              onClick={() => requestChange('CLOSED', 'Close Pilot?', CLOSE_CONFIRM, 'Close Pilot', true)}
            >
              Close Pilot
            </Button>
          </>
        ) : null}
      </div>

      {(operational === 'CLOSED' || operational === 'PAUSED') && !ready && launchStatus !== LAUNCH_STATUS.LOADING ? (
        <>
          <h3 className="ad-pilot-settings__label">Open / Resume blocked</h3>
          {blockers.length ? (
            <ul className="ad-pilot-settings__blockers">
              {blockers.map((row) => (
                <li key={`${row.id}-${row.label}`}>{row.label}</li>
              ))}
            </ul>
          ) : (
            <p className="ad-pilot-settings__note">Launch readiness is not READY TO OPEN.</p>
          )}
        </>
      ) : null}

      <ConfirmDialog
        open={!!confirm}
        title={confirm?.title || 'Confirm'}
        message={confirm?.message}
        confirmLabel={confirm?.confirmLabel}
        danger={!!confirm?.danger}
        busy={busy}
        onCancel={() => { if (!busy) setConfirm(null); }}
        onConfirm={confirmChange}
      >
        <label htmlFor="ad-pilot-settings-reason" className="ad-pilot-settings__label">
          Optional reason
        </label>
        <textarea
          id="ad-pilot-settings-reason"
          className="ad-pilot-settings__reason"
          maxLength={240}
          value={reason}
          onChange={(event) => setReason(event.target.value)}
        />
      </ConfirmDialog>
    </section>
  );
}
