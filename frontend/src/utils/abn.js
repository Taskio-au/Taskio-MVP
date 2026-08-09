// src/utils/abn.js
// ABN validation (Australia) — 11 digits with checksum.
//
// Algorithm:
// - Use weights: [10, 1, 3, 5, 7, 9, 11, 13, 15, 17, 19]
// - Subtract 1 from the first digit
// - Multiply digits by weights, sum
// - Valid if sum % 89 === 0

export function cleanAbn(input) {
  return String(input || '').replace(/\s+/g, '').trim();
}

export function isValidAbn(input) {
  const abn = cleanAbn(input);
  if (!/^\d{11}$/.test(abn)) return false;

  const weights = [10, 1, 3, 5, 7, 9, 11, 13, 15, 17, 19];
  const digits = abn.split('').map((d) => Number(d));
  digits[0] = digits[0] - 1;

  let sum = 0;
  for (let i = 0; i < 11; i += 1) sum += digits[i] * weights[i];
  return sum % 89 === 0;
}










