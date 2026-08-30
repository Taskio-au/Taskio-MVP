"use strict";

/**
 * Small Taskio transactional templates. HTML + plain text. No tracking pixels.
 */

/**
 * @param {any} value
 * @return {string}
 */
function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * Deterministic TSK-xxxx from job id (same algorithm as shared/taskReference).
 * @param {string} jobId
 * @return {string}
 */
function getTaskReferenceCode(jobId) {
  if (!jobId || typeof jobId !== "string") return "TSK-0000";
  let h = 0;
  for (let i = 0; i < jobId.length; i += 1) {
    h = (Math.imul(31, h) + jobId.charCodeAt(i)) | 0;
  }
  const n = (Math.abs(h) % 9000) + 1000;
  return `TSK-${n}`;
}

/**
 * @param {Object|string} jobOrId
 * @return {string}
 */
function getShortJobRef(jobOrId) {
  const job = jobOrId && typeof jobOrId === "object" ? jobOrId : null;
  const id = job && job.id ?
    String(job.id) :
    (typeof jobOrId === "string" ? jobOrId : "");
  if (!id) return "TSK-0000";
  const rawNum = job ? (job.taskNumber != null ?
    job.taskNumber : job.referenceNumber) : null;
  if (rawNum != null && String(rawNum).trim() !== "") {
    const n = Number(rawNum);
    if (Number.isFinite(n) && n >= 0) {
      const int = Math.min(Math.floor(Math.abs(n)), 999999);
      return `TSK-${String(int).padStart(4, "0")}`;
    }
  }
  return getTaskReferenceCode(id);
}

/**
 * @param {any} amount
 * @return {string}
 */
function formatAudAmount(amount) {
  const n = Number(amount);
  if (!Number.isFinite(n)) return "";
  return `AUD ${n.toFixed(2)}`;
}

/**
 * @param {string} title
 * @return {string}
 */
function safeTaskTitle(title) {
  const cleaned = String(title || "").trim().replace(/\s+/g, " ");
  if (!cleaned) return "your task";
  return cleaned.length > 120 ? `${cleaned.slice(0, 119).trim()}…` : cleaned;
}

/**
 * @param {Object<string, any>} args
 * @return {{html: string, text: string}}
 */
function wrapEmail({heading, paragraphs, ctaLabel, ctaUrl}) {
  const safeHeading = escapeHtml(heading);
  const bodyHtml = (paragraphs || []).map((p) => {
    return `<p style="margin:0 0 14px;line-height:1.55;color:#4B5563;">` +
      `${escapeHtml(p)}</p>`;
  }).join("");
  const bodyText = (paragraphs || []).join("\n\n");
  const label = escapeHtml(ctaLabel || "Open Taskio");
  const ctaHtml = ctaUrl ?
    `<p style="margin:24px 0 0;">` +
    `<a href="${escapeHtml(ctaUrl)}" style="display:inline-block;` +
    `background:#14C5C5;color:#111827;font-weight:700;text-decoration:none;` +
    `padding:12px 18px;border-radius:10px;">${label}</a></p>` :
    "";
  const ctaText = ctaUrl ?
    `\n\n${ctaLabel || "Open Taskio"}: ${ctaUrl}` : "";

  const html =
    `<div style="font-family:Arial,sans-serif;max-width:560px;` +
    `color:#111827;">` +
    `<p style="margin:0 0 8px;font-size:13px;letter-spacing:0.04em;` +
    `font-weight:700;color:#0EA5A5;">TASKIO</p>` +
    `<h1 style="margin:0 0 16px;font-size:22px;">${safeHeading}</h1>` +
    `${bodyHtml}${ctaHtml}` +
    `<p style="margin:28px 0 0;font-size:12px;color:#6B7280;">` +
    `This is a transactional message from Taskio.</p></div>`;

  const text = `Taskio\n\n${heading}\n\n${bodyText}${ctaText}\n`;
  return {html, text};
}

/**
 * @param {Object<string, any>} args
 * @return {{subject: string, html: string, text: string}}
 */
function buildQuoteReceivedEmail({jobRef, jobTitle, quoteAmount, openUrl}) {
  const amount = formatAudAmount(quoteAmount);
  const title = safeTaskTitle(jobTitle);
  const heading = "New quote received";
  const paragraphs = [
    `An Expert submitted a quote for ${jobRef} (${title}).`,
    amount ? `Quoted amount: ${amount}.` : "Open Taskio to review the quote.",
    "Open Taskio to compare quotes and continue when you are ready.",
  ];
  const wrapped = wrapEmail({
    heading,
    paragraphs,
    ctaLabel: "Review quote",
    ctaUrl: openUrl,
  });
  return {
    subject: `New quote for ${jobRef}`,
    html: wrapped.html,
    text: wrapped.text,
  };
}

/**
 * @param {Object<string, any>} args
 * @return {{subject: string, html: string, text: string}}
 */
function buildPaymentSecuredHomeownerEmail({jobRef, jobTitle, openUrl}) {
  const title = safeTaskTitle(jobTitle);
  const heading = "Payment secured";
  const paragraphs = [
    `Your payment for ${jobRef} (${title}) has been secured.`,
    "Funds are held until you approve the completed work. " +
      "The Expert has not been paid yet.",
  ];
  const wrapped = wrapEmail({
    heading,
    paragraphs,
    ctaLabel: "View task",
    ctaUrl: openUrl,
  });
  return {
    subject: `Payment secured for ${jobRef}`,
    html: wrapped.html,
    text: wrapped.text,
  };
}

/**
 * @param {Object<string, any>} args
 * @return {{subject: string, html: string, text: string}}
 */
function buildPaymentSecuredExpertEmail({jobRef, jobTitle, openUrl}) {
  const title = safeTaskTitle(jobTitle);
  const heading = "Payment secured";
  const paragraphs = [
    `Payment has been secured for ${jobRef} (${title}).`,
    "You can message the Client and start work when ready. " +
      "Funds are held until the Client approves completion. " +
      "You have not been paid yet.",
  ];
  const wrapped = wrapEmail({
    heading,
    paragraphs,
    ctaLabel: "Open task",
    ctaUrl: openUrl,
  });
  return {
    subject: `Payment secured for ${jobRef}`,
    html: wrapped.html,
    text: wrapped.text,
  };
}

/**
 * @param {Object<string, any>} args
 * @return {{subject: string, html: string, text: string}}
 */
function buildTaskCompleteHomeownerEmail({jobRef, jobTitle, openUrl}) {
  const title = safeTaskTitle(jobTitle);
  const heading = "Task completed";
  const paragraphs = [
    `The Expert marked ${jobRef} (${title}) as complete.`,
    "Review the work in Taskio when you are ready. " +
      "Payment has not been released.",
  ];
  const wrapped = wrapEmail({
    heading,
    paragraphs,
    ctaLabel: "Review work",
    ctaUrl: openUrl,
  });
  return {
    subject: `Task completed — review ${jobRef}`,
    html: wrapped.html,
    text: wrapped.text,
  };
}

/**
 * @param {Object<string, any>} args
 * @return {{subject: string, html: string, text: string}}
 */
function buildPaymentReleasedHomeownerEmail({jobRef, jobTitle, openUrl}) {
  const title = safeTaskTitle(jobTitle);
  const heading = "Payment released";
  const paragraphs = [
    `You approved the work for ${jobRef} (${title}).`,
    "Payment has been released to the Expert’s Stripe account.",
  ];
  const wrapped = wrapEmail({
    heading,
    paragraphs,
    ctaLabel: "View task",
    ctaUrl: openUrl,
  });
  return {
    subject: `Payment released for ${jobRef}`,
    html: wrapped.html,
    text: wrapped.text,
  };
}

/**
 * @param {Object<string, any>} args
 * @return {{subject: string, html: string, text: string}}
 */
function buildPaymentReleasedExpertEmail({jobRef, jobTitle, openUrl}) {
  const title = safeTaskTitle(jobTitle);
  const heading = "Payment released";
  const paragraphs = [
    `Payment for ${jobRef} (${title}) has been released to ` +
      "your Stripe account.",
    "Bank payout timing is managed by Stripe.",
  ];
  const wrapped = wrapEmail({
    heading,
    paragraphs,
    ctaLabel: "View payments",
    ctaUrl: openUrl,
  });
  return {
    subject: `Payment released for ${jobRef}`,
    html: wrapped.html,
    text: wrapped.text,
  };
}

/**
 * @param {Object<string, any>} args
 * @return {{subject: string, html: string, text: string}}
 */
function buildRefundHomeownerEmail({jobRef, jobTitle, refundAmount, openUrl}) {
  const title = safeTaskTitle(jobTitle);
  const amount = formatAudAmount(refundAmount);
  const heading = "Refund completed";
  const paragraphs = [
    `The Taskio payment for ${jobRef} (${title}) has been refunded.`,
    amount ?
      `Refunded amount: ${amount}.` :
      "The funded amount for this task has been refunded.",
    "Card settlement timing is managed by your payment provider.",
  ];
  const wrapped = wrapEmail({
    heading,
    paragraphs,
    ctaLabel: "View task",
    ctaUrl: openUrl,
  });
  return {
    subject: `Refund completed for ${jobRef}`,
    html: wrapped.html,
    text: wrapped.text,
  };
}

/**
 * @param {Object<string, any>} args
 * @return {{subject: string, html: string, text: string}}
 */
function buildRefundExpertEmail({jobRef, jobTitle, openUrl}) {
  const title = safeTaskTitle(jobTitle);
  const heading = "Task cancelled";
  const paragraphs = [
    `${jobRef} (${title}) was cancelled and the Client payment was refunded.`,
    "No payment is due for this task.",
  ];
  const wrapped = wrapEmail({
    heading,
    paragraphs,
    ctaLabel: "View task",
    ctaUrl: openUrl,
  });
  return {
    subject: `Task cancelled — ${jobRef}`,
    html: wrapped.html,
    text: wrapped.text,
  };
}

module.exports = {
  escapeHtml,
  getTaskReferenceCode,
  getShortJobRef,
  formatAudAmount,
  safeTaskTitle,
  wrapEmail,
  buildQuoteReceivedEmail,
  buildPaymentSecuredHomeownerEmail,
  buildPaymentSecuredExpertEmail,
  buildTaskCompleteHomeownerEmail,
  buildPaymentReleasedHomeownerEmail,
  buildPaymentReleasedExpertEmail,
  buildRefundHomeownerEmail,
  buildRefundExpertEmail,
};
