'use strict';

/**
 * Bounded Admin Job Attention derivation for the Controlled Open-Demand Pilot.
 * Quote-liquidity triggers (internal ops, not customer SLAs):
 *   0 quotes after 60 minutes → HIGH
 *   exactly 1 quote after 3 hours → MEDIUM
 * Authoritative queue must not be computed from the paginated Admin users table
 * or an unbounded client-side job list.
 *
 * Pilot-scale: one bounded job scan + batched quote counts + one Expert supply
 * load reused for every job. No per-job N+1 Expert scans.
 */

const { admin } = require('../firebaseAdmin');
const { safeToMillis } = require('../utils/firestore');
const { getShortJobRef } = require('../../../shared/taskReference');
const { getCanonicalPilotServiceAreas } = require('../utils/pilotOperationalFields');
const {
  enabledPhase1Categories,
  listAllPilotExperts,
  launchReadinessFromExpertDoc,
} = require('./pilotSupplyService');
const {
  DESIRED_INVITE_COUNT,
  ZERO_QUOTES_MS,
  ONE_QUOTE_MS,
  LOW_INVITE_GRACE_MS,
  COMPLETION_STALL_MS,
  REASONS,
  PRIORITY,
  PRIORITY_RANK,
  REASON_META,
  normalizeStatus,
  isVisibleQuoteStatus,
  inviteCountFromJob,
  jobCategory,
  jobArea,
  countSuitableLaunchReady,
  deriveJobAttention,
} = require('./jobAttentionDerive');

const JOB_ATTENTION_PAGE_SIZE = 100;
const JOB_ATTENTION_JOB_CAP = 250;
const QUOTE_IN_BATCH = 10;

function buildCategoryKeyMap() {
  const map = new Map();
  for (const row of enabledPhase1Categories()) {
    map.set(row.category, row.keys);
  }
  return map;
}

function buildLaunchReadyIndex(experts) {
  const index = [];
  for (const expert of experts) {
    const readiness = launchReadinessFromExpertDoc(expert.data);
    if (!readiness.launchReady) continue;
    const approved = new Set(
      Array.isArray(expert.data?.expertiseApproved) ? expert.data.expertiseApproved : []
    );
    index.push({
      approved,
      serviceAreas: new Set(readiness.serviceAreas || []),
    });
  }
  return index;
}

async function listJobsBounded(db, {
  pageSize = JOB_ATTENTION_PAGE_SIZE,
  cap = JOB_ATTENTION_JOB_CAP,
} = {}) {
  const jobs = [];
  let lastDoc = null;
  let truncated = false;

  while (jobs.length < cap) {
    let query = db.collection('jobs')
      .orderBy(admin.firestore.FieldPath.documentId())
      .limit(pageSize);
    if (lastDoc) {
      query = query.startAfter(lastDoc);
    }
    const snap = await query.get();
    if (!snap || snap.empty || !Array.isArray(snap.docs) || snap.docs.length === 0) break;

    for (let i = 0; i < snap.docs.length; i += 1) {
      const doc = snap.docs[i];
      jobs.push({ id: doc.id, data: doc.data() || {} });
      if (jobs.length >= cap) {
        const moreInThisPage = i + 1 < snap.docs.length;
        truncated = moreInThisPage || snap.docs.length >= pageSize;
        break;
      }
    }
    lastDoc = snap.docs[snap.docs.length - 1];
    if (jobs.length >= cap || snap.docs.length < pageSize) break;
  }

  return { jobs, truncated, scanned: jobs.length, cap };
}

async function loadQuoteCountsByJobId(db, jobIds) {
  const counts = Object.fromEntries(jobIds.map((id) => [id, 0]));
  for (let i = 0; i < jobIds.length; i += QUOTE_IN_BATCH) {
    const batch = jobIds.slice(i, i + QUOTE_IN_BATCH);
    const snap = await db.collection('quotes').where('jobId', 'in', batch).get();
    if (!snap || snap.empty) continue;
    for (const doc of snap.docs) {
      const data = doc.data() || {};
      if (!isVisibleQuoteStatus(data.status)) continue;
      const jobId = String(data.jobId || '');
      if (!Object.prototype.hasOwnProperty.call(counts, jobId)) continue;
      counts[jobId] += 1;
    }
  }
  return counts;
}

function emptySummary() {
  return {
    total: 0,
    critical: 0,
    high: 0,
    medium: 0,
    low: 0,
    zeroQuotes60m: 0,
    oneQuote3h: 0,
    noExpertsInvited: 0,
    paymentIssues: 0,
  };
}

function incrementSummary(summary, item) {
  summary.total += 1;
  const bucket = String(item.priority || '').toLowerCase();
  if (Object.prototype.hasOwnProperty.call(summary, bucket)) summary[bucket] += 1;
  if (item.reasonKey === REASONS.ZERO_QUOTES_60M) summary.zeroQuotes60m += 1;
  if (item.reasonKey === REASONS.ONLY_ONE_QUOTE_3H) summary.oneQuote3h += 1;
  if (item.reasonKey === REASONS.NO_EXPERTS_INVITED) summary.noExpertsInvited += 1;
  if (item.reasonKey === REASONS.PAYMENT_ISSUE) summary.paymentIssues += 1;
}

async function buildJobAttentionSnapshot(db, options = {}) {
  const nowMs = Number(options.nowMs) || Date.now();
  const listed = await listJobsBounded(db, options);
  const jobIds = listed.jobs.map((row) => row.id);
  const quoteCounts = jobIds.length ? await loadQuoteCountsByJobId(db, jobIds) : {};

  const listedExperts = await listAllPilotExperts(db);
  const expertScanTruncated = listedExperts.truncated === true;
  const launchReadyIndex = buildLaunchReadyIndex(listedExperts.experts);
  const categoryKeyMap = buildCategoryKeyMap();
  const pilotAreaSet = new Set(getCanonicalPilotServiceAreas());

  const items = [];
  const summary = emptySummary();

  for (const row of listed.jobs) {
    const job = { id: row.id, ...row.data };
    const suitable = countSuitableLaunchReady(job, launchReadyIndex, categoryKeyMap, pilotAreaSet);
    const supplyReliable = suitable.reliable && !expertScanTruncated;
    const derived = deriveJobAttention({
      status: job.status,
      paymentState: job.paymentState,
      createdAtMs: safeToMillis(job.createdAt),
      quoteReadyAtMs: safeToMillis(job.quoteReadyAt),
      completedAtMs: safeToMillis(job.completedAt) || Number(job.completedAtMs) || 0,
      postingReady: job.postingReady !== false,
      postingPhotoRequired: job.postingPhotoRequired === true,
      inviteCount: inviteCountFromJob(job),
      quoteCount: quoteCounts[row.id] || 0,
      suitableLaunchReadyCount: suitable.count,
      suitableSupplyReliable: supplyReliable,
    }, nowMs);
    if (!derived) continue;

    const item = {
      jobId: row.id,
      reference: getShortJobRef(job),
      category: jobCategory(job) || '—',
      area: jobArea(job) || '—',
      createdAtMs: safeToMillis(job.createdAt) || null,
      inviteCount: inviteCountFromJob(job),
      quoteCount: quoteCounts[row.id] || 0,
      suitableLaunchReadyCount: supplyReliable ? suitable.count : null,
      suitableSupplyReliable: supplyReliable,
      jobStatus: normalizeStatus(job.status),
      paymentState: job.paymentState ? String(job.paymentState) : null,
      ...derived,
    };
    incrementSummary(summary, item);
    items.push(item);
  }

  items.sort((a, b) => {
    const rank = PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority];
    if (rank !== 0) return rank;
    return (b.createdAtMs || 0) - (a.createdAtMs || 0);
  });

  return {
    source: 'GET /api/admin/job-attention — bounded job scan + one Expert supply load + batched quote counts',
    thresholds: {
      zeroQuotesMinutes: 60,
      oneQuoteHours: 3,
      desiredInviteCount: DESIRED_INVITE_COUNT,
      lowInviteGraceMinutes: 60,
      quoteClock: 'quoteReadyAt',
      fundedStall: 'deferred — no reliable agreed/scheduled work timestamp',
      completionStallHours: 48,
      note: 'Pilot operational triggers, not customer SLAs. Quote-liquidity uses quoteReadyAt (legacy createdAt only when the job was never photo-gated). FUNDED_JOB_STALLED is not emitted. 6h / 24h quoting rules are superseded.',
    },
    totals: {
      scanned: listed.scanned,
      cap: listed.cap,
      truncated: listed.truncated === true || expertScanTruncated,
      scanComplete: listed.truncated !== true && !expertScanTruncated,
      expertScanTruncated,
    },
    summary,
    jobs: items,
  };
}

module.exports = {
  JOB_ATTENTION_PAGE_SIZE,
  JOB_ATTENTION_JOB_CAP,
  DESIRED_INVITE_COUNT,
  ZERO_QUOTES_MS,
  ONE_QUOTE_MS,
  LOW_INVITE_GRACE_MS,
  COMPLETION_STALL_MS,
  REASONS,
  PRIORITY,
  REASON_META,
  isVisibleQuoteStatus,
  deriveJobAttention,
  countSuitableLaunchReady,
  buildLaunchReadyIndex,
  listJobsBounded,
  loadQuoteCountsByJobId,
  buildJobAttentionSnapshot,
};
