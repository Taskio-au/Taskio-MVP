'use strict';

/**
 * Requested vs Taskio-approved Expert categories.
 * `expertise` = self-selected/requested Phase 1 keys.
 * `expertiseApproved` = Taskio-approved subset used for marketplace eligibility.
 * Canonical validation is not Taskio approval.
 *
 * Fail-closed: effective expertise is approved ∩ requested, and only when both
 * fields are arrays. Missing, malformed, or empty either side => [].
 * Verification, profile reads, and self-selection never grant approval.
 */

const { phase1ExpertiseCatalog, phase1KeysSet } = require('../shared/expertiseCatalog');

function normalizePhase1Keys(input, max = 50) {
  if (!Array.isArray(input)) return [];
  const out = [];
  for (const item of input) {
    const key = String(item || '').trim();
    if (!key || !phase1KeysSet.has(key) || out.includes(key)) continue;
    out.push(key);
    if (out.length >= max) break;
  }
  return out;
}

function readApprovedExpertise(userDoc) {
  if (!Array.isArray(userDoc && userDoc.expertiseApproved)) return [];
  return normalizePhase1Keys(userDoc.expertiseApproved);
}

function readRequestedExpertise(userDoc) {
  if (!Array.isArray(userDoc && userDoc.expertise)) return [];
  return normalizePhase1Keys(userDoc.expertise);
}

function effectiveApprovedExpertise(userDoc) {
  const requested = readRequestedExpertise(userDoc);
  if (requested.length === 0) return [];
  const requestedSet = new Set(requested);
  return readApprovedExpertise(userDoc).filter((key) => requestedSet.has(key));
}

function hasApprovedMarketplaceExpertise(userDoc) {
  return effectiveApprovedExpertise(userDoc).length > 0;
}

function applySelfSelectedExpertise(userDoc, nextRequested) {
  const requested = normalizePhase1Keys(nextRequested);
  const requestedSet = new Set(requested);
  const approved = readApprovedExpertise(userDoc).filter((key) => requestedSet.has(key));
  return { requested, approved };
}

function approveRequestedExpertise(userDoc, keysToApprove) {
  const requested = readRequestedExpertise(userDoc);
  const requestedSet = new Set(requested);
  const source = keysToApprove == null ? requested : keysToApprove;
  const approved = normalizePhase1Keys(source).filter((key) => requestedSet.has(key));
  return { requested, approved };
}

function signupExpertiseFields(selectedKeys) {
  return {
    expertise: normalizePhase1Keys(selectedKeys),
    expertiseApproved: [],
  };
}

function keysNeedPrune(raw) {
  if (!Array.isArray(raw)) return false;
  const cleaned = raw.map((item) => String(item || '').trim()).filter(Boolean);
  return cleaned.join('\u0000') !== normalizePhase1Keys(raw).join('\u0000');
}

/**
 * Read-side / storage prune only. Never copies requested ↔ approved.
 * Never treats verified as approval. Missing fields stay missing.
 */
function planExpertiseFieldSync(userDoc) {
  const requestedPresent = Array.isArray(userDoc && userDoc.expertise);
  const approvedPresent = Array.isArray(userDoc && userDoc.expertiseApproved);
  const requested = requestedPresent ? normalizePhase1Keys(userDoc.expertise) : [];
  const approved = approvedPresent ? normalizePhase1Keys(userDoc.expertiseApproved) : [];
  let changed = false;
  if (requestedPresent && keysNeedPrune(userDoc.expertise)) changed = true;
  if (approvedPresent && keysNeedPrune(userDoc.expertiseApproved)) changed = true;
  return { requested, approved, changed };
}

/**
 * Explicit Admin-only migration planner. Does not run itself.
 * Creates expertiseApproved from a canonical requested array only when
 * verified === true and expertiseApproved is missing (not []).
 * Never parses non-array legacy strings into approval.
 */
function planAdminExpertiseMigration(userDoc) {
  const verified = userDoc && userDoc.verified === true;
  const requestedPresent = Array.isArray(userDoc && userDoc.expertise);
  const approvedPresent = Array.isArray(userDoc && userDoc.expertiseApproved);
  const requested = requestedPresent ? normalizePhase1Keys(userDoc.expertise) : [];
  const approved = approvedPresent ? normalizePhase1Keys(userDoc.expertiseApproved) : [];
  const logActions = [];
  let migrated = false;
  let prunedCount = 0;
  let nextApproved = approved.slice();

  const pruneNeeded = approvedPresent && keysNeedPrune(userDoc.expertiseApproved);
  if (!approvedPresent) {
    if (verified && requestedPresent && requested.length > 0) {
      nextApproved = requested.slice();
      migrated = true;
      logActions.push({ action: 'migrate', category: 'legacy_expertise' });
    }
  } else if (pruneNeeded) {
    const seen = new Set();
    for (const item of userDoc.expertiseApproved) {
      const key = String(item || '').trim();
      if (!key || seen.has(key)) continue;
      seen.add(key);
      if (!phase1KeysSet.has(key)) {
        prunedCount += 1;
        logActions.push({ action: 'phase1_prune', category: key });
      }
    }
  }

  return {
    approved: nextApproved,
    changed: migrated || pruneNeeded,
    migrated,
    prunedCount,
    logActions,
  };
}

function jobCategoryKeys(job) {
  const items = Array.isArray(job && job.items) ? job.items : [];
  const fromItems = [];
  for (const item of items) {
    const type = String(item && item.type ? item.type : '').trim();
    if (phase1KeysSet.has(type) && !fromItems.includes(type)) fromItems.push(type);
  }
  if (fromItems.length) return { reliable: true, keys: fromItems };

  const category = String((job && (job.primaryCategory || job.jobTypeCategory)) || '').trim();
  const fromCategory = phase1ExpertiseCatalog
    .filter((row) => row.category === category)
    .map((row) => row.key);
  if (fromCategory.length) return { reliable: true, keys: fromCategory };

  const jobType = String((job && job.jobType) || '').trim();
  if (phase1KeysSet.has(jobType)) return { reliable: true, keys: [jobType] };

  return { reliable: false, keys: [] };
}

function expertMatchesJobCategory(userDoc, job) {
  const jobKeys = jobCategoryKeys(job);
  if (!jobKeys.reliable) {
    return { reliable: false, matches: false, keys: [] };
  }
  const approved = new Set(effectiveApprovedExpertise(userDoc));
  return {
    reliable: true,
    matches: jobKeys.keys.some((key) => approved.has(key)),
    keys: jobKeys.keys,
  };
}

module.exports = {
  normalizePhase1Keys,
  readRequestedExpertise,
  readApprovedExpertise,
  effectiveApprovedExpertise,
  hasApprovedMarketplaceExpertise,
  applySelfSelectedExpertise,
  approveRequestedExpertise,
  signupExpertiseFields,
  planExpertiseFieldSync,
  planAdminExpertiseMigration,
  jobCategoryKeys,
  expertMatchesJobCategory,
};
