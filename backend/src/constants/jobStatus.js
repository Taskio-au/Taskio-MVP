'use strict';

/**
 * Compatibility wrapper around `jobStatuses`.
 * Keep this file for any legacy imports while maintaining one source of truth.
 */
const base = require('./jobStatuses');

module.exports = {
  ...base,
  // Legacy aliases
  JOB_STATUS: base.JOB_STATUSES,
  normalizeLegacyStatus: base.normalizeStatus,
};
