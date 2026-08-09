import React, { useState } from 'react';
import { createApiClient } from '../api/createApiClient';
import { detectChatFlags } from '../utils/chatFlags';

const api = createApiClient();

const styles = {
  page: {
    maxWidth: 900,
    margin: '24px auto',
    padding: 16,
    fontFamily: 'Inter, sans-serif',
  },
  heading: {
    fontFamily: 'Poppins, sans-serif',
    marginBottom: 10,
  },
  card: {
    background: '#fff',
    border: '1px solid #E5E7EB',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
  },
  row: { display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' },
  button: {
    height: 38,
    borderRadius: 8,
    border: 'none',
    background: '#14C5C5',
    color: '#fff',
    fontWeight: 700,
    padding: '0 12px',
    cursor: 'pointer',
  },
  code: {
    background: '#F3F4F6',
    borderRadius: 8,
    padding: 12,
    fontSize: 13,
    overflow: 'auto',
  },
  textarea: {
    width: '100%',
    boxSizing: 'border-box',
    borderRadius: 8,
    border: '1px solid #D1D5DB',
    padding: 10,
    minHeight: 90,
  },
  pill: {
    display: 'inline-block',
    border: '1px solid #CBD5E1',
    borderRadius: 999,
    padding: '2px 8px',
    marginRight: 8,
    marginBottom: 8,
    fontSize: 12,
    background: '#F8FAFC',
  },
};

export default function E2ECriticalFlowsPage() {
  const [timeline, setTimeline] = useState([]);
  const [lifecycleBusy, setLifecycleBusy] = useState(false);
  const [lifecycleError, setLifecycleError] = useState('');
  const [messageText, setMessageText] = useState('Call me on +61 412 345 678 or email me@example.com');
  const [flags, setFlags] = useState([]);

  const runPaymentDisputeLifecycle = async () => {
    setLifecycleBusy(true);
    setLifecycleError('');
    setTimeline([]);
    try {
      const events = [];
      const start = await api.post('/api/e2e/payment/start', { jobId: 'e2e-job-1' });
      events.push(`start -> ${start.data.paymentState}`);

      const flag = await api.post('/api/e2e/payment/flag-dispute', { jobId: 'e2e-job-1', reason: 'scope issue' });
      events.push(`flag_dispute -> ${flag.data.paymentState}`);

      const clear = await api.post('/api/e2e/payment/clear-dispute', { jobId: 'e2e-job-1' });
      events.push(`clear_dispute -> ${clear.data.paymentState}`);

      const release = await api.post('/api/e2e/payment/release', { jobId: 'e2e-job-1' });
      events.push(`manual_release -> ${release.data.paymentState}`);

      setTimeline(events);
    } catch (e) {
      setLifecycleError(e?.response?.data?.message || e?.message || 'Lifecycle failed');
    } finally {
      setLifecycleBusy(false);
    }
  };

  const analyzeMessage = () => {
    setFlags(detectChatFlags(messageText));
  };

  return (
    <main style={styles.page}>
      <h1 style={styles.heading}>E2E Critical Flows Harness</h1>
      <p>This page is enabled only in e2e mode and validates browser-level critical scenarios.</p>

      <section style={styles.card} aria-labelledby="payment-lifecycle-title">
        <h2 id="payment-lifecycle-title">Payment/Dispute Lifecycle</h2>
        <div style={styles.row}>
          <button
            type="button"
            style={styles.button}
            onClick={runPaymentDisputeLifecycle}
            disabled={lifecycleBusy}
          >
            {lifecycleBusy ? 'Running...' : 'Run Lifecycle'}
          </button>
        </div>
        {lifecycleError ? <p role="alert">{lifecycleError}</p> : null}
        <pre style={styles.code} data-testid="lifecycle-timeline">
          {timeline.length ? timeline.join('\n') : 'No lifecycle run yet.'}
        </pre>
      </section>

      <section style={styles.card} aria-labelledby="messaging-edge-title">
        <h2 id="messaging-edge-title">Messaging Edge Cases</h2>
        <textarea
          style={styles.textarea}
          value={messageText}
          onChange={(e) => setMessageText(e.target.value)}
          aria-label="Message text"
        />
        <div style={{ marginTop: 10 }}>
          <button type="button" style={styles.button} onClick={analyzeMessage}>
            Analyze Message
          </button>
        </div>
        <div style={{ marginTop: 12 }} data-testid="message-flags">
          {flags.length === 0 ? (
            <span>No flags detected.</span>
          ) : (
            flags.map((f) => (
              <span key={f.type} style={styles.pill}>
                {f.type}:{f.severity}
              </span>
            ))
          )}
        </div>
      </section>
    </main>
  );
}
