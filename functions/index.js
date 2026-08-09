const {onRequest} = require("firebase-functions/v2/https");
const {
  onDocumentCreated,
  onDocumentUpdated,
} = require("firebase-functions/v2/firestore");
const admin = require("firebase-admin");
const nodemailer = require("nodemailer");

admin.initializeApp();

const CHAT_EMAIL_THROTTLE_MS = 15 * 60 * 1000;
let cachedMailTransporter = null;

exports.helloTaskio = onRequest(
  {region: "australia-southeast1"},
  (req, res) => {
    res.json({
      message: "Hello from Taskio Cloud Functions",
      status: "ok",
    });
  },
);

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
    html:
      `<p><strong>${senderName}</strong> sent you a message about ` +
      `<strong>${jobTitle || "your task"}</strong>.</p>` +
      `<p>${preview}</p>` +
      `<p><a href="${openUrl}">Open chat</a></p>`,
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
 */
exports.flagRiskyJobMessages = onDocumentCreated(
  {
    region: "australia-southeast1",
    document: "jobs/{jobId}/messages/{messageId}",
  },
  async (event) => {
    const snap = event.data;
    if (!snap) return;

    const {jobId} = event.params || {};
    const data = snap.data() || {};
    const firestore = admin.firestore();
    const messagePreview = getMessagePreview(data);
    const messageTimestamp = isTimestampLike(data.createdAt) ?
      data.createdAt :
      admin.firestore.FieldValue.serverTimestamp();

    let job = {};
    try {
      const jobDoc = await firestore.collection("jobs").doc(jobId).get();
      job = jobDoc.exists ? (jobDoc.data() || {}) : {};
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error("Failed to load job for message trigger:", e);
    }

    // Always update last message timestamp for monitoring
    try {
      await firestore
        .collection("jobs")
        .doc(jobId)
        .set(
          {
            lastMessageAt: admin.firestore.FieldValue.serverTimestamp(),
          },
          {merge: true},
        );
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error("Failed to update lastMessageAt:", e);
    }

    const homeownerUid = String(job.homeownerUid || "").trim();
    const expertUid = String(job.acceptedTradieUid || "").trim();
    const senderUid = String(data.senderUid || "").trim();

    if (jobId && senderUid && homeownerUid && expertUid &&
        (senderUid === homeownerUid || senderUid === expertUid)) {
      const recipientUid =
        senderUid === homeownerUid ? expertUid : homeownerUid;
      const senderRole = senderUid === homeownerUid ? "homeowner" : "tradie";
      const recipientRole =
        recipientUid === homeownerUid ? "homeowner" : "tradie";

      try {
        const [sender, recipient] = await Promise.all([
          getUserIdentity(senderUid, senderRole),
          getUserIdentity(recipientUid, recipientRole),
        ]);
        const senderName =
          trimText(
            sender.displayName ||
              (!isLikelyEmail(data.senderName) ? data.senderName : ""),
            120,
          ) ||
          getRoleLabel(senderRole);
        const recipientName = trimText(recipient.displayName, 120) ||
          getRoleLabel(recipientRole);
        const threadCollection = (uid) =>
          firestore.collection("users").doc(uid).collection("chatThreads");
        const senderThreadRef = threadCollection(senderUid).doc(jobId);
        const recipientThreadRef = threadCollection(recipientUid).doc(jobId);
        const recipientThreadSnap = await recipientThreadRef.get();
        const recipientThreadData =
          recipientThreadSnap.exists ? (recipientThreadSnap.data() || {}) : {};
        const notificationRef = firestore
          .collection("users")
          .doc(recipientUid)
          .collection("notifications")
          .doc(`message_${jobId}_${event.params.messageId}`);
        const batch = firestore.batch();
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

        batch.set(
          senderThreadRef,
          {
            ...sharedFields,
            otherParticipantUid: recipientUid,
            otherParticipantName: recipientName,
            unreadCount: 0,
            lastReadAt: admin.firestore.FieldValue.serverTimestamp(),
          },
          {merge: true},
        );
        batch.set(
          recipientThreadRef,
          {
            ...sharedFields,
            otherParticipantUid: senderUid,
            otherParticipantName: senderName,
            unreadCount: admin.firestore.FieldValue.increment(1),
          },
          {merge: true},
        );
        batch.set(
          notificationRef,
          {
            type: "message_received",
            title:
              `New message about ${trimText(job.title || "your task", 80)}`,
            body: `${senderName}: ${getNotificationPreview(data)}`,
            jobId,
            messageId: event.params.messageId,
            read: false,
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          },
          {merge: true},
        );
        await batch.commit();

        await maybeSendChatEmail({
          recipientThreadRef,
          recipientThreadData,
          recipient,
          senderName,
          jobId,
          jobTitle: job.title || "your task",
          message: data,
        });
      } catch (e) {
        // eslint-disable-next-line no-console
        console.error("Failed to update chat thread summaries:", e);
      }
    }

    if (data.messageType !== "text") return;

    const reasons = matchKeywordSets(data.text || "");
    if (reasons.length === 0) return;

    const jobRef = firestore.collection("jobs").doc(jobId);

    await Promise.all([
      snap.ref.set(
        {
          flagged: true,
          flagReasons: reasons,
          flaggedAt: admin.firestore.FieldValue.serverTimestamp(),
        },
        {merge: true},
      ),
      jobRef.set(
        {
          requiresAdminAttention: true,
          flaggedMessageCount: admin.firestore.FieldValue.increment(1),
          flaggedUpdatedAt: admin.firestore.FieldValue.serverTimestamp(),
        },
        {merge: true},
      ),
    ]);
  },
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
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error("notifyHomeownerOnQuoteSubmitted failed:", e);
    }
  },
);

exports.notifyTradieOnEscrowFunded = onDocumentUpdated(
  {
    region: "australia-southeast1",
    document: "jobs/{jobId}",
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

    const fundedNow =
      (before.paymentState !== "in_escrow" &&
        after.paymentState === "in_escrow") ||
      (before.status !== "FUNDED" && after.status === "FUNDED");
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
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error("notifyTradieOnEscrowFunded failed:", e);
    }
  },
);
