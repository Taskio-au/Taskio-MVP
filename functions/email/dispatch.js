"use strict";

const admin = require("firebase-admin");
const logger = require("firebase-functions/logger");
const {getMailRuntime} = require("./config");
const {
  sanitizeDocId,
  buildTrustedAppLink,
  resolveTrustedEmail,
} = require("./recipients");
const {sendTransactionalEmail} = require("./send");
const {
  getShortJobRef,
  buildQuoteReceivedEmail,
  buildPaymentSecuredHomeownerEmail,
  buildPaymentSecuredExpertEmail,
  buildTaskCompleteHomeownerEmail,
  buildPaymentReleasedHomeownerEmail,
  buildPaymentReleasedExpertEmail,
  buildRefundHomeownerEmail,
  buildRefundExpertEmail,
} = require("./templates");

/**
 * @param {string} uid
 * @param {string} fallbackRole
 * @return {Promise<{uid: string, email: string, role: string}>}
 */
async function getUserIdentity(uid, fallbackRole) {
  const firestore = admin.firestore();
  const safeUid = String(uid || "").trim();
  const [profileSnap, authUser] = await Promise.all([
    firestore.collection("users").doc(safeUid).get().catch(() => null),
    admin.auth().getUser(safeUid).catch(() => null),
  ]);
  const profile = profileSnap && profileSnap.exists ?
    (profileSnap.data() || {}) : {};
  return {
    uid: safeUid,
    role: profile.role || fallbackRole,
    email: resolveTrustedEmail(authUser, profile),
  };
}

/**
 * @param {Object<string, any>|null} prior
 * @return {boolean}
 */
function emailAlreadySent(prior) {
  return Boolean(prior && prior.emailSentAt);
}

/**
 * Upsert in-app notification, then best-effort email. Job/payment already
 * succeeded in the API — this must not throw.
 * @param {Object<string, any>} args
 * @return {Promise<{notified: boolean, emailReason: string}>}
 */
async function dispatchNotificationEmail(args) {
  const {
    uid,
    notificationId,
    type,
    title,
    body,
    jobId,
    extra,
    email,
  } = args || {};
  if (!uid || !notificationId) {
    return {notified: false, emailReason: "missing_target"};
  }

  const firestore = admin.firestore();
  const notifRef = firestore.collection("users").doc(uid)
    .collection("notifications").doc(notificationId);

  try {
    const existing = await notifRef.get();
    const prior = existing.exists ? (existing.data() || {}) : {};
    if (!existing.exists) {
      await notifRef.set({
        type,
        title,
        body,
        jobId: jobId || null,
        ...(extra || {}),
        read: false,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      }, {merge: true});
    } else {
      await notifRef.set({
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      }, {merge: true});
    }

    if (emailAlreadySent(prior)) {
      return {notified: true, emailReason: "already_sent"};
    }

    const result = await sendTransactionalEmail(email || {});
    const patch = {
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    };
    if (result.sent) {
      patch.emailSentAt = admin.firestore.FieldValue.serverTimestamp();
      if (result.messageId) patch.emailMessageId = result.messageId;
    } else if (result.reason === "disabled" ||
        result.reason === "not_configured") {
      patch.emailSkippedReason = result.reason;
    } else {
      patch.emailFailedReason = result.reason;
      patch.emailFailedAt = admin.firestore.FieldValue.serverTimestamp();
    }
    await notifRef.set(patch, {merge: true});
    return {notified: true, emailReason: result.reason};
  } catch (error) {
    logger.error("transactional_notification_failed", {
      type,
      jobId: jobId || null,
      error: error && error.message ? String(error.message) : "unknown",
    });
    return {notified: false, emailReason: "dispatch_failed"};
  }
}

/**
 * @param {string} role
 * @param {string} jobId
 * @param {string} [hash]
 * @return {string|null}
 */
function jobOpenUrl(role, jobId, hash) {
  const runtime = getMailRuntime();
  const id = sanitizeDocId(jobId);
  if (!runtime.appUrl || !id) return null;
  const path = role === "tradie" ? `/tradie/job/${id}` : `/job/${id}`;
  const suffix = hash ? hash : "";
  return buildTrustedAppLink(runtime.appUrl, `${path}${suffix}`);
}

/**
 * @param {string} jobId
 * @param {Object<string, any>} job
 * @return {string}
 */
function jobRefOf(jobId, job) {
  return getShortJobRef({
    id: jobId,
    taskNumber: job && job.taskNumber,
    referenceNumber: job && job.referenceNumber,
  });
}

/**
 * E01 quote received — Homeowner only.
 * @param {Object<string, any>} args
 * @return {Promise<void>}
 */
async function notifyQuoteReceived(args) {
  const quoteId = sanitizeDocId(args && args.quoteId);
  const jobId = sanitizeDocId(args && args.jobId);
  const homeownerUid = String((args && args.homeownerUid) || "").trim();
  const job = (args && args.job) || {};
  const quote = (args && args.quote) || {};
  if (!quoteId || !jobId || !homeownerUid) return;

  const identity = await getUserIdentity(homeownerUid, "homeowner");
  const jobRef = jobRefOf(jobId, job);
  const openUrl = jobOpenUrl("homeowner", jobId);
  const cents = Number(quote.amountCents);
  const quoteAmount = quote.amount != null ?
    quote.amount :
    (Number.isFinite(cents) && cents > 0 ? cents / 100 : null);
  const built = buildQuoteReceivedEmail({
    jobRef,
    jobTitle: job.title,
    quoteAmount,
    openUrl,
  });
  await dispatchNotificationEmail({
    uid: homeownerUid,
    notificationId: `quote_${quoteId}`,
    type: "quote_submitted",
    title: "New quote received",
    body: `You received a new quote for “${job.title || "your task"}”.`,
    jobId,
    extra: {quoteId},
    email: {
      event: "quote_received",
      jobId,
      to: identity.email,
      subject: built.subject,
      text: built.text,
      html: built.html,
    },
  });
}

/**
 * E02 payment secured — Homeowner and Expert.
 * @param {Object<string, any>} args
 * @return {Promise<void>}
 */
async function notifyPaymentSecured(args) {
  const jobId = sanitizeDocId(args && args.jobId);
  const job = (args && args.job) || {};
  if (!jobId) return;
  const jobRef = jobRefOf(jobId, job);
  const title = job.title || "your task";

  const homeownerUid = String(job.homeownerUid || "").trim();
  if (homeownerUid) {
    const identity = await getUserIdentity(homeownerUid, "homeowner");
    const built = buildPaymentSecuredHomeownerEmail({
      jobRef,
      jobTitle: title,
      openUrl: jobOpenUrl("homeowner", jobId),
    });
    await dispatchNotificationEmail({
      uid: homeownerUid,
      notificationId: `funded_homeowner_${jobId}`,
      type: "escrow_funded",
      title: "Payment secured",
      body: `Your payment has been secured for “${title}”. ` +
        "The Expert has not been paid yet.",
      jobId,
      email: {
        event: "payment_secured_homeowner",
        jobId,
        to: identity.email,
        subject: built.subject,
        text: built.text,
        html: built.html,
      },
    });
  }

  const tradieUid = String(job.acceptedTradieUid || "").trim();
  if (tradieUid) {
    const identity = await getUserIdentity(tradieUid, "tradie");
    const built = buildPaymentSecuredExpertEmail({
      jobRef,
      jobTitle: title,
      openUrl: jobOpenUrl("tradie", jobId),
    });
    await dispatchNotificationEmail({
      uid: tradieUid,
      notificationId: `funded_${jobId}`,
      type: "escrow_funded",
      title: "Payment secured",
      body: `Payment has been secured for “${title}”. ` +
        "You can now message the Client and start work when ready.",
      jobId,
      email: {
        event: "payment_secured_expert",
        jobId,
        to: identity.email,
        subject: built.subject,
        text: built.text,
        html: built.html,
      },
    });
  }
}

/**
 * E03 Expert marked complete — Homeowner.
 * @param {Object<string, any>} args
 * @return {Promise<void>}
 */
async function notifyTaskCompleted(args) {
  const jobId = sanitizeDocId(args && args.jobId);
  const job = (args && args.job) || {};
  const homeownerUid = String(job.homeownerUid || "").trim();
  if (!jobId || !homeownerUid) return;
  const identity = await getUserIdentity(homeownerUid, "homeowner");
  const jobRef = jobRefOf(jobId, job);
  const built = buildTaskCompleteHomeownerEmail({
    jobRef,
    jobTitle: job.title,
    openUrl: jobOpenUrl("homeowner", jobId),
  });
  await dispatchNotificationEmail({
    uid: homeownerUid,
    notificationId: `complete_${jobId}`,
    type: "task_completed",
    title: "Task completed",
    body: `The Expert marked “${job.title || "your task"}” complete. ` +
      "Payment has not been released.",
    jobId,
    email: {
      event: "task_completed",
      jobId,
      to: identity.email,
      subject: built.subject,
      text: built.text,
      html: built.html,
    },
  });
}

/**
 * E04 payment released — Homeowner and Expert.
 * @param {Object<string, any>} args
 * @return {Promise<void>}
 */
async function notifyPaymentReleased(args) {
  const jobId = sanitizeDocId(args && args.jobId);
  const job = (args && args.job) || {};
  if (!jobId) return;
  const jobRef = jobRefOf(jobId, job);
  const title = job.title || "your task";

  const homeownerUid = String(job.homeownerUid || "").trim();
  if (homeownerUid) {
    const identity = await getUserIdentity(homeownerUid, "homeowner");
    const built = buildPaymentReleasedHomeownerEmail({
      jobRef,
      jobTitle: title,
      openUrl: jobOpenUrl("homeowner", jobId),
    });
    await dispatchNotificationEmail({
      uid: homeownerUid,
      notificationId: `released_homeowner_${jobId}`,
      type: "payment_released",
      title: "Payment released",
      body: `You approved “${title}”. Payment has been released.`,
      jobId,
      email: {
        event: "payment_released_homeowner",
        jobId,
        to: identity.email,
        subject: built.subject,
        text: built.text,
        html: built.html,
      },
    });
  }

  const tradieUid = String(job.acceptedTradieUid || "").trim();
  if (tradieUid) {
    const identity = await getUserIdentity(tradieUid, "tradie");
    const built = buildPaymentReleasedExpertEmail({
      jobRef,
      jobTitle: title,
      openUrl: jobOpenUrl("tradie", jobId),
    });
    await dispatchNotificationEmail({
      uid: tradieUid,
      notificationId: `released_${jobId}`,
      type: "payment_released",
      title: "Payment released",
      body: `Payment for “${title}” has been released ` +
        "to your Stripe account. " +
        "Bank payout timing is managed by Stripe.",
      jobId,
      email: {
        event: "payment_released_expert",
        jobId,
        to: identity.email,
        subject: built.subject,
        text: built.text,
        html: built.html,
      },
    });
  }
}

/**
 * E05 refund completed — Homeowner and Expert.
 * @param {Object<string, any>} args
 * @return {Promise<void>}
 */
async function notifyRefundCompleted(args) {
  const jobId = sanitizeDocId(args && args.jobId);
  const job = (args && args.job) || {};
  if (!jobId) return;
  const jobRef = jobRefOf(jobId, job);
  const title = job.title || "your task";
  const cents = Number(job.paymentAmountCents);
  const refundAmount = Number.isFinite(cents) && cents > 0 ? cents / 100 : null;

  const homeownerUid = String(job.homeownerUid || "").trim();
  if (homeownerUid) {
    const identity = await getUserIdentity(homeownerUid, "homeowner");
    const built = buildRefundHomeownerEmail({
      jobRef,
      jobTitle: title,
      refundAmount,
      openUrl: jobOpenUrl("homeowner", jobId),
    });
    await dispatchNotificationEmail({
      uid: homeownerUid,
      notificationId: `refund_homeowner_${jobId}`,
      type: "refund_completed",
      title: "Refund completed",
      body: `The payment for “${title}” has been refunded.`,
      jobId,
      email: {
        event: "refund_completed_homeowner",
        jobId,
        to: identity.email,
        subject: built.subject,
        text: built.text,
        html: built.html,
      },
    });
  }

  const tradieUid = String(job.acceptedTradieUid || "").trim();
  if (tradieUid) {
    const identity = await getUserIdentity(tradieUid, "tradie");
    const built = buildRefundExpertEmail({
      jobRef,
      jobTitle: title,
      openUrl: jobOpenUrl("tradie", jobId),
    });
    await dispatchNotificationEmail({
      uid: tradieUid,
      notificationId: `refund_${jobId}`,
      type: "refund_completed",
      title: "Task cancelled",
      body: `“${title}” was cancelled and refunded. No payment is due.`,
      jobId,
      email: {
        event: "refund_completed_expert",
        jobId,
        to: identity.email,
        subject: built.subject,
        text: built.text,
        html: built.html,
      },
    });
  }
}

module.exports = {
  getUserIdentity,
  emailAlreadySent,
  dispatchNotificationEmail,
  notifyQuoteReceived,
  notifyPaymentSecured,
  notifyTaskCompleted,
  notifyPaymentReleased,
  notifyRefundCompleted,
};
