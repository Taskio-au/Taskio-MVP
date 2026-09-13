'use strict';

/**
 * Bounded Admin marketplace metrics. Reuses Slice 3 job pagination and
 * Expert supply loading. Quote docs are batched (in of 10). Authoritative
 * statistics must not be derived from the paginated Admin UI tables.
 */

const { safeToMillis } = require('../utils/firestore');
const { buildDisplayName } = require('../utils/pii');
const { listAllPilotExperts, launchReadinessFromExpertDoc } = require('./pilotSupplyService');
const { listJobsBounded, JOB_ATTENTION_JOB_CAP, JOB_ATTENTION_PAGE_SIZE } = require('./jobAttentionService');
const { DEFAULT_RANGE, deriveMarketplaceMetrics } = require('./marketplaceMetricsDerive');

const QUOTE_IN_BATCH = 10;

function inviteTimestampsFromJob(data) {
  const out = {};
  const invites = data?.invites;
  if (!invites || typeof invites !== 'object') return out;
  for (const [uid, entry] of Object.entries(invites)) {
    const key = String(uid || '').trim();
    if (!key) continue;
    const ms = safeToMillis(entry && typeof entry === 'object' ? entry.invitedAt : null);
    if (ms) out[key] = ms;
  }
  return out;
}

async function loadQuotesByJobId(db, jobIds) {
  const byJob = Object.fromEntries(jobIds.map((id) => [id, []]));
  for (let i = 0; i < jobIds.length; i += QUOTE_IN_BATCH) {
    const batch = jobIds.slice(i, i + QUOTE_IN_BATCH);
    const snap = await db.collection('quotes').where('jobId', 'in', batch).get();
    if (!snap || snap.empty) continue;
    for (const doc of snap.docs) {
      const data = doc.data() || {};
      const jobId = String(data.jobId || '');
      if (!Object.prototype.hasOwnProperty.call(byJob, jobId)) continue;
      byJob[jobId].push({
        tradieUid: data.tradieUid ? String(data.tradieUid) : '',
        status: data.status,
        createdAtMs: safeToMillis(data.createdAt),
      });
    }
  }
  return byJob;
}

function mapJob(row, quotes) {
  const data = row.data || {};
  return {
    id: row.id,
    status: data.status,
    paymentState: data.paymentState,
    postingReady: data.postingReady !== false,
    postingPhotoRequired: data.postingPhotoRequired === true,
    createdAtMs: safeToMillis(data.createdAt),
    quoteReadyAtMs: safeToMillis(data.quoteReadyAt),
    fundedAtMs: safeToMillis(data.fundedAt),
    completedAtMs: safeToMillis(data.completedAt) || Number(data.completedAtMs) || 0,
    releasedAtMs: safeToMillis(data.releasedAt) || safeToMillis(data.paymentReleasedAt),
    acceptedQuoteId: data.acceptedQuoteId ? String(data.acceptedQuoteId) : '',
    acceptedTradieUid: data.acceptedTradieUid ? String(data.acceptedTradieUid) : '',
    invitedTradieUids: Array.isArray(data.invitedTradieUids) ? data.invitedTradieUids : [],
    inviteTimestamps: inviteTimestampsFromJob(data),
    quotes: quotes || [],
  };
}

function mapExpert(row) {
  const data = row.data || {};
  const readiness = launchReadinessFromExpertDoc(data);
  return {
    uid: row.uid,
    displayName: buildDisplayName(data),
    launchReady: readiness.launchReady === true,
    lastQuoteSubmittedAtMs: safeToMillis(data.lastQuoteSubmittedAt),
  };
}

async function buildMarketplaceMetricsSnapshot(db, options = {}) {
  const nowMs = Number(options.nowMs) || Date.now();
  const range = options.range || DEFAULT_RANGE;
  const listed = await listJobsBounded(db, {
    pageSize: options.pageSize || JOB_ATTENTION_PAGE_SIZE,
    cap: options.cap || JOB_ATTENTION_JOB_CAP,
  });
  const jobIds = listed.jobs.map((row) => row.id);
  const quotesByJobId = jobIds.length ? await loadQuotesByJobId(db, jobIds) : {};
  const listedExperts = await listAllPilotExperts(db);
  const jobs = listed.jobs.map((row) => mapJob(row, quotesByJobId[row.id] || []));
  const experts = listedExperts.experts.map(mapExpert);

  const derived = deriveMarketplaceMetrics({
    jobs,
    experts,
    range,
    nowMs,
    truncated: listed.truncated === true,
    expertScanTruncated: listedExperts.truncated === true,
    scanned: listed.scanned,
    cap: listed.cap,
  });

  return {
    source: 'GET /api/admin/marketplace-metrics — quote-ready job cohort + batched quotes + one Expert load',
    definitions: {
      quoteClock: 'quoteReadyAt; createdAt fallback only when the job was never photo-gated',
      visibleQuotes: 'submitted | accepted',
      firstResponse: 'quote-ready clock → earliest submitted/accepted/superseded quote',
      cohort: 'jobs that became quote-ready in the selected range, then followed through later stages',
      released: 'Taskio PAID / paymentState=released / releasedAt — not Stripe bank payout',
      invitationTime: 'job.invites.{uid}.invitedAt when present; omitted when missing',
    },
    ...derived,
  };
}

module.exports = {
  QUOTE_IN_BATCH,
  inviteTimestampsFromJob,
  loadQuotesByJobId,
  mapJob,
  buildMarketplaceMetricsSnapshot,
};
