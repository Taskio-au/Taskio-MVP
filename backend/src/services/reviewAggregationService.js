'use strict';

const { db } = require('../firebaseAdmin');

/**
 * Compute true lifetime rating aggregate for a single expert.
 * Uses users/{tradieUid}/reviews subcollection with a field projection to avoid
 * fetching full review text across large collections.
 *
 * @param {string} tradieUid
 * @returns {Promise<{ averageRating: number|null, reviewCount: number }>}
 */
async function getExpertRatingAggregate(tradieUid) {
  const id = String(tradieUid || '').trim();
  if (!id) return { averageRating: null, reviewCount: 0 };

  const allRatingsSnap = await db
    .collection('users')
    .doc(id)
    .collection('reviews')
    .select('rating')
    .get();

  if (allRatingsSnap.empty) return { averageRating: null, reviewCount: 0 };

  let ratingSum = 0;
  let reviewCount = 0;
  allRatingsSnap.docs.forEach((docSnap) => {
    const r = docSnap.data() || {};
    if (typeof r.rating === 'number' && r.rating >= 1 && r.rating <= 5) {
      ratingSum += r.rating;
      reviewCount++;
    }
  });

  const averageRating =
    reviewCount > 0 ? Math.round((ratingSum / reviewCount) * 10) / 10 : null;

  return { averageRating, reviewCount };
}

module.exports = { getExpertRatingAggregate };
