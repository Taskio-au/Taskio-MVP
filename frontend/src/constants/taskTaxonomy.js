/**
 * Canonical Taskio job category + job-type taxonomy (display layer).
 * Stable job-type keys match shared/expertiseCatalog.js (synced to frontend/src/shared/expertiseCatalog.js).
 * Use helpers here for all user-facing labels; do not duplicate category arrays in feature code.
 */

import {
  phase1ExpertiseCatalog,
  phase1KeysSet,
} from '../shared/expertiseCatalog';

/**
 * Ordered top-level categories (client-facing labels) and mapping to catalog `category` strings.
 * `jobTypeKeys` defines display order within the Post a Task flow.
 */
export const TASK_TAXONOMY_CATEGORY_ORDER = [
  {
    id: 'mounting',
    label: 'Mounting',
    sourceCategory: 'Mounting',
    question: 'What are you mounting?',
    jobTypeKeys: ['mounting_tv', 'mounting_shelves', 'mounting_mirrors'],
  },
  {
    id: 'assembly',
    label: 'Assembly',
    sourceCategory: 'Furniture Assembly',
    question: 'What needs assembling?',
    jobTypeKeys: ['furniture_assembly_flat_pack', 'furniture_assembly_bed_desk_wardrobe'],
  },
  {
    id: 'repairs',
    label: 'Small Fixture Repairs',
    sourceCategory: 'Minor Repairs',
    question: 'What small fixture repair do you need?',
    jobTypeKeys: [
      'minor_repairs_door_hinge',
      'minor_repairs_cabinet_alignment',
      'minor_repairs_handle_replacement',
    ],
  },
  {
    id: 'hanging',
    label: 'Hanging',
    sourceCategory: 'Hanging',
    question: 'What are you hanging?',
    jobTypeKeys: ['hanging_picture_frames', 'hanging_artwork'],
  },
  {
    id: 'curtains_blinds',
    label: 'Curtains & Blinds',
    sourceCategory: 'Curtains & Blinds',
    question: 'What do you need help with?',
    jobTypeKeys: [
      'curtains_blinds_curtain_rods',
      'curtains_blinds_install',
      'curtains_blinds_minor_fixes',
    ],
  },
  {
    id: 'wall_fixes',
    label: 'Wall Fixes',
    sourceCategory: 'Wall Patch & Touch-up',
    question: 'What wall fix do you need?',
    jobTypeKeys: ['wall_patch_touchup_small_holes', 'wall_patch_touchup_cosmetic'],
  },
  {
    id: 'sealing',
    label: 'Silicone Touch-ups',
    sourceCategory: 'Silicone Sealing',
    question: 'Where do you need silicone touch-ups?',
    jobTypeKeys: ['silicone_sealing_cosmetic'],
  },
  {
    id: 'make_good',
    label: 'Make-Good',
    sourceCategory: 'Apartment Make-Good',
    question: 'What kind of make-good help do you need?',
    jobTypeKeys: ['apartment_make_good'],
  },
];

/** Same shape as legacy `topLevelJobCategories` for Post a Task. */
export const topLevelJobCategories = TASK_TAXONOMY_CATEGORY_ORDER.map(
  ({ id, label, sourceCategory, question }) => ({ id, label, sourceCategory, question })
);

const taxonomyBySourceCategory = new Map(
  TASK_TAXONOMY_CATEGORY_ORDER.map((row) => [row.sourceCategory, row])
);

/** Normalize stored Firestore category strings (old or internal) to canonical category labels. */
const STORED_CATEGORY_TO_CANONICAL_LABEL = {
  Mounting: 'Mounting',
  'Furniture Assembly': 'Assembly',
  'Minor Repairs': 'Small Fixture Repairs',
  /** Legacy display-only names from earlier UI copy */
  Repairs: 'Small Fixture Repairs',
  'Small fixture repairs': 'Small Fixture Repairs',
  Hanging: 'Hanging',
  'Curtains & Blinds': 'Curtains & Blinds',
  'Wall Patch & Touch-up': 'Wall Fixes',
  'Silicone Sealing': 'Silicone Touch-ups',
  Sealing: 'Silicone Touch-ups',
  'Apartment Make-Good': 'Make-Good',
};

function norm(s) {
  return String(s || '')
    .trim()
    .toLowerCase();
}

export function getTopLevelCategoryId(jobTypeKey) {
  const match = phase1ExpertiseCatalog.find((item) => item.key === jobTypeKey);
  if (!match) return '';
  const topLevel = topLevelJobCategories.find((entry) => entry.sourceCategory === match.category);
  return topLevel?.id || '';
}

export function getTopLevelCategoryLabelForJobType(jobTypeKey) {
  if (!jobTypeKey) return null;
  const match = phase1ExpertiseCatalog.find((item) => item.key === jobTypeKey);
  if (!match) return null;
  const row = taxonomyBySourceCategory.get(match.category);
  return row?.label ?? null;
}

/** Canonical job-type label (matches catalog `label` for Phase 1 keys). */
export function getCanonicalJobTypeLabel(jobTypeKey) {
  if (!jobTypeKey) return '';
  const row = phase1ExpertiseCatalog.find((x) => x.key === jobTypeKey);
  return row?.label || String(jobTypeKey);
}

/** Map legacy or loose category strings to current canonical labels (display-only). */
export function canonicalizeCategoryDisplayLabel(label) {
  const s = String(label || '').trim();
  if (!s) return '';
  const n = norm(s);
  if (n === 'repairs') return 'Small Fixture Repairs';
  if (n === 'sealing') return 'Silicone Touch-ups';
  if (STORED_CATEGORY_TO_CANONICAL_LABEL[s]) return STORED_CATEGORY_TO_CANONICAL_LABEL[s];
  return s;
}

export function getCanonicalCategoryLabelForSourceCategory(sourceCategory) {
  if (!sourceCategory) return '';
  const row = taxonomyBySourceCategory.get(String(sourceCategory));
  if (row) return row.label;
  return canonicalizeCategoryDisplayLabel(
    STORED_CATEGORY_TO_CANONICAL_LABEL[String(sourceCategory)] || String(sourceCategory)
  );
}

export function getCanonicalCategoryLabelForJobTypeKey(jobTypeKey) {
  return getTopLevelCategoryLabelForJobType(jobTypeKey) || '';
}

export function buildGroupedJobTypesFromCatalog(catalog) {
  const catalogByKey = new Map(catalog.map((item) => [item.key, item]));
  return TASK_TAXONOMY_CATEGORY_ORDER.map((group) => {
    const items = group.jobTypeKeys.map((key) => catalogByKey.get(key)).filter(Boolean);
    return { ...group, items };
  }).filter((g) => g.items.length > 0);
}

/** Drop-in replacement for `expertiseLabelMap` where task-type keys are shown. */
export const canonicalExpertiseLabelMap = Object.fromEntries(
  phase1ExpertiseCatalog.map((x) => [x.key, getCanonicalJobTypeLabel(x.key)])
);

function findJobTypeKeyByLegacyJobTypeLabel(legacyLabel) {
  const n = norm(legacyLabel);
  if (!n) return null;
  for (const row of phase1ExpertiseCatalog) {
    if (norm(row.label) === n || norm(row.expertLabel) === n) return row.key;
  }
  return null;
}

/**
 * Display-only category + short job-type label (`catalog.label`) for a job document.
 * Prefer {@link getJobDisplayLayers} from `utils/jobDisplayFromJob` for expert-facing “Job type”
 * strings (`expertLabel`) and full headline titles aligned with Payments.
 */
export function getJobTaxonomyDisplay(job) {
  const keyRaw = job?.jobType ?? job?.job_type;
  const keyStr = keyRaw != null ? String(keyRaw).trim() : '';
  if (keyStr && phase1KeysSet.has(keyStr)) {
    return {
      categoryLabel: canonicalizeCategoryDisplayLabel(getCanonicalCategoryLabelForJobTypeKey(keyStr)),
      jobTypeLabel: getCanonicalJobTypeLabel(keyStr),
    };
  }
  const legacyLabel = String(job?.jobTypeLabel ?? job?.job_type_label ?? '').trim();
  const matched = legacyLabel ? findJobTypeKeyByLegacyJobTypeLabel(legacyLabel) : null;
  if (matched) {
    return {
      categoryLabel: canonicalizeCategoryDisplayLabel(getCanonicalCategoryLabelForJobTypeKey(matched)),
      jobTypeLabel: getCanonicalJobTypeLabel(matched),
    };
  }
  const storedCat = String(job?.jobTypeCategory ?? job?.job_type_category ?? '').trim();
  const categoryLabel = storedCat
    ? canonicalizeCategoryDisplayLabel(
        STORED_CATEGORY_TO_CANONICAL_LABEL[storedCat] || getCanonicalCategoryLabelForSourceCategory(storedCat)
      )
    : '';
  return {
    categoryLabel,
    jobTypeLabel: legacyLabel,
  };
}
