import React, { useEffect, useId, useMemo, useState } from 'react';
import { melbournePilotLocations } from '../../shared/auLocations';
import './ExpertPilotAvailabilityPanel.css';

function canonicalPilotAreas() {
  const seen = new Set();
  const areas = [];
  for (const item of melbournePilotLocations) {
    const suburb = String(item?.suburb || '').trim();
    if (!suburb || seen.has(suburb)) continue;
    seen.add(suburb);
    areas.push(suburb);
  }
  return areas;
}

function normalizeLoadedAreas(value) {
  const allowed = new Set(canonicalPilotAreas());
  if (!Array.isArray(value)) return [];
  const seen = new Set();
  const out = [];
  for (const item of value) {
    const suburb = String(item || '').trim();
    if (!allowed.has(suburb) || seen.has(suburb)) continue;
    seen.add(suburb);
    out.push(suburb);
  }
  return out;
}

export default function ExpertPilotAvailabilityPanel({ profile, api, onSaved }) {
  const headingId = useId();
  const acceptId = useId();
  const areas = useMemo(() => canonicalPilotAreas(), []);
  const [acceptingJobs, setAcceptingJobs] = useState(false);
  const [serviceAreas, setServiceAreas] = useState([]);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [messageType, setMessageType] = useState('info');

  useEffect(() => {
    setAcceptingJobs(profile?.acceptingJobs === true);
    setServiceAreas(normalizeLoadedAreas(profile?.serviceAreas));
  }, [profile?.acceptingJobs, profile?.serviceAreas]);

  const dirty = useMemo(() => {
    const savedAccepting = profile?.acceptingJobs === true;
    const savedAreas = normalizeLoadedAreas(profile?.serviceAreas);
    if (acceptingJobs !== savedAccepting) return true;
    if (serviceAreas.length !== savedAreas.length) return true;
    return serviceAreas.some((area) => !savedAreas.includes(area));
  }, [acceptingJobs, serviceAreas, profile?.acceptingJobs, profile?.serviceAreas]);

  const toggleArea = (area) => {
    setMessage('');
    setServiceAreas((prev) => (
      prev.includes(area) ? prev.filter((item) => item !== area) : [...prev, area]
    ));
  };

  const save = async () => {
    setSaving(true);
    setMessage('');
    try {
      const res = await api.put('/api/me/profile', { acceptingJobs, serviceAreas });
      const next = res?.data?.profile || {};
      setAcceptingJobs(next.acceptingJobs === true);
      setServiceAreas(normalizeLoadedAreas(next.serviceAreas));
      setMessageType('success');
      setMessage('Availability saved.');
      if (typeof onSaved === 'function') onSaved(res?.data);
    } catch (err) {
      setMessageType('error');
      setMessage(err?.response?.data?.message || 'Could not save availability.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <section
      className="pp-expert-pilot-availability"
      aria-labelledby={headingId}
    >
      <div className="pp-expert-pilot-availability__header">
        <h2 id={headingId} className="pp-expert-pilot-availability__title">Pilot availability</h2>
        <p className="pp-expert-pilot-availability__lede">
          Tell Taskio whether you can take new jobs and which approved areas you will service.
          This does not guarantee invitations or work.
        </p>
      </div>

      <div className="pp-expert-pilot-availability__block">
        <p className="pp-expert-eyebrow">Availability</p>
        <label className="pp-expert-pilot-availability__check" htmlFor={acceptId}>
          <input
            id={acceptId}
            type="checkbox"
            checked={acceptingJobs}
            onChange={(e) => {
              setMessage('');
              setAcceptingJobs(e.target.checked);
            }}
          />
          <span>Accepting new Taskio jobs</span>
        </label>
        <p className="pp-expert-pilot-availability__hint" id={`${acceptId}-hint`}>
          Turn this on when you&apos;re available to receive new Taskio job opportunities.
        </p>
      </div>

      <fieldset className="pp-expert-pilot-availability__block">
        <legend className="pp-expert-eyebrow">Service areas</legend>
        <p className="pp-expert-pilot-availability__hint">
          Choose the areas where you&apos;re willing to take Taskio jobs.
        </p>
        <ul className="pp-expert-pilot-availability__areas">
          {areas.map((area) => {
            const inputId = `${headingId}-${area.replace(/\s+/g, '-').toLowerCase()}`;
            return (
              <li key={area}>
                <label className="pp-expert-pilot-availability__check" htmlFor={inputId}>
                  <input
                    id={inputId}
                    type="checkbox"
                    checked={serviceAreas.includes(area)}
                    onChange={() => toggleArea(area)}
                  />
                  <span>{area}</span>
                </label>
              </li>
            );
          })}
        </ul>
      </fieldset>

      <div className="pp-expert-pilot-availability__actions">
        <button
          type="button"
          className="pp-expert-pilot-availability__save"
          onClick={save}
          disabled={saving || !dirty}
        >
          {saving ? 'Saving…' : 'Save availability'}
        </button>
        {message ? (
          <p
            className={`pp-expert-pilot-availability__msg pp-expert-pilot-availability__msg--${messageType}`}
            role={messageType === 'error' ? 'alert' : 'status'}
          >
            {message}
          </p>
        ) : null}
      </div>
    </section>
  );
}
