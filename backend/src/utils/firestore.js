'use strict';

function safeToMillis(ts) {
  // Firestore Timestamp -> millis; safely handle undefined/serverTimestamp placeholders
  try {
    if (!ts) return 0;
    if (typeof ts.toMillis === 'function') return ts.toMillis();
    // If something like { _seconds } leaks through
    if (typeof ts._seconds === 'number') return ts._seconds * 1000;
    return 0;
  } catch {
    return 0;
  }
}

module.exports = { safeToMillis };


