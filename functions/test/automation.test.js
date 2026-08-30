"use strict";

const assert = require("node:assert/strict");
const {before, describe, test} = require("node:test");
const admin = require("firebase-admin");

if (!process.env.FIRESTORE_EMULATOR_HOST ||
    !String(process.env.GCLOUD_PROJECT || "").startsWith("demo-")) {
  throw new Error(
    "Functions tests require a Firebase emulator and demo project ID.",
  );
}

const functions = require("../index");
const {
  buildChatEmailHtml,
  isEscrowFundedTransition,
  isPaymentReleasedTransition,
  isQuoteSubmissionTransition,
  isRefundCompletedTransition,
  isTaskCompletedTransition,
  processRiskyJobMessage,
} = functions._test;
const {
  notifyQuoteReceived,
  notifyPaymentSecured,
  dispatchNotificationEmail,
} = require("../email/dispatch");
const {setTransporterFactoryForTests} = require("../email/send");

let db;

before(() => {
  db = admin.firestore();
});

describe("notification transition helpers", () => {
  test("recognizes quote create/update submission exactly once", () => {
    assert.equal(isQuoteSubmissionTransition({}, {status: "submitted"}), true);
    assert.equal(
      isQuoteSubmissionTransition({status: "draft"}, {status: "submitted"}),
      true,
    );
    assert.equal(
      isQuoteSubmissionTransition({status: "submitted"}, {status: "submitted"}),
      false,
    );
  });

  test("collapses either escrow signal into one funded transition", () => {
    assert.equal(
      isEscrowFundedTransition({}, {paymentState: "in_escrow"}),
      true,
    );
    assert.equal(isEscrowFundedTransition({}, {status: "FUNDED"}), true);
    assert.equal(isEscrowFundedTransition(
      {paymentState: "in_escrow", status: "FUNDED"},
      {paymentState: "in_escrow", status: "FUNDED"},
    ), false);
  });

  test("recognizes complete, release, and refund transitions", () => {
    assert.equal(
      isTaskCompletedTransition({status: "FUNDED"}, {status: "COMPLETED"}),
      true,
    );
    assert.equal(
      isPaymentReleasedTransition(
        {paymentState: "in_escrow"},
        {paymentState: "released"},
      ),
      true,
    );
    assert.equal(
      isRefundCompletedTransition(
        {status: "FUNDED"},
        {status: "REFUND_PENDING"},
      ),
      false,
    );
    assert.equal(
      isRefundCompletedTransition(
        {status: "REFUND_PENDING"},
        {status: "REFUNDED"},
      ),
      true,
    );
  });
});

test("chat email HTML escapes all untrusted values", () => {
  const html = buildChatEmailHtml({
    senderName: "<img src=x onerror=alert(1)>",
    jobTitle: "Tap & <script>bad()</script>",
    preview: "Click <a href='https://bad.test'>me</a>",
    openUrl: "https://taskio.com.au/?a=1&b=\"quoted\"",
  });
  assert.doesNotMatch(html, /<script|<img|<a href='https:\/\/bad/i);
  assert.match(html, /&lt;script&gt;/);
  assert.match(html, /&amp;/);
  assert.match(html, /&quot;quoted&quot;/);
});

test("message automation is idempotent under duplicate delivery", async () => {
  const id = `test-${Date.now()}`;
  const jobId = `job-${id}`;
  const messageId = `message-${id}`;
  const homeownerUid = `homeowner-${id}`;
  const expertUid = `expert-${id}`;
  const jobRef = db.collection("jobs").doc(jobId);
  const messageRef = jobRef.collection("messages").doc(messageId);

  await jobRef.set({
    homeownerUid,
    acceptedTradieUid: expertUid,
    title: "Repair a tap",
    status: "FUNDED",
    flaggedMessageCount: 0,
  });
  await messageRef.set({
    jobId,
    messageId,
    senderUid: homeownerUid,
    senderRole: "homeowner",
    senderName: "Client",
    messageType: "text",
    text: "Please call me and I can pay cash",
    createdAt: admin.firestore.Timestamp.now(),
  });
  const messageSnap = await messageRef.get();
  const event = {data: messageSnap, params: {jobId, messageId}};

  await processRiskyJobMessage(event);
  await processRiskyJobMessage(event);

  const [jobSnap, messageAfter, threadSnap, notificationSnap, markerSnap] =
    await Promise.all([
      jobRef.get(),
      messageRef.get(),
      db.collection("users").doc(expertUid).collection("chatThreads")
        .doc(jobId).get(),
      db.collection("users").doc(expertUid).collection("notifications")
        .doc(`message_${jobId}_${messageId}`).get(),
      db.collection("automation_events")
        .doc(`message_${jobId}_${messageId}`).get(),
    ]);

  assert.equal(jobSnap.data().flaggedMessageCount, 1);
  assert.equal(threadSnap.data().unreadCount, 1);
  assert.equal(notificationSnap.exists, true);
  assert.equal(markerSnap.exists, true);
  assert.deepEqual(messageAfter.data().flagReasons.sort(), [
    "contact_bypass",
    "payment_evasion",
  ]);
});

describe("transactional dispatch", () => {
  const previousEnabled = process.env.EMAIL_ENABLED;
  const previousHost = process.env.SMTP_HOST;
  const previousPort = process.env.SMTP_PORT;
  const previousUser = process.env.SMTP_USER;
  const previousPass = process.env.SMTP_PASS;
  const previousFrom = process.env.MAIL_FROM;
  const previousUrl = process.env.TASKIO_APP_URL;

  /**
   * @param {boolean} enabled
   */
  function setDispatchMailEnv(enabled) {
    process.env.EMAIL_ENABLED = enabled ? "true" : "false";
    process.env.SMTP_HOST = "smtp.test.local";
    process.env.SMTP_PORT = "587";
    process.env.SMTP_USER = "taskio-test";
    process.env.SMTP_PASS = "test-only-smtp-pass-not-real";
    process.env.MAIL_FROM = "Taskio <noreply@taskio.test>";
    process.env.TASKIO_APP_URL = "https://taskio-v2-staging.web.app";
  }

  /**
   * @return {void}
   */
  function restoreDispatchMailEnv() {
    /**
     * @param {string} key
     * @param {string|undefined} value
     * @return {void}
     */
    const restore = (key, value) => {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    };
    restore("EMAIL_ENABLED", previousEnabled);
    restore("SMTP_HOST", previousHost);
    restore("SMTP_PORT", previousPort);
    restore("SMTP_USER", previousUser);
    restore("SMTP_PASS", previousPass);
    restore("MAIL_FROM", previousFrom);
    restore("TASKIO_APP_URL", previousUrl);
    setTransporterFactoryForTests(null);
  }

  test("quote dispatch uses Homeowner record and is idempotent", async () => {
    const id = `email-${Date.now()}`;
    const jobId = `job${id.replace(/[^A-Za-z0-9_-]/g, "")}`;
    const quoteId = `quote${id.replace(/[^A-Za-z0-9_-]/g, "")}`;
    const homeownerUid = `ho${id.replace(/[^A-Za-z0-9_-]/g, "")}`;
    const sent = [];
    setDispatchMailEnv(true);
    setTransporterFactoryForTests(() => ({
      sendMail: async (mail) => {
        sent.push(mail);
        return {messageId: `mid-${sent.length}`};
      },
    }));

    try {
      await db.collection("users").doc(homeownerUid).set({
        email: "homeowner@taskio.test",
        role: "homeowner",
      });
      await notifyQuoteReceived({
        quoteId,
        jobId,
        homeownerUid,
        job: {title: "Garden tidy", taskNumber: 3881},
        quote: {amount: 90, to: "attacker@evil.test"},
      });
      await notifyQuoteReceived({
        quoteId,
        jobId,
        homeownerUid,
        job: {title: "Garden tidy", taskNumber: 3881},
        quote: {amount: 90, to: "attacker@evil.test"},
      });
      assert.equal(sent.length, 1);
      assert.equal(sent[0].to, "homeowner@taskio.test");
      assert.match(sent[0].subject, /TSK-3881/);
      assert.match(sent[0].text, /AUD 90\.00/);
      assert.doesNotMatch(sent[0].text, /attacker@evil\.test/);
      const notif = await db.collection("users").doc(homeownerUid)
        .collection("notifications").doc(`quote_${quoteId}`).get();
      assert.equal(notif.exists, true);
      assert.equal(notif.data().type, "quote_submitted");
    } finally {
      restoreDispatchMailEnv();
    }
  });

  test("funding dispatch emails Homeowner and Expert once", async () => {
    const id = `fund${Date.now()}`.replace(/[^A-Za-z0-9_-]/g, "");
    const jobId = `job${id}`;
    const homeownerUid = `ho${id}`;
    const tradieUid = `ex${id}`;
    const sent = [];
    setDispatchMailEnv(true);
    setTransporterFactoryForTests(() => ({
      sendMail: async (mail) => {
        sent.push(mail);
        return {messageId: `mid-${sent.length}`};
      },
    }));

    try {
      await db.collection("users").doc(homeownerUid).set({
        email: "homeowner@taskio.test",
        role: "homeowner",
      });
      await db.collection("users").doc(tradieUid).set({
        email: "expert@taskio.test",
        role: "tradie",
      });
      await notifyPaymentSecured({
        jobId,
        job: {
          title: "Tap repair",
          taskNumber: 5507,
          homeownerUid,
          acceptedTradieUid: tradieUid,
        },
      });
      assert.equal(sent.length, 2);
      const home = sent.find((m) => m.to === "homeowner@taskio.test");
      const expert = sent.find((m) => m.to === "expert@taskio.test");
      assert.ok(home);
      assert.ok(expert);
      assert.match(home.text, /has not been paid yet/);
      assert.match(expert.text, /You have not been paid yet/);
      assert.match(home.text, /https:\/\/taskio-v2-staging\.web\.app\/job\//);
      assert.match(
        expert.text,
        /https:\/\/taskio-v2-staging\.web\.app\/tradie\/job\//,
      );
    } finally {
      restoreDispatchMailEnv();
    }
  });

  test("dispatch continues when the sender fails", async () => {
    const id = `fail${Date.now()}`.replace(/[^A-Za-z0-9_-]/g, "");
    setDispatchMailEnv(true);
    setTransporterFactoryForTests(() => ({
      sendMail: async () => {
        throw new Error("smtp boom");
      },
    }));
    try {
      await dispatchNotificationEmail({
        uid: `uid${id}`,
        notificationId: `n_${id}`,
        type: "quote_submitted",
        title: "New quote received",
        body: "A quote arrived.",
        jobId: `job${id}`,
        email: {
          event: "quote_received",
          jobId: `job${id}`,
          to: "homeowner@taskio.test",
          subject: "New quote",
          text: "A quote arrived.",
        },
      });
      const notif = await db.collection("users").doc(`uid${id}`)
        .collection("notifications").doc(`n_${id}`).get();
      assert.equal(notif.exists, true);
      assert.equal(notif.data().emailFailedReason, "send_failed");
      assert.equal(notif.data().emailSentAt, undefined);
    } finally {
      restoreDispatchMailEnv();
    }
  });
});
