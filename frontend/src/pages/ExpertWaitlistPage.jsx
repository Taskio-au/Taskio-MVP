import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import PublicPageHeader from '../components/PublicPageHeader';
import { Button, Card, PageHeader } from '../design/components';
import { createApiClient } from '../api/createApiClient';
import { phase1ExpertiseCatalog } from '../shared/expertiseCatalog';
import { melbournePilotSuburbNames, pilotServiceAreaDisplayName } from '../shared/auLocations';
import '../styles/publicPageHeader.css';

const api = createApiClient();

export default function ExpertWaitlistPage() {
  const [email, setEmail] = useState('');
  const [expertise, setExpertise] = useState([]);
  const [serviceAreas, setServiceAreas] = useState([]);
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);

  async function handleSubmit(event) {
    event.preventDefault();
    setError('');
    if (!consent) {
      setError('Please confirm we can contact you about becoming a Taskio Expert.');
      return;
    }
    if (expertise.length === 0) {
      setError('Select at least one area of expertise.');
      return;
    }
    if (serviceAreas.length === 0) {
      setError('Select at least one service area.');
      return;
    }
    setBusy(true);
    try {
      await api.post('/api/expert-waitlist', {
        email,
        expertise,
        serviceAreas,
        source: 'expert-waitlist',
        consentAccepted: true,
      });
      setDone(true);
    } catch (err) {
      const message = err?.response?.data?.message;
      setError(typeof message === 'string' && message.trim()
        ? message.trim()
        : 'Could not join the waitlist right now.');
    } finally {
      setBusy(false);
    }
  }

  function toggleSelection(setter, value) {
    setter((previous) => (
      previous.includes(value)
        ? previous.filter((item) => item !== value)
        : [...previous, value]
    ));
    setError('');
  }

  return (
    <div>
      <PublicPageHeader homeTo="/" />
      <main style={{ padding: '48px 24px' }}>
        <Card tone="elevated" style={{ display: 'grid', gap: 18, maxWidth: 560, margin: '0 auto' }}>
          <PageHeader
            eyebrow="Expert waitlist"
            title="Join the Expert waitlist"
            description="Register your interest in becoming a Taskio Expert. This does not create an account. We'll let you know when Expert onboarding is available."
          />
          {done ? (
            <p style={{ margin: 0, color: '#374151', lineHeight: 1.6 }}>
              Thanks. We&apos;ll be in touch about becoming a Taskio Expert.
            </p>
          ) : (
            <form onSubmit={handleSubmit} style={{ display: 'grid', gap: 14 }}>
              <label style={{ display: 'grid', gap: 6, fontSize: 14, color: '#111827' }}>
                Email
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  autoComplete="email"
                  style={{ padding: '10px 12px', borderRadius: 8, border: '1px solid #D1D5DB' }}
                />
              </label>
              <fieldset style={styles.fieldset} aria-describedby="expert-waitlist-expertise-help">
                <legend style={styles.legend}>Areas of expertise</legend>
                <p id="expert-waitlist-expertise-help" style={styles.help}>Select all that apply.</p>
                <div style={styles.optionGrid}>
                  {phase1ExpertiseCatalog.map((item) => (
                    <label
                      key={item.key}
                      style={{
                        ...styles.option,
                        ...(expertise.includes(item.key) ? styles.optionSelected : {}),
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={expertise.includes(item.key)}
                        onChange={() => toggleSelection(setExpertise, item.key)}
                      />
                      <span>{item.expertLabel || item.label}</span>
                    </label>
                  ))}
                </div>
              </fieldset>
              <fieldset style={styles.fieldset} aria-describedby="expert-waitlist-service-areas-help">
                <legend style={styles.legend}>Service areas</legend>
                <p id="expert-waitlist-service-areas-help" style={styles.help}>Select all Inner Melbourne pilot areas you can cover.</p>
                <div style={styles.serviceAreaGrid}>
                  {melbournePilotSuburbNames.map((name) => (
                    <label
                      key={name}
                      style={{
                        ...styles.option,
                        ...(serviceAreas.includes(name) ? styles.optionSelected : {}),
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={serviceAreas.includes(name)}
                        onChange={() => toggleSelection(setServiceAreas, name)}
                      />
                      <span>{pilotServiceAreaDisplayName(name)}</span>
                    </label>
                  ))}
                </div>
              </fieldset>
              <label style={{ display: 'flex', gap: 10, alignItems: 'flex-start', fontSize: 14, color: '#374151' }}>
                <input
                  type="checkbox"
                  checked={consent}
                  onChange={(event) => setConsent(event.target.checked)}
                />
                <span>
                  I agree to be contacted about becoming a Taskio Expert. Taskio&apos;s{' '}
                  <Link to="/privacy">Privacy Policy</Link> applies.
                </span>
              </label>
              {error ? <p role="alert" aria-live="assertive" style={{ margin: 0, color: '#DC3545', fontSize: 14 }}>{error}</p> : null}
              <div>
                <Button type="submit" disabled={busy}>
                  {busy ? 'Joining…' : 'Join Expert waitlist'}
                </Button>
              </div>
            </form>
          )}
          <p style={{ margin: 0, fontSize: 14, color: '#6B7280' }}>
            Already have an Expert account? <Link to="/login">Log in</Link>
          </p>
        </Card>
      </main>
    </div>
  );
}

const styles = {
  fieldset: {
    display: 'grid',
    gap: 8,
    minWidth: 0,
    margin: 0,
    padding: 0,
    border: 0,
  },
  legend: {
    padding: 0,
    fontSize: 14,
    fontWeight: 700,
    color: '#111827',
  },
  help: {
    margin: 0,
    color: '#6B7280',
    fontSize: 13,
    lineHeight: 1.5,
  },
  optionGrid: {
    display: 'grid',
    gap: 8,
    maxHeight: 300,
    overflowY: 'auto',
    padding: 2,
  },
  serviceAreaGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
    gap: 8,
  },
  option: {
    minHeight: 44,
    boxSizing: 'border-box',
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    padding: '10px 12px',
    border: '1px solid #D1D5DB',
    borderRadius: 10,
    color: '#374151',
    backgroundColor: '#FFFFFF',
    cursor: 'pointer',
    fontSize: 14,
    lineHeight: 1.4,
  },
  optionSelected: {
    borderColor: '#14C5C5',
    backgroundColor: '#ECFEFF',
    color: '#0F766E',
  },
};
