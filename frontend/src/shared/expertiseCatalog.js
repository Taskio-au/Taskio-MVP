// AUTO-GENERATED FILE (from /shared/expertiseCatalog.js)
// Do not edit manually. Run via `npm start` / `npm run build` / `npm test` (pre* scripts).

// Phase 1 (Tier 1) expertise catalog — SINGLE SOURCE OF TRUTH.
// IMPORTANT (Phase 1 launch rule):
// - ONLY these keys may be displayed/selected/used for matching.
// - Tier 2/regulated categories must not appear anywhere in UI or filters.

export const phase1ExpertiseCatalog = [
  { key: "mounting_tv", label: "TV mounting", category: "Mounting", expertLabel: "TV mounting", expertCategory: "Mounting & Installation", summary: "Mount a TV safely to the wall. No electrical or hidden-cable work." },
  { key: "mounting_shelves", label: "Shelves", category: "Mounting", expertLabel: "Install shelves", expertCategory: "Mounting & Installation", summary: "Install simple wall shelves." },
  { key: "mounting_mirrors", label: "Mirrors", category: "Mounting", expertLabel: "Hang mirrors", expertCategory: "Mounting & Installation", summary: "Hang or secure mirrors on interior walls." },
  { key: "hanging_picture_frames", label: "Picture frames", category: "Hanging", expertLabel: "Install picture frames", expertCategory: "Mounting & Installation", summary: "Hang one or more picture frames neatly." },
  { key: "hanging_artwork", label: "Artwork", category: "Hanging", expertLabel: "Hang artwork", expertCategory: "Mounting & Installation", summary: "Hang artwork or decorative pieces indoors." },
  { key: "curtains_blinds_curtain_rods", label: "Curtain rod install", category: "Curtains & Blinds", expertLabel: "Install curtain rods", expertCategory: "Mounting & Installation", summary: "Install curtain rods or tracks." },
  { key: "curtains_blinds_install", label: "Blind installation", category: "Curtains & Blinds", expertLabel: "Install blinds", expertCategory: "Mounting & Installation", summary: "Install new blinds indoors." },
  { key: "curtains_blinds_minor_fixes", label: "Minor blind fixes", category: "Curtains & Blinds", expertLabel: "Repair blind fittings", expertCategory: "Repairs & Fixes", summary: "Minor cosmetic blind adjustments or repairs." },
  { key: "furniture_assembly_flat_pack", label: "Flat-pack furniture", category: "Furniture Assembly", expertLabel: "Flat-pack furniture assembly", expertCategory: "Assembly", summary: "Assemble flat-pack furniture such as IKEA items." },
  { key: "furniture_assembly_bed_desk_wardrobe", label: "Beds, desks, wardrobes", category: "Furniture Assembly", expertLabel: "Assemble beds, desks, wardrobes", expertCategory: "Assembly", summary: "Assemble standard bedroom or study furniture." },
  { key: "minor_repairs_door_hinge", label: "Door hinge fix", category: "Minor Repairs", expertLabel: "Repair door hinges", expertCategory: "Repairs & Fixes", summary: "Adjust or repair sticking / loose hinges." },
  { key: "minor_repairs_cabinet_alignment", label: "Cabinet alignment", category: "Minor Repairs", expertLabel: "Align cabinets", expertCategory: "Repairs & Fixes", summary: "Realign cabinet doors or drawers." },
  { key: "minor_repairs_handle_replacement", label: "Handle replacement", category: "Minor Repairs", expertLabel: "Replace handles", expertCategory: "Repairs & Fixes", summary: "Replace simple handles or knobs." },
  { key: "minor_repairs_small_fixture", label: "Small fixture repairs", category: "Minor Repairs", expertLabel: "Small fixture repairs", expertCategory: "Repairs & Fixes", summary: "Minor fixes to small fixtures (non-electrical) such as towel rails or simple fittings." },
  { key: "wall_patch_touchup_small_holes", label: "Small holes", category: "Wall Patch & Touch-up", expertLabel: "Patch small wall holes", expertCategory: "Repairs & Fixes", summary: "Patch small wall holes and surface marks." },
  { key: "wall_patch_touchup_cosmetic", label: "Minor cosmetic wall repairs", category: "Wall Patch & Touch-up", expertLabel: "Minor cosmetic wall repairs", expertCategory: "Repairs & Fixes", summary: "Minor cosmetic patching and touch-up prep." },
  { key: "silicone_sealing_cosmetic", label: "Kitchen / bathroom edges", category: "Silicone Sealing", expertLabel: "Silicone kitchen / bathroom edges", expertCategory: "Repairs & Fixes", summary: "Cosmetic silicone sealing on edges only. No waterproofing work." },
  { key: "silicone_sealing_touchups", label: "Silicone touch-ups", category: "Silicone Sealing", expertLabel: "Silicone touch-ups", expertCategory: "Repairs & Fixes", summary: "Small silicone touch-ups and neatening of existing sealant. No waterproofing or wet-area rebuilds." },
  { key: "apartment_make_good", label: "Apartment make-good", category: "Apartment Make-Good", expertLabel: "Apartment make-good jobs", expertCategory: "Make-good", summary: "A small bundle of quick cosmetic fixes with a total scope of up to 2 hours." },
];

export const phase1KeysSet = new Set(phase1ExpertiseCatalog.map((x) => x.key));
export const expertiseLabelMap = Object.fromEntries(phase1ExpertiseCatalog.map((x) => [x.key, x.label]));
export const expertiseExpertLabelMap = Object.fromEntries(phase1ExpertiseCatalog.map((x) => [x.key, x.expertLabel || x.label]));
export const expertCategoryOrder = ["Mounting & Installation","Repairs & Fixes","Assembly","Make-good"];
