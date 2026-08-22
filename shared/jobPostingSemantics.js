'use strict';

const MIRROR_CATALOG_TYPE = 'mounting_mirrors';
const MIRROR_CATEGORY = 'Mounting';
const REQUIRED_PHOTO_CATEGORIES = Object.freeze(['Apartment Make-Good']);
const mirrorCustomItemPattern = /\bmirrors?\b/i;

function itemScopeText(items) {
  return (items || [])
    .map((item) => String(item?.customDescription || '').trim())
    .filter(Boolean)
    .join(' ');
}

function itemRepresentsMirrorWork(item, primaryCategory) {
  if (item?.type === MIRROR_CATALOG_TYPE) return true;
  return primaryCategory === MIRROR_CATEGORY
    && item?.type === 'custom'
    && mirrorCustomItemPattern.test(String(item.customDescription || ''));
}

function includesMirrorWork(items, primaryCategory) {
  return (items || []).some((item) => itemRepresentsMirrorWork(item, primaryCategory));
}

function categoryRequiresPostingPhoto(primaryCategory) {
  return REQUIRED_PHOTO_CATEGORIES.includes(String(primaryCategory || '').trim());
}

module.exports = {
  MIRROR_CATALOG_TYPE,
  MIRROR_CATEGORY,
  REQUIRED_PHOTO_CATEGORIES,
  categoryRequiresPostingPhoto,
  includesMirrorWork,
  itemRepresentsMirrorWork,
  itemScopeText,
};
