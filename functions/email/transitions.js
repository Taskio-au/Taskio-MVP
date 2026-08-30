"use strict";

/**
 * @param {Object<string, any>} before
 * @param {Object<string, any>} after
 * @return {boolean}
 */
function isQuoteSubmissionTransition(before, after) {
  const b = before || {};
  const a = after || {};
  return b.status !== "submitted" && a.status === "submitted";
}

/**
 * @param {Object<string, any>} before
 * @param {Object<string, any>} after
 * @return {boolean}
 */
function isEscrowFundedTransition(before, after) {
  const b = before || {};
  const a = after || {};
  return (b.paymentState !== "in_escrow" && a.paymentState === "in_escrow") ||
    (b.status !== "FUNDED" && a.status === "FUNDED");
}

/**
 * @param {Object<string, any>} before
 * @param {Object<string, any>} after
 * @return {boolean}
 */
function isTaskCompletedTransition(before, after) {
  const b = before || {};
  const a = after || {};
  return b.status !== "COMPLETED" && a.status === "COMPLETED";
}

/**
 * @param {Object<string, any>} before
 * @param {Object<string, any>} after
 * @return {boolean}
 */
function isPaymentReleasedTransition(before, after) {
  const b = before || {};
  const a = after || {};
  return b.paymentState !== "released" && a.paymentState === "released";
}

/**
 * @param {Object<string, any>} before
 * @param {Object<string, any>} after
 * @return {boolean}
 */
function isRefundCompletedTransition(before, after) {
  const b = before || {};
  const a = after || {};
  return (b.status !== "REFUNDED" && a.status === "REFUNDED") ||
    (b.paymentState !== "refunded" && a.paymentState === "refunded");
}

module.exports = {
  isQuoteSubmissionTransition,
  isEscrowFundedTransition,
  isTaskCompletedTransition,
  isPaymentReleasedTransition,
  isRefundCompletedTransition,
};
