"use strict";

/**
 * Transactional email is owned by Firebase Functions (nodemailer SMTP).
 * Safe default: EMAIL_ENABLED is unset/false — no network send.
 */

const {currentSmtpSecretOverrides} = require("./smtpSecrets");

/**
 * @param {string|undefined} raw
 * @return {boolean}
 */
function parseEnabledFlag(raw) {
  const v = String(raw || "").trim().toLowerCase();
  return v === "true" || v === "1" || v === "yes";
}

/**
 * @param {string} value
 * @return {boolean}
 */
function hasHeaderBreak(value) {
  return /[\r\n]/.test(String(value || ""));
}

/**
 * Trusted frontend origin for email links. HTTPS only. No credentials.
 * @param {string} raw
 * @return {string|null}
 */
function parseTrustedAppUrl(raw) {
  const trimmed = String(raw || "").trim().replace(/\/+$/, "");
  if (!trimmed || hasHeaderBreak(trimmed)) return null;
  let parsed;
  try {
    parsed = new URL(trimmed);
  } catch (_e) {
    return null;
  }
  if (parsed.protocol !== "https:") return null;
  if (parsed.username || parsed.password) return null;
  if (parsed.search || parsed.hash) return null;
  return parsed.origin;
}

/**
 * @return {Object}
 */
function getMailRuntime() {
  const enabled = parseEnabledFlag(process.env.EMAIL_ENABLED);
  if (!enabled) {
    return {
      enabled: false,
      ready: false,
      from: null,
      appUrl: null,
      smtp: null,
      skipReason: "disabled",
    };
  }

  const host = String(process.env.SMTP_HOST || "").trim();
  const portRaw = String(process.env.SMTP_PORT || "").trim();
  const secretOverrides = currentSmtpSecretOverrides();
  const user = String(
    secretOverrides ? secretOverrides.user : (process.env.SMTP_USER || ""),
  ).trim();
  const pass = String(
    secretOverrides ? secretOverrides.pass : (process.env.SMTP_PASS || ""),
  ).trim();
  const from = String(
    process.env.MAIL_FROM || process.env.CHAT_EMAIL_FROM || "",
  ).trim();
  const appUrl = parseTrustedAppUrl(process.env.TASKIO_APP_URL);
  const port = Number(portRaw);

  if (!host || !portRaw || !Number.isFinite(port) || port <= 0 || !user ||
      !pass || !from || !appUrl) {
    return {
      enabled: true,
      ready: false,
      from: null,
      appUrl,
      smtp: null,
      skipReason: "not_configured",
    };
  }
  if (hasHeaderBreak(host) || hasHeaderBreak(user) || hasHeaderBreak(from) ||
      hasHeaderBreak(pass)) {
    return {
      enabled: true,
      ready: false,
      from: null,
      appUrl,
      smtp: null,
      skipReason: "not_configured",
    };
  }

  return {
    enabled: true,
    ready: true,
    from,
    appUrl,
    smtp: {
      host,
      port,
      secure: port === 465,
      auth: {user, pass},
    },
    skipReason: null,
  };
}

/**
 * Legacy helper used by chat email: complete SMTP config or null.
 * Also requires EMAIL_ENABLED.
 * @return {Object<string, any>|null}
 */
function getMailConfig() {
  const runtime = getMailRuntime();
  if (!runtime.ready || !runtime.smtp) return null;
  return {
    host: runtime.smtp.host,
    port: runtime.smtp.port,
    secure: runtime.smtp.secure,
    auth: runtime.smtp.auth,
    from: runtime.from,
    appUrl: runtime.appUrl,
  };
}

module.exports = {
  parseEnabledFlag,
  parseTrustedAppUrl,
  hasHeaderBreak,
  getMailRuntime,
  getMailConfig,
};
