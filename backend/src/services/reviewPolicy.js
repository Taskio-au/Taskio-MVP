'use strict';

const { JOB_STATUSES, normalizeStatus } = require('../constants/jobStatuses');
const { safeToMillis } = require('../utils/firestore');

const REVIEW_WINDOW_MS = 14 * 24 * 60 * 60 * 1000;

function reviewPartyForUid(job, uid) {
  if (job?.homeownerUid === uid) return 'homeowner';
  if (job?.acceptedTradieUid === uid) return 'tradie';
  return null;
}

function releaseAnchorMs(job) {
  return safeToMillis(job?.releasedAt)
    || safeToMillis(job?.paymentReleasedAt)
    || safeToMillis(job?.paidAt)
    || 0;
}

function isPaidRelease(job) {
  const status = normalizeStatus(job?.status);
  if (job?.paymentState !== 'released') return false;
  if (status === JOB_STATUSES.PAID) return true;
  // Explicit compatibility for records written before PAID was canonical.
  return status === JOB_STATUSES.COMPLETED
    && Boolean(job?.releasedAt || job?.paymentReleasedAt || job?.transferId);
}

function reviewDeadlineMs(job) {
  const anchor = releaseAnchorMs(job);
  return anchor > 0 ? anchor + REVIEW_WINDOW_MS : 0;
}

function legacyAwareSubmissions(existing) {
  const source = existing || {};
  const submissions = source.submissions && typeof source.submissions === 'object'
    ? { ...source.submissions }
    : {};
  if (!submissions.homeowner && typeof source.rating === 'number') {
    submissions.homeowner = {
      reviewerUid: source.homeownerUid || null,
      reviewerRole: 'homeowner',
      subjectUid: source.tradieUid || null,
      rating: source.rating,
      text: source.text || '',
      createdAt: source.createdAt || null,
    };
  }
  return submissions;
}

function isReviewPublished(review, nowMs = Date.now()) {
  if (!review) return false;
  if (review.doubleBlindComplete === true) return true;
  const visibleAfterMs = Number(review.visibleAfterMs || review.publishAtMs || 0);
  // Reviews written before the double-blind schema were already public.
  if (!visibleAfterMs && !Object.prototype.hasOwnProperty.call(review, 'doubleBlindComplete')) return true;
  return visibleAfterMs > 0 && nowMs >= visibleAfterMs;
}

function buildReviewSubmission({ job, existing, uid, rating, text, nowMs = Date.now() }) {
  const party = reviewPartyForUid(job, uid);
  if (!party) return { error: 'forbidden' };
  if (!isPaidRelease(job)) return { error: 'bad_state' };
  const deadlineMs = reviewDeadlineMs(job);
  if (!deadlineMs) return { error: 'missing_release_anchor' };
  if (nowMs > deadlineMs) return { error: 'window_closed', deadlineMs };

  const submissions = legacyAwareSubmissions(existing);
  if (submissions[party]) return { error: 'already_exists' };
  const otherParty = party === 'homeowner' ? 'tradie' : 'homeowner';
  const subjectUid = party === 'homeowner' ? job.acceptedTradieUid : job.homeownerUid;
  submissions[party] = {
    reviewerUid: uid,
    reviewerRole: party,
    subjectUid,
    rating,
    text,
    createdAtMs: nowMs,
  };
  const doubleBlindComplete = Boolean(submissions[party] && submissions[otherParty]);
  return {
    party,
    submission: submissions[party],
    submissions,
    deadlineMs,
    doubleBlindComplete,
  };
}

module.exports = {
  REVIEW_WINDOW_MS,
  buildReviewSubmission,
  isPaidRelease,
  isReviewPublished,
  legacyAwareSubmissions,
  releaseAnchorMs,
  reviewDeadlineMs,
  reviewPartyForUid,
};
