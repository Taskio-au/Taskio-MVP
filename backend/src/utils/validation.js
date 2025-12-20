'use strict';

function isNonEmptyString(v) {
  return typeof v === 'string' && v.trim().length > 0;
}

function isStringMax(v, maxLen) {
  if (v === undefined || v === null) return true;
  if (typeof v !== 'string') return false;
  return v.length <= maxLen;
}

function toSafeNumber(v) {
  if (v === null || v === undefined || v === '') return NaN;
  const n = Number(v);
  return Number.isFinite(n) ? n : NaN;
}

module.exports = {
  isNonEmptyString,
  isStringMax,
  toSafeNumber,
};


