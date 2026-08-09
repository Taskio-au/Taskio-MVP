'use strict';

function normalizeStringArray(input, max = 100) {
  if (!Array.isArray(input)) return [];
  const out = [];
  for (const x of input) {
    const s = String(x || '').trim();
    if (!s) continue;
    if (!out.includes(s)) out.push(s);
    if (out.length >= max) break;
  }
  return out;
}

function pruneToAllowed(keys, allowedSet) {
  const cleaned = normalizeStringArray(keys);
  const kept = [];
  const removed = [];
  for (const k of cleaned) {
    if (allowedSet.has(k)) kept.push(k);
    else removed.push(k);
  }
  return { kept, removed };
}

module.exports = {
  normalizeStringArray,
  pruneToAllowed,
};
