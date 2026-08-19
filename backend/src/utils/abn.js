/**
 * ABN format + checksum helpers (offline).
 * Checksum validity is necessary but not sufficient for verification.
 * abnVerified is set only after a live ABR lookup confirms the ABN is currently Active.
 * GST registration is stored when present; it is not required for verification.
 */

function cleanAbn(input) {
  return String(input || '').replace(/\s+/g, '');
}

function isValidAbn(input) {
  const abn = cleanAbn(input);
  if (!/^\d{11}$/.test(abn)) return false;

  const weights = [10, 1, 3, 5, 7, 9, 11, 13, 15, 17, 19];
  const digits = abn.split('').map((d) => Number(d));
  digits[0] = digits[0] - 1;

  let sum = 0;
  for (let i = 0; i < 11; i += 1) {
    sum += digits[i] * weights[i];
  }
  return sum % 89 === 0;
}

module.exports = { isValidAbn, cleanAbn };











