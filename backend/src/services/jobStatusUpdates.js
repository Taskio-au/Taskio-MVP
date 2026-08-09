'use strict';

const { logger } = require('../observability/logger');
const { normalizeStatus, isValidTransition } = require('../constants/jobStatuses');
const { resolveJobStatus } = require('../../../shared/jobStatusesCore');

/**
 * Log and throw when transition is not allowed (use inside transactions before tx.update).
 */
function validateJobTransitionOrThrow(fromRaw, toRaw, context = {}) {
  const from = normalizeStatus(fromRaw);
  const to = normalizeStatus(toRaw);
  if (!isValidTransition(from, to)) {
    logger.warn({
      message: 'invalid_job_status_transition',
      ...context,
      from,
      to,
    });
    const err = new Error('Invalid status transition');
    err.code = 'invalid_status_transition';
    err.from = from;
    err.to = to;
    throw err;
  }
}

/**
 * Controlled job status update: validates transition, sets updatedAt, logs on failure.
 * @param {FirebaseFirestore.Firestore} db
 * @param {import('firebase-admin')} admin
 * @param {FirebaseFirestore.DocumentReference} jobRef
 * @param {string} newStatusRaw
 * @param {object} [extraFields]
 * @param {FirebaseFirestore.Transaction} [tx]
 */
async function updateJobStatus(db, admin, jobRef, newStatusRaw, extraFields = {}, tx = null) {
  const next = resolveJobStatus(newStatusRaw).status;

  const run = async (transaction) => {
    const snap = await transaction.get(jobRef);
    if (!snap.exists) {
      const err = new Error('Job not found');
      err.code = 'not_found';
      throw err;
    }
    const cur = normalizeStatus(snap.data().status);
    if (!isValidTransition(cur, next)) {
      logger.warn({
        message: 'invalid_job_status_transition',
        jobId: jobRef.id,
        from: cur,
        to: next,
      });
      const err = new Error('Invalid status transition');
      err.code = 'invalid_status_transition';
      err.from = cur;
      err.to = next;
      throw err;
    }
    transaction.update(jobRef, {
      status: next,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      ...extraFields,
    });
  };

  if (tx) {
    await run(tx);
    return;
  }
  await db.runTransaction((transaction) => run(transaction));
}

module.exports = { updateJobStatus, validateJobTransitionOrThrow };
