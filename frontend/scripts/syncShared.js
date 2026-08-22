/* eslint-disable no-console */
'use strict';

const fs = require('fs');
const path = require('path');

function writeFile(dest, contents) {
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.writeFileSync(dest, contents, 'utf8');
}

function toJsStringLiteral(s) {
  return JSON.stringify(String(s));
}

function main() {
  const root = path.resolve(__dirname, '..', '..');
  const src = path.join(root, 'shared', 'expertiseCatalog.js');
  const dest = path.join(__dirname, '..', 'src', 'shared', 'expertiseCatalog.js');
  const locSrc = path.join(root, 'shared', 'auLocations.js');
  const locDest = path.join(__dirname, '..', 'src', 'shared', 'auLocations.js');

  if (!fs.existsSync(src)) {
    console.error('[syncShared] Missing shared catalog:', src);
    process.exit(1);
  }

  // The canonical catalog is CommonJS (used by backend). Frontend needs ESM exports.
  // eslint-disable-next-line import/no-dynamic-require, global-require
  const catalog = require(src);
  const items = Array.isArray(catalog.phase1ExpertiseCatalog) ? catalog.phase1ExpertiseCatalog : [];
  const expertCategoryOrder = Array.isArray(catalog.expertCategoryOrder) ? catalog.expertCategoryOrder : [];

  const out = [
    '// AUTO-GENERATED FILE (from /shared/expertiseCatalog.js)',
    '// Do not edit manually. Run via `npm start` / `npm run build` / `npm test` (pre* scripts).',
    '',
    '// Phase 1 (Tier 1) expertise catalog — SINGLE SOURCE OF TRUTH.',
    '// IMPORTANT (Phase 1 launch rule):',
    '// - ONLY these keys may be displayed/selected/used for matching.',
    '// - Tier 2/regulated categories must not appear anywhere in UI or filters.',
    '',
    'export const phase1ExpertiseCatalog = [',
    ...items.map((x) => `  { key: ${toJsStringLiteral(x?.key)}, label: ${toJsStringLiteral(x?.label)}, category: ${toJsStringLiteral(x?.category || '')}, expertLabel: ${toJsStringLiteral(x?.expertLabel || x?.label || '')}, expertCategory: ${toJsStringLiteral(x?.expertCategory || '')}, summary: ${toJsStringLiteral(x?.summary || '')} },`),
    '];',
    '',
    'export const phase1KeysSet = new Set(phase1ExpertiseCatalog.map((x) => x.key));',
    'export const expertiseLabelMap = Object.fromEntries(phase1ExpertiseCatalog.map((x) => [x.key, x.label]));',
    'export const expertiseExpertLabelMap = Object.fromEntries(phase1ExpertiseCatalog.map((x) => [x.key, x.expertLabel || x.label]));',
    `export const expertCategoryOrder = ${JSON.stringify(expertCategoryOrder)};`,
    '',
  ].join('\n');

  writeFile(dest, out);
  console.log('[syncShared] generated', path.relative(root, dest));

  // Also sync AU locations dataset (CommonJS → ESM)
  if (!fs.existsSync(locSrc)) {
    console.error('[syncShared] Missing shared locations dataset:', locSrc);
    process.exit(1);
  }
  // eslint-disable-next-line import/no-dynamic-require, global-require
  const loc = require(locSrc);
  const itemsLoc = Array.isArray(loc.auLocations) ? loc.auLocations : [];

  const locOut = [
    '// AUTO-GENERATED FILE (from /shared/auLocations.js)',
    '// Do not edit manually.',
    '',
    'export const auLocations = [',
    ...itemsLoc.map(
      (x) =>
        `  { suburb: ${toJsStringLiteral(x?.suburb)}, state: ${toJsStringLiteral(x?.state)}, postcode: ${toJsStringLiteral(x?.postcode)}, label: ${toJsStringLiteral(x?.label)}, latitude: ${x?.latitude ?? 'null'}, longitude: ${x?.longitude ?? 'null'} },`
    ),
    '];',
    '',
    'export const melbournePilotLocations = auLocations.filter((item) => item.state === "VIC" && ["Melbourne", "Southbank", "Docklands", "South Yarra", "Prahran", "St Kilda", "Richmond", "Carlton"].includes(item.suburb));',
    '',
    'export function searchAuLocations(query, limit = 10) {',
    '  const q = String(query || "").trim().toLowerCase();',
    '  if (!q) return [];',
    '  const isDigits = /^[0-9]+$/.test(q);',
    '  const out = [];',
    '  for (const item of auLocations) {',
    '    const suburb = String(item.suburb || "").toLowerCase();',
    '    const pc = String(item.postcode || "");',
    '    const hit = isDigits ? pc.startsWith(q) : suburb.includes(q);',
    '    if (!hit) continue;',
    '    out.push(item);',
    '    if (out.length >= limit) break;',
    '  }',
    '  return out;',
    '}',
    '',
  ].join('\n');

  writeFile(locDest, locOut);
  console.log('[syncShared] generated', path.relative(root, locDest));

  const jobCorePath = path.join(root, 'shared', 'jobStatusesCore.js');
  if (!fs.existsSync(jobCorePath)) {
    console.error('[syncShared] Missing job lifecycle core:', jobCorePath);
    process.exit(1);
  }
  try {
    delete require.cache[require.resolve(jobCorePath)];
  } catch (_) {
    // ignore
  }
  // eslint-disable-next-line import/no-dynamic-require, global-require
  const jobCore = require(jobCorePath);
  const jobDest = path.join(__dirname, '..', 'src', 'shared', 'jobStatusesConstants.generated.js');
  const jobOut = [
    '// AUTO-GENERATED from shared/jobStatusesCore.js — do not edit',
    '',
    `export const JOB_STATUSES = ${JSON.stringify(jobCore.JOB_STATUSES, null, 2)};`,
    '',
    `export const LEGACY_STATUS_MAP = ${JSON.stringify(jobCore.LEGACY_STATUS_MAP, null, 2)};`,
    '',
    `export const VALID_TRANSITIONS = ${JSON.stringify(jobCore.VALID_TRANSITIONS, null, 2)};`,
    '',
    'export const VALID_STATUSES = Object.values(JOB_STATUSES);',
    '',
  ].join('\n');
  writeFile(jobDest, jobOut);
  console.log('[syncShared] generated', path.relative(root, jobDest));

  const postingSemanticsPath = path.join(root, 'shared', 'jobPostingSemantics.js');
  if (!fs.existsSync(postingSemanticsPath)) {
    console.error('[syncShared] Missing job posting semantics:', postingSemanticsPath);
    process.exit(1);
  }
  try {
    delete require.cache[require.resolve(postingSemanticsPath)];
  } catch (_) {
    // ignore
  }
  // eslint-disable-next-line import/no-dynamic-require, global-require
  const postingSemantics = require(postingSemanticsPath);
  const postingSemanticsDest = path.join(__dirname, '..', 'src', 'shared', 'jobPostingSemantics.generated.js');
  const postingSemanticsOut = [
    '// AUTO-GENERATED from shared/jobPostingSemantics.js — do not edit',
    '',
    `export const MIRROR_CATALOG_TYPE = ${toJsStringLiteral(postingSemantics.MIRROR_CATALOG_TYPE)};`,
    `export const MIRROR_CATEGORY = ${toJsStringLiteral(postingSemantics.MIRROR_CATEGORY)};`,
    `export const REQUIRED_PHOTO_CATEGORIES = ${JSON.stringify(postingSemantics.REQUIRED_PHOTO_CATEGORIES)};`,
    'const mirrorCustomItemPattern = /\\bmirrors?\\b/i;',
    '',
    'export function itemScopeText(items) {',
    '  return (items || [])',
    "    .map((item) => String(item?.customDescription || '').trim())",
    '    .filter(Boolean)',
    "    .join(' ');",
    '}',
    '',
    'export function itemRepresentsMirrorWork(item, primaryCategory) {',
    '  if (item?.type === MIRROR_CATALOG_TYPE) return true;',
    '  return primaryCategory === MIRROR_CATEGORY',
    "    && item?.type === 'custom'",
    "    && mirrorCustomItemPattern.test(String(item.customDescription || ''));",
    '}',
    '',
    'export function includesMirrorWork(items, primaryCategory) {',
    '  return (items || []).some((item) => itemRepresentsMirrorWork(item, primaryCategory));',
    '}',
    '',
    'export function categoryRequiresPostingPhoto(primaryCategory) {',
    "  return REQUIRED_PHOTO_CATEGORIES.includes(String(primaryCategory || '').trim());",
    '}',
    '',
  ].join('\n');
  writeFile(postingSemanticsDest, postingSemanticsOut);
  console.log('[syncShared] generated', path.relative(root, postingSemanticsDest));
}

main();
