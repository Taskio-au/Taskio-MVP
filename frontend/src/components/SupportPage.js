import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuthState } from 'react-firebase-hooks/auth';
import { auth, db, storage } from '../firebase';
import AppHeader from './AppHeader';
import SupportTicketsView from './support/SupportTicketsView';
import { PageLoadingShell } from './ui/AsyncPageStates';
import PageMain from './ui/PageMain';
import { collection, doc, getDoc, serverTimestamp, setDoc, query, where, orderBy, onSnapshot } from 'firebase/firestore';
import { ref as storageRef, uploadBytesResumable } from 'firebase/storage';

const CATEGORIES = [
  { value: 'payments', label: 'Payments' },
  { value: 'disputes', label: 'Disputes' },
  { value: 'safety', label: 'Safety' },
  { value: 'variations', label: 'Variations' },
  { value: 'other', label: 'Other' },
];

const CATEGORY_HELP = {
  payments: 'If this relates to payments or refunds, include the task ID.',
  safety: 'If someone asked to move payment or contact off Taskio, include message details.',
  disputes: 'We can review chat history if the task was kept on Taskio.',
  variations: 'Include what changed and any photos/docs that support the variation.',
  other: 'Include the task ID if this is related to a specific task.',
};

function isNonEmpty(s) {
  return String(s || '').trim().length > 0;
}

function supportTicketsErrorMessage(err) {
  const code = String(err?.code || '');
  if (code === 'permission-denied') {
    return 'We couldn’t load your tickets. Check that you’re signed in, or try again in a moment.';
  }
  if (code === 'unavailable' || code === 'deadline-exceeded' || code === 'resource-exhausted') {
    return 'We couldn’t reach Taskio. Check your connection and try again.';
  }
  return 'We couldn’t load your tickets. Please try again.';
}

function computePriority({ category, message }) {
  const cat = String(category || '').toLowerCase();
  const msg = String(message || '').toLowerCase();
  // Default HIGH for payments or common payment keywords.
  const paymentKeywords = ['refund', 'stripe', 'charge', 'charged', 'card', 'escrow', 'payment', 'payout', 'transfer'];
  if (cat === 'payments') return 'HIGH';
  if (paymentKeywords.some((k) => msg.includes(k))) return 'HIGH';
  // Safety should be triaged quickly.
  if (cat === 'safety') return 'HIGH';
  return 'MED';
}

export default function SupportPage() {
  const navigate = useNavigate();
  const [user, loading] = useAuthState(auth);
  const [profile, setProfile] = useState(null);

  const [category, setCategory] = useState('payments');
  const [jobId, setJobId] = useState('');
  const [message, setMessage] = useState('');
  const [file, setFile] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const fileRef = useRef(null);
  const [openFaq, setOpenFaq] = useState('payments');
  const [myTickets, setMyTickets] = useState([]);
  const [ticketsLoadError, setTicketsLoadError] = useState(null);
  const [ticketsRetryKey, setTicketsRetryKey] = useState(0);
  const [selectedTicket, setSelectedTicket] = useState(null);
  const [activeTab, setActiveTab] = useState('tickets'); // 'tickets' or 'new'

  useEffect(() => {
    if (!loading && !user) navigate('/login');
  }, [loading, user, navigate]);

  useEffect(() => {
    const run = async () => {
      if (!user) return;
      try {
        const snap = await getDoc(doc(db, 'users', user.uid));
        setProfile(snap.exists() ? snap.data() : { role: 'homeowner' });
      } catch (e) {
        // eslint-disable-next-line no-console
        console.error('Profile read failed:', e);
        setProfile({ role: 'homeowner' });
      }
    };
    run();
  }, [user]);

  // Fetch user's tickets in real-time
  useEffect(() => {
    if (!user) return undefined;
    setTicketsLoadError(null);
    const ticketsRef = collection(db, 'supportTickets');
    const q = query(ticketsRef, where('ownerUid', '==', user.uid), orderBy('createdAt', 'desc'));

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const ticketsList = snapshot.docs.map((d) => ({
          id: d.id,
          ...d.data(),
        }));
        setMyTickets(ticketsList);
        setTicketsLoadError(null);
      },
      (err) => {
        // eslint-disable-next-line no-console
        console.error('Error fetching tickets:', err);
        setMyTickets([]);
        setSelectedTicket(null);
        setTicketsLoadError(supportTicketsErrorMessage(err));
      }
    );

    return () => unsubscribe();
  }, [user, ticketsRetryKey]);

  const role = useMemo(() => {
    const r = profile?.role;
    if (r === 'tradie' || r === 'homeowner' || r === 'admin') return r;
    return 'homeowner';
  }, [profile]);

  const headerName = profile?.name || user?.displayName || '';
  const headerEmail = profile?.email || user?.email || '';

  const submit = async () => {
    if (!user) return;
    setError('');
    setSuccess('');
    setSubmitted(false);
    const msg = String(message || '').trim();
    if (msg.length < 10) return setError('Please provide a short message (10+ characters).');
    if (msg.length > 5000) return setError('Message is too long (max 5000 characters).');
    const jid = String(jobId || '').trim();
    if (jid.length > 80) return setError('Task ID is too long.');

    const chosenCat = String(category || 'other');
    if (!CATEGORIES.some((c) => c.value === chosenCat)) return setError('Invalid category.');
    const priority = computePriority({ category: chosenCat, message: msg });

    setBusy(true);
    try {
      const ticketsCol = collection(db, 'supportTickets');
      const ticketRef = doc(ticketsCol); // client-generated id
      let attachment = null;

      if (file) {
        if (file.size > 5 * 1024 * 1024) throw new Error('Attachment too large (max 5MB).');
        const ok =
          (file.type && file.type.startsWith('image/')) ||
          file.type === 'application/pdf' ||
          file.type === 'image/heic' ||
          file.type === 'image/heif';
        if (!ok) throw new Error('Unsupported attachment type. Please upload an image or PDF.');

        const storagePath = `support-tickets/${user.uid}/${ticketRef.id}/${Date.now()}-${file.name}`;
        const r = storageRef(storage, storagePath);
        await new Promise((resolve, reject) => {
          const task = uploadBytesResumable(r, file, { contentType: file.type || 'application/octet-stream' });
          task.on('state_changed', () => {}, reject, () => resolve());
        });
        attachment = {
          fileName: file.name,
          mimeType: file.type || '',
          size: file.size,
          storagePath,
        };
      }

      await setDoc(ticketRef, {
        ownerUid: user.uid,
        userUid: user.uid,
        role,
        category: chosenCat,
        jobId: jid || null,
        message: msg,
        status: 'new',
        priority,
        attachment,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        lastUpdatedBy: 'user',
      });

      setSuccess('Thanks — we’ve received your request. Our team usually responds within 1 business day.');
      setSubmitted(true);
      setCategory('payments');
      setJobId('');
      setMessage('');
      setFile(null);
    } catch (e) {
      setError(e?.message || 'Failed to submit support request.');
    } finally {
      setBusy(false);
    }
  };

  const formatDate = (timestamp) => {
    if (!timestamp) return 'N/A';
    try {
      const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
      return date.toLocaleString('en-AU', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return 'N/A';
    }
  };

  const STATUS_LABELS = {
    open: 'New',
    new: 'New',
    in_progress: 'In Progress',
    waiting_on_user: 'Waiting on user',
    resolved: 'Resolved',
    closed: 'Closed',
  };

  const STATUS_COLORS = {
    open: '#FF9100',
    new: '#FF9100',
    in_progress: '#14C5C5',
    waiting_on_user: '#7c3aed',
    resolved: '#28A745',
    closed: '#888',
  };

  if (loading || !user) {
    return <PageLoadingShell message="Loading Help & Support…" detail="Almost ready — your tickets and FAQs are next." />;
  }

  return (
    <>
      <AppHeader userRole={role} userName={headerName} userEmail={headerEmail} />
      <PageMain label="Help and support">
      <style>{`
        @media (max-width: 900px) {
          .support-page-grid,
          .support-form-grid,
          .support-tickets-grid {
            grid-template-columns: 1fr !important;
          }
        }
        @media (max-width: 640px) {
          .support-tickets-load-failure-actions {
            flex-direction: column !important;
            align-items: stretch !important;
          }
          .support-tickets-load-failure {
            padding: 18px 16px !important;
          }
        }
      `}</style>
      <div style={styles.page}>
        <div style={styles.container}>
          <div style={styles.headerRow}>
            <div>
              <h1 style={{ ...styles.title, margin: 0 }}>Help & Support</h1>
              <div style={styles.subTitle}>Quick answers, safety guidance, and a way to reach the team.</div>
            </div>
          </div>

          {/* Tabs */}
          <div style={styles.tabs} role="tablist" aria-label="Support tabs">
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === 'tickets'}
              style={{ ...styles.tab, ...(activeTab === 'tickets' ? styles.tabActive : {}) }}
              onClick={() => setActiveTab('tickets')}
            >
              Your Tickets {myTickets.length > 0 && `(${myTickets.length})`}
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === 'new'}
              style={{ ...styles.tab, ...(activeTab === 'new' ? styles.tabActive : {}) }}
              onClick={() => setActiveTab('new')}
            >
              Submit New Ticket
            </button>
          </div>

          {activeTab === 'tickets' && (
            <SupportTicketsView
              styles={styles}
              myTickets={myTickets}
              loadError={ticketsLoadError}
              onRetryLoad={() => setTicketsRetryKey((k) => k + 1)}
              selectedTicket={selectedTicket}
              onSelectTicket={setSelectedTicket}
              onOpenNewTicket={() => setActiveTab('new')}
              formatDate={formatDate}
              statusLabels={STATUS_LABELS}
              statusColors={STATUS_COLORS}
            />
          )}

          {/* New Ticket Form View */}
          {activeTab === 'new' && (
            <div style={styles.grid} className="support-page-grid">
              <div style={styles.card}>
                <div style={styles.cardTitle}>FAQs</div>

                <button type="button" style={styles.faqRow} onClick={() => setOpenFaq((p) => (p === 'payments' ? '' : 'payments'))}>
                  <div style={styles.faqRowTitle}>Payments</div>
                  <div style={styles.faqChevron}>{openFaq === 'payments' ? '–' : '+'}</div>
                </button>
                {openFaq === 'payments' && (
                  <div style={styles.faqPanel}>
                    Keep payments on Taskio. Payments are processed securely through Stripe. When a Client funds a
                    task, payment is not released to the Expert until the Client approves the completed work, or until a
                    cancellation, refund, or dispute is resolved under Taskio’s platform rules. See the{' '}
                    <Link to="/terms" style={{ color: '#0f766e', fontWeight: 800 }}>
                      Terms of Use
                    </Link>{' '}
                    for the full payment rules.
                  </div>
                )}

                <button type="button" style={styles.faqRow} onClick={() => setOpenFaq((p) => (p === 'disputes' ? '' : 'disputes'))}>
                  <div style={styles.faqRowTitle}>Disputes</div>
                  <div style={styles.faqChevron}>{openFaq === 'disputes' ? '–' : '+'}</div>
                </button>
                {openFaq === 'disputes' && (
                  <div style={styles.faqPanel}>If something goes wrong, keep communication in Taskio and contact support early. We can review the job record and messages.</div>
                )}

                <button type="button" style={styles.faqRow} onClick={() => setOpenFaq((p) => (p === 'safety' ? '' : 'safety'))}>
                  <div style={styles.faqRowTitle}>Safety</div>
                  <div style={styles.faqChevron}>{openFaq === 'safety' ? '–' : '+'}</div>
                </button>
                {openFaq === 'safety' && <div style={styles.faqPanel}>Avoid sharing phone/email in job posts. Use Taskio chat so we can help if anything is flagged.</div>}

                <button type="button" style={styles.faqRow} onClick={() => setOpenFaq((p) => (p === 'variations' ? '' : 'variations'))}>
                  <div style={styles.faqRowTitle}>Variations</div>
                  <div style={styles.faqChevron}>{openFaq === 'variations' ? '–' : '+'}</div>
                </button>
                {openFaq === 'variations' && (
                  <div style={styles.faqPanel}>If the scope changes, submit a variation so the Client can approve it before work proceeds.</div>
                )}

                <button type="button" style={styles.faqRow} onClick={() => setOpenFaq((p) => (p === 'contact' ? '' : 'contact'))}>
                  <div style={styles.faqRowTitle}>Contact</div>
                  <div style={styles.faqChevron}>{openFaq === 'contact' ? '–' : '+'}</div>
                </button>
                {openFaq === 'contact' && <div style={styles.faqPanel}>Use the form to create a support ticket. Include a job ID if relevant and any helpful photos/documents.</div>}
              </div>

              <div style={styles.card}>
                <div style={styles.cardTitle}>Create a support ticket</div>
                <div style={styles.note}>
                  Please don’t include passwords or payment card details. If you’re reporting off-platform payment/contact requests, include the job ID.
                </div>

                {error && <div style={styles.error} role="alert">{error}</div>}

                {submitted ? (
                  <div style={styles.successPanel} role="status" aria-live="polite">
                    <div style={{ fontWeight: 900, marginBottom: 6 }}>Thanks — we’ve received your request</div>
                    <div style={{ fontSize: 13, color: '#065f46' }}>Our team usually responds within 1 business day.</div>
                    <button
                      type="button"
                      style={{ ...styles.buttonSecondary, marginTop: 12 }}
                      onClick={() => {
                        setSubmitted(false);
                        setSuccess('');
                      }}
                    >
                      Submit another ticket
                    </button>
                  </div>
                ) : (
                  <>
                    {success && <div style={styles.success} role="status" aria-live="polite">{success}</div>}

                    <div style={styles.formGrid} className="support-form-grid">
                      <div>
                        <label htmlFor="support-ticket-category" style={styles.label}>
                          Category
                        </label>
                        <select
                          id="support-ticket-category"
                          value={category}
                          onChange={(e) => setCategory(e.target.value)}
                          style={styles.input}
                          disabled={busy}
                          aria-describedby="support-ticket-category-help"
                        >
                          {CATEGORIES.map((c) => (
                            <option key={c.value} value={c.value}>
                              {c.label}
                            </option>
                          ))}
                        </select>
                        <div style={styles.helperLine} id="support-ticket-category-help">
                          {CATEGORY_HELP[category] || CATEGORY_HELP.other}
                        </div>
                      </div>
                      <div>
                        <label htmlFor="support-ticket-job-id" style={styles.label}>
                          Task ID (optional)
                        </label>
                        <input
                          id="support-ticket-job-id"
                          value={jobId}
                          onChange={(e) => setJobId(e.target.value)}
                          style={styles.input}
                          placeholder="e.g. FEPJ6PDdEuna3iXvpmZj"
                          disabled={busy}
                          autoComplete="off"
                        />
                      </div>
                      <div style={{ gridColumn: '1 / -1' }}>
                        <label htmlFor="support-ticket-message" style={styles.label}>
                          Message
                        </label>
                        <textarea
                          id="support-ticket-message"
                          value={message}
                          onChange={(e) => setMessage(e.target.value)}
                          rows={6}
                          style={styles.textarea}
                          placeholder="Tell us what happened and what outcome you’re looking for…"
                          disabled={busy}
                          required
                        />
                      </div>
                      <div style={{ gridColumn: '1 / -1' }}>
                        <label htmlFor="support-ticket-attachment" style={styles.label}>
                          Attachment (optional)
                        </label>
                        <div style={styles.attachHint} id="support-ticket-attachment-hint">
                          Images or PDFs only • Max 5MB
                        </div>
                        <input
                          ref={fileRef}
                          id="support-ticket-attachment"
                          type="file"
                          accept="image/*,application/pdf"
                          className="taskio-sr-only"
                          onChange={(e) => setFile(e.target.files?.[0] || null)}
                        />
                        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                          <button
                            type="button"
                            style={styles.buttonSecondary}
                            onClick={() => fileRef.current?.click()}
                            disabled={busy}
                            aria-describedby="support-ticket-attachment-hint"
                          >
                            Choose file
                          </button>
                          <div style={{ fontSize: 13, color: '#555' }}>{file ? file.name : 'No file selected'}</div>
                        </div>
                      </div>
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 14 }}>
                      <button type="button" style={styles.buttonPrimary} onClick={submit} disabled={busy || !isNonEmpty(message)}>
                        {busy ? 'Submitting…' : 'Submit ticket'}
                      </button>
                    </div>
                  </>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
      </PageMain>
    </>
  );
}

const styles = {
  page: { background: '#F7F9FA', minHeight: 'calc(100vh - 64px)' },
  container: { maxWidth: 1100, margin: '0 auto', padding: '28px 32px 40px' },
  headerRow: { display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start', marginBottom: 14 },
  title: { fontFamily: 'Poppins, sans-serif', fontSize: 22, fontWeight: 700, color: '#222' },
  subTitle: { fontSize: 13, color: '#666', marginTop: 4 },
  tabs: { display: 'flex', gap: 8, marginBottom: 20, borderBottom: '2px solid #E0E0E0' },
  tab: {
    background: 'transparent',
    border: 'none',
    borderBottom: '2px solid transparent',
    padding: '12px 16px',
    fontSize: 14,
    fontWeight: 600,
    cursor: 'pointer',
    color: '#666',
    marginBottom: '-2px',
  },
  tabActive: { color: '#14C5C5', borderBottomColor: '#14C5C5' },
  ticketsContainer: { minHeight: 400 },
  ticketsLoadFailure: {
    background: '#fff',
    border: '1px solid #E0E0E0',
    borderLeft: '4px solid #14C5C5',
    borderRadius: 12,
    padding: '22px 24px',
    boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
  },
  ticketsLoadFailureTitle: {
    fontFamily: 'Poppins, sans-serif',
    fontSize: 17,
    fontWeight: 700,
    color: '#222',
    marginBottom: 8,
  },
  ticketsLoadFailureText: { fontSize: 14, color: '#666', lineHeight: 1.55, margin: 0 },
  ticketsLoadFailureActions: {
    marginTop: 16,
    display: 'flex',
    flexWrap: 'wrap',
    gap: 10,
    alignItems: 'center',
  },
  buttonRetryTickets: {
    background: '#fff',
    color: '#0f766e',
    border: '1px solid #99f6e4',
    borderRadius: 10,
    padding: '11px 18px',
    minHeight: 44,
    cursor: 'pointer',
    fontWeight: 700,
    fontSize: 14,
    fontFamily: 'Inter, sans-serif',
    boxSizing: 'border-box',
  },
  emptyState: {
    textAlign: 'center',
    padding: '80px 20px',
    backgroundColor: '#fff',
    borderRadius: 12,
    border: '1px solid #E0E0E0',
  },
  ticketsGrid: { display: 'grid', gridTemplateColumns: '400px 1fr', gap: 20 },
  ticketsList: { display: 'flex', flexDirection: 'column', gap: 12 },
  ticketCard: {
    background: '#fff',
    border: '1px solid #E0E0E0',
    borderRadius: 12,
    padding: 16,
    cursor: 'pointer',
    transition: 'all 140ms ease',
  },
  ticketDetail: {
    background: '#fff',
    border: '1px solid #E0E0E0',
    borderRadius: 12,
    overflow: 'hidden',
    maxHeight: 600,
    display: 'flex',
    flexDirection: 'column',
  },
  ticketDetailHeader: {
    padding: '20px 24px',
    borderBottom: '1px solid #E0E0E0',
    backgroundColor: '#FAFAFA',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  ticketDetailBody: {
    padding: 24,
    overflowY: 'auto',
    flex: 1,
  },
  grid: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 },
  card: { background: '#fff', border: '1px solid #E0E0E0', borderRadius: 12, padding: 16, boxShadow: '0 2px 8px rgba(0,0,0,0.06)' },
  cardTitle: { fontWeight: 700, color: '#111', marginBottom: 10 },
  faqRow: {
    width: '100%',
    textAlign: 'left',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 10,
    padding: '12px 12px',
    borderRadius: 12,
    border: '1px solid #F0F0F0',
    background: '#fff',
    marginBottom: 10,
    cursor: 'pointer',
  },
  faqRowTitle: { fontWeight: 700, fontSize: 13, color: '#222' },
  faqChevron: { fontWeight: 700, color: '#666' },
  faqPanel: { marginTop: -4, marginBottom: 10, padding: '0 12px 12px', color: '#666', fontSize: 13, lineHeight: 1.5 },
  note: { fontSize: 13, color: '#666', lineHeight: 1.5, background: '#F7F9FA', border: '1px solid #E0E0E0', padding: 12, borderRadius: 12, marginBottom: 12 },
  formGrid: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 },
  label: { fontSize: 12, fontWeight: 700, color: '#555', marginBottom: 6 },
  input: { width: '100%', boxSizing: 'border-box', borderRadius: 10, border: '1px solid #E0E0E0', padding: '10px 12px', fontSize: 14, fontFamily: 'Inter, sans-serif', background: '#fff' },
  textarea: { width: '100%', boxSizing: 'border-box', borderRadius: 10, border: '1px solid #E0E0E0', padding: '10px 12px', fontSize: 14, fontFamily: 'Inter, sans-serif', resize: 'vertical' },
  helperLine: { marginTop: 8, fontSize: 12, color: '#666', lineHeight: 1.4 },
  attachHint: { marginTop: -2, marginBottom: 10, fontSize: 12, color: '#666' },
  buttonPrimary: { background: '#14C5C5', color: '#fff', border: 'none', borderRadius: 10, padding: '10px 14px', cursor: 'pointer', fontWeight: 700 },
  buttonSecondary: { background: '#f3f4f6', color: '#374151', border: '1px solid #d1d5db', borderRadius: 10, padding: '10px 14px', cursor: 'pointer', fontWeight: 700 },
  error: { background: '#fff1f2', border: '1px solid #fecdd3', color: '#9f1239', padding: '10px 12px', borderRadius: 10, fontSize: 13, marginBottom: 10 },
  success: { background: '#ecfdf5', border: '1px solid #a7f3d0', color: '#065f46', padding: '10px 12px', borderRadius: 10, fontSize: 13, marginBottom: 10 },
  successPanel: { background: '#ecfdf5', border: '1px solid #a7f3d0', color: '#065f46', padding: 14, borderRadius: 12 },
};






