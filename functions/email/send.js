"use strict";

const nodemailer = require("nodemailer");
const logger = require("firebase-functions/logger");
const {getMailRuntime, hasHeaderBreak} = require("./config");
const {
  sanitizeRecipientEmail,
  sanitizeHeaderValue,
} = require("./recipients");

let cachedTransporter = null;
let transporterOverride = null;

/**
 * @param {Function|null} factory
 */
function setTransporterFactoryForTests(factory) {
  transporterOverride = factory || null;
  cachedTransporter = null;
}

/**
 * @return {any|null}
 */
/**
 * Low-level transport. Does not consult EMAIL_ENABLED.
 * @param {Object|null} smtp
 * @return {any|null}
 */
function getTransporterForSmtp(smtp) {
  if (transporterOverride) return transporterOverride();
  if (!smtp) return null;
  if (!cachedTransporter) {
    cachedTransporter = nodemailer.createTransport({
      host: smtp.host,
      port: smtp.port,
      secure: smtp.secure,
      auth: smtp.auth,
    });
  }
  return cachedTransporter;
}

/**
 * One SMTP message. No cc, bcc, or attachments. Does not check EMAIL_ENABLED.
 * @param {Object<string, any>} mail
 * @return {Promise<any>}
 */
async function deliverConfiguredMail(mail) {
  const transporter = getTransporterForSmtp(mail && mail.smtp);
  if (!transporter || typeof transporter.sendMail !== "function") {
    const error = new Error("not_configured");
    error.code = "not_configured";
    throw error;
  }
  return transporter.sendMail({
    from: mail.from,
    to: mail.to,
    subject: mail.subject,
    text: mail.text,
    html: mail.html || undefined,
  });
}

/**
 * Best-effort send. Never throws. Never logs secrets, passwords, or full
 * recipient addresses.
 * @param {Object<string, any>} args
 * @return {Promise<Object>}
 */
async function sendTransactionalEmail(args) {
  const event = sanitizeHeaderValue(args && args.event) || "transactional";
  const runtime = getMailRuntime();
  if (!runtime.enabled) {
    logger.info("transactional_email_skipped", {event, reason: "disabled"});
    return {ok: true, sent: false, reason: "disabled"};
  }
  if (!runtime.ready) {
    logger.warn("transactional_email_skipped", {
      event,
      reason: runtime.skipReason || "not_configured",
    });
    return {ok: true, sent: false,
      reason: runtime.skipReason || "not_configured"};
  }

  const to = sanitizeRecipientEmail(args && args.to);
  if (!to) {
    logger.warn("transactional_email_skipped", {
      event,
      reason: "invalid_recipient",
    });
    return {ok: false, sent: false, reason: "invalid_recipient"};
  }

  const subject = sanitizeHeaderValue(args && args.subject);
  const text = String((args && args.text) || "").trim();
  const html = String((args && args.html) || "").trim();
  if (!subject || hasHeaderBreak(subject)) {
    logger.warn("transactional_email_skipped", {
      event,
      reason: "invalid_subject",
    });
    return {ok: false, sent: false, reason: "invalid_subject"};
  }
  if (!text) {
    logger.warn("transactional_email_skipped", {
      event,
      reason: "missing_body",
    });
    return {ok: false, sent: false, reason: "missing_body"};
  }

  try {
    const info = await deliverConfiguredMail({
      smtp: runtime.smtp,
      from: runtime.from,
      to,
      subject,
      text,
      html: html || undefined,
    });
    logger.info("transactional_email_sent", {
      event,
      jobId: args && args.jobId ? String(args.jobId) : null,
      messageId: info && info.messageId ? String(info.messageId) : null,
    });
    return {
      ok: true,
      sent: true,
      reason: "sent",
      messageId: info && info.messageId ? String(info.messageId) : undefined,
    };
  } catch (error) {
    logger.error("transactional_email_failed", {
      event,
      jobId: args && args.jobId ? String(args.jobId) : null,
      error: error && error.message ? String(error.message) : "unknown",
    });
    return {ok: false, sent: false, reason: "send_failed"};
  }
}

module.exports = {
  setTransporterFactoryForTests,
  deliverConfiguredMail,
  sendTransactionalEmail,
};
