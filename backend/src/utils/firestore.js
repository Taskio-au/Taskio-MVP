'use strict';

function safeToMillis(ts) {
  // Firestore Timestamp, Date, ISO string, or { _seconds } — invalid → 0
  try {
    if (ts === undefined || ts === null) return 0;
    if (typeof ts === 'number' && Number.isFinite(ts)) return ts;
    if (ts instanceof Date && !Number.isNaN(ts.getTime())) return ts.getTime();
    if (typeof ts.toMillis === 'function') return ts.toMillis();
    if (typeof ts._seconds === 'number') return ts._seconds * 1000;
    if (typeof ts === 'string' && ts.trim()) {
      const d = Date.parse(ts);
      return Number.isNaN(d) ? 0 : d;
    }
    return 0;
  } catch {
    return 0;
  }
}

module.exports = { safeToMillis };


