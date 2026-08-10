import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { auth, db, storage } from '../firebase';
import {
  collection,
  doc,
  getDoc,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  Timestamp,
  updateDoc,
  arrayUnion,
  increment,
} from 'firebase/firestore';
import { getDownloadURL, ref as storageRef, uploadBytesResumable } from 'firebase/storage';
import { createApiClient } from '../api/createApiClient';
import { isChatEnabled, JOB_STATUSES, normalizeLegacyStatus } from '../constants/jobStatus';
import { detectChatFlags, highestSeverity, severityScore } from '../utils/chatFlags';
import { getClientAccountStatus, shouldBlockClientChat } from '../utils/homeownerAccount';
import { getMessageLayoutType, getPreferredSenderName, getRenderedSenderName } from '../utils/chatSenderDisplay';
import { resolveThreadJobId } from '../utils/chatThreads';
import { markMessageNotificationsReadForJob } from '../utils/markMessageNotificationsReadForJob';
import { CLIENT_CHAT_ACCOUNT_GATE } from '../constants/blockedFlowCopy';

const MAX_TEXT_CHARS = 4000;
const MAX_FILE_BYTES = 10 * 1024 * 1024;
const MAX_ATTACHMENTS_PER_SEND = 3;

const EXPERT_PROGRESS_STATUS_LABELS = {
  work_started: 'Work started',
  needs_more_info: 'Needs more info',
  ready_for_review: 'Ready for review',
};

const EXPERT_BANNER_TONE = {
  default: { color: '#0f766e' },
  awaiting: { color: '#6b21a8' },
  paid: { color: '#115e59' },
  disputed: { color: '#9f1239' },
  cancelled: { color: '#6b7280' },
};
const ALLOWED_MIME = new Set([
  'application/pdf',
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
  'image/heic',
  'image/heif',
]);

const api = createApiClient();

function formatTs(ts) {
  if (!ts) return '';
  // Firestore Timestamp
  if (ts?.seconds) return new Date(ts.seconds * 1000).toLocaleString('en-AU');
  // Legacy backend format
  if (ts?._seconds) return new Date(ts._seconds * 1000).toLocaleString('en-AU');
  return '';
}

function isImageMime(mimeType) {
  return typeof mimeType === 'string' && mimeType.startsWith('image/');
}

export default function JobChatPanel({ jobId, fallbackJob, alwaysListen = false, variant = 'default' }) {
  const [jobLive, setJobLive] = useState(null);
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [sendBusy, setSendBusy] = useState(false);
  const [text, setText] = useState('');
  const [error, setError] = useState('');
  const [uploadQueue, setUploadQueue] = useState([]); // File[]
  const [clientAccountReady, setClientAccountReady] = useState(false);
  const [senderProfilesByUid, setSenderProfilesByUid] = useState({});
  const [progressBusy, setProgressBusy] = useState(false);

  const listRef = useRef(null);
  const endRef = useRef(null);

  const job = useMemo(() => {
    if (jobLive && fallbackJob) {
      return { ...fallbackJob, ...jobLive };
    }
    return jobLive || fallbackJob || null;
  }, [fallbackJob, jobLive]);

  const me = auth.currentUser;
  const navigate = useNavigate();

  const myRole = useMemo(() => {
    if (!me || !job) return null;
    if (job?.homeownerUid === me.uid) return 'homeowner';
    if (job?.acceptedTradieUid === me.uid) return 'tradie';
    return null;
  }, [me, job]);

  const chatEnabled = useMemo(() => {
    return !!(job?.acceptedTradieUid && (myRole === 'homeowner' || myRole === 'tradie'));
  }, [job, myRole]);

  const chatCanRead = useMemo(() => {
    if (!chatEnabled) return false;
    // Admin transcript / monitoring should be able to read regardless of payment state.
    if (alwaysListen) return true;
    // Use centralized status-based gating: FUNDED, IN_PROGRESS, COMPLETED, DISPUTED, PAID
    const normalized = normalizeLegacyStatus(job?.status);
    if (isChatEnabled(normalized)) return true;
    if (job?.status === 'completed' || job?.status === 'cancelled' || job?.status === 'disputed') return true;
    return false;
  }, [alwaysListen, chatEnabled, job]);

  const chatReadOnly = useMemo(() => {
    const status = job?.status;
    const frozen = job?.chatFrozen === true;
    const closed = status === 'cancelled' || status === 'completed' || status === 'disputed';
    return frozen || closed;
  }, [job]);

  const shouldBlockClientMessaging = myRole === 'homeowner'
    && shouldBlockClientChat({ status: job?.status, durableAccountReady: clientAccountReady });

  /** For Experts: true job state (e.g. awaiting client) overrides `progressStatus` in the chat header. */
  const { expertBannerText, expertBannerTone } = useMemo(() => {
    if (!job || myRole !== 'tradie') {
      return { expertBannerText: null, expertBannerTone: 'default' };
    }
    const ns = normalizeLegacyStatus(job.status);
    if (ns === JOB_STATUSES.COMPLETED) {
      return {
        expertBannerText: 'Awaiting Client approval — they release payment when satisfied.',
        expertBannerTone: 'awaiting',
      };
    }
    if (ns === JOB_STATUSES.PAID) {
      return {
        expertBannerText: 'Payment released. This task is closed.',
        expertBannerTone: 'paid',
      };
    }
    if (ns === JOB_STATUSES.DISPUTED) {
      return { expertBannerText: 'This task is in dispute.', expertBannerTone: 'disputed' };
    }
    if (ns === JOB_STATUSES.CANCELLED) {
      return { expertBannerText: 'This task was cancelled.', expertBannerTone: 'cancelled' };
    }
    if (job.progressStatus && EXPERT_PROGRESS_STATUS_LABELS[job.progressStatus]) {
      return {
        expertBannerText: `Current: ${EXPERT_PROGRESS_STATUS_LABELS[job.progressStatus]}`,
        expertBannerTone: 'default',
      };
    }
    return { expertBannerText: null, expertBannerTone: 'default' };
  }, [job, myRole]);

  useEffect(() => {
    if (!jobId) return undefined;

    // Live job doc (for status/chatFrozen updates)
    const jobUnsub = onSnapshot(
      doc(db, 'jobs', jobId),
      (snap) => {
        const liveJob = snap.exists() ? { id: snap.id, ...snap.data() } : null;
        setJobLive(liveJob);
      },
      () => {
        // Don't block chat UI on this; we still have fallbackJob from API
      }
    );

    // Live messages: only attach listener when chat can exist / should be visible.
    let msgUnsub = () => {};
    if (chatCanRead) {
      const q = query(
        collection(db, 'jobs', jobId, 'messages'),
        orderBy('createdAt', 'asc'),
        limit(200)
      );
      msgUnsub = onSnapshot(
        q,
        (snap) => {
          const rows = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
          setMessages(rows);
          setLoading(false);
          // scroll to bottom on new messages
          setTimeout(() => endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' }), 50);
        },
        (e) => {
          console.error('Chat listener error:', e);
          setLoading(false);
          // Keep this generic for users; eligibility messaging is handled separately below.
          if (e?.code === 'permission-denied') {
            setError('Chat isn’t available for this job yet.');
          } else {
            setError('Could not load chat. Please refresh.');
          }
        }
      );
    } else {
      // Not eligible yet (e.g., awaiting funding) — avoid showing scary errors.
      setMessages([]);
      setError('');
      setLoading(false);
    }

    return () => {
      jobUnsub();
      msgUnsub();
    };
  }, [jobId, chatCanRead]);

  // Load client account-completion state. Payment still requires a durable method,
  // but post-payment chat should not be blocked once chat-enabled statuses are reached.
  useEffect(() => {
    let mounted = true;
    async function loadAccountState() {
      try {
        if (!me?.uid) return;
        const snap = await getDoc(doc(db, 'users', me.uid));
        const data = snap.exists() ? (snap.data() || {}) : {};
        const ok = getClientAccountStatus(data, me).durableAccountReady;
        if (mounted) setClientAccountReady(Boolean(ok));
      } catch (e) {
        if (mounted) setClientAccountReady(false);
      }
    }
    loadAccountState();
    return () => {
      mounted = false;
    };
  }, [me]);

  useEffect(() => {
    let mounted = true;
    async function loadSenderProfiles() {
      const uidSet = new Set(
        [
          me?.uid,
          job?.homeownerUid,
          job?.acceptedTradieUid,
          ...messages.map((m) => m?.senderUid),
        ].filter((v) => typeof v === 'string' && v.trim())
      );
      if (uidSet.size === 0) return;

      const next = {};
      await Promise.all(
        Array.from(uidSet).map(async (uid) => {
          try {
            const snap = await getDoc(doc(db, 'users', uid));
            if (snap.exists()) next[uid] = snap.data() || {};
          } catch (e) {
            // Best-effort profile enrichment for chat display.
          }
        })
      );
      if (mounted) {
        setSenderProfilesByUid((prev) => ({ ...prev, ...next }));
      }
    }
    loadSenderProfiles();
    return () => {
      mounted = false;
    };
  }, [job?.homeownerUid, job?.acceptedTradieUid, me?.uid, messages]);

  useEffect(() => {
    if (!chatCanRead || !me?.uid || !jobId || messages.length === 0) return undefined;

    let active = true;
    async function markThreadRead() {
      const threadJobId = resolveThreadJobId({ jobId });
      if (!threadJobId) return;
      try {
        const threadRef = doc(db, 'users', me.uid, 'chatThreads', threadJobId);
        const threadSnap = await getDoc(threadRef);
        if (!active || !threadSnap.exists()) return;
        await updateDoc(threadRef, {
          unreadCount: 0,
          lastReadAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      } catch (e) {
        // Best-effort: chat remains usable even if thread summaries are not ready yet.
      }
      try {
        await markMessageNotificationsReadForJob(db, me.uid, threadJobId);
      } catch (_) {
        /* ignore */
      }
    }

    markThreadRead();

    return () => {
      active = false;
    };
  }, [chatCanRead, jobId, me?.uid, messages.length]);

  const addFiles = (fileList) => {
    const files = Array.from(fileList || []);
    if (files.length === 0) return;
    setError('');

    const next = [];
    for (const f of files) {
      if (next.length + uploadQueue.length >= MAX_ATTACHMENTS_PER_SEND) break;
      if (f.size > MAX_FILE_BYTES) {
        setError('One of the files is too large (max 10MB).');
        continue;
      }
      if (f.type && !ALLOWED_MIME.has(f.type)) {
        setError('Unsupported file type. Please upload an image or PDF.');
        continue;
      }
      next.push(f);
    }
    if (next.length > 0) setUploadQueue((p) => [...p, ...next]);
  };

  const removeQueuedFile = (idx) => {
    setUploadQueue((p) => p.filter((_, i) => i !== idx));
  };

  const sendText = async () => {
    const trimmed = text.trim();
    if (!trimmed) return;
    if (!job || !me) return;
    if (!chatCanRead) return;
    if (chatReadOnly) return;
    if (shouldBlockClientMessaging) {
      setError('Verify your email or continue with Google before payment so chat can unlock smoothly once payment is secured.');
      return;
    }
    if (trimmed.length > MAX_TEXT_CHARS) {
      setError(`Message is too long (max ${MAX_TEXT_CHARS} characters).`);
      return;
    }

    setSendBusy(true);
    setError('');
    try {
      const messageRef = doc(collection(db, 'jobs', jobId, 'messages'));
      const senderName = getPreferredSenderName(me, myRole, senderProfilesByUid?.[me?.uid]);

      const detected = detectChatFlags(trimmed);
      const reasonTypes = detected.map((f) => f.type);
      await setDoc(messageRef, {
        jobId,
        messageId: messageRef.id,
        senderUid: me.uid,
        senderRole: myRole,
        senderName,
        messageType: 'text',
        text: trimmed,
        createdAt: serverTimestamp(),
        flagged: detected.length > 0,
        flagReasons: reasonTypes,
      });

      // Flag only — do not block. Persist job-level flags for admin triage.
      if (detected.length > 0) {
        const at = Timestamp.now();
        const entries = detected.map((f) => ({
          type: f.type,
          match: f.match,
          messageId: messageRef.id,
          senderRole: myRole,
          at,
          severity: f.severity,
        }));

        const currentHighest = String(job?.highestFlagSeverity || 'LOW').toUpperCase();
        const nextHighest = highestSeverity(detected);
        const highest = severityScore(nextHighest) > severityScore(currentHighest) ? nextHighest : currentHighest;

        await updateDoc(doc(db, 'jobs', jobId), {
          requiresAdminAttention: true,
          flaggedChatCount: increment(entries.length),
          lastFlaggedAt: serverTimestamp(),
          highestFlagSeverity: highest,
          flagTypes: arrayUnion(...reasonTypes),
          chatFlags: arrayUnion(...entries),
        });
      }

      setText('');
    } catch (e) {
      console.error('Send message failed:', e);
      setError(e?.message || 'Failed to send message.');
    } finally {
      setSendBusy(false);
    }
  };

  const postSystemMessage = async (systemText) => {
    if (!job || !me) return;
    if (!chatCanRead) return;
    if (chatReadOnly) return;
    if (shouldBlockClientMessaging) {
      setError('Verify your email or continue with Google before payment so chat can unlock smoothly once payment is secured.');
      return;
    }

    const messageRef = doc(collection(db, 'jobs', jobId, 'messages'));
    const senderName = getPreferredSenderName(me, myRole, senderProfilesByUid?.[me?.uid]);
    await setDoc(messageRef, {
      jobId,
      messageId: messageRef.id,
      senderUid: me.uid,
      senderRole: myRole,
      senderName,
      messageType: 'system',
      text: String(systemText || '').slice(0, 1000),
      createdAt: serverTimestamp(),
      flagged: false,
      flagReasons: [],
    });
  };

  const setProgressStatus = async (next) => {
    if (!job || !me) return;
    if (myRole !== 'tradie') return;
    if (chatReadOnly) return;
    if (!chatCanRead) return;
    if (!EXPERT_PROGRESS_STATUS_LABELS[next]) return;
    if (job.progressStatus === next) return;
    if (progressBusy) return;

    setProgressBusy(true);
    setError('');
    try {
      const { data } = await api.post(`/api/jobs/${jobId}/progress-status`, { progressStatus: next });
      if (data?.unchanged) return;
      const label = EXPERT_PROGRESS_STATUS_LABELS[next] || next;
      await postSystemMessage(`Status update: ${label}.`);
    } catch (e) {
      console.error('Update progressStatus failed:', e);
      setError('Could not update task progress. Please refresh and try again.');
    } finally {
      setProgressBusy(false);
    }
  };

  const uploadAndSendAttachments = async () => {
    if (!job || !me) return;
    if (!chatCanRead) return;
    if (chatReadOnly) return;
    if (uploadQueue.length === 0) return;

    setSendBusy(true);
    setError('');
    try {
      // Upload sequentially so messageId maps cleanly to each file.
      for (const file of uploadQueue) {
        const messageRef = doc(collection(db, 'jobs', jobId, 'messages'));
        const path = `job-attachments/${jobId}/${messageRef.id}/${file.name}`;
        const r = storageRef(storage, path);

        const task = uploadBytesResumable(r, file, {
          contentType: file.type || undefined,
        });

        await new Promise((resolve, reject) => {
          task.on(
            'state_changed',
            undefined,
            (err) => reject(err),
            () => resolve()
          );
        });

        const url = await getDownloadURL(r);
        const senderName = getPreferredSenderName(me, myRole, senderProfilesByUid?.[me?.uid]);

        await setDoc(messageRef, {
          jobId,
          messageId: messageRef.id,
          senderUid: me.uid,
          senderRole: myRole,
          senderName,
          messageType: 'attachment',
          attachment: {
            fileName: file.name,
            fileSize: file.size,
            mimeType: file.type || 'application/octet-stream',
            storagePath: path,
            downloadUrl: url,
          },
          createdAt: serverTimestamp(),
          flagged: false,
          flagReasons: [],
        });
      }

      setUploadQueue([]);
    } catch (e) {
      console.error('Attachment upload failed:', e);
      setError('Upload failed. Please try again.');
    } finally {
      setSendBusy(false);
    }
  };

  const onSend = async () => {
    if (sendBusy) return;
    // Send text first, then attachments (or just attachments)
    if (text.trim()) await sendText();
    if (uploadQueue.length > 0) await uploadAndSendAttachments();
  };

  const styles = useMemo(() => {
    if (variant !== 'expertCompact') return CHAT_PANEL_STYLES;
    return {
      ...CHAT_PANEL_STYLES,
      wrap: { ...CHAT_PANEL_STYLES.wrap, padding: 11, marginTop: 0 },
      headerRow: { ...CHAT_PANEL_STYLES.headerRow, marginBottom: 6 },
      title: { ...CHAT_PANEL_STYLES.title, fontSize: 15 },
      subTitle: { ...CHAT_PANEL_STYLES.subTitle, fontSize: 11, lineHeight: 1.35 },
      list: { ...CHAT_PANEL_STYLES.list, maxHeight: 220, padding: 6 },
      actionsRow: {
        ...CHAT_PANEL_STYLES.actionsRow,
        gap: 6,
        marginBottom: 8,
        marginTop: 2,
        padding: '8px 8px 9px',
        background: '#F9FAFB',
        borderRadius: 10,
        border: '1px solid #E5E7EB',
      },
      actionBtn: { ...CHAT_PANEL_STYLES.actionBtn, height: 32, fontSize: 11, padding: '0 8px', fontWeight: 800 },
      msgRow: { ...CHAT_PANEL_STYLES.msgRow, padding: '3px 0' },
      msgBubble: { ...CHAT_PANEL_STYLES.msgBubble, padding: '7px 9px', minWidth: 108 },
      msgMeta: { ...CHAT_PANEL_STYLES.msgMeta, gap: 8, marginBottom: 1 },
      msgSender: { ...CHAT_PANEL_STYLES.msgSender, fontSize: 11 },
      msgTime: { ...CHAT_PANEL_STYLES.msgTime, fontSize: 10 },
      msgText: { ...CHAT_PANEL_STYLES.msgText, fontSize: 13, marginTop: 3, lineHeight: 1.38 },
      systemMsg: { ...CHAT_PANEL_STYLES.systemMsg, fontSize: 11, padding: '5px 8px', lineHeight: 1.4 },
      composer: { ...CHAT_PANEL_STYLES.composer, marginTop: 6 },
      input: { ...CHAT_PANEL_STYLES.input, padding: 8, minHeight: 64, fontSize: 14 },
      composerRow: { ...CHAT_PANEL_STYLES.composerRow, marginTop: 6, alignItems: 'center' },
      sendBtn: { ...CHAT_PANEL_STYLES.sendBtn, height: 38, minWidth: 88, fontSize: 12 },
      attachBtn: { ...CHAT_PANEL_STYLES.attachBtn, height: 32, width: 80, fontSize: 12 },
      progressStatusRow: { ...CHAT_PANEL_STYLES.progressStatusRow, fontSize: 11, marginBottom: 5 },
    };
  }, [variant]);

  return (
    <>
      <style>{`
        @media (max-width: 480px) {
          .job-chat-panel-root {
            padding: 12px !important;
            margin-top: 12px !important;
            max-width: 100% !important;
            min-width: 0 !important;
            box-sizing: border-box !important;
            overflow-x: hidden;
          }
          .job-chat-header {
            flex-direction: column !important;
            align-items: flex-start !important;
            gap: 8px !important;
          }
          .job-chat-progress-actions {
            flex-direction: column !important;
            align-items: stretch !important;
            gap: 8px !important;
          }
          .job-chat-progress-actions button {
            width: 100% !important;
            min-height: 44px !important;
            box-sizing: border-box !important;
          }
          .job-chat-composer-row {
            flex-direction: column-reverse !important;
            align-items: stretch !important;
            gap: 10px !important;
          }
          .job-chat-composer-row .job-chat-send {
            width: 100% !important;
            min-height: 48px !important;
            box-sizing: border-box !important;
          }
          .job-chat-composer-row .job-chat-attach {
            width: 100% !important;
            min-height: 44px !important;
            justify-content: center !important;
            box-sizing: border-box !important;
          }
        }
      `}</style>
    <div style={styles.wrap} className="job-chat-panel-root">
      <div style={styles.headerRow} className="job-chat-header">
        <div>
          <div style={styles.title}>Chat</div>
          <div style={styles.subTitle}>
            {variant === 'expertCompact'
              ? 'Keep everything on Taskio — off-platform requests may be flagged.'
              : 'Keep payments and contact details in Taskio. Off-platform requests may be flagged.'}
          </div>
        </div>
        {!chatEnabled && <div style={styles.pill}>Chat opens once an Expert is selected</div>}
        {chatEnabled && !chatCanRead && (
          <div style={styles.pill}>
            Chat opens once payment is secured.
          </div>
        )}
        {chatEnabled && chatReadOnly && (
          <div style={{ ...styles.pill, background: '#fff7ed', borderColor: '#fdba74', color: '#9a3412' }}>
            Read-only (job closed or chat frozen)
          </div>
        )}
      </div>

      {shouldBlockClientMessaging && (
        <div
          style={{
            marginBottom: 12,
            padding: 14,
            borderRadius: 12,
            border: '1px solid #fde68a',
            background: '#fffbeb',
            color: '#92400e',
            fontSize: 13,
            lineHeight: 1.45,
          }}
          role="status"
        >
          <div style={{ fontWeight: 800, marginBottom: 6, color: '#78350f' }}>{CLIENT_CHAT_ACCOUNT_GATE.title}</div>
          <div style={{ marginBottom: 12 }}>{CLIENT_CHAT_ACCOUNT_GATE.body}</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center' }}>
            <button
              type="button"
              onClick={() => navigate(`/account/complete?next=${encodeURIComponent(`/job/${jobId}#chat`)}`)}
              style={{
                minHeight: 40,
                padding: '0 14px',
                borderRadius: 10,
                border: 'none',
                background: '#14C5C5',
                color: '#fff',
                fontWeight: 800,
                cursor: 'pointer',
                fontSize: 13,
              }}
            >
              {CLIENT_CHAT_ACCOUNT_GATE.primaryCta}
            </button>
            <Link to="/support" style={{ fontWeight: 700, color: '#0f766e', fontSize: 13, textDecoration: 'none' }}>
              {CLIENT_CHAT_ACCOUNT_GATE.help}
            </Link>
          </div>
        </div>
      )}

      {chatEnabled && chatCanRead && myRole === 'tradie' && (expertBannerText || !chatReadOnly) && (
        <div>
          {expertBannerText && (
            <div
              style={{ ...styles.progressStatusRow, ...EXPERT_BANNER_TONE[expertBannerTone] || EXPERT_BANNER_TONE.default }}
              className="job-chat-progress-current"
            >
              <span>{expertBannerText}</span>
            </div>
          )}
          {!chatReadOnly && (
            <div style={styles.actionsRow} className="job-chat-progress-actions">
              <button
                type="button"
                style={styles.actionBtn}
                onClick={() => setProgressStatus('work_started')}
                disabled={sendBusy || progressBusy || job?.progressStatus === 'work_started'}
              >
                Work Started
              </button>
              <button
                type="button"
                style={styles.actionBtn}
                onClick={() => setProgressStatus('needs_more_info')}
                disabled={sendBusy || progressBusy || job?.progressStatus === 'needs_more_info'}
              >
                Needs More Info
              </button>
              <button
                type="button"
                style={styles.actionBtn}
                onClick={() => setProgressStatus('ready_for_review')}
                disabled={sendBusy || progressBusy || job?.progressStatus === 'ready_for_review'}
              >
                Ready for Review
              </button>
            </div>
          )}
        </div>
      )}

      {/* Only show message list when chat is readable or has messages */}
      {(chatCanRead || messages.length > 0) && (
        <div ref={listRef} style={styles.list}>
          {loading && <div style={styles.muted}>Loading messages…</div>}
          {!loading && chatCanRead && messages.length === 0 && (
            <div style={styles.muted}>No messages yet.</div>
          )}
          {messages.map((m) => {
            const layoutType = getMessageLayoutType(m, me?.uid);
            const isSystem = layoutType === 'system';
            const isMine = layoutType === 'mine';
            return (
          <div
            key={m.id}
            style={{
              ...styles.msgRow,
              ...(isMine ? styles.msgRowMine : styles.msgRowOther),
              ...(isSystem ? styles.msgRowSystem : {}),
            }}
          >
            <div
              style={{
                ...styles.msgBubble,
                ...(isMine ? styles.msgBubbleMine : styles.msgBubbleOther),
                ...(isSystem ? styles.msgBubbleSystem : {}),
                ...(m.flagged ? styles.msgBubbleFlagged : {}),
              }}
            >
            <div style={styles.msgMeta}>
              <span style={styles.msgSender}>
                {getRenderedSenderName(m, me, myRole, senderProfilesByUid?.[m.senderUid])}
              </span>
              <span style={styles.msgTime}>{formatTs(m.createdAt)}</span>
            </div>

            {m.flagged && Array.isArray(m.flagReasons) && m.flagReasons.length > 0 && (
              <div style={styles.flagPill}>
                Flagged: {m.flagReasons.join(', ')}
              </div>
            )}

            {m.messageType === 'attachment' && m.attachment ? (
              <div style={styles.attachmentBox}>
                {isImageMime(m.attachment.mimeType) ? (
                  <a href={m.attachment.downloadUrl} target="_blank" rel="noreferrer" style={styles.attachmentLink}>
                    <img
                      src={m.attachment.downloadUrl}
                      alt={m.attachment.fileName || 'Attachment'}
                      style={styles.thumb}
                    />
                    <div style={styles.attachmentMeta}>
                      <div style={styles.attachmentName}>{m.attachment.fileName}</div>
                      <div style={styles.attachmentHint}>Open image</div>
                    </div>
                  </a>
                ) : (
                  <a href={m.attachment.downloadUrl} target="_blank" rel="noreferrer" style={styles.attachmentLink}>
                    <div style={styles.pdfBadge}>PDF</div>
                    <div style={styles.attachmentMeta}>
                      <div style={styles.attachmentName}>{m.attachment.fileName}</div>
                      <div style={styles.attachmentHint}>Open / download</div>
                    </div>
                  </a>
                )}
              </div>
            ) : (
              <div style={m.messageType === 'system' ? styles.systemMsg : styles.msgText}>
                {m.text}
              </div>
            )}
            </div>
          </div>
            );
          })}
          <div ref={endRef} />
        </div>
      )}

      {error && <div style={styles.error}>{error}</div>}

      <div style={styles.composer}>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={chatEnabled ? (chatCanRead ? 'Type a message…' : 'Chat will open once payment is secured…') : 'Chat is not available yet.'}
          disabled={!chatEnabled || !chatCanRead || chatReadOnly || sendBusy}
          rows={variant === 'expertCompact' ? 2 : 3}
          style={styles.input}
        />

        <div style={styles.composerRow} className="job-chat-composer-row">
          <div style={styles.leftTools}>
            <label style={styles.attachBtn} className="job-chat-attach">
              <input
                type="file"
                accept="image/*,application/pdf"
                multiple
                onChange={(e) => addFiles(e.target.files)}
                disabled={!chatEnabled || !chatCanRead || chatReadOnly || sendBusy}
                style={{ display: 'none' }}
              />
              Attach
            </label>

            {uploadQueue.length > 0 && (
              <div style={styles.queue}>
                {uploadQueue.map((f, idx) => (
                  <div key={`${f.name}-${idx}`} style={styles.queueItem}>
                    <span style={styles.queueName}>{f.name}</span>
                    <button
                      type="button"
                      onClick={() => removeQueuedFile(idx)}
                      style={styles.queueRemove}
                      disabled={sendBusy}
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <button
            type="button"
            className="job-chat-send"
            onClick={onSend}
            disabled={!chatEnabled || !chatCanRead || chatReadOnly || sendBusy || (!text.trim() && uploadQueue.length === 0)}
            style={styles.sendBtn}
          >
            {sendBusy ? 'Sending…' : 'Send'}
          </button>
        </div>
      </div>
    </div>
    </>
  );
}

const CHAT_PANEL_STYLES = {
  wrap: {
    background: '#FFFFFF',
    borderRadius: 12,
    border: '1px solid #E0E0E0',
    boxShadow: '0 4px 12px rgba(0,0,0,0.05)',
    padding: 16,
    marginTop: 20,
  },
  headerRow: {
    display: 'flex',
    justifyContent: 'space-between',
    gap: 12,
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  title: { fontFamily: 'Poppins, sans-serif', fontSize: 18, fontWeight: 800, color: '#222' },
  subTitle: { fontSize: 13, color: '#666', marginTop: 2 },
  pill: {
    fontSize: 12,
    fontWeight: 700,
    padding: '6px 10px',
    borderRadius: 999,
    border: '1px solid #E0E0E0',
    background: '#F7F9FA',
    color: '#555',
    whiteSpace: 'nowrap',
  },
  list: {
    border: '1px solid #F0F0F0',
    borderRadius: 12,
    padding: 12,
    background: '#fff',
    maxHeight: 360,
    overflow: 'auto',
  },
  actionsRow: {
    display: 'flex',
    gap: 10,
    flexWrap: 'wrap',
    marginBottom: 12,
  },
  progressStatusRow: {
    marginBottom: 8,
    fontSize: 12,
    fontWeight: 800,
    color: '#0f766e',
    letterSpacing: 0.01,
  },
  actionBtn: {
    height: 38,
    borderRadius: 10,
    border: '1px solid #d1d5db',
    background: '#fff',
    padding: '0 12px',
    fontWeight: 900,
    cursor: 'pointer',
    color: '#374151',
    fontSize: 13,
  },
  muted: { color: '#777', fontSize: 13 },
  msgRow: { display: 'flex', padding: '8px 0' },
  msgRowMine: { justifyContent: 'flex-end' },
  msgRowOther: { justifyContent: 'flex-start' },
  msgRowSystem: { justifyContent: 'center' },
  msgBubble: { maxWidth: '82%', minWidth: 160, border: '1px solid #E5E7EB', borderRadius: 12, padding: '10px 12px' },
  msgBubbleMine: { background: '#FFF4E6', borderColor: '#FED7AA' },
  msgBubbleOther: { background: '#FFFFFF', borderColor: '#E5E7EB' },
  msgBubbleSystem: { background: '#ECFEFF', borderColor: '#A5F3FC', maxWidth: '90%' },
  msgBubbleFlagged: { background: '#fff1f2', borderColor: '#fecdd3' },
  msgMeta: { display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'baseline' },
  msgSender: { fontSize: 13, fontWeight: 800, color: '#222' },
  msgTime: { fontSize: 12, color: '#999' },
  msgText: { marginTop: 6, whiteSpace: 'pre-wrap', fontSize: 14, color: '#333', lineHeight: 1.45 },
  flagPill: { marginTop: 8, display: 'inline-block', fontSize: 12, fontWeight: 900, color: '#9f1239', background: '#fff1f2', border: '1px solid #fecdd3', padding: '4px 10px', borderRadius: 999 },
  systemMsg: {
    marginTop: 6,
    whiteSpace: 'pre-wrap',
    fontSize: 13,
    color: '#0f766e',
    background: '#ecfeff',
    border: '1px solid #a5f3fc',
    padding: '8px 10px',
    borderRadius: 10,
    lineHeight: 1.45,
  },
  attachmentBox: { marginTop: 6 },
  attachmentLink: {
    display: 'flex',
    gap: 10,
    alignItems: 'center',
    padding: 10,
    borderRadius: 10,
    border: '1px solid #E0E0E0',
    background: '#F7F9FA',
    color: '#111',
    textDecoration: 'none',
  },
  thumb: { width: 56, height: 56, objectFit: 'cover', borderRadius: 10, border: '1px solid #E0E0E0' },
  pdfBadge: {
    width: 56,
    height: 56,
    borderRadius: 10,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    border: '1px solid #E0E0E0',
    background: '#fff1f2',
    color: '#9f1239',
    fontWeight: 900,
    fontSize: 12,
  },
  attachmentMeta: { display: 'flex', flexDirection: 'column', gap: 2 },
  attachmentName: { fontWeight: 800, fontSize: 13 },
  attachmentHint: { fontSize: 12, color: '#666' },
  error: {
    marginTop: 10,
    background: '#fff1f2',
    border: '1px solid #fecdd3',
    color: '#9f1239',
    padding: '10px 12px',
    borderRadius: 10,
    fontSize: 13,
  },
  composer: { marginTop: 12 },
  input: {
    width: '100%',
    boxSizing: 'border-box',
    border: '1px solid #E0E0E0',
    borderRadius: 10,
    padding: 10,
    fontFamily: 'Inter, sans-serif',
    fontSize: 14,
    resize: 'vertical',
  },
  composerRow: { marginTop: 10, display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'flex-start' },
  leftTools: { display: 'flex', flexDirection: 'column', gap: 8, flex: 1 },
  attachBtn: {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: 92,
    height: 36,
    borderRadius: 10,
    border: '1px solid #d1d5db',
    background: '#fff',
    cursor: 'pointer',
    fontWeight: 800,
    fontSize: 13,
    color: '#374151',
  },
  queue: { display: 'flex', flexWrap: 'wrap', gap: 8 },
  queueItem: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6,
    background: '#F7F9FA',
    border: '1px solid #E0E0E0',
    borderRadius: 999,
    padding: '6px 10px',
    fontSize: 12,
    color: '#333',
  },
  queueName: { maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  queueRemove: {
    border: 'none',
    background: 'transparent',
    cursor: 'pointer',
    fontSize: 16,
    lineHeight: 1,
    color: '#6b7280',
    padding: 0,
  },
  sendBtn: {
    height: 44,
    minWidth: 110,
    borderRadius: 10,
    border: 'none',
    background: '#FF9100',
    color: '#fff',
    fontWeight: 900,
    cursor: 'pointer',
    padding: '0 16px',
  },
};
