'use strict';

function isSafeString(v, max = 5000) {
  return typeof v === 'string' && v.length <= max;
}

function sanitizePlainText(input, maxLen) {
  if (!isSafeString(input, maxLen)) return '';
  return String(input || '').replace(/<[^>]*>/g, '').trim();
}

module.exports = {
  isSafeString,
  sanitizePlainText,
};
