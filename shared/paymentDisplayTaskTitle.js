'use strict';

const { expertiseExpertLabelMap, phase1ExpertiseCatalog } = require('./expertiseCatalog');
const { getShortJobRef } = require('./taskReference');

/**
 * Expert payment task titles — wording comes only from shared/expertiseCatalog.js (Phase 1):
 * - expertiseExpertLabelMap[jobType] → expertLabel (same strings as Post a Task / expertiseExpertLabelMap).
 * - Secondary match: jobTypeLabel === catalog row.label → expertLabel.
 *
 * Optional legacy/alternate jobType keys map to canonical catalog keys (never invent wording).
 */

/** Alternate keys seen in older data / docs → canonical phase1 catalogue keys */
const JOB_TYPE_ALIASES = {
  mounting_picture_frames: 'hanging_picture_frames',
  assembly_flat_pack: 'furniture_assembly_flat_pack',
};

function normalizeJobTypeKey(key) {
  if (!key || typeof key !== 'string') return '';
  const k = key.trim();
  return JOB_TYPE_ALIASES[k] || k;
}

function pickSuburb(job) {
  if (!job || typeof job !== 'object') return '';
  const direct = typeof job.locationSuburb === 'string' ? job.locationSuburb.trim() : '';
  if (direct) return direct;
  const loc = typeof job.location === 'string' ? job.location.trim() : '';
  if (!loc) return '';
  const head = loc.split(',')[0].trim();
  return head || '';
}

/** Title-case words for suburb display (e.g. south yarra → South Yarra). */
function formatLocality(suburb) {
  const s = String(suburb || '').trim();
  if (!s) return '';
  return s
    .split(/\s+/)
    .map((w) => {
      if (!w) return '';
      if (/^[A-Za-z]+-[A-Za-z]+$/.test(w)) {
        return w
          .split('-')
          .map((p) => (p ? p.charAt(0).toUpperCase() + p.slice(1).toLowerCase() : ''))
          .join('-');
      }
      return w.charAt(0).toUpperCase() + w.slice(1).toLowerCase();
    })
    .join(' ');
}

function resolvePaymentTaskPhraseDetailed(job) {
  const rawKey = typeof job.jobType === 'string' ? job.jobType.trim() : '';
  const key = normalizeJobTypeKey(rawKey);
  if (key && expertiseExpertLabelMap[key]) {
    return { phrase: String(expertiseExpertLabelMap[key]).trim(), fromCatalog: true };
  }
  const jl = typeof job.jobTypeLabel === 'string' ? job.jobTypeLabel.trim() : '';
  if (jl) {
    const row =
      phase1ExpertiseCatalog.find((e) => e.label === jl) ||
      phase1ExpertiseCatalog.find((e) => e.expertLabel === jl);
    if (row) {
      return { phrase: String(row.expertLabel || row.label).trim(), fromCatalog: true };
    }
    return { phrase: jl, fromCatalog: false };
  }
  return { phrase: '', fromCatalog: false };
}

function buildCatalogFallbackTitle(job) {
  const { phrase, fromCatalog } = resolvePaymentTaskPhraseDetailed(job);
  const suburb = pickSuburb(job);
  if (!phrase) return '';
  if (!suburb) return phrase;

  const words = phrase.split(/\s+/).filter(Boolean);
  if (words.length === 1 && !fromCatalog) {
    return '';
  }

  return `${phrase} in ${formatLocality(suburb)}`;
}

function referenceFallbackTitle(job) {
  if (!job || typeof job !== 'object') return '';
  const id = job.id;
  if (!id || typeof id !== 'string' || !String(id).trim()) return '';
  return getShortJobRef(job);
}

/**
 * Default stored `job.title` for new posts (Post a Task + POST /api/jobs).
 * Uses the same expert-facing phrase as phase1ExpertiseCatalog.expertLabel + locality.
 * @param {{ expertLabel?: string, label?: string }} row Phase 1 catalog row
 * @param {{ suburb?: string }} location Normalized location payload (suburb required for " in …" suffix)
 */
function buildPostedJobTitleFromPhase1Row(row, location) {
  if (!row || typeof row !== 'object') return 'Task';
  const phrase = String(row.expertLabel || row.label || '').trim();
  if (!phrase) return 'Task';
  const suburbRaw = location && typeof location.suburb === 'string' ? location.suburb.trim() : '';
  if (!suburbRaw) return phrase;
  return `${phrase} in ${formatLocality(suburbRaw)}`;
}

/** Same resolution rules as paymentDisplayTaskTitle — catalogue-backed display everywhere. */
function canonicalTaskDisplayTitle(job) {
  return paymentDisplayTaskTitle(job);
}

function paymentDisplayTaskTitle(job) {
  if (!job || typeof job !== 'object') return 'Task';

  const resolved = resolvePaymentTaskPhraseDetailed(job);
  const barePhrase = resolved.phrase;
  const fallback = buildCatalogFallbackTitle(job);
  const raw = typeof job.title === 'string' ? job.title.trim() : '';

  const barePhraseWords = barePhrase.split(/\s+/).filter(Boolean);
  const barePhraseOk = barePhrase && (resolved.fromCatalog || barePhraseWords.length > 1);

  if (!raw || raw === 'Task') {
    if (fallback) return fallback;
    if (barePhraseOk) return barePhrase;
    const ref = referenceFallbackTitle(job);
    return ref || 'Task';
  }

  if (!fallback) {
    return raw;
  }

  const suburb = pickSuburb(job);
  if (!suburb) {
    return raw;
  }

  const suffix = ` in ${formatLocality(suburb)}`;
  const rl = raw.toLowerCase();
  const sl = suffix.toLowerCase();
  if (!rl.endsWith(sl)) {
    return raw;
  }

  const rawPrefix = raw.slice(0, raw.length - suffix.length).trim();
  const fbPrefix = fallback.slice(0, fallback.length - suffix.length).trim();

  if (!fbPrefix) {
    return raw;
  }

  if (raw.toLowerCase() === fallback.toLowerCase()) {
    return fallback;
  }

  const rp = rawPrefix.toLowerCase();
  const fp = fbPrefix.toLowerCase();

  if (fp === rp) {
    return fallback;
  }

  if (fp.length > rp.length && fp.includes(rp)) {
    return fallback;
  }

  const keyResolved = normalizeJobTypeKey(typeof job.jobType === 'string' ? job.jobType.trim() : '');
  const catRowByKey = keyResolved ? phase1ExpertiseCatalog.find((e) => e.key === keyResolved) : null;
  if (catRowByKey && rp === String(catRowByKey.label || '').trim().toLowerCase()) {
    return fallback;
  }

  return raw;
}

module.exports = {
  paymentDisplayTaskTitle,
  canonicalTaskDisplayTitle,
  buildPostedJobTitleFromPhase1Row,
  pickSuburb,
  buildCatalogFallbackTitle,
  resolvePaymentTaskPhraseDetailed,
  formatLocality,
  normalizeJobTypeKey,
  JOB_TYPE_ALIASES,
};
