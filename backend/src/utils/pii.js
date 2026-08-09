'use strict';

function maskEmail(email) {
  if (typeof email !== 'string') return '';
  const trimmed = email.trim();
  const at = trimmed.indexOf('@');
  if (at <= 0) return '';
  const local = trimmed.slice(0, at);
  const domain = trimmed.slice(at + 1);
  if (!domain) return '';

  const keep = Math.min(2, local.length);
  const prefix = local.slice(0, keep);
  return `${prefix}***@${domain}`;
}

function buildDisplayName(userDoc) {
  const firstName = (userDoc?.firstName || '').toString().trim();
  const lastName = (userDoc?.lastName || '').toString().trim();
  const displayName = `${firstName} ${lastName}`.trim();
  return displayName || (userDoc?.displayName || '').toString().trim() || '';
}

module.exports = { maskEmail, buildDisplayName };
















