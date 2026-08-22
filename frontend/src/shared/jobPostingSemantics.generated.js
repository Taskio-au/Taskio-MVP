// AUTO-GENERATED from shared/jobPostingSemantics.js — do not edit

export const MIRROR_CATALOG_TYPE = "mounting_mirrors";
export const MIRROR_CATEGORY = "Mounting";
export const REQUIRED_PHOTO_CATEGORIES = ["Apartment Make-Good"];
const mirrorCustomItemPattern = /\bmirrors?\b/i;

export function itemScopeText(items) {
  return (items || [])
    .map((item) => String(item?.customDescription || '').trim())
    .filter(Boolean)
    .join(' ');
}

export function itemRepresentsMirrorWork(item, primaryCategory) {
  if (item?.type === MIRROR_CATALOG_TYPE) return true;
  return primaryCategory === MIRROR_CATEGORY
    && item?.type === 'custom'
    && mirrorCustomItemPattern.test(String(item.customDescription || ''));
}

export function includesMirrorWork(items, primaryCategory) {
  return (items || []).some((item) => itemRepresentsMirrorWork(item, primaryCategory));
}

export function categoryRequiresPostingPhoto(primaryCategory) {
  return REQUIRED_PHOTO_CATEGORIES.includes(String(primaryCategory || '').trim());
}
