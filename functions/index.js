const {
  onDocumentCreated,
  onDocumentUpdated,
} = require("firebase-functions/v2/firestore");
const admin = require("firebase-admin");
const nodemailer = require("nodemailer");
const logger = require("firebase-functions/logger");

admin.initializeApp();

const CHAT_EMAIL_THROTTLE_MS = 15 * 60 * 1000;
let cachedMailTransporter = null;

/**
 * Returns flag reasons (categories) for a text message.
 * @param {string} text
 * @return {string[]}
 */
function matchKeywordSets(text) {
  const t = String(text || "").toLowerCase();
  if (!t.trim()) return [];

  const paymentEvasion = [
    "cash",
    "bank transfer",
    "transfer",
    "bsb",
    "account number",
    "pay outside",
    "pay off platform",
  ];

  const contactBypass = [
    "call me",
    "my number",
    "phone number",
    "email me",
    "whatsapp",
    "telegram",
    "dm me",
  ];

  const reasons = [];
  if (paymentEvasion.some((k) => t.includes(k))) {
    reasons.push("payment_evasion");
  }
  if (contactBypass.some((k) => t.includes(k))) {
    reasons.push("contact_bypass");
  }
  return reasons;
}

/**
 * @param {string} value
 * @return {boolean}
 */
function isLikelyEmail(value) {
  return /\S+@\S+\.\S+/.test(String(value || "").trim());
}

/**
 * @param {string} role
 * @return {string}
 */
function getRoleLabel(role) {
  if (role === "homeowner") return "Client";
  if (role === "tradie") return "Expert";
  return "User";
}

/**
 * @param {Object<string, any>} profile
 * @return {string}
 */
function getProfileDisplayName(profile = {}) {
  const firstName = String(profile.firstName || "").trim();
  const lastName = String(profile.lastName || "").trim();
  const joined = [firstName, lastName].filter(Boolean).join(" ").trim();
  if (joined) return joined;

  const displayName = String(profile.displayName || profile.name || "")
    .trim()
    .replace(/\s+/g, " ");
  if (displayName && !isLikelyEmail(displayName)) return displayName;
  return "";
}

/**
 * @param {string} value
 * @param {number} maxLen
 * @return {string}
 */
function trimText(value, maxLen) {
  const cleaned = String(value || "").trim().replace(/\s+/g, " ");
  if (!cleaned) return "";
  if (cleaned.length <= maxLen) return cleaned;
  return `${cleaned.slice(0, Math.max(0, maxLen - 1)).trim()}…`;
}

/**
 * Escape untrusted text before interpolation into an HTML email.
 * @param {any} value
 * @return {string}
 */
function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * @param {Object<string, any>} values
 * @return {string}
 */
function buildChatEmailHtml({senderName, jobTitle, preview, openUrl}) {
  return `<p><strong>${escapeHtml(senderName)}</strong> ` +
    "sent you a message about " +
    `<strong>${escapeHtml(jobTitle || "your task")}</strong>.</p>` +
    `<p>${escapeHtml(preview)}</p>` +
    `<p><a href="${escapeHtml(openUrl)}">Open chat</a></p>`;
}

/**
 * @param {Object<string, any>} message
 * @return {string}
 */
function getMessagePreview(message = {}) {
  if (message.messageType === "attachment") {
    const attachment = message.attachment || {};
    const fileName = trimText(attachment.fileName || "", 80);
    return fileName ? `Shared ${fileName}` : "Shared an attachment";
  }
  if (message.messageType === "system") {
    return trimText(message.text || "Posted an update", 140);
  }
  return trimText(message.text || "", 140) || "Sent a message";
}

/**
 * @param {Object<string, any>} message
 * @return {string}
 */
function getNotificationPreview(message = {}) {
  return trimText(getMessagePreview(message), 90);
}

/**
 * @param {any} timestamp
 * @return {number}
 */
function timestampToMillis(timestamp) {
  if (!timestamp) return 0;
  if (typeof timestamp.toMillis === "function") return timestamp.toMillis();
  if (typeof timestamp.seconds === "number") return timestamp.seconds * 1000;
  if (typeof timestamp._seconds === "number") return timestamp._seconds * 1000;
  return 0;
}

/**
 * @param {any} timestamp
 * @return {boolean}
 */
function isTimestampLike(timestamp) {
  return timestampToMillis(timestamp) > 0;
}

/**
 * @param {Object<string, any>} before
 * @param {Object<string, any>} after
 * @return {boolean}
 */
function isQuoteSubmissionTransition(before = {}, after = {}) {
  return before.status !== "submitted" && after.status === "submitted";
}

/**
 * @param {Object<string, any>} before
 * @param {Object<string, any>} after
 * @return {boolean}
 */
function isEscrowFundedTransition(before = {}, after = {}) {
  return (before.paymentState !== "in_escrow" &&
      after.paymentState === "in_escrow") ||
    (before.status !== "FUNDED" && after.status === "FUNDED");
}

/**
 * @param {string} uid
 * @param {string} fallbackRole
 * @return {Promise<Object<string, any>>}
 */
async function getUserIdentity(uid, fallbackRole) {
  const firestore = admin.firestore();
  const [profileSnap, authUser] = await Promise.all([
    firestore.collection("users").doc(uid).get().catch(() => null),
    admin.auth().getUser(uid).catch(() => null),
  ]);
  const profile = profileSnap && profileSnap.exists ?
    (profileSnap.data() || {}) :
    {};
  const displayName =
    getProfileDisplayName(profile) ||
    trimText((authUser && authUser.displayName) || "", 120) ||
    getRoleLabel(fallbackRole);

  return {
    uid,
    profile,
    authUser,
    displayName,
    email: String(profile.email || ((authUser && authUser.email) || "")).trim(),
  };
}

/**
 * @return {Object<string, any>|null}
 */
function getMailConfig() {
  const {
    SMTP_HOST,
    SMTP_PORT,
    SMTP_USER,
    SMTP_PASS,
    CHAT_EMAIL_FROM,
    TASKIO_APP_URL,
  } = process.env;

  if (!SMTP_HOST || !SMTP_PORT || !SMTP_USER || !SMTP_PASS ||
      !CHAT_EMAIL_FROM || !TASKIO_APP_URL) {
    return null;
  }

  return {
    host: SMTP_HOST,
    port: Number(SMTP_PORT),
    secure: Number(SMTP_PORT) === 465,
    auth: {
      user: SMTP_USER,
      pass: SMTP_PASS,
    },
    from: CHAT_EMAIL_FROM,
    appUrl: String(TASKIO_APP_URL).replace(/\/+$/, ""),
  };
}

/**
 * @return {Promise<any>}
 */
async function getMailTransporter() {
  const config = getMailConfig();
  if (!config) return null;
  if (!cachedMailTransporter) {
    cachedMailTransporter = nodemailer.createTransport({
      host: config.host,
      port: config.port,
      secure: config.secure,
      auth: config.auth,
    });
  }
  return cachedMailTransporter;
}

/**
 * @param {Object<string, any>} args
 * @return {Promise<void>}
 */
async function maybeSendChatEmail(args) {
  const {
    recipientThreadRef,
    recipientThreadData,
    recipient,
    senderName,
    jobId,
    jobTitle,
    message,
  } = args;

  const config = getMailConfig();
  if (!config || !recipient || !recipient.email) return;

  const lastEmailAtMs = timestampToMillis(
    recipientThreadData ? recipientThreadData.lastEmailSentAt : null,
  );
  if (lastEmailAtMs && Date.now() - lastEmailAtMs < CHAT_EMAIL_THROTTLE_MS) {
    return;
  }

  const transporter = await getMailTransporter();
  if (!transporter) return;

  const recipientRole =
    recipient && recipient.profile && recipient.profile.role === "tradie" ?
      "tradie" :
      "homeowner";
  const jobPath =
    recipientRole === "tradie" ?
      `/tradie/job/${jobId}#chat` :
      `/job/${jobId}#chat`;
  const openUrl = `${config.appUrl}${jobPath}`;
  const subject = `New message about ${trimText(jobTitle || "your task", 80)}`;
  const preview = getNotificationPreview(message);

  await transporter.sendMail({
    from: config.from,
    to: recipient.email,
    subject,
    text:
      `${senderName} sent you a message about ${jobTitle || "your task"}.\n\n` +
      `${preview}\n\n` +
      `Open chat: ${openUrl}`,
    html: buildChatEmailHtml({senderName, jobTitle, preview, openUrl}),
  });

  await recipientThreadRef.set(
    {
      lastEmailSentAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    },
    {merge: true},
  );
}

/**
 * Keyword flagging (MVP)
 * - Triggers on new message creation: jobs/{jobId}/messages/{messageId}
 * - Flags risky text messages for admin review (does not block)
 * - Updates job aggregate counters for monitoring UI
 * @param {Object<string, any>} event
 * @return {Promise<void>}
 */
async function processRiskyJobMessage(event) {
  const snap = event.data;
  if (!snap) return;
  const {jobId, messageId} = event.params || {};
  if (!jobId || !messageId) return;

  const data = snap.data() || {};
  const firestore = admin.firestore();
  const jobRef = firestore.collection("jobs").doc(jobId);
  const markerRef = firestore.collection("automation_events")
    .doc(`message_${jobId}_${messageId}`);
  const messagePreview = getMessagePreview(data);
  const messageTimestamp = isTimestampLike(data.createdAt) ?
    data.createdAt : admin.firestore.FieldValue.serverTimestamp();
  let job = {};
  let delivery = null;
  let alreadyProcessed = false;

  try {
    await firestore.runTransaction(async (transaction) => {
      const [markerSnap, jobSnap] = await Promise.all([
        transaction.get(markerRef),
        transaction.get(jobRef),
      ]);
      job = jobSnap.exists ? (jobSnap.data() || {}) : {};
      if (markerSnap.exists) {
        alreadyProcessed = true;
        return;
      }

      const homeownerUid = String(job.homeownerUid || "").trim();
      const expertUid = String(job.acceptedTradieUid || "").trim();
      const senderUid = String(data.senderUid || "").trim();
      const participant = senderUid && homeownerUid && expertUid &&
        (senderUid === homeownerUid || senderUid === expertUid);

      transaction.set(jobRef, {
        lastMessageAt: admin.firestore.FieldValue.serverTimestamp(),
      }, {merge: true});

      if (participant) {
        const recipientUid = senderUid === homeownerUid ?
          expertUid : homeownerUid;
        const senderRole = senderUid === homeownerUid ? "homeowner" : "tradie";
        const recipientRole = recipientUid === homeownerUid ?
          "homeowner" : "tradie";
        const senderName = trimText(
          !isLikelyEmail(data.senderName) ? data.senderName : "",
          120,
        ) || getRoleLabel(senderRole);
        const recipientName = getRoleLabel(recipientRole);
        const senderThreadRef = firestore.collection("users").doc(senderUid)
          .collection("chatThreads").doc(jobId);
        const recipientThreadRef = firestore.collection("users")
          .doc(recipientUid)
          .collection("chatThreads").doc(jobId);
        const notificationRef = firestore.collection("users").doc(recipientUid)
          .collection("notifications").doc(`message_${jobId}_${messageId}`);
        const sharedFields = {
          jobId,
          jobTitle: trimText(job.title || "Taskio task", 140),
          jobStatus: String(job.status || ""),
          lastMessageText: messagePreview,
          lastMessageType: String(data.messageType || "text"),
          lastMessageAt: messageTimestamp,
          lastSenderUid: senderUid,
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        };
        transaction.set(senderThreadRef, {
          ...sharedFields,
          otherParticipantUid: recipientUid,
          otherParticipantName: recipientName,
          unreadCount: 0,
          lastReadAt: admin.firestore.FieldValue.serverTimestamp(),
        }, {merge: true});
        transaction.set(recipientThreadRef, {
          ...sharedFields,
          otherParticipantUid: senderUid,
          otherParticipantName: senderName,
          unreadCount: admin.firestore.FieldValue.increment(1),
        }, {merge: true});
        transaction.set(notificationRef, {
          type: "message_received",
          title: `New message about ${trimText(job.title || "your task", 80)}`,
          body: `${senderName}: ${getNotificationPreview(data)}`,
          jobId,
          messageId,
          read: false,
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        }, {merge: true});
        delivery = {
          recipientUid, recipientRole, senderUid, senderRole, senderName,
          recipientThreadRef};
      }

      const reasons = data.messageType === "text" ?
        matchKeywordSets(data.text || "") : [];
      if (reasons.length > 0) {
        transaction.set(snap.ref, {
          flagged: true,
          flagReasons: reasons,
          flaggedAt: admin.firestore.FieldValue.serverTimestamp(),
        }, {merge: true});
        transaction.set(jobRef, {
          requiresAdminAttention: true,
          flaggedMessageCount: admin.firestore.FieldValue.increment(1),
          flaggedUpdatedAt: admin.firestore.FieldValue.serverTimestamp(),
        }, {merge: true});
      }

      transaction.set(markerRef, {
        type: "message_created",
        jobId,
        messageId,
        processedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
    });

    if (!delivery && !alreadyProcessed) {
      const homeownerUid = String(job.homeownerUid || "").trim();
      const expertUid = String(job.acceptedTradieUid || "").trim();
      const senderUid = String(data.senderUid || "").trim();
      if (senderUid && homeownerUid && expertUid &&
          (senderUid === homeownerUid || senderUid === expertUid)) {
        const recipientUid = senderUid === homeownerUid ?
          expertUid : homeownerUid;
        const senderRole = senderUid === homeownerUid ? "homeowner" : "tradie";
        const recipientRole = recipientUid === homeownerUid ?
          "homeowner" : "tradie";
        delivery = {
          recipientUid,
          recipientRole,
          senderUid,
          senderRole,
          senderName: trimText(
            !isLikelyEmail(data.senderName) ? data.senderName : "",
            120,
          ) || getRoleLabel(senderRole),
          recipientThreadRef: firestore.collection("users").doc(recipientUid)
            .collection("chatThreads").doc(jobId),
        };
      }
    }

    if (!alreadyProcessed && delivery && getMailConfig()) {
      const [recipient, recipientThreadSnap] = await Promise.all([
        getUserIdentity(delivery.recipientUid, delivery.recipientRole),
        delivery.recipientThreadRef.get(),
      ]);
      await maybeSendChatEmail({
        recipientThreadRef: delivery.recipientThreadRef,
        recipientThreadData: recipientThreadSnap.exists ?
          (recipientThreadSnap.data() || {}) : {},
        recipient,
        senderName: delivery.senderName,
        jobId,
        jobTitle: job.title || "your task",
        message: data,
      });
    }
  } catch (error) {
    logger.error("flag_risky_job_message_failed", {
      jobId,
      messageId,
      error: error && error.message ? error.message : "unknown",
    });
    throw error;
  }
}

exports.flagRiskyJobMessages = onDocumentCreated(
  {
    region: "australia-southeast1",
    document: "jobs/{jobId}/messages/{messageId}",
    retry: true,
  },
  processRiskyJobMessage,
);

/**
 * Notifications (MVP)
 * Path: users/{uid}/notifications/{id}
 *
 * Created by backend/automation only (Admin SDK).
 * The client can only read and mark read.
 */

exports.notifyHomeownerOnQuoteSubmitted = onDocumentCreated(
  {
    region: "australia-southeast1",
    document: "quotes/{quoteId}",
    retry: true,
  },
  async (event) => {
    const snap = event.data;
    if (!snap) return;
    const data = snap.data() || {};
    if (data.status !== "submitted") return;

    const homeownerUid = data.homeownerUid;
    const jobId = data.jobId;
    if (!homeownerUid || !jobId) return;

    try {
      const jobDoc = await admin
        .firestore()
        .collection("jobs")
        .doc(jobId)
        .get();
      const job = jobDoc.exists ? (jobDoc.data() || {}) : {};
      const title = job.title || "your job";

      const notifRef = admin
        .firestore()
        .collection("users")
        .doc(homeownerUid)
        .collection("notifications")
        .doc(`quote_${event.params.quoteId}`);

      await notifRef.set(
        {
          type: "quote_submitted",
          title: "New quote received",
          body: `You received a new quote for “${title}”.`,
          jobId,
          quoteId: event.params.quoteId,
          read: false,
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        },
        {merge: true},
      );
    } catch (error) {
      logger.error("quote_submitted_notification_failed", {
        quoteId: event.params && event.params.quoteId,
        error: error && error.message ? error.message : "unknown",
      });
      throw error;
    }
  },
);

exports.notifyHomeownerOnQuoteSubmittedUpdate = onDocumentUpdated(
  {
    region: "australia-southeast1",
    document: "quotes/{quoteId}",
    retry: true,
  },
  async (event) => {
    const beforeSnap = event.data && event.data.before;
    const afterSnap = event.data && event.data.after;
    const before = beforeSnap ? (beforeSnap.data() || {}) : {};
    const after = afterSnap ? (afterSnap.data() || {}) : {};
    if (!isQuoteSubmissionTransition(before, after)) return;
    const homeownerUid = after.homeownerUid;
    const jobId = after.jobId;
    const quoteId = event.params && event.params.quoteId;
    if (!homeownerUid || !jobId || !quoteId) return;

    try {
      const firestore = admin.firestore();
      const jobDoc = await firestore.collection("jobs").doc(jobId).get();
      const job = jobDoc.exists ? (jobDoc.data() || {}) : {};
      await firestore.collection("users").doc(homeownerUid)
        .collection("notifications").doc(`quote_${quoteId}`).set({
          type: "quote_submitted",
          title: "New quote received",
          body: `You received a new quote for "${job.title || "your job"}".`,
          jobId,
          quoteId,
          read: false,
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        }, {merge: true});
    } catch (error) {
      logger.error("quote_submitted_update_notification_failed", {
        jobId,
        quoteId,
        error: error && error.message ? error.message : "unknown",
      });
      throw error;
    }
  },
);

exports.notifyTradieOnEscrowFunded = onDocumentUpdated(
  {
    region: "australia-southeast1",
    document: "jobs/{jobId}",
    retry: true,
  },
  async (event) => {
    const params = event.params || {};
    const jobId = params.jobId;
    const beforeSnap =
      event.data && event.data.before ? event.data.before : null;
    const afterSnap = event.data && event.data.after ? event.data.after : null;
    const before = beforeSnap ? (beforeSnap.data() || {}) : {};
    const after = afterSnap ? (afterSnap.data() || {}) : {};
    if (!jobId) return;

    const fundedNow = isEscrowFundedTransition(before, after);
    if (!fundedNow) return;

    const tradieUid = after.acceptedTradieUid || null;
    if (!tradieUid) return;

    try {
      const title = after.title || "a job";
      const notifRef = admin
        .firestore()
        .collection("users")
        .doc(tradieUid)
        .collection("notifications")
        .doc(`funded_${jobId}`);

      await notifRef.set(
        {
          type: "escrow_funded",
          title: "Payment secured",
          body:
            `Payment has been secured for “${title}”. ` +
            "You can now message the Client and start work when ready.",
          jobId,
          read: false,
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        },
        {merge: true},
      );
    } catch (error) {
      logger.error("escrow_funded_notification_failed", {
        jobId,
        error: error && error.message ? error.message : "unknown",
      });
      throw error;
    }
  },
);

exports._test = {
  buildChatEmailHtml,
  escapeHtml,
  getMessagePreview,
  getNotificationPreview,
  isEscrowFundedTransition,
  isQuoteSubmissionTransition,
  matchKeywordSets,
  processRiskyJobMessage,
  trimText,
};
