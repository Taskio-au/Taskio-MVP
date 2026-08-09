'use strict';

function parseNameParts(displayName) {
  const s = String(displayName || '').trim().replace(/\s+/g, ' ');
  if (!s) return { firstName: '', lastName: '' };
  const parts = s.split(' ');
  const firstName = parts[0] || '';
  const lastName = parts.slice(1).join(' ').trim();
  return { firstName, lastName };
}

module.exports = {
  parseNameParts,
};
