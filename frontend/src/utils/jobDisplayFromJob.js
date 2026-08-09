/**
 * Canonical task wording for job documents — mirrors shared/paymentDisplayTaskTitle.js.
 * Use for headlines and “Job type” rows; never writes to Firestore.
 */

import { expertiseExpertLabelMap, phase1ExpertiseCatalog } from '../shared/expertiseCatalog';
import { getShortJobRef } from './taskReference';
import { getJobTaxonomyDisplay } from '../constants/taskTaxonomy';

/** Legacy keys → Phase 1 catalogue keys (same as shared/paymentDisplayTaskTitle.js). */
export const JOB_TYPE_ALIASES = {
  mounting_picture_frames: 'hanging_picture_frames',
  assembly_flat_pack: 'furniture_assembly_flat_pack',
};

export function normalizeJobTypeKey(key) {
  if (!key || typeof key !== 'string') return '';
  const k = key.trim();
  return JOB_TYPE_ALIASES[k] || k;
}

export function pickSuburb(job) {
  if (!job || typeof job !== 'object') return '';
  const direct = typeof job.locationSuburb === 'string' ? job.locationSuburb.trim() : '';
  if (direct) return direct;
  const loc = typeof job.location === 'string' ? job.location.trim() : '';
  if (!loc) return '';
  const head = loc.split(',')[0].trim();
  return head || '';
}

export function formatLocality(suburb) {
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

export function resolveExpertPhraseDetailed(job) {
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
  const { phrase, fromCatalog } = resolveExpertPhraseDetailed(job);
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
 * Full headline string for dashboards and detail pages (catalogue + suburb rules).
 */
export function fullTaskDisplayTitle(job) {
  if (!job || typeof job !== 'object') return 'Task';

  const resolved = resolveExpertPhraseDetailed(job);
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

/**
 * User-facing labels aligned with Payments catalogue wording.
 * @returns {{ categoryDisplayLabel: string, taskTypeDisplayLabel: string, fullTaskDisplayTitle: string }}
 */
export function getJobDisplayLayers(job) {
  const taxonomy = getJobTaxonomyDisplay(job || {});
  const resolved = resolveExpertPhraseDetailed(job || {});
  let taskTypeDisplayLabel = '';
  if (resolved.phrase) {
    const words = resolved.phrase.split(/\s+/).filter(Boolean);
    const phraseOk = resolved.fromCatalog || words.length > 1;
    taskTypeDisplayLabel = phraseOk ? resolved.phrase.trim() : taxonomy.jobTypeLabel || resolved.phrase.trim();
  } else {
    taskTypeDisplayLabel = taxonomy.jobTypeLabel || '';
  }

  return {
    categoryDisplayLabel: taxonomy.categoryLabel || '',
    taskTypeDisplayLabel,
    fullTaskDisplayTitle: fullTaskDisplayTitle(job || {}),
  };
}
