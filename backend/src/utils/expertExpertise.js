'use strict';

/**
 * Requested vs Taskio-approved Expert categories.
 * `expertise` = self-selected/requested Phase 1 keys.
 * `expertiseApproved` = Taskio-approved subset used for marketplace eligibility.
 * Canonical validation is not Taskio approval.
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
  return normalizePhase1Keys(userDoc && userDoc.expertiseApproved);
}

function readRequestedExpertise(userDoc) {
  if (Array.isArray(userDoc && userDoc.expertise)) {
    return normalizePhase1Keys(userDoc.expertise);
  }
  return readApprovedExpertise(userDoc);
}

function effectiveApprovedExpertise(userDoc) {
  const approved = readApprovedExpertise(userDoc);
  if (!Array.isArray(userDoc && userDoc.expertise)) return approved;
  const requested = new Set(normalizePhase1Keys(userDoc.expertise));
  return approved.filter((key) => requested.has(key));
}

function hasApprovedMarketplaceExpertise(userDoc) {
  const approvedPresent = Array.isArray(userDoc && userDoc.expertiseApproved);
  const requestedPresent = Array.isArray(userDoc && userDoc.expertise);
  if (!approvedPresent && !requestedPresent) return true;
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

function planExpertiseFieldSync(userDoc) {
  const requestedPresent = Array.isArray(userDoc && userDoc.expertise);
  const approvedPresent = Array.isArray(userDoc && userDoc.expertiseApproved);
  let requested = requestedPresent ? normalizePhase1Keys(userDoc.expertise) : null;
  let approved = approvedPresent ? normalizePhase1Keys(userDoc.expertiseApproved) : null;
  let changed = false;

  if (!requestedPresent && approvedPresent) {
    requested = approved.slice();
    changed = true;
  }
  if (!approvedPresent && requestedPresent) {
    approved = userDoc && userDoc.verified === true ? requested.slice() : [];
    changed = true;
  }
  if (requestedPresent && keysNeedPrune(userDoc.expertise)) changed = true;
  if (approvedPresent && keysNeedPrune(userDoc.expertiseApproved)) changed = true;

  if (requested == null) requested = [];
  if (approved == null) approved = [];

  return { requested, approved, changed };
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
  jobCategoryKeys,
  expertMatchesJobCategory,
};
