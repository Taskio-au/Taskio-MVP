/**
 * Fix mojibake sequences that appear when UTF-8 bytes were decoded as Windows-1252.
 *
 * Examples:
 * - "â€¦" -> "…"
 * - "â€”" -> "—"
 * - "â€¢" -> "•"
 * - "â€™" -> "’"
 * - "âœ•" -> "×"
 * - "Ã—"  -> "×"
 *
 * Run:
 *   node scripts/fixMojibake.js
 */

/* eslint-disable no-console */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', 'src');
const EXTS = new Set(['.js', '.jsx', '.css']);

// Use unicode escapes so this script is safe to run in any terminal encoding.
const REPLACEMENTS = [
  // UTF-8 punctuation decoded as CP-1252 triplets (â + € + X)
  ['\u00e2\u20ac\u201d', '\u2014'], // â€” -> —
  ['\u00e2\u20ac\u201c', '\u2013'], // â€“ -> –
  ['\u00e2\u20ac\u00a2', '\u2022'], // â€¢ -> •
  ['\u00e2\u20ac\u00a6', '\u2026'], // â€¦ -> …
  ['\u00e2\u20ac\u2122', '\u2019'], // â€™ -> ’
  ['\u00e2\u20ac\u0153', '\u201c'], // â€œ -> “
  ['\u00e2\u20ac\u009d', '\u201d'], // â€� -> ”

  // Misc
  ['\u00c2', ''], // Â (often from NBSP) -> remove

  // UTF-8 symbols decoded as CP-1252 pairs
  ['\u00c3\u2014', '\u00d7'], // Ã— -> ×

  // UTF-8 symbols decoded as CP-1252 (â + œ + …)
  ['\u00e2\u0153\u2022', '\u00d7'], // âœ• (✕) -> ×
  ['\u00e2\u0153\u201c', '\u2713'], // âœ“ (✓) -> ✓
  ['\u00e2\u0153\u2014', '\u2717'], // âœ— (✗) -> ✗
  ['\u00e2\u0153\u2026', '\u2705'], // âœ… (✅) -> ✅
  ['\u00e2\u0153\u00a8', '\u2728'], // âœ¨ (✨) -> ✨

  // ⚠️ (E2 9A A0 EF B8 8F) decoded as CP-1252
  ['\u00e2\u0161\u00a0\u00ef\u00b8\u008f', '\u26a0\ufe0f'], // âš ï¸ -> ⚠️
  ['\u00e2\u0161\u00a0', '\u26a0\ufe0f'], // âš  -> ⚠️
  ['\u00e2\u0161\u00a1', '\u26a1'], // âš¡ -> ⚡

  // ⏳ (E2 8F B3) decoded as CP-1252
  ['\u00e2\u008f\u00b3', '\u23f3'], // â³ -> ⏳

  // Arrows and symbols (UTF-8 decoded as CP-1252)
  ['\u00e2\u2020\u2019', '\u2192'], // â†’ -> →
  ['\u00e2\u2020\u0090', '\u2190'], // â† -> ←
  ['\u00e2\u2020\u00bb', '\u21bb'], // â†» -> ↻
  ['\u00e2\u2013\u00b4', '\u25b4'], // â–´ -> ▴
  ['\u00e2\u2013\u00be', '\u25be'], // â–¾ -> ▾
  ['\u00e2\u2014\u2039', '\u25cb'], // â—‹ -> ○
  ['\u00e2\u02dc\u2026', '\u2605'], // â˜… -> ★
  ['\u00e2\u2030\u00a4', '\u2264'], // â‰¤ -> ≤
  ['\u00e2\u20ac\u2018', '\u2011'], // â€‘ -> ‑ (non-breaking hyphen)

  // ❓ (E2 9D 93) decoded as CP-1252 => â + control + “
  ['\u00e2\u009d\u201c', '\u2753'], // â“ -> ❓
  ['\u00e2\u00ad\u0090', '\u2b50'], // â­ -> ⭐

  // Emoji sequences decoded as CP-1252 (common across UI)
  ['\u00f0\u0178\u201d\u2019', '\ud83d\udd12'], // ðŸ”’ -> 🔒
  ['\u00f0\u0178\u2018\u00a4', '\ud83d\udc64'], // ðŸ‘¤ -> 👤
  ['\u00f0\u0178\u2019\u00b3', '\ud83d\udcb3'], // ðŸ’³ -> 💳
  ['\u00f0\u0178\u201d\u201d', '\ud83d\udd14'], // ðŸ”” -> 🔔
  ['\u00f0\u0178\u0161\u00aa', '\ud83d\udeaa'], // ðŸšª -> 🚪
  ['\u00f0\u0178\u2019\u00a1', '\ud83d\udca1'], // ðŸ’¡ -> 💡
  ['\u00f0\u0178\u2019\u00ac', '\ud83d\udcac'], // ðŸ’¬ -> 💬
  ['\u00f0\u0178\u201c\u00ac', '\ud83d\udcec'], // ðŸ“¬ -> 📬
  ['\u00f0\u0178\u201c\u00b7', '\ud83d\udcf7'], // ðŸ“· -> 📷
  ['\u00f0\u0178\u2018\u2039', '\ud83d\udc4b'], // ðŸ‘‹ -> 👋
  ['\u00f0\u0178\u201c\u00b9', '\ud83d\udd1d'], // ðŸ“¹ -> 🔝 (fallback; rarely used)
  ['\u00f0\u0178\u201c\u009d', '\ud83d\udcdd'], // ðŸ“ -> 📝
  ['\u00f0\u0178\u201c\u008d', '\ud83d\udccd'], // ðŸ“ -> 📍
  ['\u00f0\u0178\u2019\u00b0', '\ud83d\udcb0'], // ðŸ’° -> 💰
  ['\u00f0\u0178\u201d\u00a7', '\ud83d\udd27'], // ðŸ”§ -> 🔧
  ['\u00f0\u0178\u008f\u00a0', '\ud83c\udfe0'], // ðŸ  -> 🏠
  ['\u00f0\u0178\u201c\u2039', '\ud83d\udccb'], // ðŸ“‹ -> 📋
  ['\u00f0\u0178\u201d\u2014', '\ud83d\udd17'], // ðŸ”— -> 🔗
  ['\u00f0\u0178\u201c\u017d', '\ud83d\udcce'], // ðŸ“Ž -> 📎
  ['\u00f0\u0178\u203a\u00a1\u00ef\u00b8\u008f', '\ud83d\udee1\ufe0f'], // ðŸ›¡ï¸ -> 🛡️
];

function walk(dir) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) walk(p);
    else if (EXTS.has(path.extname(ent.name))) fixFile(p);
  }
}

function fixFile(filePath) {
  const src = fs.readFileSync(filePath, 'utf8');
  let out = src;
  for (const [from, to] of REPLACEMENTS) {
    out = out.split(from).join(to);
  }
  if (out !== src) {
    fs.writeFileSync(filePath, out, 'utf8');
    console.log('fixed:', path.relative(ROOT, filePath));
  }
}

walk(ROOT);
console.log('done');


