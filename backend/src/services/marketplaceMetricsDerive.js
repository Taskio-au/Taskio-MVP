'use strict';

/**
 * Pure marketplace-health derivation for the Controlled Open-Demand Pilot.
 * No Firestore I/O. Quote clock matches Slice 3 (resolveQuoteClockMs).
 *
 * Cohort: jobs that became quote-ready in the selected range, then followed
 * through later stages. Do not mix "completed this week" into this funnel.
 */

const { JOB_STATUSES, resolveJobStatus } = require('../../../shared/jobStatusesCore');
const { isVisibleQuoteStatus, resolveQuoteClockMs } = require('./jobAttentionDerive');

const RANGES = Object.freeze({
  '7d': { key: '7d', label: '7 days', windowMs: 7 * 24 * 60 * 60 * 1000 },
  '30d': { key: '30d', label: '30 days', windowMs: 30 * 24 * 60 * 60 * 1000 },
  pilot: { key: 'pilot', label: 'Pilot to date', windowMs: null },
});

const DEFAULT_RANGE = '7d';
const FIRST_RESPONSE_TARGET_MS = 60 * 60 * 1000;
const TONE_MIN_SAMPLE = 8;
const TIMING_QUOTE_STATUSES = new Set(['submitted', 'accepted', 'superseded']);

const FUNNEL_STAGES = Object.freeze([
  { key: 'quoteReady', label: 'Quote-ready' },
  { key: 'oneQuote', label: '≥1 quote' },
  { key: 'twoQuotes', label: '≥2 quotes' },
  { key: 'accepted', label: 'Accepted' },
  { key: 'funded', label: 'Funded' },
  { key: 'completed', label: 'Completed' },
  { key: 'released', label: 'Released' },
]);

function normalizeRange(range) {
  const key = String(range || '').trim().toLowerCase();
  if (key === '7d' || key === '7') return RANGES['7d'];
  if (key === '30d' || key === '30') return RANGES['30d'];
  if (key === 'pilot' || key === 'all' || key === 'ptd') return RANGES.pilot;
  return RANGES[DEFAULT_RANGE];
}

function rangeBounds(rangeKey, nowMs) {
  const range = normalizeRange(rangeKey);
  return {
    range: range.key,
    rangeLabel: range.label,
    startMs: range.windowMs == null ? 0 : nowMs - range.windowMs,
    endMs: nowMs,
  };
}

function normalizeStatus(status) {
  return resolveJobStatus(status).status;
}

function rateParts(numerator, denominator) {
  const n = Number(numerator) || 0;
  const d = Number(denominator) || 0;
  return {
    numerator: n,
    denominator: d,
    rate: d > 0 ? n / d : null,
  };
}

function median(values) {
  if (!values.length) return null;
  const sorted = values.slice().sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2) return sorted[mid];
  return (sorted[mid - 1] + sorted[mid]) / 2;
}

function minutesFromMs(ms) {
  if (!Number.isFinite(ms) || ms < 0) return null;
  return Math.round(ms / 60000);
}

function quotesWithStatus(quotes, predicate) {
  return (quotes || []).filter((quote) => predicate(String(quote.status || '').trim().toLowerCase()));
}

function visibleQuotes(quotes) {
  return quotesWithStatus(quotes, isVisibleQuoteStatus);
}

function timingQuotes(quotes) {
  return quotesWithStatus(quotes, (status) => TIMING_QUOTE_STATUSES.has(status));
}

function earliestCreatedAtMs(quotes) {
  let min = 0;
  for (const quote of quotes || []) {
    const ms = Number(quote.createdAtMs) || 0;
    if (!ms) continue;
    if (!min || ms < min) min = ms;
  }
  return min;
}

function quotesForExpert(quotes, uid) {
  return (quotes || []).filter((quote) => String(quote.tradieUid || '') === uid);
}

function invitedUids(job) {
  if (!Array.isArray(job?.invitedTradieUids)) return [];
  const seen = new Set();
  const out = [];
  for (const raw of job.invitedTradieUids) {
    const uid = String(raw || '').trim();
    if (!uid || seen.has(uid)) continue;
    seen.add(uid);
    out.push(uid);
  }
  return out;
}

function invitedAtMs(job, uid) {
  return Number(job?.inviteTimestamps?.[uid]) || 0;
}

function isQuoteReadyEligible(job) {
  if (job?.postingReady === false) return false;
  return resolveQuoteClockMs(job) > 0;
}

function isAccepted(job) {
  if (job?.acceptedQuoteId || job?.acceptedTradieUid) return true;
  if (visibleQuotes(job?.quotes).some((quote) => String(quote.status).toLowerCase() === 'accepted')) {
    return true;
  }
  const status = normalizeStatus(job?.status);
  return (
    status === JOB_STATUSES.ASSIGNED
    || status === JOB_STATUSES.AWAITING_FUNDING
    || status === JOB_STATUSES.FUNDED
    || status === JOB_STATUSES.IN_PROGRESS
    || status === JOB_STATUSES.COMPLETED
    || status === JOB_STATUSES.PAID
  );
}

function isFunded(job) {
  const status = normalizeStatus(job?.status);
  if (
    status === JOB_STATUSES.FUNDED
    || status === JOB_STATUSES.IN_PROGRESS
    || status === JOB_STATUSES.COMPLETED
    || status === JOB_STATUSES.PAID
  ) {
    return true;
  }
  const paymentState = String(job?.paymentState || '').toLowerCase();
  if (paymentState === 'in_escrow' || paymentState === 'released') return true;
  return (Number(job?.fundedAtMs) || 0) > 0;
}

function isCompleted(job) {
  const status = normalizeStatus(job?.status);
  if (status === JOB_STATUSES.COMPLETED || status === JOB_STATUSES.PAID) return true;
  return (Number(job?.completedAtMs) || 0) > 0;
}

function isReleased(job) {
  if (normalizeStatus(job?.status) === JOB_STATUSES.PAID) return true;
  if (String(job?.paymentState || '').toLowerCase() === 'released') return true;
  return (Number(job?.releasedAtMs) || 0) > 0;
}

function coverageTone(rate, denominator, { good, watch }) {
  if (denominator < TONE_MIN_SAMPLE || rate == null) return null;
  if (rate >= good) return 'ON TARGET';
  if (rate >= watch) return 'WATCH';
  return 'NEEDS ATTENTION';
}

function inverseCoverageTone(rate, denominator, { good, watch }) {
  if (denominator < TONE_MIN_SAMPLE || rate == null) return null;
  if (rate < good) return 'ON TARGET';
  if (rate <= watch) return 'WATCH';
  return 'NEEDS ATTENTION';
}

function buildFunnel(counts) {
  const stages = [];
  let previous = counts.quoteReady;
  for (const meta of FUNNEL_STAGES) {
    const count = counts[meta.key] || 0;
    stages.push({
      key: meta.key,
      label: meta.label,
      count,
      fromPrevious: rateParts(count, previous),
      fromQuoteReady: rateParts(count, counts.quoteReady),
    });
    previous = count;
  }
  return stages;
}

function emptyExpert(uid) {
  return {
    uid,
    invitations: 0,
    invitationsWithTimestamp: 0,
    quotedJobs: 0,
    responseDurationsMs: [],
    awarded: 0,
    completed: 0,
    cancellations: 0,
    lastActivityAtMs: 0,
  };
}

function touchActivity(row, ms) {
  const value = Number(ms) || 0;
  if (value > row.lastActivityAtMs) row.lastActivityAtMs = value;
}

function deriveMarketplaceMetrics({
  jobs = [],
  experts = [],
  range = DEFAULT_RANGE,
  nowMs = Date.now(),
  truncated = false,
  expertScanTruncated = false,
  scanned = 0,
  cap = 0,
} = {}) {
  const bounds = rangeBounds(range, nowMs);
  const expertByUid = new Map(experts.map((row) => [row.uid, row]));
  const cohort = [];

  for (const job of jobs) {
    if (!isQuoteReadyEligible(job)) continue;
    const quoteClockMs = resolveQuoteClockMs(job);
    if (quoteClockMs < bounds.startMs || quoteClockMs > bounds.endMs) continue;
    const visible = visibleQuotes(job.quotes);
    const timing = timingQuotes(job.quotes);
    cohort.push({
      ...job,
      quoteClockMs,
      visibleCount: visible.length,
      firstVisibleQuoteMs: earliestCreatedAtMs(visible),
      firstSubmittedQuoteMs: earliestCreatedAtMs(timing),
    });
  }

  const quoteReadyJobs = cohort.length;
  const oneQuoteJobs = cohort.filter((job) => job.visibleCount >= 1).length;
  const twoQuoteJobs = cohort.filter((job) => job.visibleCount >= 2).length;
  const zeroQuoteJobs = cohort.filter((job) => job.visibleCount === 0).length;

  const firstResponseMs = [];
  let within60Minutes = 0;
  for (const job of cohort) {
    const firstMs = job.firstSubmittedQuoteMs || job.firstVisibleQuoteMs;
    if (!firstMs || firstMs < job.quoteClockMs) continue;
    const delta = firstMs - job.quoteClockMs;
    firstResponseMs.push(delta);
    if (delta <= FIRST_RESPONSE_TARGET_MS) within60Minutes += 1;
  }

  const oneQuote = rateParts(oneQuoteJobs, quoteReadyJobs);
  const twoQuote = rateParts(twoQuoteJobs, quoteReadyJobs);
  const zeroQuote = rateParts(zeroQuoteJobs, quoteReadyJobs);
  const within60 = rateParts(within60Minutes, firstResponseMs.length);

  const acceptedJobs = cohort.filter((job) => isAccepted(job)).length;
  const fundedJobs = cohort.filter((job) => isFunded(job)).length;
  const completedJobs = cohort.filter((job) => isCompleted(job)).length;
  const releasedJobs = cohort.filter((job) => isReleased(job)).length;

  const expertRows = new Map();
  function expertRow(uid) {
    if (!expertRows.has(uid)) expertRows.set(uid, emptyExpert(uid));
    return expertRows.get(uid);
  }

  for (const job of cohort) {
    const invited = invitedUids(job);
    const quotedUids = new Set(
      visibleQuotes(job.quotes)
        .map((quote) => String(quote.tradieUid || '').trim())
        .filter(Boolean)
    );
    for (const uid of invited) {
      const row = expertRow(uid);
      row.invitations += 1;
      const invitedMs = invitedAtMs(job, uid);
      if (invitedMs) {
        row.invitationsWithTimestamp += 1;
        touchActivity(row, invitedMs);
      }
      if (quotedUids.has(uid)) {
        row.quotedJobs += 1;
        const firstMs = earliestCreatedAtMs(timingQuotes(quotesForExpert(job.quotes, uid)))
          || earliestCreatedAtMs(visibleQuotes(quotesForExpert(job.quotes, uid)));
        if (invitedMs && firstMs && firstMs >= invitedMs) {
          row.responseDurationsMs.push(firstMs - invitedMs);
        }
      }
    }
    for (const uid of quotedUids) {
      if (!invited.includes(uid)) {
        const row = expertRow(uid);
        row.quotedJobs += 1;
      }
    }
    const awardedUid = String(job.acceptedTradieUid || '').trim();
    if (awardedUid) {
      const row = expertRow(awardedUid);
      row.awarded += 1;
      if (isCompleted(job)) row.completed += 1;
      if (normalizeStatus(job.status) === JOB_STATUSES.CANCELLED) row.cancellations += 1;
      touchActivity(row, job.completedAtMs);
      touchActivity(row, job.fundedAtMs);
      touchActivity(row, job.releasedAtMs);
    }
    for (const quote of job.quotes || []) {
      const uid = String(quote.tradieUid || '').trim();
      if (!uid) continue;
      touchActivity(expertRow(uid), quote.createdAtMs);
    }
  }

  for (const expert of experts) {
    const row = expertRows.get(expert.uid);
    if (!row) continue;
    touchActivity(row, expert.lastQuoteSubmittedAtMs);
  }

  let invitations = 0;
  let invitationsWithTimestamp = 0;
  const expertsOut = [];
  for (const row of expertRows.values()) {
    invitations += row.invitations;
    invitationsWithTimestamp += row.invitationsWithTimestamp;
    const profile = expertByUid.get(row.uid) || {};
    const response = rateParts(row.quotedJobs, row.invitations);
    const responseTimeMinutes = minutesFromMs(median(row.responseDurationsMs));
    expertsOut.push({
      uid: row.uid,
      displayName: profile.displayName || '',
      launchReady: profile.launchReady === true,
      invitations: row.invitations,
      quotedJobs: row.quotedJobs,
      responseRate: response.rate,
      responseNumerator: response.numerator,
      responseDenominator: response.denominator,
      responseTimeMinutes,
      responseTimeAvailable: responseTimeMinutes != null,
      responseTimeBasis: responseTimeMinutes != null ? 'invitation' : null,
      responseTimeSampleCount: row.responseDurationsMs.length,
      invitationTimestampsKnown: row.invitationsWithTimestamp,
      awarded: row.awarded,
      completed: row.completed,
      cancellations: row.cancellations,
      lastActivityAtMs: row.lastActivityAtMs || null,
    });
  }

  expertsOut.sort((a, b) => {
    const ar = a.responseRate == null ? 2 : a.responseRate;
    const br = b.responseRate == null ? 2 : b.responseRate;
    if (ar !== br) return ar - br;
    if (b.invitations !== a.invitations) return b.invitations - a.invitations;
    return (b.lastActivityAtMs || 0) - (a.lastActivityAtMs || 0);
  });

  const scanTruncated = truncated === true || expertScanTruncated === true;

  return {
    range: bounds.range,
    rangeLabel: bounds.rangeLabel,
    rangeStartMs: bounds.startMs,
    rangeEndMs: bounds.endMs,
    cohort: 'jobs_quote_ready_in_range',
    scanComplete: !scanTruncated,
    truncated: scanTruncated,
    totals: {
      scanned,
      cap,
      truncated: scanTruncated,
      scanComplete: !scanTruncated,
      jobScanTruncated: truncated === true,
      expertScanTruncated: expertScanTruncated === true,
      quoteReadyJobs,
    },
    quoteHealth: {
      quoteReadyJobs,
      oneQuoteJobs,
      twoQuoteJobs,
      zeroQuoteJobs,
      oneQuoteRate: oneQuote.rate,
      twoQuoteRate: twoQuote.rate,
      zeroQuoteRate: zeroQuote.rate,
      oneQuote: oneQuote,
      twoQuote: twoQuote,
      zeroQuote: zeroQuote,
      medianFirstResponseMinutes: minutesFromMs(median(firstResponseMs)),
      within60MinutesJobs: within60Minutes,
      within60MinutesRate: within60.rate,
      within60Minutes: within60,
      timingSampleCount: firstResponseMs.length,
      oneQuoteTone: coverageTone(oneQuote.rate, quoteReadyJobs, { good: 0.9, watch: 0.7 }),
      zeroQuoteTone: inverseCoverageTone(zeroQuote.rate, quoteReadyJobs, { good: 0.1, watch: 0.2 }),
      within60Tone: coverageTone(within60.rate, firstResponseMs.length, { good: 0.7, watch: 0.5 }),
    },
    funnel: {
      cohort: 'jobs_quote_ready_in_range',
      note: 'Recent jobs may still be in progress.',
      quoteReady: quoteReadyJobs,
      oneQuote: oneQuoteJobs,
      twoQuotes: twoQuoteJobs,
      accepted: acceptedJobs,
      funded: fundedJobs,
      completed: completedJobs,
      released: releasedJobs,
      stages: buildFunnel({
        quoteReady: quoteReadyJobs,
        oneQuote: oneQuoteJobs,
        twoQuotes: twoQuoteJobs,
        accepted: acceptedJobs,
        funded: fundedJobs,
        completed: completedJobs,
        released: releasedJobs,
      }),
    },
    experts: expertsOut,
    gaps: {
      invitationTimestamp: {
        available: invitationsWithTimestamp > 0,
        invitations,
        invitationsWithTimestamp,
        note: invitationsWithTimestamp
          ? 'Expert invitation response time uses job.invites.{uid}.invitedAt when present (Admin invite path). Missing timestamps are omitted, not invented.'
          : 'No reliable per-Expert invitation timestamp in this scan. Admin invite writes invites.{uid}.invitedAt; older or incomplete invite maps omit invitation response time.',
      },
    },
  };
}

module.exports = {
  RANGES,
  DEFAULT_RANGE,
  FIRST_RESPONSE_TARGET_MS,
  TONE_MIN_SAMPLE,
  FUNNEL_STAGES,
  normalizeRange,
  rangeBounds,
  rateParts,
  median,
  isQuoteReadyEligible,
  isAccepted,
  isFunded,
  isCompleted,
  isReleased,
  deriveMarketplaceMetrics,
};
