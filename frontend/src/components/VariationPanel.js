import React, { useEffect, useMemo, useState } from 'react';
import { auth, db, storage } from '../firebase';
import {
  collection,
  doc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
} from 'firebase/firestore';
import { getDownloadURL, ref as storageRef, uploadBytesResumable } from 'firebase/storage';
import { loadStripe } from '@stripe/stripe-js';
import { canUseVariations, isVariationReadOnly, isPaymentSecured } from '../utils/jobStateHelpers';
import { createApiClient } from '../api/createApiClient';
import { getVariationStatusLabel } from '../utils/variationStatusLabels';

const stripePromise = process.env.REACT_APP_STRIPE_PUBLISHABLE_KEY
  ? loadStripe(process.env.REACT_APP_STRIPE_PUBLISHABLE_KEY)
  : null;

function centsToAud(cents) {
  const n = Number(cents || 0);
  return `$${(n / 100).toFixed(2)}`;
}

function formatVariationPaidAt(ts) {
  if (!ts || typeof ts._seconds !== 'number') return '';
  return new Date(ts._seconds * 1000).toLocaleDateString('en-AU', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

function variationPillLabel(v) {
  return getVariationStatusLabel(v.status, v.paymentState);
}

function statusPillStyle(status, paymentState) {
  if (status === 'approved' && paymentState === 'in_escrow') {
    return { ...styles.statusPill, background: '#d1fae5', color: '#065f46', borderColor: '#a7f3d0' };
  }
  if (status === 'approved') return { ...styles.statusPill, background: '#d1fae5', color: '#065f46', borderColor: '#a7f3d0' };
  if (status === 'awaiting_payment') return { ...styles.statusPill, background: '#fef3c7', color: '#92400e', borderColor: '#fde68a' };
  if (status === 'declined' || status === 'cancelled') return { ...styles.statusPill, background: '#fee2e2', color: '#991b1b', borderColor: '#fecaca' };
  return styles.statusPill;
}

export default function VariationPanel({ jobId, job, onPendingVariationPayment }) {
  const me = auth.currentUser;

  const role = useMemo(() => {
    if (!me || !job) return null;
    if (job.homeownerUid === me.uid) return 'homeowner';
    if (job.acceptedTradieUid === me.uid) return 'tradie';
    return null;
  }, [me, job]);

  const enabled = !!(job?.acceptedTradieUid && (role === 'homeowner' || role === 'tradie'));

  const readOnly = isVariationReadOnly(job);
  const eligible = canUseVariations(job);
  const paymentSecured = isPaymentSecured(job);

  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState({ title: '', description: '', priceChangeCents: 0, timeImpact: '' });
  const [busy, setBusy] = useState(false);
  const [files, setFiles] = useState([]);

  const MAX_FILE_BYTES = 10 * 1024 * 1024;
  const MAX_FILES = 3;
  const ALLOWED_MIME = new Set([
    'application/pdf',
    'image/jpeg',
    'image/jpg',
    'image/png',
    'image/webp',
    'image/heic',
    'image/heif',
  ]);

  const writeSystemMessage = async (text) => {
    if (!me || !role) return;
    const senderName = (me.displayName || '').trim() || (role === 'homeowner' ? 'Client' : 'Expert');
    const msgRef = doc(collection(db, 'jobs', jobId, 'messages'));
    await setDoc(msgRef, {
      jobId,
      messageId: msgRef.id,
      senderUid: me.uid,
      senderRole: role,
      senderName,
      messageType: 'system',
      text: String(text || '').slice(0, 1000),
      createdAt: serverTimestamp(),
      flagged: false,
      flagReasons: [],
    });
  };

  useEffect(() => {
    if (!jobId || !enabled) {
      setLoading(false);
      setItems([]);
      setError('');
      return undefined;
    }
    if (!eligible && !readOnly) {
      setLoading(false);
      setItems([]);
      setError('');
      return undefined;
    }

    const q = query(collection(db, 'jobs', jobId, 'variations'), orderBy('createdAt', 'desc'));
    const unsub = onSnapshot(
      q,
      (snap) => {
        const next = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        setItems(next);
        setLoading(false);
        if (onPendingVariationPayment) {
          onPendingVariationPayment(next.some((v) => v.status === 'awaiting_payment'));
        }
      },
      (e) => {
        console.error('Variations listen failed:', e);
        if (e?.code === 'permission-denied') {
          setError('Variations are not available for this job right now.');
        } else {
          setError('Could not load variations.');
        }
        setLoading(false);
      }
    );
    return () => unsub();
  }, [jobId, enabled, eligible, readOnly, onPendingVariationPayment]);

  const addFiles = (fileList) => {
    const next = Array.from(fileList || []);
    if (next.length === 0) return;
    setError('');
    const out = [];
    for (const f of next) {
      if (files.length + out.length >= MAX_FILES) break;
      if (f.size > MAX_FILE_BYTES) {
        setError('One of the files is too large (max 10MB).');
        continue;
      }
      if (f.type && !ALLOWED_MIME.has(f.type)) {
        setError('Unsupported file type. Please upload an image or PDF.');
        continue;
      }
      out.push(f);
    }
    if (out.length > 0) setFiles((p) => [...p, ...out]);
  };

  const removeFile = (idx) => {
    setFiles((p) => p.filter((_, i) => i !== idx));
  };

  const redirectToStripe = async (sessionId) => {
    const stripe = await stripePromise;
    if (!stripe) {
      setError('Stripe failed to load. Please refresh and try again.');
      return;
    }
    const { error: stripeErr } = await stripe.redirectToCheckout({ sessionId });
    if (stripeErr) setError('Payment could not start. Please try again.');
  };

  const submitVariation = async () => {
    setError('');
    if (!me) return;
    if (!enabled || role !== 'tradie') return;
    if (readOnly) return;
    if (!eligible) {
      setError('Variations are not available at this stage of the task.');
      return;
    }

    const title = form.title.trim();
    const description = form.description.trim();
    const timeImpact = form.timeImpact.trim();
    const priceChangeCents = Math.max(0, Math.floor(Number(form.priceChangeCents || 0)));

    if (title.length < 3) return setError('Please add a short title (min 3 characters).');
    if (description.length < 10) return setError('Please add a short description (min 10 characters).');
    if (timeImpact.length > 200) return setError('Time impact is too long.');

    setBusy(true);
    try {
      const uploadId = Math.random().toString(36).slice(2, 10);
      const attachmentMeta = [];
      for (const f of files) {
        const path = `job-attachments/${jobId}/variation-${uploadId}/${f.name}`;
        const r = storageRef(storage, path);
        const task = uploadBytesResumable(r, f, { contentType: f.type || undefined });
        await new Promise((resolve, reject) => {
          task.on('state_changed', undefined, (err) => reject(err), () => resolve());
        });
        const url = await getDownloadURL(r);
        attachmentMeta.push({
          fileName: f.name,
          fileSize: f.size,
          mimeType: f.type || 'application/octet-stream',
          storagePath: path,
          downloadUrl: url,
        });
      }

      const api = createApiClient();
      const { data } = await api.post(`/api/jobs/${jobId}/variations`, {
        title,
        description,
        priceChangeCents,
        timeImpact,
        attachments: attachmentMeta,
      });

      const variationId = data?.variationId || '';
      setForm({ title: '', description: '', priceChangeCents: 0, timeImpact: '' });
      setFiles([]);
      setFormOpen(false);
      writeSystemMessage(
        `Variation requested (#${variationId.slice(0, 6)}): ${title} \u2022 +${centsToAud(priceChangeCents)}${timeImpact ? ` \u2022 ${timeImpact}` : ''}${attachmentMeta.length ? ` \u2022 ${attachmentMeta.length} attachment(s)` : ''}`
      ).catch(() => {});
    } catch (e) {
      console.error('Create variation failed:', e);
      const serverMsg = e?.response?.data?.message;
      setError(serverMsg || 'Failed to create variation. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  const approveVariation = async (variationId) => {
    setError('');
    if (!me || role !== 'homeowner') return;
    setBusy(true);
    try {
      const api = createApiClient();
      const { data } = await api.post(`/api/jobs/${jobId}/variations/${variationId}/approve`);
      if (data?.sessionId) {
        await redirectToStripe(data.sessionId);
      } else {
        writeSystemMessage(`Variation approved (#${String(variationId).slice(0, 6)}).`).catch(() => {});
      }
    } catch (e) {
      console.error('Approve variation failed:', e);
      setError(e?.response?.data?.message || 'Failed to approve variation. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  const declineVariation = async (variationId) => {
    setError('');
    if (!me || role !== 'homeowner') return;
    setBusy(true);
    try {
      const api = createApiClient();
      await api.post(`/api/jobs/${jobId}/variations/${variationId}/decline`);
      writeSystemMessage(`Variation declined (#${String(variationId).slice(0, 6)}).`).catch(() => {});
    } catch (e) {
      console.error('Decline variation failed:', e);
      setError(e?.response?.data?.message || 'Failed to decline variation. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  const continueVariationPayment = async (variationId) => {
    setError('');
    if (!me || role !== 'homeowner') return;
    setBusy(true);
    try {
      const api = createApiClient();
      const { data } = await api.post(`/api/jobs/${jobId}/variations/${variationId}/checkout`);
      if (data?.sessionId) {
        await redirectToStripe(data.sessionId);
      }
    } catch (e) {
      console.error('Continue variation payment failed:', e);
      setError(e?.response?.data?.message || 'Failed to start payment. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  const cancelVariation = async (variationId) => {
    setError('');
    if (!me || role !== 'tradie') return;
    setBusy(true);
    try {
      const api = createApiClient();
      await api.post(`/api/jobs/${jobId}/variations/${variationId}/cancel`);
      writeSystemMessage(`Variation cancelled (#${String(variationId).slice(0, 6)}).`).catch(() => {});
    } catch (e) {
      console.error('Cancel variation failed:', e);
      setError(e?.response?.data?.message || 'Failed to cancel variation. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  if (!enabled) {
    return null;
  }

  return (
    <div style={styles.wrap}>
      <div style={styles.header}>
        <div>
          <div style={styles.title}>Variations</div>
          <div style={styles.subTitle}>Record scope/price/time changes with approval.</div>
        </div>
        {role === 'tradie' && !readOnly && eligible && (
          <button type="button" style={styles.btn} onClick={() => setFormOpen((p) => !p)} disabled={busy}>
            {formOpen ? 'Close' : 'Request Variation'}
          </button>
        )}
      </div>

      {error && <div style={styles.error}>{error}</div>}

      {!eligible && !readOnly && (
        <div style={styles.info}>
          {paymentSecured
            ? 'Variations will be available once work starts.'
            : 'Variations unlock once payment is secured and work is in progress.'}
        </div>
      )}

      {readOnly && (
        <div style={styles.info}>
          Variation history is shown below &mdash; no new variations can be submitted at this stage.
        </div>
      )}

      {role === 'tradie' && eligible && formOpen && (
        <div style={styles.form}>
          <label style={styles.label}>Title</label>
          <input
            style={styles.input}
            value={form.title}
            onChange={(e) => setForm((p) => ({ ...p, title: e.target.value }))}
            placeholder="e.g., Replace corroded valve"
          />
          <label style={styles.label}>Description</label>
          <textarea
            style={styles.textarea}
            value={form.description}
            onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))}
            rows={4}
            placeholder="What changed and why?"
          />
          <div style={styles.row}>
            <div style={{ flex: 1 }}>
              <label style={styles.label}>Price change (AUD)</label>
              <input
                style={styles.input}
                type="number"
                min={0}
                step={1}
                value={Math.floor(Number(form.priceChangeCents || 0) / 100)}
                onChange={(e) => setForm((p) => ({ ...p, priceChangeCents: Math.max(0, Number(e.target.value || 0) * 100) }))}
              />
            </div>
            <div style={{ flex: 2 }}>
              <label style={styles.label}>Time impact</label>
              <input
                style={styles.input}
                value={form.timeImpact}
                onChange={(e) => setForm((p) => ({ ...p, timeImpact: e.target.value }))}
                placeholder="e.g., +1 day"
              />
            </div>
          </div>

          <label style={styles.label}>Attachments (optional)</label>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
            <label style={styles.attachBtn}>
              <input
                type="file"
                accept="image/*,application/pdf"
                multiple
                onChange={(e) => addFiles(e.target.files)}
                disabled={busy}
                style={{ display: 'none' }}
              />
              Add files
            </label>
            <div style={{ fontSize: 12, color: '#666' }}>Up to {MAX_FILES} files &bull; Max 10MB each</div>
          </div>
          {files.length > 0 && (
            <div style={{ marginTop: 10, display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {files.map((f, idx) => (
                <div key={`${f.name}-${idx}`} style={styles.fileChip}>
                  <span style={styles.fileChipName}>{f.name}</span>
                  <button type="button" style={styles.fileChipRemove} onClick={() => removeFile(idx)} disabled={busy} aria-label="Remove file">
                    &times;
                  </button>
                </div>
              ))}
            </div>
          )}

          <button type="button" style={styles.primary} onClick={submitVariation} disabled={busy}>
            {busy ? 'Submitting...' : 'Submit request'}
          </button>
        </div>
      )}

      {loading ? (
        <div style={styles.muted}>Loading...</div>
      ) : items.length === 0 ? (
        <div style={styles.muted}>No variations yet.</div>
      ) : (
        <div style={styles.list}>
          {items.map((v) => (
            <div key={v.id} style={styles.card}>
              <div style={styles.cardTop}>
                <div style={{ fontWeight: 900 }}>{v.title}</div>
                <div style={statusPillStyle(v.status, v.paymentState)}>{variationPillLabel(v)}</div>
              </div>
              <div style={styles.meta}>
                <div><strong>Price:</strong> {centsToAud(v.priceChangeCents)}</div>
                <div><strong>Time:</strong> {v.timeImpact || '\u2014'}</div>
              </div>
              <div style={styles.desc}>{v.description}</div>

              {Array.isArray(v.attachments) && v.attachments.length > 0 && (
                <div style={{ marginTop: 10, display: 'grid', gap: 6 }}>
                  <div style={{ fontSize: 12, fontWeight: 900, color: '#555' }}>Attachments</div>
                  {v.attachments.slice(0, 6).map((a, idx) => (
                    <a
                      key={`${v.id}-att-${idx}`}
                      href={a.downloadUrl}
                      target="_blank"
                      rel="noreferrer"
                      style={{ fontSize: 13, color: '#14C5C5', fontWeight: 800, textDecoration: 'none' }}
                    >
                      {a.fileName || 'Attachment'}
                    </a>
                  ))}
                </div>
              )}

              {/* Client: pending — Approve & pay or just Approve (free), plus Decline */}
              {role === 'homeowner' && v.status === 'pending' && !readOnly && (
                <div style={styles.actions}>
                  <button
                    type="button"
                    style={styles.approve}
                    onClick={() => approveVariation(v.id)}
                    disabled={busy}
                  >
                    {Number(v.priceChangeCents || 0) > 0 ? 'Approve & pay variation' : 'Approve'}
                  </button>
                  <button
                    type="button"
                    style={styles.decline}
                    onClick={() => declineVariation(v.id)}
                    disabled={busy}
                  >
                    Decline
                  </button>
                </div>
              )}

              {/* Client: awaiting_payment — Continue or Decline */}
              {role === 'homeowner' && v.status === 'awaiting_payment' && !readOnly && (
                <div style={styles.actions}>
                  <button
                    type="button"
                    style={styles.approve}
                    onClick={() => continueVariationPayment(v.id)}
                    disabled={busy}
                  >
                    Continue variation payment
                  </button>
                  <button
                    type="button"
                    style={styles.decline}
                    onClick={() => declineVariation(v.id)}
                    disabled={busy}
                  >
                    Decline
                  </button>
                </div>
              )}

              {/* Client: approved + payment secured */}
              {role === 'homeowner' && v.status === 'approved' && v.paymentState === 'in_escrow' && (
                <div style={styles.paymentSecuredBadge}>
                  &#10003; Your variation payment has been secured. The expert can proceed with the approved work.
                  {formatVariationPaidAt(v.paidAt) ? (
                    <div style={{ marginTop: 6, fontWeight: 700, opacity: 0.95 }}>Paid on {formatVariationPaidAt(v.paidAt)}</div>
                  ) : null}
                </div>
              )}

              {/* Client: free variation approved */}
              {role === 'homeowner' && v.status === 'approved' && v.paymentState !== 'in_escrow' && (
                <div style={styles.paymentSecuredBadge}>&#10003; Approved</div>
              )}

              {/* Expert: cancel own pending request */}
              {role === 'tradie' && v.status === 'pending' && v.createdByUid === me?.uid && !readOnly && (
                <div style={styles.actions}>
                  <button type="button" style={styles.decline} onClick={() => cancelVariation(v.id)} disabled={busy}>
                    Cancel request
                  </button>
                </div>
              )}

              {/* Expert: awaiting client payment */}
              {role === 'tradie' && v.status === 'awaiting_payment' && (
                <div style={styles.awaitingPaymentNotice}>
                  Awaiting Client payment for this variation.
                </div>
              )}

              {/* Expert: variation payment secured */}
              {role === 'tradie' && v.status === 'approved' && v.paymentState === 'in_escrow' && (
                <div style={styles.paymentSecuredBadge}>
                  &#10003; Variation payment secured. You can proceed with the approved additional work.
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

const styles = {
  wrap: { background: '#fff', border: '1px solid #E0E0E0', borderRadius: 12, padding: 16, marginTop: 20 },
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, marginBottom: 12 },
  title: { fontFamily: 'Poppins, sans-serif', fontSize: 18, fontWeight: 800, color: '#222' },
  subTitle: { fontSize: 13, color: '#666', marginTop: 2 },
  btn: { borderRadius: 10, border: '1px solid #d1d5db', background: '#fff', padding: '10px 12px', fontWeight: 800, cursor: 'pointer', color: '#111', minWidth: 140 },
  error: { background: '#fff1f2', border: '1px solid #fecdd3', color: '#9f1239', padding: '10px 12px', borderRadius: 10, fontSize: 13, marginBottom: 10 },
  info: { background: '#F7F9FA', border: '1px solid #E0E0E0', color: '#555', padding: '10px 12px', borderRadius: 10, fontSize: 13, marginBottom: 10 },
  muted: { color: '#777', fontSize: 13 },
  form: { border: '1px solid #F0F0F0', borderRadius: 12, padding: 12, background: '#F7F9FA', marginBottom: 12 },
  label: { display: 'block', fontSize: 13, fontWeight: 800, color: '#222', marginBottom: 6, marginTop: 10 },
  input: { width: '100%', boxSizing: 'border-box', borderRadius: 10, border: '1px solid #E0E0E0', padding: 10, fontSize: 14 },
  textarea: { width: '100%', boxSizing: 'border-box', borderRadius: 10, border: '1px solid #E0E0E0', padding: 10, fontSize: 14, resize: 'vertical' },
  row: { display: 'flex', gap: 12, alignItems: 'flex-start' },
  attachBtn: { height: 36, borderRadius: 10, border: '1px solid #d1d5db', background: '#fff', padding: '0 12px', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontWeight: 900, cursor: 'pointer', color: '#374151', fontSize: 13 },
  fileChip: { display: 'inline-flex', alignItems: 'center', gap: 6, background: '#fff', border: '1px solid #E0E0E0', borderRadius: 999, padding: '6px 10px', fontSize: 12, color: '#333' },
  fileChipName: { maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: 800 },
  fileChipRemove: { border: 'none', background: 'transparent', cursor: 'pointer', fontSize: 16, lineHeight: 1, color: '#6b7280', padding: 0 },
  primary: { marginTop: 12, height: 44, borderRadius: 10, border: 'none', background: '#FF9100', color: '#fff', fontWeight: 900, cursor: 'pointer', padding: '0 16px' },
  list: { display: 'grid', gap: 10 },
  card: { border: '1px solid #E0E0E0', borderRadius: 12, padding: 12, background: '#fff' },
  cardTop: { display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'center' },
  statusPill: { fontSize: 12, fontWeight: 900, padding: '4px 10px', borderRadius: 999, border: '1px solid #E0E0E0', background: '#F7F9FA', color: '#555', textTransform: 'capitalize' },
  meta: { marginTop: 8, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, fontSize: 13, color: '#333' },
  desc: { marginTop: 8, fontSize: 14, color: '#444', whiteSpace: 'pre-wrap', lineHeight: 1.45 },
  actions: { marginTop: 10, display: 'flex', gap: 10, justifyContent: 'flex-end', flexWrap: 'wrap' },
  approve: { height: 40, borderRadius: 10, border: 'none', background: '#52d68a', color: '#fff', fontWeight: 900, cursor: 'pointer', padding: '0 14px' },
  decline: { height: 40, borderRadius: 10, border: '1px solid #d1d5db', background: '#fff', color: '#374151', fontWeight: 900, cursor: 'pointer', padding: '0 14px' },
  paymentSecuredBadge: { marginTop: 10, fontSize: 13, fontWeight: 800, color: '#065f46', background: '#d1fae5', border: '1px solid #a7f3d0', borderRadius: 8, padding: '8px 12px' },
  awaitingPaymentNotice: { marginTop: 10, fontSize: 13, fontWeight: 800, color: '#92400e', background: '#fef3c7', border: '1px solid #fde68a', borderRadius: 8, padding: '8px 12px' },
};
