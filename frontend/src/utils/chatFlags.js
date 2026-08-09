// Lightweight keyword detection for off-platform comms / payment requests.
// IMPORTANT: flag only. Do NOT block messages or enforce automation.

const EMAIL_RE = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i;
// Simple phone-ish patterns (AU + generic). Intentionally broad; false positives are acceptable for flagging.
const PHONE_RE = /\b(\+?\d{1,3}[\s-]?)?(\(?\d{2,4}\)?[\s-]?)?\d{3,4}[\s-]?\d{3,4}\b/;

const KEYWORD_RULES = [
  { type: 'cash_request', severity: 'MED', re: /\b(cash|cash\s*only|pay\s*cash)\b/i },
  { type: 'off_platform_payment', severity: 'HIGH', re: /\b(bank\s*transfer|bsb|account\s*number|osko|payid|paypal|venmo)\b/i },
  { type: 'off_platform_contact', severity: 'MED', re: /\b(call\s*me|text\s*me|whatsapp|dm\s*me|email\s*me)\b/i },
];

const SEVERITY_SCORE = { LOW: 1, MED: 2, HIGH: 3 };

export function detectChatFlags(text) {
  const t = String(text || '');
  const flags = [];

  for (const r of KEYWORD_RULES) {
    const m = t.match(r.re);
    if (m) {
      flags.push({ type: r.type, severity: r.severity, match: String(m[0] || '').slice(0, 80) });
    }
  }

  const email = t.match(EMAIL_RE);
  if (email) flags.push({ type: 'email_address', severity: 'HIGH', match: String(email[0] || '').slice(0, 80) });

  const phone = t.match(PHONE_RE);
  if (phone) {
    const raw = String(phone[0] || '').trim();
    // Avoid flagging obvious small numbers like "200" etc.
    const digits = raw.replace(/\D/g, '');
    if (digits.length >= 8) flags.push({ type: 'phone_number', severity: 'HIGH', match: raw.slice(0, 80) });
  }

  // De-dupe by type (keep highest severity)
  const byType = {};
  for (const f of flags) {
    const prev = byType[f.type];
    if (!prev) byType[f.type] = f;
    else if ((SEVERITY_SCORE[f.severity] || 0) > (SEVERITY_SCORE[prev.severity] || 0)) byType[f.type] = f;
  }

  return Object.values(byType);
}

export function highestSeverity(flags) {
  let best = null;
  for (const f of Array.isArray(flags) ? flags : []) {
    if (!best) best = f.severity;
    else if ((SEVERITY_SCORE[f.severity] || 0) > (SEVERITY_SCORE[best] || 0)) best = f.severity;
  }
  return best || 'LOW';
}

export function severityScore(s) {
  return SEVERITY_SCORE[String(s || '').toUpperCase()] || 0;
}





