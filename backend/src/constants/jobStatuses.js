/**
 * Job status constants — re-exports shared/jobStatusesCore.js with server-side logging.
 */
const core = require('../../../shared/jobStatusesCore');
const { logger } = require('../observability/logger');

const {
  JOB_STATUSES,
  VALID_STATUSES,
  LEGACY_STATUS_MAP,
  VALID_TRANSITIONS,
  resolveJobStatus,
  isValidStatus,
  isValidTransition,
} = core;

function normalizeStatus(status) {
  const r = resolveJobStatus(status);
  if (r.unknown) {
    logger.warn({ message: 'job_status_unknown', raw: r.rawInput });
  }
  return r.status;
}

module.exports = {
  JOB_STATUSES,
  VALID_STATUSES,
  LEGACY_STATUS_MAP,
  VALID_TRANSITIONS,
  resolveJobStatus,
  normalizeStatus,
  isValidStatus,
  isValidTransition,
};
