import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import PublicPageHeader from '../components/PublicPageHeader';
import { Button, Card, PageHeader } from '../design/components';
import { createApiClient } from '../api/createApiClient';
import { PILOT_POSTING_COPY } from '../constants/pilotPostingCopy';
import '../styles/publicPageHeader.css';

const api = createApiClient();

export default function WaitlistPage() {
  const [email, setEmail] = useState('');
  const [suburb, setSuburb] = useState('');
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);

  async function handleSubmit(event) {
    event.preventDefault();
    setError('');
    if (!consent) {
      setError('Please confirm we can contact you about the Melbourne pilot.');
      return;
    }
    setBusy(true);
    try {
      await api.post('/api/pilot-waitlist', {
        email,
        suburb,
        source: 'waitlist',
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
            eyebrow="Inner Melbourne pilot"
            title="Join the waitlist"
            description={PILOT_POSTING_COPY.CLOSED}
          />
          {done ? (
            <p style={{ margin: 0, color: '#374151', lineHeight: 1.6 }}>
              Thanks. We&apos;ll be in touch when homeowner posting opens.
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
                Suburb (optional)
                <input
                  type="text"
                  value={suburb}
                  onChange={(event) => setSuburb(event.target.value)}
                  autoComplete="address-level2"
                  style={{ padding: '10px 12px', borderRadius: 8, border: '1px solid #D1D5DB' }}
                />
              </label>
              <label style={{ display: 'flex', gap: 10, alignItems: 'flex-start', fontSize: 14, color: '#374151' }}>
                <input
                  type="checkbox"
                  checked={consent}
                  onChange={(event) => setConsent(event.target.checked)}
                />
                <span>
                  I agree to be contacted about the Melbourne pilot. Taskio&apos;s{' '}
                  <Link to="/privacy">Privacy Policy</Link> applies.
                </span>
              </label>
              {error ? <p style={{ margin: 0, color: '#DC3545', fontSize: 14 }}>{error}</p> : null}
              <div>
                <Button type="submit" disabled={busy}>
                  {busy ? 'Joining…' : 'Join waitlist'}
                </Button>
              </div>
            </form>
          )}
        </Card>
      </main>
    </div>
  );
}
