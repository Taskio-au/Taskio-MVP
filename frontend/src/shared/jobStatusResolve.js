/**
 * Mirrors shared/jobStatusesCore.js#resolveJobStatus — keep behaviour identical.
 */
import { JOB_STATUSES, LEGACY_STATUS_MAP } from './jobStatusesConstants.generated.js';

const VALID_STATUSES = Object.values(JOB_STATUSES);

/**
 * @returns {{ status: string, unknown: boolean, rawInput: string }}
 */
export function resolveJobStatus(raw) {
  const rawInput = raw === undefined || raw === null ? '' : String(raw);
  const cleaned = rawInput.trim();

  if (!cleaned) {
    return { status: JOB_STATUSES.OPEN, unknown: false, rawInput };
  }

  const upperStatus = cleaned.toUpperCase();
  if (VALID_STATUSES.includes(upperStatus)) {
    return { status: upperStatus, unknown: false, rawInput };
  }

  const lowerStatus = cleaned.toLowerCase();
  if (LEGACY_STATUS_MAP[lowerStatus]) {
    return { status: LEGACY_STATUS_MAP[lowerStatus], unknown: false, rawInput };
  }

  return { status: JOB_STATUSES.OPEN, unknown: true, rawInput };
}
