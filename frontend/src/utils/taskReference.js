/**
 * Human-friendly task reference for support (deterministic from Firestore job id).
 * @param {string} jobId
 * @returns {string} e.g. "TSK-4821"
 */
export function getTaskReferenceCode(jobId) {
    if (!jobId || typeof jobId !== 'string') return 'TSK-0000';
    let h = 0;
    for (let i = 0; i < jobId.length; i += 1) {
        h = (Math.imul(31, h) + jobId.charCodeAt(i)) | 0;
    }
    const n = (Math.abs(h) % 9000) + 1000;
    return `TSK-${n}`;
}

/**
 * Card / list reference: TSK-#### — uses job.taskNumber when set, else deterministic code from id.
 * @param {string | { id?: string, taskNumber?: number, referenceNumber?: number }} jobOrId
 * @returns {string} e.g. "TSK-4821"
 */
export function getShortJobRef(jobOrId) {
    const job = typeof jobOrId === 'object' && jobOrId != null ? jobOrId : null;
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

/**
 * @param {string} jobId
 * @returns {string} e.g. "Task #TSK-4821"
 */
export function formatTaskReferenceLabel(jobId) {
    return `Task #${getTaskReferenceCode(jobId)}`;
}

/**
 * Compact secondary line for list rows (Messages, Notifications).
 * @param {string} jobId
 * @returns {string} e.g. "Ref: TSK-4821"
 */
export function formatTaskRefRowLabel(jobId) {
    if (!jobId || typeof jobId !== 'string') return '';
    return `Ref: ${getShortJobRef(jobId)}`;
}

/**
 * Same as {@link formatTaskRefRowLabel} but accepts a full job object (taskNumber when present).
 * @param {string | { id?: string, taskNumber?: number, referenceNumber?: number }} jobOrId
 * @returns {string} e.g. "Ref: TSK-4821"
 */
export function formatTaskRefRowLabelFromJob(jobOrId) {
    const job = typeof jobOrId === 'object' && jobOrId != null ? jobOrId : null;
    const id = job?.id ?? (typeof jobOrId === 'string' ? jobOrId : '');
    if (!id) return '';
    return `Ref: ${getShortJobRef(jobOrId)}`;
}
