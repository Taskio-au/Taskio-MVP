"use strict";

const {hasHeaderBreak} = require("./config");

const EMAIL_RE = /^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$/i;

/**
 * Trusted recipient from Auth/profile records only.
 * Never from request to/cc/bcc.
 * @param {string} value
 * @return {string|null}
 */
function sanitizeRecipientEmail(value) {
  const email = String(value || "").trim();
  if (!email || hasHeaderBreak(email)) return null;
  if (email.length > 254) return null;
  if (email.includes(",") || email.includes(";") || email.includes(" ")) {
    return null;
  }
  if (!EMAIL_RE.test(email)) return null;
  return email;
}

/**
 * Prefer Firebase Auth email over profile. Never use client to/cc/bcc.
 * @param {Object<string, any>|null} authUser
 * @param {Object<string, any>|null} profile
 * @return {string}
 */
function resolveTrustedEmail(authUser, profile) {
  const fromAuth = sanitizeRecipientEmail(authUser && authUser.email);
  if (fromAuth) return fromAuth;
  return sanitizeRecipientEmail(profile && profile.email) || "";
}

/**
 * @param {string} value
 * @return {string|null}
 */
function sanitizeHeaderValue(value) {
  const text = String(value || "").trim().replace(/\s+/g, " ");
  if (!text || hasHeaderBreak(text)) return null;
  if (text.length > 200) return `${text.slice(0, 199).trim()}…`;
  return text;
}

/**
 * Firestore document ids used in links. Reject path/header injection.
 * @param {string} value
 * @return {string|null}
 */
function sanitizeDocId(value) {
  const id = String(value || "").trim();
  if (!id || id.length > 128) return null;
  if (!/^[A-Za-z0-9_-]+$/.test(id)) return null;
  return id;
}

/**
 * @param {string} appUrl
 * @param {string} path
 * @return {string|null}
 */
function buildTrustedAppLink(appUrl, path) {
  const origin = String(appUrl || "").replace(/\/+$/, "");
  const p = String(path || "");
  if (!origin || !p.startsWith("/") || p.startsWith("//")) return null;
  if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(p.slice(1))) return null;
  if (hasHeaderBreak(p)) return null;
  return `${origin}${p}`;
}

module.exports = {
  EMAIL_RE,
  sanitizeRecipientEmail,
  resolveTrustedEmail,
  sanitizeHeaderValue,
  sanitizeDocId,
  buildTrustedAppLink,
};
