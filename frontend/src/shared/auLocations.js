// AUTO-GENERATED FILE (from /shared/auLocations.js)
// Do not edit manually.

export const auLocations = [
  { suburb: "Sydney", state: "NSW", postcode: "2000", label: "Sydney NSW 2000", latitude: null, longitude: null },
  { suburb: "Surry Hills", state: "NSW", postcode: "2010", label: "Surry Hills NSW 2010", latitude: null, longitude: null },
  { suburb: "Bondi", state: "NSW", postcode: "2026", label: "Bondi NSW 2026", latitude: null, longitude: null },
  { suburb: "Bondi Junction", state: "NSW", postcode: "2022", label: "Bondi Junction NSW 2022", latitude: null, longitude: null },
  { suburb: "Parramatta", state: "NSW", postcode: "2150", label: "Parramatta NSW 2150", latitude: null, longitude: null },
  { suburb: "Chatswood", state: "NSW", postcode: "2067", label: "Chatswood NSW 2067", latitude: null, longitude: null },
  { suburb: "Newtown", state: "NSW", postcode: "2042", label: "Newtown NSW 2042", latitude: null, longitude: null },
  { suburb: "Manly", state: "NSW", postcode: "2095", label: "Manly NSW 2095", latitude: null, longitude: null },
  { suburb: "Penrith", state: "NSW", postcode: "2750", label: "Penrith NSW 2750", latitude: null, longitude: null },
  { suburb: "Wollongong", state: "NSW", postcode: "2500", label: "Wollongong NSW 2500", latitude: null, longitude: null },
  { suburb: "Newcastle", state: "NSW", postcode: "2300", label: "Newcastle NSW 2300", latitude: null, longitude: null },
  { suburb: "Gosford", state: "NSW", postcode: "2250", label: "Gosford NSW 2250", latitude: null, longitude: null },
  { suburb: "Melbourne", state: "VIC", postcode: "3000", label: "Melbourne VIC 3000", latitude: -37.8136, longitude: 144.9631 },
  { suburb: "Southbank", state: "VIC", postcode: "3006", label: "Southbank VIC 3006", latitude: -37.8257, longitude: 144.9647 },
  { suburb: "Docklands", state: "VIC", postcode: "3008", label: "Docklands VIC 3008", latitude: -37.8142, longitude: 144.9469 },
  { suburb: "South Yarra", state: "VIC", postcode: "3141", label: "South Yarra VIC 3141", latitude: -37.8396, longitude: 144.9928 },
  { suburb: "Prahran", state: "VIC", postcode: "3181", label: "Prahran VIC 3181", latitude: -37.851, longitude: 144.993 },
  { suburb: "St Kilda", state: "VIC", postcode: "3182", label: "St Kilda VIC 3182", latitude: -37.8676, longitude: 144.9809 },
  { suburb: "Richmond", state: "VIC", postcode: "3121", label: "Richmond VIC 3121", latitude: -37.8182, longitude: 144.9985 },
  { suburb: "Carlton", state: "VIC", postcode: "3053", label: "Carlton VIC 3053", latitude: -37.8005, longitude: 144.9653 },
  { suburb: "Geelong", state: "VIC", postcode: "3220", label: "Geelong VIC 3220", latitude: null, longitude: null },
  { suburb: "Ballarat", state: "VIC", postcode: "3350", label: "Ballarat VIC 3350", latitude: null, longitude: null },
  { suburb: "Bendigo", state: "VIC", postcode: "3550", label: "Bendigo VIC 3550", latitude: null, longitude: null },
  { suburb: "Brisbane City", state: "QLD", postcode: "4000", label: "Brisbane City QLD 4000", latitude: null, longitude: null },
  { suburb: "South Brisbane", state: "QLD", postcode: "4101", label: "South Brisbane QLD 4101", latitude: null, longitude: null },
  { suburb: "Fortitude Valley", state: "QLD", postcode: "4006", label: "Fortitude Valley QLD 4006", latitude: null, longitude: null },
  { suburb: "Toowong", state: "QLD", postcode: "4066", label: "Toowong QLD 4066", latitude: null, longitude: null },
  { suburb: "Chermside", state: "QLD", postcode: "4032", label: "Chermside QLD 4032", latitude: null, longitude: null },
  { suburb: "Gold Coast", state: "QLD", postcode: "4217", label: "Gold Coast QLD 4217", latitude: null, longitude: null },
  { suburb: "Surfers Paradise", state: "QLD", postcode: "4217", label: "Surfers Paradise QLD 4217", latitude: null, longitude: null },
  { suburb: "Sunshine Coast", state: "QLD", postcode: "4551", label: "Sunshine Coast QLD 4551", latitude: null, longitude: null },
  { suburb: "Perth", state: "WA", postcode: "6000", label: "Perth WA 6000", latitude: null, longitude: null },
  { suburb: "West Perth", state: "WA", postcode: "6005", label: "West Perth WA 6005", latitude: null, longitude: null },
  { suburb: "Fremantle", state: "WA", postcode: "6160", label: "Fremantle WA 6160", latitude: null, longitude: null },
  { suburb: "Joondalup", state: "WA", postcode: "6027", label: "Joondalup WA 6027", latitude: null, longitude: null },
  { suburb: "Adelaide", state: "SA", postcode: "5000", label: "Adelaide SA 5000", latitude: null, longitude: null },
  { suburb: "Glenelg", state: "SA", postcode: "5045", label: "Glenelg SA 5045", latitude: null, longitude: null },
  { suburb: "Norwood", state: "SA", postcode: "5067", label: "Norwood SA 5067", latitude: null, longitude: null },
  { suburb: "Canberra", state: "ACT", postcode: "2600", label: "Canberra ACT 2600", latitude: null, longitude: null },
  { suburb: "Belconnen", state: "ACT", postcode: "2617", label: "Belconnen ACT 2617", latitude: null, longitude: null },
  { suburb: "Hobart", state: "TAS", postcode: "7000", label: "Hobart TAS 7000", latitude: null, longitude: null },
  { suburb: "Launceston", state: "TAS", postcode: "7250", label: "Launceston TAS 7250", latitude: null, longitude: null },
  { suburb: "Darwin", state: "NT", postcode: "0800", label: "Darwin NT 0800", latitude: null, longitude: null },
];

export const melbournePilotLocations = auLocations.filter((item) => item.state === "VIC" && ["Melbourne", "Southbank", "Docklands", "South Yarra", "Prahran", "St Kilda", "Richmond", "Carlton"].includes(item.suburb));

export function searchAuLocations(query, limit = 10) {
  const q = String(query || "").trim().toLowerCase();
  if (!q) return [];
  const isDigits = /^[0-9]+$/.test(q);
  const out = [];
  for (const item of auLocations) {
    const suburb = String(item.suburb || "").toLowerCase();
    const pc = String(item.postcode || "");
    const hit = isDigits ? pc.startsWith(q) : suburb.includes(q);
    if (!hit) continue;
    out.push(item);
    if (out.length >= limit) break;
  }
  return out;
}
