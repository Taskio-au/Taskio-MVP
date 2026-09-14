import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import PublicPageHeader from '../components/PublicPageHeader';
import { Button, Card, PageHeader } from '../design/components';
import { createApiClient } from '../api/createApiClient';
import { phase1ExpertiseCatalog } from '../shared/expertiseCatalog';
import { melbournePilotSuburbNames } from '../shared/auLocations';
import '../styles/publicPageHeader.css';

const api = createApiClient();

export default function ExpertWaitlistPage() {
  const [email, setEmail] = useState('');
  const [expertise, setExpertise] = useState('');
  const [suburb, setSuburb] = useState('');
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
    setBusy(true);
    try {
      await api.post('/api/expert-waitlist', {
        email,
        expertise,
        suburb,
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

  return (
    <div>
      <PublicPageHeader homeTo="/" />
      <main style={{ padding: '48px 24px' }}>
        <Card tone="elevated" style={{ display: 'grid', gap: 18, maxWidth: 560, margin: '0 auto' }}>
          <PageHeader
            eyebrow="Expert applications"
            title="Join the Expert waitlist"
            description="Register your interest in becoming a Taskio Expert. This is not an application and does not create an account."
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
              <label style={{ display: 'grid', gap: 6, fontSize: 14, color: '#111827' }}>
                Primary expertise (optional)
                <select
                  value={expertise}
                  onChange={(event) => setExpertise(event.target.value)}
                  style={{ padding: '10px 12px', borderRadius: 8, border: '1px solid #D1D5DB' }}
                >
                  <option value="">Select a category</option>
                  {phase1ExpertiseCatalog.map((item) => (
                    <option key={item.key} value={item.key}>{item.expertLabel || item.label}</option>
                  ))}
                </select>
              </label>
              <label style={{ display: 'grid', gap: 6, fontSize: 14, color: '#111827' }}>
                Primary service area (optional)
                <select
                  value={suburb}
                  onChange={(event) => setSuburb(event.target.value)}
                  style={{ padding: '10px 12px', borderRadius: 8, border: '1px solid #D1D5DB' }}
                >
                  <option value="">Select a suburb</option>
                  {melbournePilotSuburbNames.map((name) => (
                    <option key={name} value={name}>{name}</option>
                  ))}
                </select>
              </label>
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
              {error ? <p style={{ margin: 0, color: '#DC3545', fontSize: 14 }}>{error}</p> : null}
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
