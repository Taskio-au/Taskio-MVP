"use strict";

const assert = require("node:assert/strict");
const {afterEach, beforeEach, describe, test} = require("node:test");
const logger = require("firebase-functions/logger");
const {
  parseEnabledFlag,
  parseTrustedAppUrl,
  getMailRuntime,
} = require("../email/config");
const {
  sanitizeRecipientEmail,
  resolveTrustedEmail,
  sanitizeHeaderValue,
  sanitizeDocId,
  buildTrustedAppLink,
} = require("../email/recipients");
const {
  buildQuoteReceivedEmail,
  buildPaymentSecuredHomeownerEmail,
  buildPaymentSecuredExpertEmail,
  buildTaskCompleteHomeownerEmail,
  buildPaymentReleasedHomeownerEmail,
  buildPaymentReleasedExpertEmail,
  buildRefundHomeownerEmail,
  buildRefundExpertEmail,
} = require("../email/templates");
const {
  isQuoteSubmissionTransition,
  isEscrowFundedTransition,
  isTaskCompletedTransition,
  isPaymentReleasedTransition,
  isRefundCompletedTransition,
} = require("../email/transitions");
const {emailAlreadySent} = require("../email/dispatch");
const {
  sendTransactionalEmail,
  setTransporterFactoryForTests,
} = require("../email/send");
const {runWithSmtpSecrets} = require("../email/smtpSecrets");

const SECRET_PASS = "test-only-smtp-pass-not-real";
const MAIL_ENV_KEYS = [
  "EMAIL_ENABLED",
  "SMTP_HOST",
  "SMTP_PORT",
  "SMTP_USER",
  "SMTP_PASS",
  "MAIL_FROM",
  "CHAT_EMAIL_FROM",
  "TASKIO_APP_URL",
];

const originalMailEnv = {};
MAIL_ENV_KEYS.forEach((key) => {
  originalMailEnv[key] = process.env[key];
});

/**
 * @param {Object<string, string>} values
 */
function setMailEnv(values) {
  MAIL_ENV_KEYS.forEach((key) => {
    if (Object.prototype.hasOwnProperty.call(values, key)) {
      process.env[key] = values[key];
    } else {
      delete process.env[key];
    }
  });
}

beforeEach(() => {
  setMailEnv({});
  setTransporterFactoryForTests(null);
});

afterEach(() => {
  MAIL_ENV_KEYS.forEach((key) => {
    if (originalMailEnv[key] === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = originalMailEnv[key];
    }
  });
  setTransporterFactoryForTests(null);
});

/**
 * @return {Object<string, string>}
 */
function readyMailEnv() {
  return {
    EMAIL_ENABLED: "true",
    SMTP_HOST: "smtp.test.local",
    SMTP_PORT: "587",
    SMTP_USER: "taskio-test",
    SMTP_PASS: SECRET_PASS,
    MAIL_FROM: "Taskio <noreply@taskio.test>",
    TASKIO_APP_URL: "https://taskio-v2-staging.web.app",
  };
}

describe("mail config", () => {
  test("EMAIL_ENABLED defaults to false", () => {
    assert.equal(parseEnabledFlag(undefined), false);
    assert.equal(parseEnabledFlag(""), false);
    assert.equal(parseEnabledFlag("false"), false);
    assert.equal(getMailRuntime().enabled, false);
    assert.equal(getMailRuntime().ready, false);
  });

  test("enabled without SMTP is not ready", () => {
    setMailEnv({EMAIL_ENABLED: "true"});
    const runtime = getMailRuntime();
    assert.equal(runtime.enabled, true);
    assert.equal(runtime.ready, false);
    assert.equal(runtime.skipReason, "not_configured");
  });

  test("secret overrides supply SMTP_USER and SMTP_PASS", () => {
    setMailEnv({
      EMAIL_ENABLED: "true",
      SMTP_HOST: "smtp.test.local",
      SMTP_PORT: "587",
      SMTP_USER: "from-env-user",
      SMTP_PASS: "from-env-pass",
      MAIL_FROM: "Taskio <noreply@taskio.test>",
      TASKIO_APP_URL: "https://taskio-v2-staging.web.app",
    });
    runWithSmtpSecrets({
      user: "from-secret-user",
      pass: SECRET_PASS,
    }, () => {
      const runtime = getMailRuntime();
      assert.equal(runtime.ready, true);
      assert.equal(runtime.smtp.auth.user, "from-secret-user");
      assert.equal(runtime.smtp.auth.pass, SECRET_PASS);
    });
  });

  test("empty bound secrets fail safely as not_configured", () => {
    setMailEnv({
      EMAIL_ENABLED: "true",
      SMTP_HOST: "smtp.test.local",
      SMTP_PORT: "587",
      SMTP_USER: "from-env-user",
      SMTP_PASS: SECRET_PASS,
      MAIL_FROM: "Taskio <noreply@taskio.test>",
      TASKIO_APP_URL: "https://taskio-v2-staging.web.app",
    });
    runWithSmtpSecrets({user: "", pass: ""}, () => {
      const runtime = getMailRuntime();
      assert.equal(runtime.enabled, true);
      assert.equal(runtime.ready, false);
      assert.equal(runtime.skipReason, "not_configured");
    });
  });

  test("TASKIO_APP_URL must be a trusted https origin", () => {
    assert.equal(
      parseTrustedAppUrl("https://taskio-v2-staging.web.app"),
      "https://taskio-v2-staging.web.app",
    );
    assert.equal(parseTrustedAppUrl("http://taskio.com.au"), null);
    assert.equal(parseTrustedAppUrl("https://evil.test/?next=1"), null);
    assert.equal(
      parseTrustedAppUrl("https://user:pass@taskio.com.au"),
      null,
    );
  });
});

describe("recipients and headers", () => {
  test("rejects header injection and client to/cc/bcc lists", () => {
    assert.equal(sanitizeRecipientEmail("ok@taskio.test"), "ok@taskio.test");
    assert.equal(
      sanitizeRecipientEmail("ok@taskio.test\nBcc: other@x.test"),
      null,
    );
    assert.equal(
      sanitizeRecipientEmail("a@taskio.test,b@taskio.test"),
      null,
    );
    assert.equal(
      sanitizeHeaderValue("Hi\nBcc: x@y.test"),
      "Hi Bcc: x@y.test",
    );
    assert.doesNotMatch(sanitizeHeaderValue("Hi\nBcc: x@y.test"), /\r|\n/);
    assert.equal(sanitizeDocId("abc/../quotes"), null);
    assert.equal(sanitizeDocId("job_1-OK"), "job_1-OK");
  });

  test("prefers Auth email over profile email", () => {
    assert.equal(
      resolveTrustedEmail(
        {email: "auth@taskio.test"},
        {email: "profile@taskio.test"},
      ),
      "auth@taskio.test",
    );
    assert.equal(
      resolveTrustedEmail(null, {email: "profile@taskio.test"}),
      "profile@taskio.test",
    );
    assert.equal(
      resolveTrustedEmail(
        {email: "bad\ninject@taskio.test"},
        {email: "safe@taskio.test"},
      ),
      "safe@taskio.test",
    );
  });

  test("trusted app links ignore arbitrary request paths", () => {
    const origin = "https://taskio.com.au";
    assert.equal(
      buildTrustedAppLink(origin, "/job/abc123"),
      "https://taskio.com.au/job/abc123",
    );
    assert.equal(buildTrustedAppLink(origin, "//evil.test"), null);
    assert.equal(
      buildTrustedAppLink(origin, "https://evil.test"),
      null,
    );
  });
});

describe("MVP event copy", () => {
  const openUrl = "https://taskio-v2-staging.web.app/job/abc123";

  test("quote email is for the Homeowner and omits Expert PII", () => {
    const built = buildQuoteReceivedEmail({
      jobRef: "TSK-3881",
      jobTitle: "Garden tidy",
      quoteAmount: 90,
      openUrl,
    });
    assert.match(built.subject, /TSK-3881/);
    assert.match(built.text, /AUD 90\.00/);
    assert.match(built.text, /Open Taskio|Review quote/);
    assert.match(built.html, /TASKIO/);
    assert.doesNotMatch(built.text, /expert@/i);
    assert.doesNotMatch(built.text, /phone/i);
    assert.doesNotMatch(built.text, /acct_/);
    assert.doesNotMatch(built.text, /escrow/i);
    assert.ok(built.html.indexOf(openUrl) !== -1);
  });

  test("funding copy distinguishes Homeowner vs Expert", () => {
    const home = buildPaymentSecuredHomeownerEmail({
      jobRef: "TSK-5507",
      jobTitle: "Tap repair",
      openUrl,
    });
    const expert = buildPaymentSecuredExpertEmail({
      jobRef: "TSK-5507",
      jobTitle: "Tap repair",
      openUrl,
    });
    assert.match(home.text, /has been secured/);
    assert.match(home.text, /held until you approve/);
    assert.match(home.text, /has not been paid yet/);
    assert.match(expert.text, /has been secured/);
    assert.match(expert.text, /You have not been paid yet/);
    assert.doesNotMatch(expert.text, /you have been paid/i);
    assert.doesNotMatch(home.text, /escrow/i);
    assert.doesNotMatch(expert.text, /escrow/i);
  });

  test("completion email is for Homeowner review, not release", () => {
    const built = buildTaskCompleteHomeownerEmail({
      jobRef: "TSK-5507",
      jobTitle: "Tap repair",
      openUrl,
    });
    assert.match(built.text, /marked .* complete/i);
    assert.match(built.text, /Payment has not been released/);
    assert.doesNotMatch(built.text, /released to your Stripe/i);
  });

  test("release email does not claim bank payout is complete", () => {
    const expert = buildPaymentReleasedExpertEmail({
      jobRef: "TSK-5507",
      jobTitle: "Tap repair",
      openUrl,
    });
    const home = buildPaymentReleasedHomeownerEmail({
      jobRef: "TSK-5507",
      jobTitle: "Tap repair",
      openUrl,
    });
    assert.match(expert.text, /released to your Stripe account/);
    assert.match(expert.text, /Bank payout timing is managed by Stripe/);
    assert.doesNotMatch(expert.text, /payout is complete/i);
    assert.doesNotMatch(expert.text, /paid to your bank/i);
    assert.match(home.text, /Payment has been released/);
  });

  test("refund email represents a completed Taskio refund", () => {
    const home = buildRefundHomeownerEmail({
      jobRef: "TSK-3881",
      jobTitle: "Garden tidy",
      refundAmount: 90,
      openUrl,
    });
    const expert = buildRefundExpertEmail({
      jobRef: "TSK-3881",
      jobTitle: "Garden tidy",
      openUrl,
    });
    assert.match(home.text, /has been refunded/);
    assert.match(home.text, /AUD 90\.00/);
    assert.match(home.text, /Card settlement timing is managed/);
    assert.match(expert.text, /No payment is due for this task/);
    assert.doesNotMatch(home.text, /will appear on your statement tomorrow/i);
  });
});

describe("transitions", () => {
  test("does not treat REFUND_PENDING as a completed refund", () => {
    assert.equal(
      isRefundCompletedTransition({}, {status: "REFUND_PENDING"}),
      false,
    );
    assert.equal(
      isRefundCompletedTransition({}, {status: "REFUNDED"}),
      true,
    );
    assert.equal(
      isTaskCompletedTransition({}, {status: "COMPLETED"}),
      true,
    );
    assert.equal(
      isPaymentReleasedTransition({}, {paymentState: "released"}),
      true,
    );
    assert.equal(
      isQuoteSubmissionTransition({status: "draft"}, {status: "submitted"}),
      true,
    );
    assert.equal(
      isEscrowFundedTransition({}, {paymentState: "in_escrow"}),
      true,
    );
  });
});

describe("sendTransactionalEmail", () => {
  test("EMAIL_ENABLED false sends nothing externally", async () => {
    let calls = 0;
    setTransporterFactoryForTests(() => {
      calls += 1;
      return {sendMail: async () => ({messageId: "should-not-send"})};
    });
    const result = await sendTransactionalEmail({
      event: "quote_received",
      to: "homeowner@taskio.test",
      subject: "New quote",
      text: "A quote arrived.",
    });
    assert.equal(result.sent, false);
    assert.equal(result.reason, "disabled");
    assert.equal(calls, 0);
  });

  test("EMAIL_ENABLED false ignores bound SMTP secrets", async () => {
    let calls = 0;
    setTransporterFactoryForTests(() => {
      calls += 1;
      return {sendMail: async () => ({messageId: "should-not-send"})};
    });
    const result = await runWithSmtpSecrets({
      user: "from-secret-user",
      pass: SECRET_PASS,
    }, () => sendTransactionalEmail({
      event: "quote_received",
      to: "homeowner@taskio.test",
      subject: "New quote",
      text: "A quote arrived.",
    }));
    assert.equal(result.sent, false);
    assert.equal(result.reason, "disabled");
    assert.equal(calls, 0);
  });

  test("enabled but unconfigured does not open SMTP", async () => {
    let calls = 0;
    setMailEnv({EMAIL_ENABLED: "true"});
    setTransporterFactoryForTests(() => {
      calls += 1;
      return {sendMail: async () => ({messageId: "nope"})};
    });
    const result = await sendTransactionalEmail({
      event: "quote_received",
      to: "homeowner@taskio.test",
      subject: "New quote",
      text: "A quote arrived.",
    });
    assert.equal(result.sent, false);
    assert.equal(result.reason, "not_configured");
    assert.equal(calls, 0);
  });

  test("bound secrets send without env SMTP credentials", async () => {
    setMailEnv({
      EMAIL_ENABLED: "true",
      SMTP_HOST: "smtp.test.local",
      SMTP_PORT: "587",
      MAIL_FROM: "Taskio <noreply@taskio.test>",
      TASKIO_APP_URL: "https://taskio-v2-staging.web.app",
    });
    let capturedUser = null;
    setTransporterFactoryForTests(() => ({
      sendMail: async (mail) => {
        capturedUser = mail.from;
        return {messageId: "mid-secret"};
      },
    }));
    const result = await runWithSmtpSecrets({
      user: "from-secret-user",
      pass: SECRET_PASS,
    }, () => sendTransactionalEmail({
      event: "quote_received",
      to: "homeowner@taskio.test",
      subject: "New quote",
      text: "A quote arrived.",
    }));
    assert.equal(result.sent, true);
    assert.equal(capturedUser, "Taskio <noreply@taskio.test>");
  });

  test("sender failure does not throw", async () => {
    setMailEnv(readyMailEnv());
    setTransporterFactoryForTests(() => ({
      sendMail: async () => {
        throw new Error("smtp boom");
      },
    }));
    const result = await sendTransactionalEmail({
      event: "payment_released_expert",
      to: "expert@taskio.test",
      subject: "Payment released",
      text: "Released to Stripe.",
    });
    assert.equal(result.sent, false);
    assert.equal(result.reason, "send_failed");
    assert.equal(result.ok, false);
  });

  test("rejects injected recipients and does not call sendMail", async () => {
    setMailEnv(readyMailEnv());
    let calls = 0;
    setTransporterFactoryForTests(() => ({
      sendMail: async () => {
        calls += 1;
        return {messageId: "nope"};
      },
    }));
    const result = await sendTransactionalEmail({
      event: "quote_received",
      to: "ok@taskio.test\nBcc: victim@evil.test",
      subject: "New quote",
      text: "A quote arrived.",
    });
    assert.equal(result.reason, "invalid_recipient");
    assert.equal(calls, 0);
  });

  test("logs and result omit secrets and full recipient", async () => {
    setMailEnv(readyMailEnv());
    const captured = [];
    const origInfo = logger.info;
    const origWarn = logger.warn;
    const origError = logger.error;
    const tap = (...args) => {
      captured.push(JSON.stringify(args));
    };
    logger.info = tap;
    logger.warn = tap;
    logger.error = tap;
    setTransporterFactoryForTests(() => ({
      sendMail: async (mail) => {
        assert.equal(mail.to, "homeowner@taskio.test");
        assert.equal(mail.subject, "New quote for TSK-0001");
        return {messageId: "mid-1"};
      },
    }));
    try {
      const result = await sendTransactionalEmail({
        event: "quote_received",
        jobId: "abc123",
        to: "homeowner@taskio.test",
        subject: "New quote for TSK-0001",
        text: "A quote arrived.",
        html: "<p>A quote arrived.</p>",
      });
      assert.equal(result.sent, true);
      const dump = `${JSON.stringify(result)}\n${captured.join("\n")}`;
      assert.doesNotMatch(dump, new RegExp(SECRET_PASS));
      assert.doesNotMatch(dump, /homeowner@taskio\.test/);
      assert.doesNotMatch(dump, /noreply@taskio\.test/);
    } finally {
      logger.info = origInfo;
      logger.warn = origWarn;
      logger.error = origError;
    }
  });
});

describe("idempotency", () => {
  test("emailSentAt skips a duplicate send", () => {
    assert.equal(emailAlreadySent(null), false);
    assert.equal(emailAlreadySent({}), false);
    assert.equal(emailAlreadySent({emailSentAt: {seconds: 1}}), true);
  });
});
