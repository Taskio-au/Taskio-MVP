"use strict";

/**
 * Operator verification tool, not a customer-facing product feature.
 * Disabled unless EMAIL_PROOF_ENABLED is exactly "true".
 * After a successful production P03 proof, disable it and optionally
 * undeploy it in a separately approved cleanup. Do not use it as a
 * general email endpoint.
 */

const admin = require("firebase-admin");
const logger = require("firebase-functions/logger");
const {parseExactTrue, getProofMailRuntime} = require("./config");
const {sanitizeRecipientEmail} = require("./recipients");
const {deliverConfiguredMail} = require("./send");

let verifyIdTokenForTests = null;

/**
 * @param {Function|null} verifier
 */
function setVerifyIdTokenForTests(verifier) {
  verifyIdTokenForTests = verifier || null;
}

const PROOF_SUBJECT = "Taskio production email verification";
const PROOF_TEXT =
  "This is a controlled Taskio transactional-email verification message. " +
  "No customer action is required.";

/**
 * @param {import("express").Request} req
 * @param {import("express").Response} res
 * @param {number} status
 * @param {Object<string, any>} body
 * @return {void}
 */
function sendJson(res, status, body) {
  res.status(status).json(body);
}

/**
 * @param {import("express").Request} req
 * @return {boolean}
 */
function hasUnexpectedInput(req) {
  const query = req && req.query;
  if (query && typeof query === "object" && Object.keys(query).length > 0) {
    return true;
  }
  const body = req && req.body;
  if (body == null || body === "") return false;
  if (typeof body === "string") return body.trim().length > 0;
  if (Array.isArray(body)) return true;
  if (typeof body === "object") return Object.keys(body).length > 0;
  return true;
}

/**
 * Firebase ID token with custom claim admin === true.
 * Email address and profile.role are not authorities.
 * @param {import("express").Request} req
 * @return {Promise<"ok"|"unauthenticated"|"forbidden">}
 */
async function authorizeProofOperator(req) {
  const header = String((req && req.get && req.get("authorization")) || "");
  const match = header.match(/^Bearer\s+(\S+)$/);
  if (!match) return "unauthenticated";
  try {
    const verify = verifyIdTokenForTests ||
      ((token) => admin.auth().verifyIdToken(token));
    const decoded = await verify(match[1]);
    if (decoded && decoded.admin === true) return "ok";
    return "forbidden";
  } catch (_error) {
    return "unauthenticated";
  }
}

/**
 * HTTPS handler. One fixed message. No Firestore writes.
 * @param {import("express").Request} req
 * @param {import("express").Response} res
 * @return {Promise<void>}
 */
async function handleVerifyTransactionalEmail(req, res) {
  if (!req || req.method !== "POST") {
    sendJson(res, 405, {ok: false, error: "method_not_allowed"});
    return;
  }

  const authz = await authorizeProofOperator(req);
  if (authz === "unauthenticated") {
    sendJson(res, 401, {ok: false, error: "unauthenticated"});
    return;
  }
  if (authz !== "ok") {
    sendJson(res, 403, {ok: false, error: "forbidden"});
    return;
  }

  if (!parseExactTrue(process.env.EMAIL_PROOF_ENABLED)) {
    logger.info("transactional_email_proof", {result: "disabled"});
    sendJson(res, 404, {ok: false, error: "proof_disabled"});
    return;
  }

  if (hasUnexpectedInput(req)) {
    sendJson(res, 400, {ok: false, error: "unexpected_fields"});
    return;
  }

  const runtime = getProofMailRuntime();
  const to = runtime.ready ? sanitizeRecipientEmail(runtime.to) : null;
  if (!runtime.ready || !runtime.smtp || !to) {
    logger.warn("transactional_email_proof", {result: "unavailable"});
    sendJson(res, 503, {ok: false, error: "proof_unavailable"});
    return;
  }

  try {
    const info = await deliverConfiguredMail({
      smtp: runtime.smtp,
      from: runtime.from,
      to,
      subject: PROOF_SUBJECT,
      text: PROOF_TEXT,
    });
    logger.info("transactional_email_proof_sent", {
      messageId: info && info.messageId ? String(info.messageId) : null,
    });
    sendJson(res, 200, {
      ok: true,
      event: "transactional_email_proof_sent",
    });
  } catch (_error) {
    logger.error("transactional_email_proof", {result: "send_failed"});
    sendJson(res, 502, {ok: false, error: "proof_send_failed"});
  }
}

module.exports = {
  PROOF_SUBJECT,
  PROOF_TEXT,
  setVerifyIdTokenForTests,
  handleVerifyTransactionalEmail,
};
