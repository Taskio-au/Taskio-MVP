"use strict";

const assert = require("node:assert/strict");
const {afterEach, beforeEach, describe, test} = require("node:test");
const logger = require("firebase-functions/logger");
const {parseExactTrue, getMailRuntime} = require("../email/config");
const {
  PROOF_SUBJECT,
  PROOF_TEXT,
  setVerifyIdTokenForTests,
  handleVerifyTransactionalEmail,
} = require("../email/proof");
const {setTransporterFactoryForTests} = require("../email/send");
const {
  proofSecretParams,
  runWithSmtpSecrets,
} = require("../email/smtpSecrets");

const PROOF_RECIPIENT = "operator@taskio.test";
const MAIL_FROM = "Taskio <admin@taskio.test>";
const SECRET_PASS = "test-only-smtp-pass-not-real";

const ENV_KEYS = [
  "EMAIL_ENABLED",
  "EMAIL_PROOF_ENABLED",
  "SMTP_HOST",
  "SMTP_PORT",
  "SMTP_USER",
  "SMTP_PASS",
  "MAIL_FROM",
  "CHAT_EMAIL_FROM",
  "TASKIO_APP_URL",
];

const originalEnv = {};
ENV_KEYS.forEach((key) => {
  originalEnv[key] = process.env[key];
});

/**
 * @param {Object<string, string>} values
 */
function setEnv(values) {
  ENV_KEYS.forEach((key) => {
    if (Object.prototype.hasOwnProperty.call(values, key)) {
      process.env[key] = values[key];
    } else {
      delete process.env[key];
    }
  });
}

/**
 * @param {Object<string, any>} overrides
 * @return {Object}
 */
function readyProofEnv(overrides) {
  return Object.assign({
    EMAIL_ENABLED: "false",
    EMAIL_PROOF_ENABLED: "true",
    SMTP_HOST: "smtp.test.local",
    SMTP_PORT: "587",
    MAIL_FROM,
  }, overrides || {});
}

/**
 * @param {Object<string, any>} options
 * @return {Object}
 */
function mockReq(options) {
  const opts = options || {};
  const headers = Object.assign({}, opts.headers || {});
  return {
    method: opts.method || "POST",
    query: opts.query || {},
    body: Object.prototype.hasOwnProperty.call(opts, "body") ? opts.body : {},
    get(name) {
      return headers[String(name || "").toLowerCase()] || "";
    },
  };
}

/**
 * @return {Object}
 */
function mockRes() {
  return {
    statusCode: 0,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    },
  };
}

/**
 * @param {Object<string, any>} extra
 * @return {Promise<{res: Object, calls: Array}>}
 */
async function invoke(extra) {
  const calls = [];
  setTransporterFactoryForTests(() => ({
    sendMail: async (mail) => {
      calls.push(mail);
      if (extra && extra.failSend) {
        const error = new Error("smtp user smtp-user@postmark.test password leaked");
        throw error;
      }
      return {messageId: "proof-mid-1", envelope: {to: [PROOF_RECIPIENT]}};
    },
  }));
  const secrets = Object.prototype.hasOwnProperty.call(extra || {}, "secrets") ?
    extra.secrets :
    {
      user: "smtp-user",
      pass: SECRET_PASS,
      proofRecipient: PROOF_RECIPIENT,
    };
  const req = mockReq(extra && extra.req);
  const res = mockRes();
  const run = () => handleVerifyTransactionalEmail(req, res);
  if (secrets === null) {
    await run();
  } else {
    await runWithSmtpSecrets(secrets, run);
  }
  return {res, calls};
}

beforeEach(() => {
  setEnv({});
  setTransporterFactoryForTests(null);
  setVerifyIdTokenForTests(async (token) => {
    if (token === "admin-token") return {uid: "admin-1", admin: true};
    if (token === "user-token") {
      return {uid: "user-1", admin: false, role: "admin"};
    }
    if (token === "email-token") {
      return {uid: "email-1", email: "admin@taskio.test"};
    }
    throw new Error("invalid token");
  });
});

afterEach(() => {
  setVerifyIdTokenForTests(null);
  setTransporterFactoryForTests(null);
  ENV_KEYS.forEach((key) => {
    if (originalEnv[key] === undefined) delete process.env[key];
    else process.env[key] = originalEnv[key];
  });
});

describe("proof gate", () => {
  test("only the exact string true enables the proof", () => {
    assert.equal(parseExactTrue(undefined), false);
    assert.equal(parseExactTrue(""), false);
    assert.equal(parseExactTrue("false"), false);
    assert.equal(parseExactTrue("1"), false);
    assert.equal(parseExactTrue("yes"), false);
    assert.equal(parseExactTrue("TRUE"), false);
    assert.equal(parseExactTrue(" true"), false);
    assert.equal(parseExactTrue("true"), true);
  });

  test("absent or false proof gate does not send", async () => {
    for (const flag of [undefined, "false", "1", "yes", "TRUE"]) {
      setEnv(readyProofEnv(
        flag === undefined ? {} : {EMAIL_PROOF_ENABLED: flag},
      ));
      if (flag === undefined) delete process.env.EMAIL_PROOF_ENABLED;
      const {res, calls} = await invoke({
        req: {headers: {authorization: "Bearer admin-token"}},
      });
      assert.equal(res.statusCode, 404);
      assert.deepEqual(res.body, {ok: false, error: "proof_disabled"});
      assert.equal(calls.length, 0);
    }
  });
});

describe("proof auth", () => {
  test("unauthenticated is denied and does not send", async () => {
    setEnv(readyProofEnv());
    const {res, calls} = await invoke({req: {headers: {}}});
    assert.equal(res.statusCode, 401);
    assert.equal(res.body.error, "unauthenticated");
    assert.equal(calls.length, 0);
  });

  test("authenticated non-admin is denied", async () => {
    setEnv(readyProofEnv());
    const {res, calls} = await invoke({
      req: {headers: {authorization: "Bearer user-token"}},
    });
    assert.equal(res.statusCode, 403);
    assert.equal(res.body.error, "forbidden");
    assert.equal(calls.length, 0);
  });

  test("email address and client role are not admin authority", async () => {
    setEnv(readyProofEnv());
    const {res, calls} = await invoke({
      req: {headers: {authorization: "Bearer email-token"}},
    });
    assert.equal(res.statusCode, 403);
    assert.equal(calls.length, 0);
  });

  test("admin is accepted only when the proof gate is enabled", async () => {
    setEnv(readyProofEnv());
    const {res, calls} = await invoke({
      req: {headers: {authorization: "Bearer admin-token"}},
    });
    assert.equal(res.statusCode, 200);
    assert.deepEqual(res.body, {
      ok: true,
      event: "transactional_email_proof_sent",
    });
    assert.equal(calls.length, 1);
  });
});

describe("proof config", () => {
  test("each missing SMTP setting fails without a send", async () => {
    const cases = [
      {SMTP_HOST: ""},
      {SMTP_PORT: ""},
      {MAIL_FROM: ""},
      {secrets: {user: "", pass: SECRET_PASS, proofRecipient: PROOF_RECIPIENT}},
      {secrets: {user: "smtp-user", pass: "", proofRecipient: PROOF_RECIPIENT}},
      {secrets: {user: "smtp-user", pass: SECRET_PASS, proofRecipient: ""}},
    ];
    for (const item of cases) {
      setEnv(readyProofEnv(item));
      const extra = {
        req: {headers: {authorization: "Bearer admin-token"}},
      };
      if (item.secrets) extra.secrets = item.secrets;
      const {res, calls} = await invoke(extra);
      assert.equal(res.statusCode, 503);
      assert.deepEqual(res.body, {ok: false, error: "proof_unavailable"});
      assert.equal(JSON.stringify(res.body).includes("SMTP"), false);
      assert.equal(JSON.stringify(res.body).includes(SECRET_PASS), false);
      assert.equal(calls.length, 0);
    }
  });
});

describe("proof message", () => {
  test("uses fixed sender, subject, body, and configured recipient", async () => {
    setEnv(readyProofEnv({
      CHAT_EMAIL_FROM: "Other <other@taskio.test>",
    }));
    const {calls} = await invoke({
      req: {
        headers: {authorization: "Bearer admin-token"},
        body: {},
      },
    });
    assert.equal(calls.length, 1);
    assert.equal(calls[0].from, MAIL_FROM);
    assert.equal(calls[0].to, PROOF_RECIPIENT);
    assert.equal(calls[0].subject, PROOF_SUBJECT);
    assert.equal(calls[0].subject, "Taskio production email verification");
    assert.equal(calls[0].text, PROOF_TEXT);
    assert.equal(calls[0].html, undefined);
    assert.equal(calls[0].cc, undefined);
    assert.equal(calls[0].bcc, undefined);
    assert.equal(calls[0].attachments, undefined);
  });

  test("rejects caller recipient, subject, and body", async () => {
    setEnv(readyProofEnv());
    const {res, calls} = await invoke({
      req: {
        headers: {authorization: "Bearer admin-token"},
        body: {
          to: "victim@example.com",
          subject: "Changed",
          body: "Changed",
          html: "<b>Changed</b>",
          from: "attacker@example.com",
        },
      },
    });
    assert.equal(res.statusCode, 400);
    assert.equal(res.body.error, "unexpected_fields");
    assert.equal(calls.length, 0);
  });

  test("rejects query overrides", async () => {
    setEnv(readyProofEnv());
    const {res, calls} = await invoke({
      req: {
        headers: {authorization: "Bearer admin-token"},
        query: {to: "victim@example.com"},
      },
    });
    assert.equal(res.statusCode, 400);
    assert.equal(calls.length, 0);
  });

  test("sends exactly one message while customer email stays off", async () => {
    setEnv(readyProofEnv());
    const {res, calls} = await invoke({
      req: {headers: {authorization: "Bearer admin-token"}},
    });
    assert.equal(res.statusCode, 200);
    assert.equal(calls.length, 1);
    assert.equal(getMailRuntime().enabled, false);
    assert.equal(Object.prototype.hasOwnProperty.call(res.body, "messageId"), false);
    assert.equal(JSON.stringify(res.body).includes(PROOF_RECIPIENT), false);
  });
});

describe("proof failure", () => {
  test("provider failure is sanitized and does not send twice", async () => {
    setEnv(readyProofEnv());
    const captured = [];
    const origError = logger.error;
    logger.error = (...args) => captured.push(JSON.stringify(args));
    try {
      const {res, calls} = await invoke({
        failSend: true,
        req: {headers: {authorization: "Bearer admin-token"}},
      });
      assert.equal(res.statusCode, 502);
      assert.deepEqual(res.body, {ok: false, error: "proof_send_failed"});
      assert.equal(calls.length, 1);
      const dump = `${JSON.stringify(res.body)}\n${captured.join("\n")}`;
      assert.equal(dump.includes(PROOF_RECIPIENT), false);
      assert.equal(dump.includes(SECRET_PASS), false);
      assert.equal(dump.includes("smtp-user"), false);
      assert.equal(dump.includes("leaked"), false);
    } finally {
      logger.error = origError;
    }
  });
});

describe("proof secrets", () => {
  test("proof function secrets are SMTP credentials plus the recipient", () => {
    assert.deepEqual(
      proofSecretParams().map((item) => item.name).sort(),
      ["EMAIL_PROOF_RECIPIENT", "SMTP_PASS", "SMTP_USER"],
    );
  });
});
