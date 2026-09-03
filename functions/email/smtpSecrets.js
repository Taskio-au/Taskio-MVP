"use strict";

/**
 * Firebase Functions v2 Secret Manager params for P03 SMTP.
 * Bound only on E01 quote-received functions. Values are never logged.
 */

const {AsyncLocalStorage} = require("node:async_hooks");
const {defineSecret} = require("firebase-functions/params");

const smtpUser = defineSecret("SMTP_USER");
const smtpPass = defineSecret("SMTP_PASS");
const smtpSecretStore = new AsyncLocalStorage();

/**
 * @return {Array<{name: string, value: function(): string}>}
 */
function smtpSecretParams() {
  return [smtpUser, smtpPass];
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
 * Handler-scoped secret overrides for getMailRuntime. Safe under concurrency.
 * @param {Object} secrets
 * @param {string=} secrets.user
 * @param {string=} secrets.pass
 * @param {function(): *} fn
 * @return {*}
 */
function runWithSmtpSecrets(secrets, fn) {
  return smtpSecretStore.run({
    user: String((secrets && secrets.user) || ""),
    pass: String((secrets && secrets.pass) || ""),
  }, fn);
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
  smtpSecretParams,
  readBoundSmtpSecrets,
  runWithSmtpSecrets,
  currentSmtpSecretOverrides,
};
