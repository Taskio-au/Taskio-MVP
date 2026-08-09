'use strict';

function parseDobForAge(userDoc) {
  const dob = userDoc?.dob;
  if (!dob || typeof dob !== 'object') return null;
  const day = Number(dob.day);
  const month = Number(dob.month);
  const year = Number(dob.year);
  if (!Number.isFinite(day) || !Number.isFinite(month) || !Number.isFinite(year)) return null;
  if (year < 1900 || year > 2100) return null;
  if (month < 1 || month > 12) return null;
  if (day < 1 || day > 31) return null;
  const d = new Date(Date.UTC(year, month - 1, day));
  if (d.getUTCFullYear() !== year || (d.getUTCMonth() + 1) !== month || d.getUTCDate() !== day) return null;
  return { day, month, year };
}

function ageYearsFromDob(dobObj, now = new Date()) {
  if (!dobObj) return null;
  const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  let age = today.getUTCFullYear() - dobObj.year;
  const m = today.getUTCMonth() + 1;
  const d = today.getUTCDate();
  if (m < dobObj.month || (m === dobObj.month && d < dobObj.day)) age -= 1;
  return age;
}

function is18PlusConfirmed(userDoc) {
  const dobObj = parseDobForAge(userDoc);
  const age = dobObj ? ageYearsFromDob(dobObj) : null;
  return !!(dobObj && Number.isFinite(age) && age >= 18);
}

function hasServiceLocation(userDoc) {
  const loc = userDoc?.serviceLocation;
  if (!loc || typeof loc !== 'object') return false;
  const postcode = String(loc.postcode || '').trim();
  const suburb = String(loc.suburb || '').trim();
  const state = String(loc.state || '').trim();
  return /^[0-9]{4}$/.test(postcode) && suburb.length >= 2 && state.length >= 2;
}

function hasBusinessType(userDoc) {
  const bt = String(userDoc?.businessType || '').trim();
  return bt === 'individual' || bt === 'sole_trader' || bt === 'company';
}

module.exports = {
  parseDobForAge,
  ageYearsFromDob,
  is18PlusConfirmed,
  hasServiceLocation,
  hasBusinessType,
};
