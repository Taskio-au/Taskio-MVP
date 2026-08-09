// Lightweight AU suburb/postcode dataset for typeahead selection.
// This is intentionally "small but useful" for MVP and can be expanded later.
// Shape: { suburb, state, postcode, label }

'use strict';

const auLocations = [
  // NSW
  { suburb: 'Sydney', state: 'NSW', postcode: '2000', label: 'Sydney NSW 2000' },
  { suburb: 'Surry Hills', state: 'NSW', postcode: '2010', label: 'Surry Hills NSW 2010' },
  { suburb: 'Bondi', state: 'NSW', postcode: '2026', label: 'Bondi NSW 2026' },
  { suburb: 'Bondi Junction', state: 'NSW', postcode: '2022', label: 'Bondi Junction NSW 2022' },
  { suburb: 'Parramatta', state: 'NSW', postcode: '2150', label: 'Parramatta NSW 2150' },
  { suburb: 'Chatswood', state: 'NSW', postcode: '2067', label: 'Chatswood NSW 2067' },
  { suburb: 'Newtown', state: 'NSW', postcode: '2042', label: 'Newtown NSW 2042' },
  { suburb: 'Manly', state: 'NSW', postcode: '2095', label: 'Manly NSW 2095' },
  { suburb: 'Penrith', state: 'NSW', postcode: '2750', label: 'Penrith NSW 2750' },
  { suburb: 'Wollongong', state: 'NSW', postcode: '2500', label: 'Wollongong NSW 2500' },
  { suburb: 'Newcastle', state: 'NSW', postcode: '2300', label: 'Newcastle NSW 2300' },
  { suburb: 'Gosford', state: 'NSW', postcode: '2250', label: 'Gosford NSW 2250' },

  // VIC
  { suburb: 'Melbourne', state: 'VIC', postcode: '3000', label: 'Melbourne VIC 3000', latitude: -37.8136, longitude: 144.9631 },
  { suburb: 'Southbank', state: 'VIC', postcode: '3006', label: 'Southbank VIC 3006', latitude: -37.8257, longitude: 144.9647 },
  { suburb: 'Docklands', state: 'VIC', postcode: '3008', label: 'Docklands VIC 3008', latitude: -37.8142, longitude: 144.9469 },
  { suburb: 'South Yarra', state: 'VIC', postcode: '3141', label: 'South Yarra VIC 3141', latitude: -37.8396, longitude: 144.9928 },
  { suburb: 'Prahran', state: 'VIC', postcode: '3181', label: 'Prahran VIC 3181', latitude: -37.8510, longitude: 144.9930 },
  { suburb: 'St Kilda', state: 'VIC', postcode: '3182', label: 'St Kilda VIC 3182', latitude: -37.8676, longitude: 144.9809 },
  { suburb: 'Richmond', state: 'VIC', postcode: '3121', label: 'Richmond VIC 3121', latitude: -37.8182, longitude: 144.9985 },
  { suburb: 'Carlton', state: 'VIC', postcode: '3053', label: 'Carlton VIC 3053', latitude: -37.8005, longitude: 144.9653 },
  { suburb: 'Geelong', state: 'VIC', postcode: '3220', label: 'Geelong VIC 3220' },
  { suburb: 'Ballarat', state: 'VIC', postcode: '3350', label: 'Ballarat VIC 3350' },
  { suburb: 'Bendigo', state: 'VIC', postcode: '3550', label: 'Bendigo VIC 3550' },

  // QLD
  { suburb: 'Brisbane City', state: 'QLD', postcode: '4000', label: 'Brisbane City QLD 4000' },
  { suburb: 'South Brisbane', state: 'QLD', postcode: '4101', label: 'South Brisbane QLD 4101' },
  { suburb: 'Fortitude Valley', state: 'QLD', postcode: '4006', label: 'Fortitude Valley QLD 4006' },
  { suburb: 'Toowong', state: 'QLD', postcode: '4066', label: 'Toowong QLD 4066' },
  { suburb: 'Chermside', state: 'QLD', postcode: '4032', label: 'Chermside QLD 4032' },
  { suburb: 'Gold Coast', state: 'QLD', postcode: '4217', label: 'Gold Coast QLD 4217' },
  { suburb: 'Surfers Paradise', state: 'QLD', postcode: '4217', label: 'Surfers Paradise QLD 4217' },
  { suburb: 'Sunshine Coast', state: 'QLD', postcode: '4551', label: 'Sunshine Coast QLD 4551' },

  // WA
  { suburb: 'Perth', state: 'WA', postcode: '6000', label: 'Perth WA 6000' },
  { suburb: 'West Perth', state: 'WA', postcode: '6005', label: 'West Perth WA 6005' },
  { suburb: 'Fremantle', state: 'WA', postcode: '6160', label: 'Fremantle WA 6160' },
  { suburb: 'Joondalup', state: 'WA', postcode: '6027', label: 'Joondalup WA 6027' },

  // SA
  { suburb: 'Adelaide', state: 'SA', postcode: '5000', label: 'Adelaide SA 5000' },
  { suburb: 'Glenelg', state: 'SA', postcode: '5045', label: 'Glenelg SA 5045' },
  { suburb: 'Norwood', state: 'SA', postcode: '5067', label: 'Norwood SA 5067' },

  // ACT
  { suburb: 'Canberra', state: 'ACT', postcode: '2600', label: 'Canberra ACT 2600' },
  { suburb: 'Belconnen', state: 'ACT', postcode: '2617', label: 'Belconnen ACT 2617' },

  // TAS
  { suburb: 'Hobart', state: 'TAS', postcode: '7000', label: 'Hobart TAS 7000' },
  { suburb: 'Launceston', state: 'TAS', postcode: '7250', label: 'Launceston TAS 7250' },

  // NT
  { suburb: 'Darwin', state: 'NT', postcode: '0800', label: 'Darwin NT 0800' },
];

const melbournePilotSuburbs = new Set([
  'Melbourne',
  'Southbank',
  'Docklands',
  'South Yarra',
  'Prahran',
  'St Kilda',
  'Richmond',
  'Carlton',
]);

const INNER_MELBOURNE_LAUNCH_MESSAGE = "We're currently launching in inner Melbourne. We'll be in your area soon.";

const melbournePilotLocations = auLocations.filter(
  (item) => item.state === 'VIC' && melbournePilotSuburbs.has(item.suburb)
);

function normalizeLocationLabel(input) {
  return String(input || '')
    .trim()
    .replace(/,/g, '')
    .replace(/\s+/g, ' ')
    .toLowerCase();
}

function locationKey({ suburb, state, postcode }) {
  return `${String(suburb || '').trim().toLowerCase()}|${String(state || '').trim().toUpperCase()}|${String(postcode || '').trim()}`;
}

const melbournePilotLocationKeys = new Set(melbournePilotLocations.map(locationKey));
const melbournePilotLocationLabels = new Set(
  melbournePilotLocations.flatMap((item) => ([
    normalizeLocationLabel(item.label),
    normalizeLocationLabel(`${item.suburb}, ${item.state} ${item.postcode}`),
    normalizeLocationLabel(`${item.suburb} ${item.state} ${item.postcode}`),
  ]))
);

function searchMelbournePilotLocations(query, limit = 10) {
  const q = String(query || '').trim().toLowerCase();
  if (!q) return [];
  const isDigits = /^[0-9]+$/.test(q);
  const out = [];
  for (const item of melbournePilotLocations) {
    const suburb = String(item.suburb || '').toLowerCase();
    const pc = String(item.postcode || '');
    const hit = isDigits ? pc.startsWith(q) : suburb.includes(q);
    if (!hit) continue;
    out.push(item);
    if (out.length >= limit) break;
  }
  return out;
}

function isSupportedMelbournePilotLocation(input) {
  if (!input) return false;
  if (typeof input === 'string') {
    return melbournePilotLocationLabels.has(normalizeLocationLabel(input));
  }
  if (typeof input === 'object') {
    return melbournePilotLocationKeys.has(locationKey(input));
  }
  return false;
}

module.exports = {
  auLocations,
  melbournePilotLocations,
  searchMelbournePilotLocations,
  isSupportedMelbournePilotLocation,
  normalizeLocationLabel,
  INNER_MELBOURNE_LAUNCH_MESSAGE,
};
