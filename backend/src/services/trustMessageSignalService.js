'use strict';

/**
 * Server-side off-platform / urgency detection (mirrors frontend chatFlags intent).
 * Returns normalized signals with severity for risk scoring — does not block sends.
 */

const SEVERITY_NUM = { LOW: 1, MED: 2, HIGH: 3, CRITICAL: 4 };

const EMAIL_RE = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i;
const PHONE_RE = /\b(\+?\d{1,3}[\s-]?)?(\(?\d{2,4}\)?[\s-]?)?\d{3,4}[\s-]?\d{3,4}\b/;

const PATTERNS = [
  { signalType: 'off_platform_contact', category: 'OFF_PLATFORM_CONTACT_ATTEMPT', severity: 'MED', re: /\b(whatsapp|telegram|signal|wechat|line app|dm\s*me|message\s*me\s*directly|call\s*me|text\s*me|ring\s*me)\b/i },
  { signalType: 'off_platform_contact', category: 'OFF_PLATFORM_CONTACT_ATTEMPT', severity: 'MED', re: /\b(email\s*me|contact\s*me\s*outside|outside\s*the\s*app)\b/i },
  { signalType: 'off_platform_payment', category: 'OFF_PLATFORM_PAYMENT_ATTEMPT', severity: 'HIGH', re: /\b(cash\s*only|pay\s*cash|bank\s*transfer|direct\s*deposit|bsb|payid|pay\s*me\s*directly|outside\s*the\s*app|avoid\s*the\s*fee)\b/i },
  { signalType: 'off_platform_payment', category: 'OFF_PLATFORM_PAYMENT_ATTEMPT', severity: 'HIGH', re: /\b(account\s*number|sort\s*code|iban|paypal\.me|venmo)\b/i },
  { signalType: 'urgency_pressure', category: 'HIGH_RISK_KEYWORDS_IN_CHAT', severity: 'MED', re: /\b(don'?t\s*use\s*the\s*app|bypass\s*taskio|skip\s*the\s*platform)\b/i },
];

function redactMatch(raw) {
  const s = String(raw || '').slice(0, 120);
  return s.replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '[email]');
}

/**
 * @param {string} text
 * @returns {{ signalType: string, category: string, severity: string, matchedPhrase: string, score: number }[]}
 */
function analyzeMessageText(text) {
  const t = String(text || '');
  const out = [];

  for (const p of PATTERNS) {
    const m = t.match(p.re);
    if (m) {
      out.push({
        signalType: p.signalType,
        category: p.category,
        severity: p.severity,
        matchedPhrase: redactMatch(m[0]),
        score: SEVERITY_NUM[p.severity] || 2,
      });
    }
  }

  const email = t.match(EMAIL_RE);
  if (email) {
    out.push({
      signalType: 'email_in_message',
      category: 'OFF_PLATFORM_CONTACT_ATTEMPT',
      severity: 'HIGH',
      matchedPhrase: '[email]',
      score: SEVERITY_NUM.HIGH,
    });
  }

  const phone = t.match(PHONE_RE);
  if (phone) {
    const digits = String(phone[0] || '').replace(/\D/g, '');
    if (digits.length >= 8) {
      out.push({
        signalType: 'phone_in_message',
        category: 'OFF_PLATFORM_CONTACT_ATTEMPT',
        severity: 'HIGH',
        matchedPhrase: '[phone]',
        score: SEVERITY_NUM.HIGH,
      });
    }
  }

  const seen = new Set();
  const deduped = [];
  for (const x of out) {
    const k = `${x.category}:${x.signalType}:${x.matchedPhrase}`;
    if (seen.has(k)) continue;
    seen.add(k);
    deduped.push(x);
  }

  return deduped;
}

/**
 * Aggregate score from signals (for threshold checks).
 */
function aggregateSignalScore(signals) {
  let s = 0;
  for (const x of Array.isArray(signals) ? signals : []) s += Number(x.score) || 0;
  return s;
}

module.exports = {
  analyzeMessageText,
  aggregateSignalScore,
  SEVERITY_NUM,
};
