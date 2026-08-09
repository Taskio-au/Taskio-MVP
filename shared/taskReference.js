'use strict';

/**
 * Deterministic TSK-xxxx from Firestore job id (matches frontend/src/utils/taskReference.js).
 * @param {string} jobId
 * @returns {string}
 */
function getTaskReferenceCode(jobId) {
  if (!jobId || typeof jobId !== 'string') return 'TSK-0000';
  let h = 0;
  for (let i = 0; i < jobId.length; i += 1) {
    h = (Math.imul(31, h) + jobId.charCodeAt(i)) | 0;
  }
  const n = (Math.abs(h) % 9000) + 1000;
  return `TSK-${n}`;
}

/**
 * Same logic as frontend/src/utils/taskReference.js — prefer human taskNumber when set.
 * @param {string | { id?: string, taskNumber?: number|string, referenceNumber?: number|string }} jobOrId
 * @returns {string}
 */
function getShortJobRef(jobOrId) {
  const job = jobOrId && typeof jobOrId === 'object' ? jobOrId : null;
  const id = job?.id ?? (typeof jobOrId === 'string' ? jobOrId : '');
  if (!id) return 'TSK-0000';

  const rawNum = job?.taskNumber ?? job?.referenceNumber;
  if (rawNum != null && String(rawNum).trim() !== '') {
    const n = Number(rawNum);
    if (Number.isFinite(n) && n >= 0) {
      const int = Math.min(Math.floor(Math.abs(n)), 999999);
      return `TSK-${String(int).padStart(4, '0')}`;
    }
  }
  return getTaskReferenceCode(id);
}

module.exports = { getTaskReferenceCode, getShortJobRef };
