'use strict';

const { phase1ExpertiseCatalog } = require('../shared/expertiseCatalog');
const { itemScopeText } = require('../shared/jobPostingSemantics');

const MAX_JOB_ITEMS = 20;
const MIN_QUANTITY = 1;
const MAX_QUANTITY = 99;

const catalogByKey = new Map(phase1ExpertiseCatalog.map((row) => [row.key, row]));
const validCategories = new Set(phase1ExpertiseCatalog.map((row) => row.category));

function customJobTypeKey(category) {
  return `custom:${String(category || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '_')}`;
}

function normalizeJobItems({ jobType, primaryCategory, items }) {
  if (items === undefined) {
    const legacyRow = catalogByKey.get(String(jobType || '').trim());
    if (!legacyRow) return { error: 'Please choose a supported job type.' };
    return {
      primaryCategory: legacyRow.category,
      items: [{ type: legacyRow.key, quantity: 1, customDescription: '' }],
      primaryJobType: legacyRow.key,
      primaryRow: legacyRow,
      legacyInput: true,
    };
  }

  const category = String(primaryCategory || '').trim();
  if (!validCategories.has(category)) return { error: 'Please choose one supported primary category.' };
  if (!Array.isArray(items) || items.length < 1 || items.length > MAX_JOB_ITEMS) {
    return { error: `Choose between 1 and ${MAX_JOB_ITEMS} task items.` };
  }

  const normalized = [];
  const seenTypes = new Set();
  for (const raw of items) {
    const type = String(raw?.type || '').trim();
    const quantity = Number(raw?.quantity);
    const customDescription = String(raw?.customDescription || '').trim().replace(/\s+/g, ' ');
    const row = catalogByKey.get(type);
    const isCustom = type === 'custom';

    if ((!isCustom && (!row || row.category !== category)) || seenTypes.has(type)) {
      return { error: 'Every task item must be unique and belong to the primary category.' };
    }
    if (!Number.isInteger(quantity) || quantity < MIN_QUANTITY || quantity > MAX_QUANTITY) {
      return { error: 'Task item quantities must be whole numbers from 1 to 99.' };
    }
    if (isCustom && (customDescription.length < 3 || customDescription.length > 200)) {
      return { error: 'Describe the custom task item in 3 to 200 characters.' };
    }
    if (!isCustom && customDescription.length > 200) {
      return { error: 'Task item descriptions must be 200 characters or fewer.' };
    }

    seenTypes.add(type);
    normalized.push({ type, quantity, customDescription: isCustom ? customDescription : '' });
  }

  const firstCatalogItem = normalized.find((item) => item.type !== 'custom');
  const primaryRow = firstCatalogItem ? catalogByKey.get(firstCatalogItem.type) : null;
  return {
    primaryCategory: category,
    items: normalized,
    primaryJobType: primaryRow?.key || customJobTypeKey(category),
    primaryRow,
    legacyInput: false,
  };
}

module.exports = {
  MAX_JOB_ITEMS,
  MAX_QUANTITY,
  MIN_QUANTITY,
  customJobTypeKey,
  itemScopeText,
  normalizeJobItems,
};
