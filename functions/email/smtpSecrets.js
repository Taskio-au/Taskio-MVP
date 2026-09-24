"use strict";

/**
 * Firebase Functions v2 Secret Manager params for P03 SMTP.
 * Bound only on E01 quote-received functions. Values are never logged.
 */

const {AsyncLocalStorage} = require("node:async_hooks");
const {defineSecret} = require("firebase-functions/params");

const smtpUser = defineSecret("SMTP_USER");
const smtpPass = defineSecret("SMTP_PASS");
const emailProofRecipient = defineSecret("EMAIL_PROOF_RECIPIENT");
const smtpSecretStore = new AsyncLocalStorage();

/**
 * @return {Array<{name: string, value: function(): string}>}
 */
function smtpSecretParams() {
  return [smtpUser, smtpPass];
}

/**
 * Proof function only. Not mounted on customer email triggers.
 * @return {Array<{name: string, value: function(): string}>}
 */
function proofSecretParams() {
  return [smtpUser, smtpPass, emailProofRecipient];
}

/**
 * Runtime values from Firebase-mounted secrets. Empty when unavailable.
 * @return {{user: string, pass: string}}
 */
function readBoundSmtpSecrets() {
  try {
    return {
      user: String(smtpUser.value() || "").trim(),
      pass: String(smtpPass.value() || "").trim(),
    };
  } catch (_err) {
    return {user: "", pass: ""};
  }
}

/**
 * Proof recipient from Secret Manager. Empty when unavailable. Never logged.
 * @return {string}
 */
function readBoundProofRecipient() {
  try {
    return String(emailProofRecipient.value() || "").trim();
  } catch (_err) {
    return "";
  }
}

/**
 * Handler-scoped secret overrides for getMailRuntime. Safe under concurrency.
 * @param {Object} secrets
 * @param {string=} secrets.user
 * @param {string=} secrets.pass
 * @param {function(): *} fn
 * @return {*}
 */
function runWithSmtpSecrets(secrets, fn) {
  const stored = {
    user: String((secrets && secrets.user) || ""),
    pass: String((secrets && secrets.pass) || ""),
  };
  if (secrets && Object.prototype.hasOwnProperty.call(
    secrets, "proofRecipient",
  )) {
    stored.proofRecipient = String(secrets.proofRecipient || "");
  }
  return smtpSecretStore.run(stored, fn);
}

/**
 * @return {{user: string, pass: string}|null}
 */
function currentSmtpSecretOverrides() {
  const store = smtpSecretStore.getStore();
  return store || null;
}

module.exports = {
  smtpUser,
  smtpPass,
  emailProofRecipient,
  smtpSecretParams,
  proofSecretParams,
  readBoundSmtpSecrets,
  readBoundProofRecipient,
  runWithSmtpSecrets,
  currentSmtpSecretOverrides,
};
