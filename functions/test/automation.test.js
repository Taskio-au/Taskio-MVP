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
  isQuoteSubmissionTransition,
  processRiskyJobMessage,
} = functions._test;

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
