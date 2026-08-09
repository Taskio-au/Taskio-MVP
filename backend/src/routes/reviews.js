'use strict';

const express = require('express');
const rateLimit = require('express-rate-limit');

const { admin, db } = require('../firebaseAdmin');
const { requireAuth, requireRole } = require('../middleware/auth');
const { safeToMillis } = require('../utils/firestore');
const { isNonEmptyString, isStringMax, toSafeNumber } = require('../utils/validation');
const { JOB_STATUSES, normalizeStatus } = require('../constants/jobStatuses');
const { getExpertRatingAggregate } = require('../services/reviewAggregationService');

const router = express.Router();

const publicReadLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
});

const writeLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
});

function clampInt(n, min, max) {
  if (!Number.isFinite(n)) return null;
  const i = Math.round(n);
  return Math.min(Math.max(i, min), max);
}

/**
 * GET /api/jobs/:jobId/review (homeowner-only)
 * Returns the review for this job if it exists.
 */
router.get('/api/jobs/:jobId/review', requireAuth, requireRole('homeowner'), async (req, res) => {
  try {
    const { jobId } = req.params;
    const homeownerUid = req.user.uid;

    const jobDoc = await db.collection('jobs').doc(jobId).get();
    if (!jobDoc.exists) return res.status(404).send({ message: 'Task not found.' });
    const job = jobDoc.data() || {};
    if (job.homeownerUid !== homeownerUid) return res.status(403).send({ message: 'Forbidden: You do not own this task.' });

    const reviewDoc = await db.collection('reviews').doc(jobId).get();
    if (!reviewDoc.exists) return res.status(200).send({ review: null });
    const r = reviewDoc.data() || {};

    return res.status(200).send({
      review: {
        id: reviewDoc.id,
        jobId: r.jobId || jobId,
        tradieUid: r.tradieUid || null,
        rating: typeof r.rating === 'number' ? r.rating : null,
        text: r.text || '',
        createdAt: safeToMillis(r.createdAt),
      },
    });
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('Error fetching job review:', error);
    return res.status(500).send({ message: 'Failed to fetch review.' });
  }
});

/**
 * POST /api/jobs/:jobId/review (homeowner-only)
 * Create a review after job completion + payment release.
 *
 * Body: { rating: 1..5, text?: string }
 * Idempotent: one review per jobId (review doc id = jobId)
 */
router.post('/api/jobs/:jobId/review', requireAuth, requireRole('homeowner'), writeLimiter, async (req, res) => {
  try {
    const { jobId } = req.params;
    const homeownerUid = req.user.uid;
    const { rating, text } = req.body || {};

    const r = clampInt(toSafeNumber(rating), 1, 5);
    if (!r) return res.status(400).send({ message: 'Rating must be an integer from 1 to 5.' });
    if (!isStringMax(text, 1000)) return res.status(400).send({ message: 'Review text is too long (max 1000 chars).' });

    const jobRef = db.collection('jobs').doc(jobId);
    const reviewRef = db.collection('reviews').doc(jobId);

    await db.runTransaction(async (tx) => {
      const [jobDoc, existingReview] = await Promise.all([tx.get(jobRef), tx.get(reviewRef)]);
      if (!jobDoc.exists) {
        const err = new Error('not_found');
        err.code = 'not_found';
        throw err;
      }

      const job = jobDoc.data() || {};
      if (job.homeownerUid !== homeownerUid) {
        const err = new Error('forbidden');
        err.code = 'forbidden';
        throw err;
      }

      // Only allow after escrow release (completed)
      const normalizedStatus = normalizeStatus(job.status);
      if (![JOB_STATUSES.COMPLETED, JOB_STATUSES.PAID].includes(normalizedStatus) || job.paymentState !== 'released') {
        const err = new Error('bad_state');
        err.code = 'bad_state';
        err.status = job.status;
        err.paymentState = job.paymentState;
        throw err;
      }

      const tradieUid = job.acceptedTradieUid;
      if (!tradieUid) {
        const err = new Error('missing_tradie');
        err.code = 'missing_tradie';
        throw err;
      }

      if (existingReview.exists) {
        const err = new Error('already_exists');
        err.code = 'already_exists';
        throw err;
      }

      const payload = {
        jobId,
        homeownerUid,
        tradieUid,
        rating: r,
        text: isNonEmptyString(text) ? String(text).trim() : '',
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      };

      // Store canonical review (docId = jobId)
      tx.set(reviewRef, payload);

      // Also write under tradie subcollection to enable ordering without composite indexes
      // (Query: users/{tradieUid}/reviews orderBy createdAt)
      const tradieReviewRef = db.collection('users').doc(tradieUid).collection('reviews').doc(jobId);
      tx.set(tradieReviewRef, payload);
    });

    return res.status(201).send({ message: 'Review submitted.' });
  } catch (error) {
    if (error?.code === 'not_found') return res.status(404).send({ message: 'Task not found.' });
    if (error?.code === 'forbidden') return res.status(403).send({ message: 'Forbidden: You do not own this task.' });
    if (error?.code === 'bad_state') {
      return res.status(409).send({ message: `Cannot review yet (status: ${error.status}, paymentState: ${error.paymentState}).` });
    }
    if (error?.code === 'missing_tradie') return res.status(409).send({ message: 'Cannot review: task is missing the assigned expert.' });
    if (error?.code === 'already_exists') return res.status(409).send({ message: 'Review already submitted for this task.' });
    // eslint-disable-next-line no-console
    console.error('Error creating review:', error);
    return res.status(500).send({ message: 'Failed to submit review.' });
  }
});

/**
 * GET /api/tradies/:tradieUid/reviews (public)
 * Returns recent reviews for an expert. No reviewer PII.
 *
 * Response shape:
 *   reviews        — limited recent public reviews (for display)
 *   averageRating  — true lifetime average (all reviews, not just the page)
 *   reviewCount    — true lifetime review count
 *   count          — alias for reviewCount (backward compat)
 */
router.get('/api/tradies/:tradieUid/reviews', publicReadLimiter, async (req, res) => {
  try {
    const tradieUid = String(req.params.tradieUid || '').trim();
    if (!tradieUid) return res.status(400).send({ message: 'tradieUid is required.' });

    const limitRaw = Number(req.query.limit || 20);
    const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(limitRaw, 1), 50) : 20;

    // Two queries in parallel:
    //  1. Recent limited page (for display)
    //  2. Lifetime rating aggregate (via shared helper — same logic used when enriching quote cards)
    const reviewsRef = db
      .collection('users')
      .doc(tradieUid)
      .collection('reviews');

    const [pageSnap, aggregate] = await Promise.all([
      reviewsRef.orderBy('createdAt', 'desc').limit(limit).get(),
      getExpertRatingAggregate(tradieUid),
    ]);

    // Build the public review list (no homeowner PII)
    const reviews = pageSnap.empty ? [] : pageSnap.docs.map((docSnap) => {
      const r = docSnap.data() || {};
      return {
        id: docSnap.id,
        jobId: r.jobId || docSnap.id,
        rating: typeof r.rating === 'number' ? r.rating : null,
        text: r.text || '',
        createdAt: safeToMillis(r.createdAt),
        // Intentionally omitting: homeownerUid, tradieUid, any PII fields
      };
    });

    const { averageRating, reviewCount } = aggregate;

    return res.status(200).send({
      tradieUid,
      averageRating,
      reviewCount,
      count: reviewCount, // backward-compat alias
      reviews,
    });
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('Error fetching tradie reviews:', error);
    return res.status(500).send({ message: 'Failed to fetch reviews.' });
  }
});

module.exports = router;



