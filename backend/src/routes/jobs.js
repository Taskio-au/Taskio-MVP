'use strict';

const express = require('express');

const { admin, db } = require('../firebaseAdmin');
const { requireAuth, requireRole, ensureUserProfile } = require('../middleware/auth');
const { safeToMillis } = require('../utils/firestore');
const { isNonEmptyString, isStringMax, toSafeNumber } = require('../utils/validation');
const {
  retrievePaymentIntent,
  retrieveCheckoutSession,
  createTransfer,
  createRefund,
  getSucceededChargeIdForConnectTransfer,
} = require('../services/stripe');
const { JOB_STATUSES, isValidStatus, normalizeStatus, isValidTransition } = require('../constants/jobStatuses');
const { updateJobStatus, validateJobTransitionOrThrow } = require('../services/jobStatusUpdates');
const { phase1ExpertiseCatalog } = require('../shared/expertiseCatalog');
const { melbournePilotLocations, isSupportedMelbournePilotLocation, normalizeLocationLabel, INNER_MELBOURNE_LAUNCH_MESSAGE } = require('../../../shared/auLocations');
const { defaultPlatformFeePercentFromEnv } = require('../../../shared/feePlans');
const { getExpertRatingAggregate } = require('../services/reviewAggregationService');
const { detectPII } = require('../utils/eligibility');
const { applyVariationPaymentSuccess, isVariationPaymentMetadata } = require('../services/variationPaymentCompletion');
const {
  createExpertReleaseStripeTransfers,
  persistExpertReleaseAfterTransfers,
} = require('../services/expertJobRelease');
const {
  confirmBaseQuoteFundingIfSucceededTx,
  isAlreadyFundingComplete,
} = require('../services/baseQuoteFundingCompletion');
const { buildPostedJobTitleFromPhase1Row } = require('../../../shared/paymentDisplayTaskTitle');
const { refundFundedVariationsForCancellation } = require('../services/cancellationRefundService');
const { itemScopeText, normalizeJobItems } = require('../services/jobItems');
const { loggerForReq } = require('../observability/logger');

const router = express.Router();

const phase1CatalogMap = new Map(phase1ExpertiseCatalog.map((item) => [item.key, item]));
const PHASE1_MAX_BUDGET_DOLLARS = 300;
const PHASE1_SCOPE_MESSAGE = 'Taskio currently supports small indoor jobs under $300 and up to 2 hours. Electrical, plumbing, gas, and waterproofing work are not available yet.';
const phase1BudgetOptions = {
  under_150: { label: 'Under $150', budgetAmountCents: 15000 },
  '150_to_300': { label: '$150 - $300', budgetAmountCents: 30000 },
  not_sure_under_300: { label: 'Not sure, but under $300', budgetAmountCents: null },
};
const phase1DurationOptions = {
  under_1_hour: { label: 'Under 1 hour', maxMinutes: 60 },
  one_to_two_hours: { label: '1 to 2 hours', maxMinutes: 120 },
};
const blockedScopePattern = /\b(electrical|electrician|plumbing|plumber|gas|waterproofing)\b/i;
const overDurationPattern = /\b([3-9]|[1-9]\d)\s*(hours?|hrs?)\b|\bhalf[- ]day\b|\bfull[- ]day\b|\ball[- ]day\b/i;
const siteAccessValueOptions = {
  propertyType: new Set(['apartment_unit', 'house_townhouse']),
  liftAvailable: new Set(['yes', 'no', 'not_sure']),
  stairs: new Set(['none', 'one_flight', 'multiple_flights', 'not_sure']),
  parking: new Set(['easy', 'limited', 'none', 'not_sure']),
};
const mirrorSizeOptions = new Set(['standard', 'large_heavy']);

function toLocationLabel(location) {
  return `${location.suburb}, ${location.state} ${location.postcode}`;
}

/* -------------------------------------------------------------------------- */
/* Expert trust summary for quote cards (client-facing, safe fields only)     */
/* -------------------------------------------------------------------------- */

/**
 * Build a safe, PII-free expert object to embed in the GET /api/jobs/:jobId/quotes response.
 * Only the explicitly listed fields are included — nothing is spread from the user document.
 *
 * @param {string} uid
 * @param {object} userData - raw Firestore user doc data (may be {})
 * @param {{ averageRating: number|null, reviewCount: number }} ratingAggregate
 * @returns {object}
 */
function buildSafeExpertSummary(uid, userData, ratingAggregate) {
  const u = userData || {};

  // Name: first name only + single last-initial letter
  const rawFirst = String(u.firstName || '').trim();
  const rawLast  = String(u.lastName  || '').trim();
  const firstName  = rawFirst;
  const lastInitial = rawLast ? `${rawLast.charAt(0).toUpperCase()}.` : '';
  const name = firstName
    ? (lastInitial ? `${firstName} ${lastInitial}` : firstName)
    : '';

  // Business name: only expose when the expert explicitly operates as a business
  const isBusinessType = u.businessType && String(u.businessType).trim().toLowerCase() !== 'individual';
  const rawBusinessName = String(u.businessName || '').trim();
  const businessName = (isBusinessType && rawBusinessName) ? rawBusinessName : '';

  // Bio: only if no PII detected, capped at 200 chars
  let bio = '';
  const rawBio = String(u.bio || '').trim();
  if (rawBio) {
    const piiCheck = detectPII(rawBio);
    if (!piiCheck.hasPII) {
      bio = rawBio.slice(0, 200);
    }
  }

  // Photo URL — safe to expose
  const photoURL = u.profilePhotoURL || u.photoURL || null;

  // Verified: strictly boolean — only true when the admin has explicitly set verified === true
  const verified = u.verified === true;

  const { averageRating, reviewCount } = ratingAggregate || { averageRating: null, reviewCount: 0 };

  return {
    uid,
    firstName,
    lastInitial,
    name,
    businessName,
    bio,
    // Never return token-bearing Firebase Storage download URLs in quote/public payloads.
    profilePhotoAvailable: Boolean(u.profilePhotoPath || photoURL),
    verified,
    rating: typeof averageRating === 'number' ? averageRating : null,
    reviewsCount: typeof reviewCount === 'number' ? reviewCount : 0,
  };
}

async function recoverAcceptedTradieUid(jobRef, jobData) {
  const current = jobData && typeof jobData === 'object' ? { ...jobData } : {};
  if (current.acceptedTradieUid || !current.acceptedQuoteId) {
    return current;
  }

  const acceptedQuoteDoc = await db.collection('quotes').doc(current.acceptedQuoteId).get();
  if (!acceptedQuoteDoc.exists) {
    return current;
  }

  const acceptedQuote = acceptedQuoteDoc.data() || {};
  const acceptedTradieUid = String(acceptedQuote.tradieUid || '').trim();
  if (!acceptedTradieUid) {
    return current;
  }

  await jobRef.update({
    acceptedTradieUid,
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  });

  return {
    ...current,
    acceptedTradieUid,
  };
}

/**
 * Homeowner dashboard cards: attach assigned expert summary (real data only; no placeholders).
 */
async function attachHomeownerJobExpertSummary(jobData) {
  const uid = jobData.acceptedTradieUid ? String(jobData.acceptedTradieUid).trim() : '';
  const assigned = Boolean(uid);
  jobData.expertAssigned = assigned;
  jobData.assignedExpertId = assigned ? uid : null;
  if (!assigned) {
    jobData.expert = null;
    delete jobData.expertId;
    return jobData;
  }

  try {
    const userDoc = await db.collection('users').doc(uid).get();
    const u = userDoc.exists ? userDoc.data() || {} : {};
    const displayName = String(u.displayName || u.name || '').trim();
    const parts = displayName.split(/\s+/).filter(Boolean);
    const firstName = parts[0] || '';
    const lastInitial = parts.length > 1 ? `${String(parts[parts.length - 1]).charAt(0).toUpperCase()}.` : '';

    const reviewSnap = await db.collection('users').doc(uid).collection('reviews').limit(100).get();
    let ratingSum = 0;
    let ratingCount = 0;
    reviewSnap.docs.forEach((d) => {
      const r = (d.data() || {}).rating;
      if (typeof r === 'number' && Number.isFinite(r)) {
        ratingSum += r;
        ratingCount += 1;
      }
    });
    const rating = ratingCount > 0 ? Math.round((ratingSum / ratingCount) * 10) / 10 : null;
    const reviewsCount = ratingCount;

    const expert = { expertId: uid };
    if (firstName) expert.firstName = firstName;
    if (lastInitial) expert.lastInitial = lastInitial;
    if (displayName) expert.name = displayName;
    if (rating != null) expert.rating = rating;
    if (reviewsCount > 0) expert.reviewsCount = reviewsCount;

    jobData.expertId = uid;
    jobData.expert = expert;
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error('attachHomeownerJobExpertSummary failed:', e);
    jobData.expert = null;
  }
  return jobData;
}

function getReleasePaymentErrorResponse(error) {
  if (!error || typeof error !== 'object') {
    return null;
  }

  if (error.code === 'balance_insufficient') {
    return {
      status: 409,
      message: 'Payment was collected, but Stripe cannot release funds yet because the platform balance is not available. If you are testing, use Stripe test funds or try again after the balance becomes available.',
    };
  }

  return null;
}

function normalizeLocationPayload(input) {
  if (!input) return null;

  if (typeof input === 'string') {
    const normalizedInput = normalizeLocationLabel(input);
    const match = melbournePilotLocations.find((item) => normalizeLocationLabel(toLocationLabel(item)) === normalizedInput);
    if (!match) return null;
    return {
      label: toLocationLabel(match),
      suburb: match.suburb,
      state: match.state,
      postcode: match.postcode,
      country: 'AU',
      coordinates: {
        latitude: match.latitude ?? null,
        longitude: match.longitude ?? null,
      },
    };
  }

  if (typeof input !== 'object') return null;

  const suburb = String(input.suburb || '').trim();
  const state = String(input.state || '').trim().toUpperCase();
  const postcode = String(input.postcode || '').trim();
  const match = melbournePilotLocations.find(
    (item) => item.suburb === suburb && item.state === state && item.postcode === postcode
  );
  if (!match) return null;

  return {
    label: toLocationLabel(match),
    suburb: match.suburb,
    state: match.state,
    postcode: match.postcode,
    country: 'AU',
    coordinates: {
      latitude: match.latitude ?? null,
      longitude: match.longitude ?? null,
    },
  };
}

function validateSiteAccess(input) {
  if (!input || typeof input !== 'object') return null;
  const propertyType = String(input.propertyType || '').trim();
  const liftAvailable = String(input.liftAvailable || '').trim();
  const stairs = String(input.stairs || '').trim();
  const parking = String(input.parking || '').trim();
  if (!siteAccessValueOptions.propertyType.has(propertyType)) return null;
  if (!siteAccessValueOptions.liftAvailable.has(liftAvailable)) return null;
  if (!siteAccessValueOptions.stairs.has(stairs)) return null;
  if (!siteAccessValueOptions.parking.has(parking)) return null;
  return { propertyType, liftAvailable, stairs, parking };
}

function validateJobDetails(jobType, input) {
  if (!input || typeof input !== 'object') {
    return { mirrorSize: '' };
  }
  const mirrorSize = String(input.mirrorSize || '').trim();
  if (String(jobType).trim() === 'mounting_mirrors') {
    if (!mirrorSizeOptions.has(mirrorSize)) {
      return null;
    }
    return { mirrorSize };
  }
  return { mirrorSize: '' };
}

function normalizePostingPhotos(input, jobId) {
  if (!Array.isArray(input)) return null;
  const normalized = input
    .map((photo) => {
      if (!photo || typeof photo !== 'object') return null;
      const fileName = String(photo.fileName || '').trim();
      const mimeType = String(photo.mimeType || '').trim();
      const storagePath = String(photo.storagePath || '').trim();
      const downloadUrl = String(photo.downloadUrl || '').trim();
      const fileSize = Number(photo.fileSize);
      if (!fileName || !mimeType.startsWith('image/') || !storagePath || !downloadUrl) return null;
      if (!storagePath.startsWith(`job-posting-attachments/${jobId}/`)) return null;
      if (!Number.isFinite(fileSize) || fileSize <= 0 || fileSize > 10 * 1024 * 1024) return null;
      return {
        fileName,
        mimeType,
        storagePath,
        downloadUrl,
        fileSize: Math.round(fileSize),
      };
    })
    .filter(Boolean);
  return normalized.length === input.length ? normalized : null;
}

function hasOverBudgetMention(text) {
  const matches = String(text || '').match(/\$\s*([0-9]{3,4})\b/g) || [];
  return matches.some((match) => {
    const amount = Number(String(match).replace(/[^0-9]/g, ''));
    return Number.isFinite(amount) && amount > PHASE1_MAX_BUDGET_DOLLARS;
  });
}

function isOutOfPhase1Scope({ title, description }) {
  const combined = `${String(title || '')} ${String(description || '')}`.trim();
  if (!combined) return false;
  return blockedScopePattern.test(combined) || overDurationPattern.test(combined) || hasOverBudgetMention(combined);
}

async function getHomeownerProfile(uid) {
  const snap = await db.collection('users').doc(uid).get();
  return snap.exists ? (snap.data() || {}) : {};
}

function hasQuoteAccess(profile, decodedToken) {
  if (profile.quoteAccessVerified === true) return true;
  if (profile.accountCompleted === true) return true;
  if (decodedToken?.email_verified === true) return true;
  if (profile.emailVerified === true) return true;
  return false;
}

function hasCompletedHomeownerAccount(profile, decodedToken) {
  const phoneVerified = profile.phoneVerified === true || !!decodedToken?.phone_number;
  const emailVerified = profile.emailVerified === true || decodedToken?.email_verified === true;
  const hasFirstName = Boolean(
    String(profile.firstName || '').trim()
    || String(profile.displayName || profile.name || '').trim()
  );
  return phoneVerified && emailVerified && hasFirstName;
}

/* -------------------------------------------------------------------------- */
/* Jobs (Homeowner)                                                            */
/* -------------------------------------------------------------------------- */

// Create Job Endpoint - PROTECTED (Homeowner)
router.post('/api/jobs', requireAuth, ensureUserProfile({ defaultRole: 'homeowner' }), requireRole('homeowner'), async (req, res) => {
  try {
    const {
      jobType, primaryCategory, items, title, description, location, timeline,
      budget, estimatedDuration, siteAccess, details,
    } = req.body;
    const homeownerUid = req.user.uid;

    const normalizedItems = normalizeJobItems({ jobType, primaryCategory, items });
    if (normalizedItems.error) return res.status(400).send({ message: normalizedItems.error });
    if (!isNonEmptyString(description)) {
      return res.status(400).send({ message: 'Description is required.' });
    }
    if (title && !isStringMax(title, 140)) {
      return res.status(400).send({ message: 'Title or description is too long.' });
    }
    if (!isStringMax(description, 5000)) {
      return res.status(400).send({ message: 'Title or description is too long.' });
    }
    if (!isStringMax(timeline, 80)) {
      return res.status(400).send({ message: 'Location or timeline is too long.' });
    }
    if (!isNonEmptyString(estimatedDuration) || !phase1DurationOptions[String(estimatedDuration).trim()]) {
      return res.status(400).send({ message: 'Please confirm the job fits within our current duration limit.' });
    }
    const normalizedLocation = normalizeLocationPayload(location);
    if (!normalizedLocation || !isSupportedMelbournePilotLocation(normalizedLocation)) {
      return res.status(400).send({ message: INNER_MELBOURNE_LAUNCH_MESSAGE });
    }
    const normalizedSiteAccess = validateSiteAccess(siteAccess);
    if (!normalizedSiteAccess) {
      return res.status(400).send({ message: 'Please confirm lift, stairs, and parking details.' });
    }
    const includesMirror = normalizedItems.items.some((item) => item.type === 'mounting_mirrors');
    const normalizedDetails = validateJobDetails(includesMirror ? 'mounting_mirrors' : normalizedItems.primaryJobType, details);
    if (!normalizedDetails) {
      return res.status(400).send({ message: 'Please confirm whether the mirror is standard or large/heavy.' });
    }
    const selectedJobTypeRow = normalizedItems.primaryRow;
    const customLead = normalizedItems.items.find((item) => item.type === 'custom')?.customDescription || '';
    const generatedTitle = selectedJobTypeRow
      ? buildPostedJobTitleFromPhase1Row(selectedJobTypeRow, normalizedLocation)
      : `${customLead} in ${normalizedLocation.suburb}`.trim().slice(0, 140);
    const normalizedTitle = isNonEmptyString(title) && String(title).trim() !== 'Task'
      ? String(title).trim()
      : generatedTitle;
    if (isOutOfPhase1Scope({ title: normalizedTitle, description: `${description} ${itemScopeText(normalizedItems.items)}` })) {
      return res.status(400).send({ message: PHASE1_SCOPE_MESSAGE });
    }

    const selectedJobType = selectedJobTypeRow;
    const selectedDuration = phase1DurationOptions[String(estimatedDuration).trim()];

    let budgetValue = null; // what we store in job.budget (string label or number)
    let budgetAmountCents = null; // optional numeric for internal use

    if (budget === null || budget === undefined || budget === '') {
      budgetValue = null;
    } else if (typeof budget === 'string') {
      const selectedBudget = phase1BudgetOptions[budget.trim()];
      if (!selectedBudget) {
        return res.status(400).send({ message: 'Invalid budget provided.' });
      }
      budgetValue = selectedBudget.label;
      budgetAmountCents = selectedBudget.budgetAmountCents;
    } else {
      const budgetNum = toSafeNumber(budget);
      if (Number.isNaN(budgetNum) || budgetNum < 0 || budgetNum > PHASE1_MAX_BUDGET_DOLLARS) {
        return res.status(400).send({ message: 'Invalid budget provided.' });
      }
      budgetValue = budgetNum;
      budgetAmountCents = Math.round(budgetNum * 100);
    }

    const jobData = {
      homeownerUid,
      jobType: normalizedItems.primaryJobType,
      jobTypeLabel: selectedJobType?.label || customLead,
      jobTypeCategory: normalizedItems.primaryCategory,
      primaryCategory: normalizedItems.primaryCategory,
      items: normalizedItems.items,
      title: normalizedTitle,
      description: description.trim(),
      location: normalizedLocation.label,
      locationSuburb: normalizedLocation.suburb,
      locationState: normalizedLocation.state,
      locationPostcode: normalizedLocation.postcode,
      locationCountry: normalizedLocation.country,
      locationCoordinates: normalizedLocation.coordinates,
      siteAccess: normalizedSiteAccess,
      details: normalizedDetails,
      postingPhotos: [],
      estimatedDuration: String(estimatedDuration).trim(),
      estimatedDurationLabel: selectedDuration.label,
      phase1ScopeVersion: 'melbourne_v1',
      timeline: timeline || '',
      budget: budgetValue,
      budgetAmountCents,
      status: JOB_STATUSES.OPEN,
      paymentState: null, // No payment state initially
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      invitedTradieUids: [],
    };

    const jobRef = await db.collection('jobs').add(jobData);
    return res.status(201).send({ message: 'Task created successfully', jobId: jobRef.id });
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('Error creating job:', error);
    return res.status(500).send({ message: 'Failed to create task' });
  }
});

router.post('/api/jobs/:id/photos', requireAuth, ensureUserProfile({ defaultRole: 'homeowner' }), requireRole('homeowner'), async (req, res) => {
  try {
    const jobId = String(req.params.id || '').trim();
    const photos = normalizePostingPhotos(req.body?.photos, jobId);
    if (!jobId || !photos) {
      return res.status(400).send({ message: 'Please provide valid job photos.' });
    }

    const jobRef = db.collection('jobs').doc(jobId);
    const jobSnap = await jobRef.get();
    if (!jobSnap.exists) {
      return res.status(404).send({ message: 'Task not found.' });
    }
    const jobData = jobSnap.data() || {};
    if (jobData.homeownerUid !== req.user.uid) {
      return res.status(403).send({ message: 'Forbidden: You do not have access to this task.' });
    }

    await jobRef.update({ postingPhotos: photos });
    return res.status(200).send({ message: 'Job photos saved successfully.' });
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('Error saving job photos:', error);
    return res.status(500).send({ message: 'Failed to save job photos' });
  }
});

// Get Job by ID Endpoint (owner or admin only)
router.get('/api/jobs/:id', requireAuth, async (req, res) => {
  try {
    const jobId = req.params.id;
    const jobRef = db.collection('jobs').doc(jobId);
    const jobDoc = await jobRef.get();

    if (!jobDoc.exists) return res.status(404).send({ message: 'Task not found' });

    const jobData = await recoverAcceptedTradieUid(jobRef, jobDoc.data());
    const isAdmin = req.user.admin === true;

    if (jobData.homeownerUid !== req.user.uid && !isAdmin) {
      return res.status(403).send({ message: 'Forbidden: You do not have access to this task.' });
    }

    return res.status(200).send({ id: jobDoc.id, ...jobData });
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('Error fetching job:', error);
    return res.status(500).send({ message: 'Failed to fetch task' });
  }
});

// Get Jobs for a specific Homeowner
router.get('/api/homeowner/jobs', requireAuth, requireRole('homeowner'), async (req, res) => {
  try {
    const homeownerUid = req.user.uid;

    const jobsSnapshot = await db.collection('jobs').where('homeownerUid', '==', homeownerUid).get();
    if (jobsSnapshot.empty) return res.status(200).send([]);

    const jobsDataPromises = jobsSnapshot.docs.map(async (doc) => {
      let jobData = await recoverAcceptedTradieUid(doc.ref, { id: doc.id, ...doc.data() });

      const quotesSnapshot = await db.collection('quotes').where('jobId', '==', doc.id).get();
      jobData.quoteCount = quotesSnapshot.docs
        .map((quoteDoc) => quoteDoc.data() || {})
        .filter((quote) => isHomeownerVisibleQuoteStatus(quote.status))
        .length;

      jobData = await attachHomeownerJobExpertSummary(jobData);
      return jobData;
    });

    const jobsWithQuotes = await Promise.all(jobsDataPromises);
    const recencyMillis = (job) => safeToMillis(job.updatedAt) || safeToMillis(job.createdAt);
    jobsWithQuotes.sort((a, b) => recencyMillis(b) - recencyMillis(a));
    return res.status(200).send(jobsWithQuotes);
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error("Error fetching homeowner's jobs:", error);
    return res.status(500).send({ message: 'Failed to fetch tasks' });
  }
});

// Get all quotes for a specific job (for the job owner)
router.get('/api/jobs/:jobId/quotes', requireAuth, requireRole('homeowner'), async (req, res) => {
  try {
    const { jobId } = req.params;
    const homeownerUid = req.user.uid;
    const homeownerProfile = await getHomeownerProfile(homeownerUid);
    if (!hasQuoteAccess(homeownerProfile, req.user)) {
      return res.status(403).send({ message: 'Please verify your phone or email to view quotes.', code: 'quote_access_required' });
    }

    const jobDoc = await db.collection('jobs').doc(jobId).get();
    if (!jobDoc.exists || jobDoc.data().homeownerUid !== homeownerUid) {
      return res.status(403).send({ message: 'Forbidden: You do not have access to this task.' });
    }

    const quotesSnapshot = await db.collection('quotes').where('jobId', '==', jobId).get();
    if (quotesSnapshot.empty) return res.status(200).send([]);

    const rawQuotes = quotesSnapshot.docs
      .map(doc => ({ id: doc.id, ...doc.data() }))
      .filter((quote) => isHomeownerVisibleQuoteStatus(quote.status));
    rawQuotes.sort((a, b) => safeToMillis(b.createdAt) - safeToMillis(a.createdAt));

    // Enrich each quote with a safe expert summary (one batch fetch + parallel rating aggregates)
    const distinctExpertUids = [...new Set(rawQuotes.map(q => q.tradieUid).filter(Boolean))];
    let expertById = new Map();
    if (distinctExpertUids.length > 0) {
      const userRefs = distinctExpertUids.map(uid => db.collection('users').doc(uid));
      const [userSnaps, ...aggregates] = await Promise.all([
        db.getAll(...userRefs),
        ...distinctExpertUids.map(uid => getExpertRatingAggregate(uid)),
      ]);
      distinctExpertUids.forEach((uid, i) => {
        const userData = userSnaps[i] && userSnaps[i].exists ? userSnaps[i].data() : {};
        expertById.set(uid, buildSafeExpertSummary(uid, userData, aggregates[i]));
      });
    }

    // Build an explicit allow-list DTO — never spread raw quote doc data
    const quotes = rawQuotes.map(q => ({
      id: q.id,
      jobId: q.jobId || jobId,
      tradieUid: q.tradieUid || null,
      amount: q.amount,
      amountCents: q.amountCents,
      message: q.message || '',
      status: q.status,
      version: q.version || 1,
      createdAt: safeToMillis(q.createdAt),
      updatedAt: safeToMillis(q.updatedAt),
      expert: expertById.get(q.tradieUid) || buildSafeExpertSummary(q.tradieUid || '', {}, { averageRating: null, reviewCount: 0 }),
    }));

    return res.status(200).send(quotes);
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('Error fetching quotes for job:', error);
    return res.status(500).send({ message: 'Failed to fetch quotes' });
  }
});

/* -------------------------------------------------------------------------- */
/* Quotes (Tradie submits)                                                     */
/* -------------------------------------------------------------------------- */
const { computeEligibility, computeStripeOnboardingComplete } = require('../utils/v11TradieEligibility');

/** Try to reconcile a paid Stripe Checkout / PI with Firestore before minting another Checkout Session. */
async function reconcileBaseQuoteStripeBeforeNewCheckout(jobRef) {
  try {
    const snap = await jobRef.get();
    if (!snap.exists) return { kind: 'continue' };
    const j = snap.data() || {};

    const pidStored = j.paymentIntentId;
    if (pidStored) {
      try {
        const pid = typeof pidStored === 'string' ? pidStored : pidStored?.id;
        if (pid) {
          const pi = await retrievePaymentIntent(pid);
          if (pi?.status === 'succeeded') {
            await confirmBaseQuoteFundingIfSucceededTx(db, admin, jobRef, pi, {
              paymentCheckoutSessionId: j.paymentCheckoutSessionId || undefined,
            });
            return { kind: 'already_confirmed' };
          }
        }
      } catch (_) {
        /* fall through — Stripe may still be creating the PI */
      }
    }

    const sid = j.paymentCheckoutSessionId;
    if (sid) {
      try {
        const sess = await retrieveCheckoutSession(sid);
        const canReuseOpen = sess?.status === 'open' && sess?.payment_status === 'unpaid';
        if (canReuseOpen) {
          return { kind: 'reuse_open', sessionId: sid };
        }
        if (sess?.payment_status === 'paid') {
          let piRaw = sess.payment_intent;
          const piResolved =
            typeof piRaw === 'string'
              ? await retrievePaymentIntent(piRaw)
              : piRaw && typeof piRaw === 'object'
                ? piRaw
                : null;
          if (piResolved?.status === 'succeeded') {
            await confirmBaseQuoteFundingIfSucceededTx(db, admin, jobRef, piResolved, {
              paymentCheckoutSessionId: sess.id,
            });
            return { kind: 'already_confirmed' };
          }
        }
        return { kind: 'continue', replaceSessionId: sid };
      } catch (_) {
        return { kind: 'retry_later' };
      }
    }

    return { kind: 'continue' };
  } catch (_) {
    return { kind: 'continue' };
  }
}

function parseDobForAge(userDoc) {
  const dob = userDoc?.dob;
  if (!dob || typeof dob !== 'object') return null;
  const day = Number(dob.day);
  const month = Number(dob.month);
  const year = Number(dob.year);
  if (!Number.isFinite(day) || !Number.isFinite(month) || !Number.isFinite(year)) return null;
  if (year < 1900 || year > 2100) return null;
  if (month < 1 || month > 12) return null;
  if (day < 1 || day > 31) return null;
  const d = new Date(Date.UTC(year, month - 1, day));
  if (d.getUTCFullYear() !== year || (d.getUTCMonth() + 1) !== month || d.getUTCDate() !== day) return null;
  return { day, month, year };
}

function ageYearsFromDob(dobObj, now = new Date()) {
  if (!dobObj) return null;
  const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  let age = today.getUTCFullYear() - dobObj.year;
  const m = today.getUTCMonth() + 1;
  const d = today.getUTCDate();
  if (m < dobObj.month || (m === dobObj.month && d < dobObj.day)) age -= 1;
  return age;
}

function isHomeownerVisibleQuoteStatus(status) {
  const normalized = String(status || '').trim().toLowerCase();
  return normalized === 'submitted' || normalized === 'accepted';
}

router.post('/api/jobs/:id/quotes', requireAuth, requireRole('tradie'), async (req, res) => {
  try {
    const jobId = req.params.id;
    const tradieUid = req.user.uid;
    const { amount, message } = req.body;

    const amt = toSafeNumber(amount);
    if (Number.isNaN(amt) || amt <= 0 || !isNonEmptyString(message) || !isStringMax(message, 2000)) {
      return res.status(400).send({ message: 'Invalid quote data. Please provide a positive amount and a message.' });
    }
    const amountCents = Math.round(amt * 100);
    if (!Number.isFinite(amountCents) || amountCents <= 0 || amountCents > 5000000 * 100) {
      return res.status(400).send({ message: 'Invalid quote amount.' });
    }

    // Enforce invitation to prevent quote spam/leaks; aligns with /api/tradie/jobs visibility
    const jobDoc = await db.collection('jobs').doc(jobId).get();
    if (!jobDoc.exists) return res.status(404).send({ message: 'Task not found' });
    const jobData = jobDoc.data();
    if (!Array.isArray(jobData.invitedTradieUids) || !jobData.invitedTradieUids.includes(tradieUid)) {
      return res.status(403).send({ message: 'Forbidden: You are not invited to quote on this task.' });
    }
    
    // Normalize status for backward compatibility
    const currentStatus = normalizeStatus(jobData.status);
    
    // Allow quotes when job is OPEN or QUOTED (not yet assigned to specific tradie)
    if (currentStatus !== JOB_STATUSES.OPEN && currentStatus !== JOB_STATUSES.QUOTED) {
      return res.status(400).send({ message: `Cannot submit quote for task with status: ${currentStatus}` });
    }

    // Load tradie profile for eligibility check
    const tradieDoc = await db.collection('users').doc(tradieUid).get();
    const tradieData = tradieDoc.exists ? tradieDoc.data() : null;

    // 18+ restriction (must-have): block if DOB missing/invalid or underage
    const dobObj = parseDobForAge(tradieData);
    const ageYears = dobObj ? ageYearsFromDob(dobObj) : null;
    if (!dobObj || !Number.isFinite(ageYears)) {
      return res.status(403).send({
        message: 'Date of birth is required to quote on tasks.',
        code: 'UNDERAGE_OR_DOB_MISSING',
        reason: 'DOB_MISSING',
      });
    }
    if (ageYears < 18) {
      return res.status(403).send({
        message: 'You must be 18+ to quote on tasks.',
        code: 'UNDERAGE_OR_DOB_MISSING',
        reason: 'UNDERAGE',
      });
    }

    // V11: enforce verified/phone/abn/stripe/profileCompleted gating (server-side)
    const v11 = computeEligibility({ decodedToken: req.user, userDoc: tradieData });
    if (!v11.eligible) {
      return res.status(403).send({
        message: 'Task expert is not eligible to quote yet.',
        code: 'TRADIE_NOT_ELIGIBLE',
        reasons: v11.reasons,
      });
    }

    const revisionReqRef = db.collection('jobs').doc(jobId).collection('quote_revision_requests').doc(tradieUid);
    const revisionReqDoc = await revisionReqRef.get();
    const hasOpenRevisionRequest = revisionReqDoc.exists && revisionReqDoc.data()?.status === 'open';

    // Detect PII/contact info in quote message
    const piiCheck = detectPII(message);
    const quoteFlagged = piiCheck.hasPII;
    const flagReasons = piiCheck.patterns;

    // Server-side enforcement: tradie must complete Stripe onboarding before participating in escrow jobs.
    if (process.env.STRIPE_ENABLED === 'true') {
      if (!tradieData || computeStripeOnboardingComplete(tradieData) !== true) {
        return res.status(403).send({
          message: 'Stripe onboarding required. Please complete your Stripe onboarding before submitting quotes.',
        });
      }
    }

    // Robust state: no silent duplicate submitted quotes.
    // Allow new quote only if:
    // - no active submitted/accepted quote exists, OR
    // - homeowner explicitly requested a revision (open revision request exists).
    const existingSnap = await db.collection('quotes')
      .where('jobId', '==', jobId)
      .where('tradieUid', '==', tradieUid)
      .limit(25)
      .get();

    const existingQuotes = existingSnap.empty ? [] : existingSnap.docs.map(d => ({ id: d.id, ...d.data() }));
    existingQuotes.sort((a, b) => safeToMillis(b.createdAt) - safeToMillis(a.createdAt));
    const latest = existingQuotes[0] || null;
    const latestStatus = latest?.status || null;
    const hasActiveSubmitted = existingQuotes.some(q => q.status === 'submitted');
    const hasActiveAccepted = existingQuotes.some(q => q.status === 'accepted');

    if ((hasActiveSubmitted || hasActiveAccepted) && !hasOpenRevisionRequest) {
      return res.status(409).send({ message: 'You have already submitted a quote for this task.' });
    }

    // Create quote in a transaction if we are submitting a revision to avoid races.
    if (hasOpenRevisionRequest && latest && (latestStatus === 'submitted' || latestStatus === 'accepted')) {
      const quoteRef = db.collection('quotes').doc();
      const prevRef = db.collection('quotes').doc(latest.id);
      const userRef = db.collection('users').doc(tradieUid);

      await db.runTransaction(async (tx) => {
        const [jobFresh, prevFresh, reqFresh] = await Promise.all([tx.get(jobDoc.ref), tx.get(prevRef), tx.get(revisionReqRef)]);
        if (!jobFresh.exists || !prevFresh.exists || !reqFresh.exists) {
          const err = new Error('not_found');
          err.code = 'not_found';
          throw err;
        }
        const jobNow = jobFresh.data();
        const prevNow = prevFresh.data();
        const reqNow = reqFresh.data();
        const jobCurrentStatus = normalizeStatus(jobNow.status);
        if (jobCurrentStatus !== JOB_STATUSES.OPEN && jobCurrentStatus !== JOB_STATUSES.QUOTED) {
          const err = new Error('bad_job_status');
          err.code = 'bad_job_status';
          throw err;
        }
        if (reqNow.status !== 'open') {
          const err = new Error('no_open_revision');
          err.code = 'no_open_revision';
          throw err;
        }
        if (prevNow.status !== 'submitted' && prevNow.status !== 'accepted') {
          const err = new Error('bad_prev_status');
          err.code = 'bad_prev_status';
          throw err;
        }

        const version = Number.isFinite(prevNow.version) ? Number(prevNow.version) + 1 : 2;
        tx.update(prevRef, { status: 'superseded', updatedAt: admin.firestore.FieldValue.serverTimestamp() });
        tx.set(revisionReqRef, { status: 'fulfilled', fulfilledAt: admin.firestore.FieldValue.serverTimestamp(), updatedAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });
        tx.set(quoteRef, {
          jobId,
          tradieUid,
          homeownerUid: jobNow.homeownerUid || null,
          amount: amt,
          amountCents,
          message: message.trim(),
          status: 'submitted',
          version,
          revisedFromQuoteId: prevRef.id,
          revisionRequestedId: revisionReqRef.id,
          flagged: quoteFlagged,
          flagReasons: quoteFlagged ? flagReasons : [],
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });

        // Ops: record last quote submitted (best-effort; used for admin dashboards)
        tx.set(userRef, { lastQuoteSubmittedAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });
      });

      return res.status(201).send({ 
        message: 'Revised quote submitted successfully', 
        quoteId: quoteRef.id,
        flagged: quoteFlagged,
        flagReasons: quoteFlagged ? flagReasons : undefined
      });
    }

    // New quote (version 1) allowed if no active submitted quote exists (or after withdraw/reject/supersede).
    const quoteRef = await db.collection('quotes').add({
      jobId,
      tradieUid,
      homeownerUid: jobData.homeownerUid || null,
      amount: amt,
      amountCents,
      message: message.trim(),
      status: 'submitted',
      version: 1,
      flagged: quoteFlagged,
      flagReasons: quoteFlagged ? flagReasons : [],
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    // Ops: record last quote submitted (best-effort; used for admin dashboards)
    try {
      await db.collection('users').doc(tradieUid).set(
        { lastQuoteSubmittedAt: admin.firestore.FieldValue.serverTimestamp() },
        { merge: true }
      );
    } catch (_) {
      // Non-blocking
    }
    
    // Auto-transition job to QUOTED when first quote is submitted
    if (currentStatus === JOB_STATUSES.OPEN) {
      await updateJobStatus(db, admin, db.collection('jobs').doc(jobId), JOB_STATUSES.QUOTED);
    }
    
    return res.status(201).send({ 
      message: 'Quote submitted successfully', 
      quoteId: quoteRef.id,
      flagged: quoteFlagged,
      flagReasons: quoteFlagged ? flagReasons : undefined
    });
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('Error submitting quote:', error);
    return res.status(500).send({ message: 'Failed to submit quote' });
  }
});

/**
 * GET /api/tradie/eligibility (tradie-only)
 * Returns tradie's quote eligibility status and profile completion details.
 */
router.get('/api/tradie/eligibility', requireAuth, requireRole('tradie'), async (req, res) => {
  try {
    const tradieUid = req.user.uid;
    
    const tradieDoc = await db.collection('users').doc(tradieUid).get();
    const tradieData = tradieDoc.exists ? tradieDoc.data() : null;
    const eligibilityCheck = computeEligibility({ decodedToken: req.user, userDoc: tradieData });
    const checklist = eligibilityCheck.checklist || {};
    const quoteReadinessItems = [
      checklist.emailVerified === true,
      checklist.phoneVerified === true,
      checklist.serviceLocationPresent === true,
      checklist.dobPresent === true && checklist.is18PlusConfirmed === true,
      checklist.businessTypeSet === true,
      checklist.abnRequired === false || (checklist.abnPresent === true && checklist.abnVerified === true),
      checklist.profileCompleted === true,
      checklist.stripeOnboardingComplete === true,
      checklist.verified === true,
    ];
    const score = Math.round((quoteReadinessItems.filter(Boolean).length / quoteReadinessItems.length) * 100);
    
    return res.status(200).send({
      eligible: eligibilityCheck.eligible,
      reason: eligibilityCheck.reasons?.[0] || null,
      missing: eligibilityCheck.reasons || [],
      reasons: eligibilityCheck.reasons || [],
      score,
      checklist,
      emailVerified: checklist.emailVerified === true,
      hasName: !!(tradieData?.displayName || tradieData?.name || tradieData?.fullName),
      hasPhoto: !!(tradieData?.profilePhotoURL || tradieData?.photoURL),
      hasBio: !!(tradieData?.bio && String(tradieData.bio).trim().length >= 20),
      hasPhone: checklist.phoneVerified === true,
      hasAbn: checklist.abnRequired === false || checklist.abnPresent === true,
      status: tradieData?.status || 'active',
      canQuote: eligibilityCheck.eligible
    });
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('Error checking eligibility:', error);
    return res.status(500).send({ message: 'Failed to check eligibility' });
  }
});

/**
 * GET /api/jobs/:jobId/my-quote (tradie-only)
 * Returns the tradie's most recent quote for this job and whether a revision was requested.
 */
router.get('/api/jobs/:jobId/my-quote', requireAuth, requireRole('tradie'), async (req, res) => {
  try {
    const { jobId } = req.params;
    const tradieUid = req.user.uid;

    const jobDoc = await db.collection('jobs').doc(jobId).get();
    if (!jobDoc.exists) return res.status(404).send({ message: 'Task not found' });
    const jobData = jobDoc.data();
    if (!Array.isArray(jobData.invitedTradieUids) || !jobData.invitedTradieUids.includes(tradieUid)) {
      return res.status(403).send({ message: 'Forbidden: You are not invited to this task.' });
    }

    const quotesSnap = await db.collection('quotes')
      .where('jobId', '==', jobId)
      .where('tradieUid', '==', tradieUid)
      .limit(25)
      .get();

    const quotes = quotesSnap.empty ? [] : quotesSnap.docs.map(d => ({ id: d.id, ...d.data() }));
    quotes.sort((a, b) => safeToMillis(b.createdAt) - safeToMillis(a.createdAt));
    const latest = quotes[0] || null;

    const revisionReqRef = db.collection('jobs').doc(jobId).collection('quote_revision_requests').doc(tradieUid);
    const revisionReqDoc = await revisionReqRef.get();
    const revisionRequest = revisionReqDoc.exists ? { id: revisionReqDoc.id, ...revisionReqDoc.data() } : null;
    const hasOpenRevisionRequest = revisionRequest?.status === 'open';

    return res.status(200).send({
      quote: latest,
      hasOpenRevisionRequest,
      revisionRequest: hasOpenRevisionRequest ? revisionRequest : null,
    });
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('Error fetching tradie quote:', error);
    return res.status(500).send({ message: 'Failed to fetch quote state' });
  }
});

/**
 * POST /api/quotes/:quoteId/withdraw (tradie-only)
 */
router.post('/api/quotes/:quoteId/withdraw', requireAuth, requireRole('tradie'), async (req, res) => {
  try {
    const { quoteId } = req.params;
    const tradieUid = req.user.uid;

    const quoteRef = db.collection('quotes').doc(quoteId);
    const quoteDoc = await quoteRef.get();
    if (!quoteDoc.exists) return res.status(404).send({ message: 'Quote not found.' });
    const quote = quoteDoc.data();
    if (quote.tradieUid !== tradieUid) return res.status(403).send({ message: 'Forbidden: You do not own this quote.' });
    if (quote.status !== 'submitted') return res.status(409).send({ message: `Cannot withdraw quote with status: ${quote.status}` });

    const jobDoc = await db.collection('jobs').doc(quote.jobId).get();
    if (!jobDoc.exists) return res.status(404).send({ message: 'Task not found.' });
    const job = jobDoc.data();
    const currentJobStatus = normalizeStatus(job.status);
    if (job.acceptedQuoteId === quoteId || ![JOB_STATUSES.OPEN, JOB_STATUSES.QUOTED, JOB_STATUSES.ASSIGNED].includes(currentJobStatus)) {
      return res.status(409).send({ message: 'Cannot withdraw: this quote is no longer withdrawable.' });
    }

    await quoteRef.update({
      status: 'withdrawn',
      withdrawnAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    const remainingQuotesSnap = await db.collection('quotes').where('jobId', '==', quote.jobId).get();
    const remainingVisibleQuotes = remainingQuotesSnap.docs
      .map((doc) => ({ id: doc.id, ...doc.data() }))
      .filter((row) => row.id !== quoteId && isHomeownerVisibleQuoteStatus(row.status));

    if (remainingVisibleQuotes.length === 0 && [JOB_STATUSES.QUOTED, JOB_STATUSES.ASSIGNED].includes(currentJobStatus)) {
      await updateJobStatus(db, admin, db.collection('jobs').doc(quote.jobId), JOB_STATUSES.OPEN);
    }

    return res.status(200).send({ message: 'Quote withdrawn.' });
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('Error withdrawing quote:', error);
    return res.status(500).send({ message: 'Failed to withdraw quote.' });
  }
});

/**
 * POST /api/jobs/:jobId/quotes/:tradieId/request-revision (homeowner-only)
 */
router.post('/api/jobs/:jobId/quotes/:tradieId/request-revision', requireAuth, requireRole('homeowner'), async (req, res) => {
  try {
    const { jobId, tradieId } = req.params;
    const { message } = req.body || {};
    const homeownerUid = req.user.uid;

    const jobRef = db.collection('jobs').doc(jobId);
    const jobDoc = await jobRef.get();
    if (!jobDoc.exists) return res.status(404).send({ message: 'Task not found.' });
    const job = jobDoc.data();
    if (job.homeownerUid !== homeownerUid) return res.status(403).send({ message: 'Forbidden: You do not own this task.' });
    if (job.status !== 'assigned') return res.status(409).send({ message: `Cannot request revision for task with status: ${job.status}` });
    if (job.acceptedQuoteId) return res.status(409).send({ message: 'Cannot request revision after accepting a quote.' });

    // ensure there is an active submitted quote for this tradie
    const qSnap = await db.collection('quotes')
      .where('jobId', '==', jobId)
      .where('tradieUid', '==', tradieId)
      .limit(25)
      .get();
    const qs = qSnap.empty ? [] : qSnap.docs.map(d => ({ id: d.id, ...d.data() }));
    const hasSubmitted = qs.some(q => q.status === 'submitted');
    if (!hasSubmitted) return res.status(409).send({ message: 'No submitted quote found for this expert.' });

    const reqRef = db.collection('jobs').doc(jobId).collection('quote_revision_requests').doc(tradieId);
    const reqDoc = await reqRef.get();
    if (reqDoc.exists && reqDoc.data()?.status === 'open') {
      return res.status(200).send({ message: 'Revision already requested.' });
    }

    await reqRef.set({
      jobId,
      homeownerUid,
      tradieUid: tradieId,
      status: 'open',
      message: typeof message === 'string' ? message.trim().slice(0, 500) : '',
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });

    return res.status(200).send({ message: 'Revision requested.' });
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('Error requesting revision:', error);
    return res.status(500).send({ message: 'Failed to request revision.' });
  }
});

/**
 * GET /api/jobs/:jobId/revision-requests (homeowner-only)
 * Returns all revision requests for this job.
 */
router.get('/api/jobs/:jobId/revision-requests', requireAuth, requireRole('homeowner'), async (req, res) => {
  try {
    const { jobId } = req.params;
    const homeownerUid = req.user.uid;

    const jobDoc = await db.collection('jobs').doc(jobId).get();
    if (!jobDoc.exists) return res.status(404).send({ message: 'Task not found.' });
    const job = jobDoc.data();
    if (job.homeownerUid !== homeownerUid) return res.status(403).send({ message: 'Forbidden: You do not own this task.' });

    const snap = await db.collection('jobs').doc(jobId).collection('quote_revision_requests').get();
    const requests = snap.empty ? [] : snap.docs.map(d => ({ id: d.id, ...d.data() }));
    return res.status(200).send({ requests });
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('Error fetching revision requests:', error);
    return res.status(500).send({ message: 'Failed to fetch revision requests.' });
  }
});

/* -------------------------------------------------------------------------- */
/* Funding (Stripe PaymentIntent)                                              */
/* -------------------------------------------------------------------------- */
/**
 * @route POST /api/jobs/:jobId/checkout
 * @description Creates a Stripe Checkout Session (Stripe-hosted) to fund escrow after a quote is accepted.
 * @access Private (Homeowner)
 */
router.post('/api/jobs/:jobId/checkout', requireAuth, requireRole('homeowner'), async (req, res) => {
  try {
    const { jobId } = req.params;
    const { quoteId } = req.body;
    const homeownerUid = req.user.uid;

    if (!quoteId) return res.status(400).send({ message: 'A valid quoteId is required.' });

    // Require a completed account before payment/chat, while still allowing quote viewing after lightweight verification.
    try {
      const profile = await getHomeownerProfile(homeownerUid);
      if (!hasCompletedHomeownerAccount(profile, req.user)) {
        return res.status(403).send({
          message: 'Add a verified email or continue with Google to unlock payment.',
          code: 'account_completion_required',
        });
      }
    } catch (e) {
      // If we cannot read the user profile, fail closed.
      return res.status(403).send({ message: 'Add a verified email or continue with Google to continue.', code: 'account_completion_required' });
    }

    const jobRef = db.collection('jobs').doc(jobId);
    const quoteRef = db.collection('quotes').doc(quoteId);

    // Transaction prevents races/double-accepts at scale.
    const { amountInCents } = await db.runTransaction(async (tx) => {
      const [jobDoc, quoteDoc] = await Promise.all([tx.get(jobRef), tx.get(quoteRef)]);
      if (!jobDoc.exists || !quoteDoc.exists) {
        const err = new Error('not_found');
        err.code = 'not_found';
        throw err;
      }

      const jobData = jobDoc.data();
      const quoteData = quoteDoc.data();

      if (jobData.homeownerUid !== homeownerUid) {
        const err = new Error('forbidden');
        err.code = 'forbidden';
        throw err;
      }
      if (quoteData.jobId !== jobId) {
        const err = new Error('mismatch');
        err.code = 'mismatch';
        throw err;
      }
      if (jobData.acceptedQuoteId && jobData.acceptedQuoteId !== quoteId) {
        const err = new Error('already_accepted');
        err.code = 'already_accepted';
        throw err;
      }

      const currentJobStatus = normalizeStatus(jobData.status);
      if (![JOB_STATUSES.QUOTED, JOB_STATUSES.ASSIGNED, JOB_STATUSES.AWAITING_FUNDING].includes(currentJobStatus)) {
        const err = new Error('bad_job_status');
        err.code = 'bad_job_status';
        err.status = currentJobStatus;
        throw err;
      }

      if (isAlreadyFundingComplete(jobData)) {
        const err = new Error('already_funded');
        err.code = 'already_funded';
        throw err;
      }

      const computedAmountInCents = Math.round(Number(quoteData.amount) * 100);
      if (!Number.isFinite(computedAmountInCents) || computedAmountInCents <= 0) {
        const err = new Error('bad_amount');
        err.code = 'bad_amount';
        throw err;
      }

      const acceptedTradieUid = quoteData.tradieUid;
      if (!acceptedTradieUid) {
        const err = new Error('missing_tradie');
        err.code = 'missing_tradie';
        throw err;
      }

      // Retry path: job is already AWAITING_FUNDING for the same quote (abandoned Stripe Checkout).
      // The job and quote are already in the correct state — no transition needed.
      // Return the existing session ID so the outer code can reuse or recreate it.
      if (currentJobStatus === JOB_STATUSES.AWAITING_FUNDING && jobData.acceptedQuoteId === quoteId) {
        return { amountInCents: computedAmountInCents };
      }

      validateJobTransitionOrThrow(currentJobStatus, JOB_STATUSES.AWAITING_FUNDING, { jobId });

      // Move job into AWAITING_FUNDING and persist accepted quote/tradie.
      tx.update(jobRef, {
        status: JOB_STATUSES.AWAITING_FUNDING,
        acceptedQuoteId: quoteId,
        acceptedTradieUid,
        paymentState: jobData.paymentState || 'pending_payment',
        paymentStatus: jobData.paymentStatus || 'requires_payment_method',
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      if (quoteData.status === 'pending' || quoteData.status === 'submitted') {
        tx.update(quoteRef, { status: 'accepted', updatedAt: admin.firestore.FieldValue.serverTimestamp() });
      }

      return { amountInCents: computedAmountInCents };
    });

    const reco = await reconcileBaseQuoteStripeBeforeNewCheckout(jobRef);
    if (reco.kind === 'already_confirmed') {
      return res.status(200).send({
        paymentAlreadyConfirmed: true,
        recovered: true,
        confirmed: true,
        message: 'Payment is already confirmed.',
      });
    }
    if (reco.kind === 'reuse_open') {
      return res.status(200).send({ sessionId: reco.sessionId, reused: true });
    }
    if (reco.kind === 'retry_later') {
      return res.status(202).send({
        pending: true,
        message: 'Payment status is still being checked. Please try again shortly.',
      });
    }

    const checkoutGeneration = await db.runTransaction(async (tx) => {
      const snap = await tx.get(jobRef);
      if (!snap.exists) {
        const err = new Error('not_found');
        err.code = 'not_found';
        throw err;
      }
      const current = snap.data() || {};
      const existingGeneration = Math.max(1, Math.floor(Number(current.paymentCheckoutGeneration || 1)));
      const replacing = String(reco.replaceSessionId || '');
      if (!replacing || String(current.paymentCheckoutSessionId || '') !== replacing) {
        return existingGeneration;
      }
      if (current.paymentCheckoutReplacementFor === replacing) {
        return existingGeneration;
      }
      const nextGeneration = existingGeneration + 1;
      tx.update(jobRef, {
        paymentCheckoutGeneration: nextGeneration,
        paymentCheckoutReplacementFor: replacing,
        paymentUpdatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      return nextGeneration;
    });

    const frontend = (process.env.FRONTEND_URL || 'http://localhost:3000').replace(/\/$/, '');
    const successUrl = `${frontend}/job/${jobId}?checkout=success&session_id={CHECKOUT_SESSION_ID}`;
    const cancelUrl = `${frontend}/job/${jobId}?checkout=cancel`;

    const { createCheckoutSession } = require('../services/stripe');
    const session = await createCheckoutSession({
      amountInCents,
      currency: 'aud',
      name: 'Secure payment for Taskio task',
      description: `Job ID: ${jobId}`,
      successUrl,
      cancelUrl,
      metadata: { jobId, quoteId, homeownerUid },
      idempotencyKey: `taskio_checkout_${jobId}_${quoteId}_g${checkoutGeneration}`,
      customerEmail: req.user?.email || undefined,
    });

    const piStored =
      session.payment_intent == null
        ? undefined
        : typeof session.payment_intent === 'string'
          ? session.payment_intent
          : session.payment_intent?.id;

    const freshSnap = await jobRef.get();
    if (!freshSnap.exists) {
      return res.status(404).send({ message: 'Task or quote not found.' });
    }
    const priorJob = freshSnap.data() || {};
    if (isAlreadyFundingComplete(priorJob)) {
      return res.status(200).send({
        paymentAlreadyConfirmed: true,
        recovered: true,
        confirmed: true,
        message: 'Payment is already confirmed.',
      });
    }

    let intentPatch = piStored ? { paymentIntentId: piStored } : {};
    const priorPid =
      priorJob.paymentIntentId != null
        ? typeof priorJob.paymentIntentId === 'string'
          ? priorJob.paymentIntentId
          : priorJob.paymentIntentId?.id
        : null;
    if (priorPid && priorPid !== piStored) {
      try {
        const priorPi = await retrievePaymentIntent(priorPid);
        if (priorPi?.status === 'succeeded') {
          await confirmBaseQuoteFundingIfSucceededTx(db, admin, jobRef, priorPi, {
            paymentCheckoutSessionId: priorJob.paymentCheckoutSessionId || undefined,
          });
          return res.status(200).send({
            paymentAlreadyConfirmed: true,
            recovered: true,
            confirmed: true,
            message: 'Payment is already confirmed.',
          });
        }
      } catch (_) {
        /* continue — create checkout path */
      }
    } else if (priorPid && piStored && priorPid === piStored) {
      intentPatch = {};
    }

    await jobRef.update({
      paymentCheckoutSessionId: session.id,
      paymentCheckoutGeneration: checkoutGeneration,
      paymentCheckoutReplacementFor: null,
      ...intentPatch,
      paymentState: 'pending_payment',
      paymentStatus: 'requires_payment_method',
      paymentUpdatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    return res.status(200).send({ sessionId: session.id });
  } catch (error) {
    if (error?.code === 'not_found') return res.status(404).send({ message: 'Task or quote not found.' });
    if (error?.code === 'forbidden') return res.status(403).send({ message: 'Forbidden: You do not own this task.' });
    if (error?.code === 'mismatch') return res.status(400).send({ message: 'Mismatch: This quote does not belong to the specified task.' });
    if (error?.code === 'already_accepted') return res.status(409).send({ message: 'A quote has already been accepted/funded for this task.' });
    if (error?.code === 'already_funded') return res.status(409).send({ message: 'Payment is already secured for this task.' });
    if (error?.code === 'bad_job_status') return res.status(400).send({ message: `Cannot fund job with status: ${error.status}` });
    if (error?.code === 'bad_amount') return res.status(400).send({ message: 'Quote amount is invalid.' });
    if (error?.code === 'missing_tradie') return res.status(500).send({ message: 'Quote data is missing the expert ID.' });
    if (error?.code === 'stripe_not_configured') return res.status(500).send({ message: 'Stripe is not configured on the server.' });
    if (error?.code === 'invalid_status_transition') {
      return res.status(409).send({ message: 'Invalid task state for checkout.' });
    }
    // eslint-disable-next-line no-console
    console.error('Error creating checkout session:', error);
    return res.status(500).send({ message: 'Failed to initialize Stripe Checkout.' });
  }
});

/**
 * @route POST /api/jobs/:jobId/payment-confirmed
 * @description Compatibility endpoint. Primarily webhook-driven, but can recover from webhook lag by checking Stripe directly.
 * @access Private (Homeowner)
 */
router.post('/api/jobs/:jobId/payment-confirmed', requireAuth, requireRole('homeowner'), async (req, res) => {
  try {
    const { jobId } = req.params;
    const homeownerUid = req.user.uid;
    const sessionIdFromBody =
      typeof req.body?.sessionId === 'string' && req.body.sessionId.trim()
        ? req.body.sessionId.trim()
        : '';

    const jobRef = db.collection('jobs').doc(jobId);
    const jobDoc = await jobRef.get();
    if (!jobDoc.exists) return res.status(404).send({ message: 'Task not found.' });

    let jobData = jobDoc.data();
    if (jobData.homeownerUid !== homeownerUid) {
      return res.status(403).send({ message: 'Forbidden: You do not own this task.' });
    }

    if (jobData.paymentState === 'released' || jobData.paymentState === 'refunded') {
      return res.status(200).send({
        recovered: false,
        confirmed: false,
        message: 'Payment state is already final.',
        status: normalizeStatus(jobData.status),
        paymentState: jobData.paymentState,
        paymentStatus: jobData.paymentStatus || null,
      });
    }

    if (isAlreadyFundingComplete(jobData)) {
      return res.status(200).send({
        recovered: true,
        confirmed: true,
        message: 'Payment is already confirmed.',
        status: normalizeStatus(jobData.status),
        paymentState: jobData.paymentState,
        paymentStatus: jobData.paymentStatus || null,
      });
    }

    const softStillConfirming = (extraJob = jobData, extraFields = {}) =>
      res.status(200).send({
        recovered: false,
        confirmed: false,
        message: 'Payment is still being confirmed.',
        status: normalizeStatus(extraJob.status),
        paymentState: extraJob.paymentState || null,
        paymentStatus: extraJob.paymentStatus || null,
        ...extraFields,
      });

    if (sessionIdFromBody) {
      const session = await retrieveCheckoutSession(sessionIdFromBody);
      const meta = session?.metadata || {};
      if (isVariationPaymentMetadata(meta)) {
        return res.status(400).send({
          message: 'Use variation confirmation for this payment.',
          code: 'variation_payment_session',
        });
      }
      const metaJobId = meta.jobId != null ? String(meta.jobId).trim() : '';
      if (metaJobId !== String(jobId).trim()) {
        return res.status(403).send({
          message: 'This Checkout session does not belong to this task.',
          code: 'session_job_mismatch',
        });
      }

      if (!session) {
        return softStillConfirming(jobData, { stripeSessionPaymentStatus: null });
      }

      const piRaw = session.payment_intent;
      /** @type {import('stripe').Stripe.PaymentIntent|null} */
      let paymentIntent =
        typeof piRaw === 'string'
          ? await retrievePaymentIntent(piRaw)
          : piRaw && typeof piRaw === 'object'
            ? piRaw
            : null;

      if (session.payment_status !== 'paid' && paymentIntent?.status !== 'succeeded') {
        return softStillConfirming(jobData, {
          stripeSessionPaymentStatus: session.payment_status || null,
          paymentIntentStatus: paymentIntent?.status || null,
        });
      }

      if (!paymentIntent?.id) {
        return softStillConfirming(jobData);
      }

      if (paymentIntent.status === 'processing' || paymentIntent.status === 'requires_capture') {
        return softStillConfirming(jobData, {
          paymentIntentStatus: paymentIntent.status,
        });
      }

      if (paymentIntent.status !== 'succeeded') {
        return softStillConfirming(jobData, {
          paymentIntentStatus: paymentIntent.status,
        });
      }

      const result = await confirmBaseQuoteFundingIfSucceededTx(db, admin, jobRef, paymentIntent, {
        paymentCheckoutSessionId: session.id,
      });

      const after = await jobRef.get();
      const afterData = after.data() || jobData;

      if (result.alreadyComplete || (result.confirmed && isAlreadyFundingComplete(afterData))) {
        return res.status(200).send({
          recovered: true,
          confirmed: true,
          message: 'Payment is already confirmed.',
          status: normalizeStatus(afterData.status),
          paymentState: afterData.paymentState,
          paymentStatus: afterData.paymentStatus || null,
        });
      }

      if (!result.confirmed) {
        if (result.reason === 'payment_intent_mismatch') {
          return res.status(403).send({ message: 'Payment record mismatch for this task.', code: 'payment_intent_mismatch' });
        }
        return softStillConfirming(afterData);
      }

      return res.status(200).send({
        recovered: true,
        confirmed: true,
        message: 'Payment secured.',
        status: normalizeStatus(afterData.status),
        paymentState: afterData.paymentState,
        paymentStatus: afterData.paymentStatus || null,
      });
    }

    /* Fallback: legacy recovery using stored job.paymentIntentId / paymentCheckoutSessionId */
    if (!jobData.paymentIntentId && !jobData.paymentCheckoutSessionId) {
      return res.status(400).send({ message: 'No payment reference found for this task.' });
    }

    let paymentIntent = null;
    let checkoutSessionForExtras = null;
    if (jobData.paymentIntentId) {
      const pid = typeof jobData.paymentIntentId === 'string' ? jobData.paymentIntentId : jobData.paymentIntentId?.id;
      if (pid) paymentIntent = await retrievePaymentIntent(pid);
    } else if (jobData.paymentCheckoutSessionId) {
      checkoutSessionForExtras = await retrieveCheckoutSession(jobData.paymentCheckoutSessionId);
      const pir = checkoutSessionForExtras?.payment_intent;
      if (typeof pir === 'string') {
        paymentIntent = await retrievePaymentIntent(pir);
      } else if (pir && typeof pir === 'object') paymentIntent = pir;
    }

    if (!paymentIntent?.id || paymentIntent.status !== 'succeeded') {
      return softStillConfirming(jobData, paymentIntent?.status ? { paymentIntentStatus: paymentIntent.status } : {});
    }

    const result = await confirmBaseQuoteFundingIfSucceededTx(db, admin, jobRef, paymentIntent, {
      paymentCheckoutSessionId:
        checkoutSessionForExtras?.id || jobData.paymentCheckoutSessionId || undefined,
    });
    const after = await jobRef.get();
    const afterData = after.data() || jobData;

    if (result.alreadyComplete || (result.confirmed && isAlreadyFundingComplete(afterData))) {
      return res.status(200).send({
        recovered: true,
        confirmed: true,
        status: normalizeStatus(afterData.status),
        paymentState: afterData.paymentState,
        paymentStatus: afterData.paymentStatus || null,
      });
    }

    if (!result.confirmed) {
      return softStillConfirming(afterData);
    }

    return res.status(200).send({
      recovered: true,
      confirmed: true,
      status: normalizeStatus(afterData.status),
      paymentState: afterData.paymentState,
      paymentStatus: afterData.paymentStatus || null,
    });
  } catch (error) {
    if (error && error.code === 'stripe_not_configured') {
      return res.status(500).send({ message: 'Stripe is not configured on the server.' });
    }
    // eslint-disable-next-line no-console
    console.error('Error confirming payment:', error);
    return res.status(500).send({ message: 'Failed to confirm payment.' });
  }
});

/* -------------------------------------------------------------------------- */
/* Sprint 7: Completion + Release (Escrow)                                     */
/* -------------------------------------------------------------------------- */

function getDefaultPlatformFeePercent() {
  return defaultPlatformFeePercentFromEnv();
}

async function logJobEvent({ jobId, actorId, actorRole, action, metadata }) {
  await db.collection('job_events').add({
    jobId,
    actorId,
    actorRole,
    action,
    metadata: metadata || null,
    timestamp: admin.firestore.FieldValue.serverTimestamp(),
  });
}

const EXPERT_PROGRESS_STATUSES = new Set(['work_started', 'needs_more_info', 'ready_for_review']);

/**
 * POST /api/jobs/:id/progress-status (tradie-only)
 * Expert progress marker. When progressStatus is 'work_started', this also
 * performs the FUNDED → IN_PROGRESS status transition so the job document
 * is the authoritative source of truth — not just a chat message.
 */
router.post('/api/jobs/:id/progress-status', requireAuth, requireRole('tradie'), async (req, res) => {
  try {
    const jobId = req.params.id;
    const tradieUid = req.user.uid;
    const progressStatus = String(req.body?.progressStatus || '').trim();

    if (!EXPERT_PROGRESS_STATUSES.has(progressStatus)) {
      return res.status(400).send({ message: 'Invalid progress status.' });
    }

    const jobRef = db.collection('jobs').doc(jobId);

    // 'work_started' is the authoritative "work has begun" signal.
    // It must atomically transition job.status FUNDED → IN_PROGRESS so that
    // client-side state helpers (hasWorkStarted, canUseVariations, etc.) work
    // correctly without relying on chat messages.
    if (progressStatus === 'work_started') {
      let unchanged = false;
      let didTransition = false;

      await db.runTransaction(async (tx) => {
        const jobDoc = await tx.get(jobRef);
        if (!jobDoc.exists) {
          const err = new Error('Task not found.');
          err.statusCode = 404;
          throw err;
        }
        const job = jobDoc.data() || {};

        if (job.acceptedTradieUid !== tradieUid) {
          const err = new Error('Only the assigned Expert can update task progress.');
          err.statusCode = 403;
          throw err;
        }
        if (job.chatFrozen === true || String(job.status || '').toLowerCase() === 'cancelled') {
          const err = new Error('Task progress cannot be updated for this task.');
          err.statusCode = 409;
          throw err;
        }

        if (job.progressStatus === progressStatus) {
          unchanged = true;
          return;
        }

        const normalizedJobStatus = normalizeStatus(job.status);
        const update = {
          progressStatus,
          progressStatusUpdatedAt: admin.firestore.FieldValue.serverTimestamp(),
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        };

        // Transition FUNDED → IN_PROGRESS when payment is secured and work begins.
        if (
          normalizedJobStatus === JOB_STATUSES.FUNDED &&
          job.paymentState === 'in_escrow'
        ) {
          validateJobTransitionOrThrow(normalizedJobStatus, JOB_STATUSES.IN_PROGRESS, { jobId });
          update.status = JOB_STATUSES.IN_PROGRESS;
          update.workStartedAt = admin.firestore.FieldValue.serverTimestamp();
          didTransition = true;
        }

        tx.update(jobRef, update);
      });

      if (unchanged) {
        return res.status(200).send({ progressStatus, unchanged: true });
      }

      await logJobEvent({
        jobId,
        actorId: tradieUid,
        actorRole: 'tradie',
        action: didTransition ? 'TRADIE_WORK_STARTED' : 'TRADIE_PROGRESS_STATUS_UPDATE',
        metadata: { progressStatus, statusTransitioned: didTransition },
      });

      return res.status(200).send({ progressStatus, unchanged: false });
    }

    // --- needs_more_info / ready_for_review: simple progress update ---
    const jobDoc = await jobRef.get();
    if (!jobDoc.exists) return res.status(404).send({ message: 'Task not found.' });

    const job = jobDoc.data() || {};
    if (job.acceptedTradieUid !== tradieUid) {
      return res.status(403).send({ message: 'Only the assigned Expert can update task progress.' });
    }
    if (job.chatFrozen === true || String(job.status || '').toLowerCase() === 'cancelled') {
      return res.status(409).send({ message: 'Task progress cannot be updated for this task.' });
    }

    const current = String(job.progressStatus || '').trim();
    if (current === progressStatus) {
      return res.status(200).send({ progressStatus, unchanged: true });
    }

    await jobRef.update({
      progressStatus,
      progressStatusUpdatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    await logJobEvent({
      jobId,
      actorId: tradieUid,
      actorRole: 'tradie',
      action: 'TRADIE_PROGRESS_STATUS_UPDATE',
      metadata: { progressStatus },
    });

    return res.status(200).send({ progressStatus, unchanged: false });
  } catch (error) {
    if (error.statusCode) {
      return res.status(error.statusCode).send({ message: error.message });
    }
    if (error.code === 'invalid_status_transition') {
      return res.status(409).send({ message: `Cannot mark work started: invalid transition (${error.from} → ${error.to}).` });
    }
    // eslint-disable-next-line no-console
    console.error('Error updating job progress status:', error);
    return res.status(500).send({ message: 'Failed to update task progress.' });
  }
});

/**
 * POST /api/jobs/:jobId/variations (tradie-only)
 * Creates a new pending variation under jobs/{jobId}/variations using Admin SDK.
 * Validates that payment is secured and work is in progress before writing.
 * Clients cannot write variations directly via the Firestore SDK.
 */
router.post('/api/jobs/:jobId/variations', requireAuth, requireRole('tradie'), async (req, res) => {
  try {
    const jobId = req.params.jobId;
    const tradieUid = req.user.uid;

    // --- Input validation ---
    const title = String(req.body?.title || '').trim();
    const description = String(req.body?.description || '').trim();
    const timeImpact = String(req.body?.timeImpact || '').trim();
    const priceChangeCents = Math.max(0, Math.floor(Number(req.body?.priceChangeCents ?? 0)));
    const rawAttachments = Array.isArray(req.body?.attachments) ? req.body.attachments : [];

    if (title.length < 3 || title.length > 140) {
      return res.status(400).send({ message: 'Title must be between 3 and 140 characters.' });
    }
    if (description.length < 10 || description.length > 5000) {
      return res.status(400).send({ message: 'Description must be between 10 and 5000 characters.' });
    }
    if (timeImpact.length > 200) {
      return res.status(400).send({ message: 'Time impact must be 200 characters or fewer.' });
    }
    if (!Number.isFinite(priceChangeCents) || priceChangeCents < 0 || priceChangeCents > 5000000) {
      return res.status(400).send({ message: 'Price change must be between $0 and $50,000.' });
    }

    // Sanitise attachment metadata — storage uploads happen client-side before this call.
    const safeAttachments = rawAttachments.slice(0, 3).map((a) => ({
      fileName: String(a.fileName || '').slice(0, 200),
      fileSize: Number(a.fileSize || 0),
      mimeType: String(a.mimeType || '').slice(0, 100),
      storagePath: String(a.storagePath || '').slice(0, 500),
      downloadUrl: String(a.downloadUrl || '').slice(0, 2000),
    }));

    // --- Load and validate job ---
    const jobRef = db.collection('jobs').doc(jobId);
    const jobSnap = await jobRef.get();
    if (!jobSnap.exists) {
      return res.status(404).send({ message: 'Job not found.' });
    }
    const job = jobSnap.data();
    const normalizedStatus = normalizeStatus(job.status);

    // Authorization: requester must be the accepted Expert.
    if (job.acceptedTradieUid !== tradieUid) {
      return res.status(403).send({ message: 'Only the accepted Expert can create a variation.' });
    }

    // Payment must be secured (matches frontend isPaymentSecured).
    const paymentSecured = job.paymentState === 'in_escrow' || job.paymentStatus === 'succeeded';
    if (!paymentSecured) {
      return res.status(409).send({ message: 'Variations are available once payment is secured.' });
    }

    // Work must have started (mirrors frontend hasWorkStarted + Firestore jobWorkStarted).
    const WORK_STARTED_STATUSES = new Set([
      JOB_STATUSES.IN_PROGRESS,
      JOB_STATUSES.COMPLETED,
      JOB_STATUSES.PAID,
      JOB_STATUSES.DISPUTED,
    ]);
    const workStarted = WORK_STARTED_STATUSES.has(normalizedStatus)
      || job.progressStatus === 'work_started'
      || !!job.workStartedAt;
    if (!workStarted) {
      return res.status(409).send({ message: 'Variations are only available once payment is secured and work is in progress.' });
    }

    // Reject terminal / read-only states.
    const VARIATION_BLOCKED_STATUSES = new Set([
      JOB_STATUSES.COMPLETED,
      JOB_STATUSES.PAID,
      JOB_STATUSES.CANCELLED,
      JOB_STATUSES.DISPUTED,
      JOB_STATUSES.REFUNDED,
      JOB_STATUSES.REFUND_PENDING,
    ]);
    if (VARIATION_BLOCKED_STATUSES.has(normalizedStatus)) {
      return res.status(409).send({ message: "New variations can't be created after the task is marked complete." });
    }

    // --- Create variation via Admin SDK ---
    const variationRef = db.collection('jobs').doc(jobId).collection('variations').doc();
    await variationRef.set({
      createdByUid: tradieUid,
      createdByRole: 'tradie',
      title,
      description,
      priceChangeCents,
      timeImpact,
      status: 'pending',
      attachments: safeAttachments,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    await logJobEvent({
      jobId,
      actorId: tradieUid,
      actorRole: 'tradie',
      action: 'TRADIE_VARIATION_REQUESTED',
      metadata: { variationId: variationRef.id, title, priceChangeCents },
    });

    return res.status(201).send({ variationId: variationRef.id });
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error('POST /api/jobs/:jobId/variations error:', e);
    return res.status(500).send({ message: 'Failed to create variation. Please try again.' });
  }
});

/**
 * POST /api/jobs/:jobId/variations/:variationId/decline (homeowner-only)
 * Client declines a pending or awaiting-payment variation. No payment involved.
 */
router.post(
  '/api/jobs/:jobId/variations/:variationId/decline',
  requireAuth,
  requireRole('homeowner'),
  async (req, res) => {
    try {
      const { jobId, variationId } = req.params;
      const homeownerUid = req.user.uid;

      const jobRef = db.collection('jobs').doc(jobId);
      const varRef = jobRef.collection('variations').doc(variationId);
      const [jobSnap, varSnap] = await Promise.all([jobRef.get(), varRef.get()]);

      if (!jobSnap.exists) return res.status(404).send({ message: 'Task not found.' });
      if (!varSnap.exists) return res.status(404).send({ message: 'Variation not found.' });

      const job = jobSnap.data();
      const variation = varSnap.data();

      if (job.homeownerUid !== homeownerUid) {
        return res.status(403).send({ message: 'Only the task owner can decline a variation.' });
      }
      if (!['pending', 'awaiting_payment'].includes(variation.status)) {
        return res.status(409).send({ message: 'This variation cannot be declined at this stage.' });
      }
      const DECLINE_BLOCKED = new Set([
        JOB_STATUSES.CANCELLED, JOB_STATUSES.REFUNDED, JOB_STATUSES.REFUND_PENDING,
      ]);
      if (DECLINE_BLOCKED.has(normalizeStatus(job.status))) {
        return res.status(409).send({ message: 'Cannot modify variations for a cancelled or refunded task.' });
      }

      await varRef.update({
        status: 'declined',
        declinedByUid: homeownerUid,
        declinedAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      await logJobEvent({
        jobId,
        actorId: homeownerUid,
        actorRole: 'homeowner',
        action: 'CLIENT_VARIATION_DECLINED',
        metadata: { variationId },
      });
      return res.status(200).send({ status: 'declined' });
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error('POST variation/decline error:', e);
      return res.status(500).send({ message: 'Failed to decline variation. Please try again.' });
    }
  }
);

/**
 * POST /api/jobs/:jobId/variations/:variationId/approve (homeowner-only)
 * $0 variations: approve directly.
 * Paid variations: create a Stripe Checkout Session and return sessionId.
 */
router.post(
  '/api/jobs/:jobId/variations/:variationId/approve',
  requireAuth,
  requireRole('homeowner'),
  async (req, res) => {
    try {
      const { jobId, variationId } = req.params;
      const homeownerUid = req.user.uid;

      const jobRef = db.collection('jobs').doc(jobId);
      const varRef = jobRef.collection('variations').doc(variationId);
      const [jobSnap, varSnap] = await Promise.all([jobRef.get(), varRef.get()]);

      if (!jobSnap.exists) return res.status(404).send({ message: 'Task not found.' });
      if (!varSnap.exists) return res.status(404).send({ message: 'Variation not found.' });

      const job = jobSnap.data();
      const variation = varSnap.data();

      if (job.homeownerUid !== homeownerUid) {
        return res.status(403).send({ message: 'Only the task owner can approve a variation.' });
      }
      if (variation.status !== 'pending') {
        return res.status(409).send({ message: 'This variation is not pending review.' });
      }
      const APPROVE_BLOCKED = new Set([
        JOB_STATUSES.COMPLETED, JOB_STATUSES.PAID, JOB_STATUSES.CANCELLED,
        JOB_STATUSES.DISPUTED, JOB_STATUSES.REFUNDED, JOB_STATUSES.REFUND_PENDING,
      ]);
      if (APPROVE_BLOCKED.has(normalizeStatus(job.status))) {
        return res.status(409).send({ message: 'Cannot approve variations for a task in its current state.' });
      }
      if (job.paymentState !== 'in_escrow' && job.paymentStatus !== 'succeeded') {
        return res.status(409).send({ message: 'Payment must be secured before approving variations.' });
      }

      const amountInCents = Math.max(0, Math.floor(Number(variation.priceChangeCents || 0)));

      // Zero-amount: approve directly without Stripe.
      if (amountInCents === 0) {
        await varRef.update({
          status: 'approved',
          approvedByUid: homeownerUid,
          approvedAt: admin.firestore.FieldValue.serverTimestamp(),
          paymentState: 'not_required',
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
        await logJobEvent({
          jobId,
          actorId: homeownerUid,
          actorRole: 'homeowner',
          action: 'CLIENT_VARIATION_APPROVED',
          metadata: { variationId, amountInCents: 0 },
        });
        return res.status(200).send({ status: 'approved' });
      }

      // Paid variation: create Stripe Checkout Session.
      if (process.env.STRIPE_ENABLED !== 'true') {
        return res.status(503).send({ message: 'Stripe is not configured. Please contact support.' });
      }
      const { createCheckoutSession: createVarCheckout } = require('../services/stripe');
      const varFrontend = (process.env.FRONTEND_URL || 'http://localhost:3000').replace(/\/$/, '');
      const session = await createVarCheckout({
        amountInCents,
        currency: 'aud',
        name: 'Approved variation payment',
        description: `Variation: ${(variation.title || '').slice(0, 80)}`,
        successUrl: `${varFrontend}/job/${jobId}?variationPayment=success&variationId=${encodeURIComponent(variationId)}&session_id={CHECKOUT_SESSION_ID}`,
        cancelUrl: `${varFrontend}/job/${jobId}?variationPayment=cancelled&variationId=${encodeURIComponent(variationId)}`,
        metadata: {
          type: 'variation_payment',
          paymentType: 'variation',
          jobId: String(jobId),
          variationId: String(variationId),
          homeownerUid: String(homeownerUid),
          tradieUid: String(job.acceptedTradieUid || ''),
          amountInCents: String(amountInCents),
        },
        idempotencyKey: `taskio_var_approve_${variationId}_${Date.now()}`,
        customerEmail: req.user?.email || undefined,
      });

      await varRef.update({
        status: 'awaiting_payment',
        checkoutSessionId: session.id,
        paymentState: 'pending_payment',
        approvedByUid: homeownerUid,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      await logJobEvent({
        jobId,
        actorId: homeownerUid,
        actorRole: 'homeowner',
        action: 'CLIENT_VARIATION_AWAITING_PAYMENT',
        metadata: { variationId, amountInCents, sessionId: session.id },
      });
      return res.status(200).send({ status: 'awaiting_payment', sessionId: session.id });
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error('POST variation/approve error:', e);
      return res.status(500).send({ message: 'Failed to approve variation. Please try again.' });
    }
  }
);

/**
 * POST /api/jobs/:jobId/variations/:variationId/checkout (homeowner-only)
 * Retry path: reuse an open Checkout Session or create a new one.
 */
router.post(
  '/api/jobs/:jobId/variations/:variationId/checkout',
  requireAuth,
  requireRole('homeowner'),
  async (req, res) => {
    try {
      const { jobId, variationId } = req.params;
      const homeownerUid = req.user.uid;

      const jobRef = db.collection('jobs').doc(jobId);
      const varRef = jobRef.collection('variations').doc(variationId);
      const [jobSnap, varSnap] = await Promise.all([jobRef.get(), varRef.get()]);

      if (!jobSnap.exists) return res.status(404).send({ message: 'Task not found.' });
      if (!varSnap.exists) return res.status(404).send({ message: 'Variation not found.' });

      const job = jobSnap.data();
      const variation = varSnap.data();

      if (job.homeownerUid !== homeownerUid) {
        return res.status(403).send({ message: 'Only the task owner can continue this payment.' });
      }
      if (variation.status === 'approved' && variation.paymentState === 'in_escrow') {
        return res.status(409).send({ message: 'This variation has already been paid.' });
      }
      if (variation.status !== 'awaiting_payment') {
        return res.status(409).send({ message: 'This variation is not awaiting payment.' });
      }
      if (process.env.STRIPE_ENABLED !== 'true') {
        return res.status(503).send({ message: 'Stripe is not configured. Please contact support.' });
      }

      const amountInCents = Math.max(0, Math.floor(Number(variation.priceChangeCents || 0)));

      // Try to reuse existing open session.
      const existingVarSessionId = variation.checkoutSessionId;
      if (existingVarSessionId) {
        try {
          const existingVarSession = await retrieveCheckoutSession(existingVarSessionId);
          if (existingVarSession?.status === 'open' && existingVarSession?.payment_status === 'unpaid') {
            return res.status(200).send({ sessionId: existingVarSessionId, reused: true });
          }
        } catch (_) { /* fall through */ }
      }

      const { createCheckoutSession: createVarRetryCheckout } = require('../services/stripe');
      const varRetryFrontend = (process.env.FRONTEND_URL || 'http://localhost:3000').replace(/\/$/, '');
      const retrySession = await createVarRetryCheckout({
        amountInCents,
        currency: 'aud',
        name: 'Approved variation payment',
        description: `Variation: ${(variation.title || '').slice(0, 80)}`,
        successUrl: `${varRetryFrontend}/job/${jobId}?variationPayment=success&variationId=${encodeURIComponent(variationId)}&session_id={CHECKOUT_SESSION_ID}`,
        cancelUrl: `${varRetryFrontend}/job/${jobId}?variationPayment=cancelled&variationId=${encodeURIComponent(variationId)}`,
        metadata: {
          type: 'variation_payment',
          paymentType: 'variation',
          jobId: String(jobId),
          variationId: String(variationId),
          homeownerUid: String(homeownerUid),
          tradieUid: String(job.acceptedTradieUid || ''),
          amountInCents: String(amountInCents),
        },
        idempotencyKey: `taskio_var_checkout_${variationId}_${Date.now()}`,
        customerEmail: req.user?.email || undefined,
      });

      await varRef.update({
        checkoutSessionId: retrySession.id,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      return res.status(200).send({ sessionId: retrySession.id });
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error('POST variation/checkout error:', e);
      return res.status(500).send({ message: 'Failed to start payment. Please try again.' });
    }
  }
);

/**
 * POST /api/jobs/:jobId/variations/confirm-checkout-session (homeowner-only)
 * After Stripe Checkout redirect: verify session and apply variation payment if webhook is delayed.
 */
router.post(
  '/api/jobs/:jobId/variations/confirm-checkout-session',
  requireAuth,
  requireRole('homeowner'),
  async (req, res) => {
    try {
      const { jobId } = req.params;
      const sessionId = String(req.body?.sessionId || '').trim();
      if (!sessionId) {
        return res.status(400).send({ message: 'sessionId is required.' });
      }

      const homeownerUid = req.user.uid;
      const jobRef = db.collection('jobs').doc(jobId);
      const jobSnap = await jobRef.get();
      if (!jobSnap.exists) return res.status(404).send({ message: 'Task not found.' });
      if (jobSnap.data().homeownerUid !== homeownerUid) {
        return res.status(403).send({ message: 'Only the task owner can confirm this payment.' });
      }

      const session = await retrieveCheckoutSession(sessionId);
      const meta = session.metadata || {};
      if (!isVariationPaymentMetadata(meta)) {
        return res.status(400).send({ message: 'This checkout session is not a variation payment.' });
      }
      if (String(meta.jobId || '') !== String(jobId)) {
        return res.status(400).send({ message: 'Checkout session does not match this task.' });
      }
      const variationId = String(meta.variationId || '').trim();
      if (!variationId) {
        return res.status(400).send({ message: 'Invalid variation on checkout session.' });
      }

      if (session.payment_status !== 'paid') {
        return res.status(200).send({
          status: 'pending',
          paymentStatus: session.payment_status,
          message: 'Payment is not completed yet. If you were charged, confirmation usually arrives within a few seconds.',
        });
      }

      const piRaw = session.payment_intent;
      const paymentIntentId = typeof piRaw === 'string' ? piRaw : piRaw?.id || null;

      await applyVariationPaymentSuccess(db, {
        jobId: String(jobId),
        variationId,
        paymentIntentId,
        checkoutSessionId: session.id,
        amountReceived: typeof session.amount_total === 'number' ? session.amount_total : null,
        currency: typeof session.currency === 'string' ? session.currency : null,
      });

      return res.status(200).send({ status: 'completed', variationId });
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error('POST variation confirm-checkout-session error:', e);
      return res.status(500).send({ message: 'Could not confirm payment. Please try again shortly.' });
    }
  }
);

/**
 * POST /api/jobs/:jobId/variations/:variationId/cancel (tradie-only)
 * Expert cancels their own pending variation request.
 */
router.post(
  '/api/jobs/:jobId/variations/:variationId/cancel',
  requireAuth,
  requireRole('tradie'),
  async (req, res) => {
    try {
      const { jobId, variationId } = req.params;
      const tradieUid = req.user.uid;

      const jobRef = db.collection('jobs').doc(jobId);
      const varRef = jobRef.collection('variations').doc(variationId);
      const [jobSnap, varSnap] = await Promise.all([jobRef.get(), varRef.get()]);

      if (!jobSnap.exists) return res.status(404).send({ message: 'Task not found.' });
      if (!varSnap.exists) return res.status(404).send({ message: 'Variation not found.' });

      const job = jobSnap.data();
      const variation = varSnap.data();

      if (job.acceptedTradieUid !== tradieUid) {
        return res.status(403).send({ message: 'Only the accepted Expert can cancel a variation.' });
      }
      if (variation.createdByUid !== tradieUid) {
        return res.status(403).send({ message: 'You can only cancel your own variations.' });
      }
      if (variation.status !== 'pending') {
        return res.status(409).send({ message: 'Only pending variations can be cancelled.' });
      }

      await varRef.update({
        status: 'cancelled',
        cancelledByUid: tradieUid,
        cancelledAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      await logJobEvent({
        jobId,
        actorId: tradieUid,
        actorRole: 'tradie',
        action: 'TRADIE_VARIATION_CANCELLED',
        metadata: { variationId },
      });
      return res.status(200).send({ status: 'cancelled' });
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error('POST variation/cancel error:', e);
      return res.status(500).send({ message: 'Failed to cancel variation. Please try again.' });
    }
  }
);

/**
 * POST /api/jobs/:id/complete (tradie-only)
 * Tradie marks job complete (awaiting homeowner approval).
 */
router.post('/api/jobs/:id/complete', requireAuth, requireRole('tradie'), async (req, res) => {
  try {
    const jobId = req.params.id;
    const tradieUid = req.user.uid;
    const jobRef = db.collection('jobs').doc(jobId);

    await db.runTransaction(async (tx) => {
      const jobDoc = await tx.get(jobRef);
      if (!jobDoc.exists) {
        const err = new Error('not_found');
        err.code = 'not_found';
        throw err;
      }
      const job = jobDoc.data();

      if (job.acceptedTradieUid !== tradieUid) {
        const err = new Error('forbidden');
        err.code = 'forbidden';
        throw err;
      }
      const normalizedStatus = normalizeStatus(job.status);
      if (![JOB_STATUSES.FUNDED, JOB_STATUSES.IN_PROGRESS].includes(normalizedStatus)) {
        const err = new Error('bad_job_status');
        err.code = 'bad_job_status';
        err.status = job.status;
        throw err;
      }
      if (job.paymentState !== 'in_escrow') {
        const err = new Error('bad_payment_state');
        err.code = 'bad_payment_state';
        err.paymentState = job.paymentState;
        throw err;
      }
      if (job.disputeFlag === true || job.status === 'disputed' || job.paymentState === 'disputed') {
        const err = new Error('disputed');
        err.code = 'disputed';
        throw err;
      }

      validateJobTransitionOrThrow(normalizedStatus, JOB_STATUSES.COMPLETED, { jobId });

      tx.update(jobRef, {
        status: JOB_STATUSES.COMPLETED,
        completedAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
    });

    await logJobEvent({ jobId, actorId: tradieUid, actorRole: 'tradie', action: 'TRADIE_MARK_COMPLETE' });
    return res.status(200).send({ message: 'Task marked complete. Awaiting client approval.' });
  } catch (error) {
    if (error?.code === 'not_found') return res.status(404).send({ message: 'Task not found.' });
    if (error?.code === 'forbidden') return res.status(403).send({ message: 'Forbidden: You are not the assigned expert.' });
    if (error?.code === 'bad_job_status') return res.status(409).send({ message: `Invalid state transition (status: ${error.status}).` });
    if (error?.code === 'bad_payment_state') return res.status(409).send({ message: `Invalid state transition (paymentState: ${error.paymentState}).` });
    if (error?.code === 'disputed') return res.status(409).send({ message: 'Task is disputed.' });
    if (error?.code === 'invalid_status_transition') {
      return res.status(409).send({ message: 'Invalid state transition for this task.' });
    }
    // eslint-disable-next-line no-console
    console.error('Error marking job complete:', error);
    return res.status(500).send({ message: 'Failed to mark task complete.' });
  }
});

/**
 * POST /api/jobs/:id/release (homeowner-only)
 * Homeowner approves and releases escrow to tradie (Stripe Transfer).
 */
router.post('/api/jobs/:id/release', requireAuth, requireRole('homeowner'), async (req, res) => {
  try {
    if (process.env.STRIPE_ENABLED !== 'true') {
      return res.status(400).send({ message: 'Stripe is not enabled on this server.' });
    }

    const jobId = req.params.id;
    const homeownerUid = req.user.uid;
    const jobRef = db.collection('jobs').doc(jobId);

    // Read necessary data
    const jobDoc = await jobRef.get();
    if (!jobDoc.exists) return res.status(404).send({ message: 'Task not found.' });
    const job = jobDoc.data();

    if (job.homeownerUid !== homeownerUid) return res.status(403).send({ message: 'Forbidden: You do not own this task.' });

    // Idempotency
    if (job.paymentState === 'released' && job.transferId) {
      return res.status(200).send({ message: 'Payment already released.', transferId: job.transferId });
    }

    if (normalizeStatus(job.status) !== JOB_STATUSES.COMPLETED) {
      return res.status(409).send({ message: `Invalid state transition (status: ${job.status}).` });
    }
    if (job.paymentState !== 'in_escrow') return res.status(409).send({ message: `Invalid state transition (paymentState: ${job.paymentState}).` });
    if (job.disputeFlag === true || job.status === 'disputed' || job.paymentState === 'disputed') {
      return res.status(409).send({ message: 'Task is disputed.' });
    }

    const tradieUid = job.acceptedTradieUid;
    if (!tradieUid) return res.status(400).send({ message: 'Missing assigned expert.' });

    const tradieDoc = await db.collection('users').doc(tradieUid).get();
    if (!tradieDoc.exists) return res.status(400).send({ message: 'Assigned expert not found.' });
    const tradie = tradieDoc.data();
    if (tradie.role !== 'tradie') return res.status(400).send({ message: 'Assigned user is not an expert.' });
    if (tradie.stripeOnboardingStatus !== 'completed' || tradie.stripeChargesEnabled !== true || tradie.stripePayoutsEnabled !== true) {
      return res.status(409).send({ message: 'Task expert is not ready for payouts (Stripe onboarding incomplete).' });
    }
    if (!tradie.stripeAccountId) return res.status(409).send({ message: 'Task expert is missing Stripe account.' });

    const amountCents = Number.isFinite(job.paymentAmountCents) ? job.paymentAmountCents : null;
    if (!amountCents || amountCents <= 0) return res.status(400).send({ message: 'Missing payment amount.' });

    const platformFeePercent = Number.isFinite(job.platformFeePercent) ? job.platformFeePercent : getDefaultPlatformFeePercent();

    try {
      validateJobTransitionOrThrow(job.status, JOB_STATUSES.PAID, { jobId });
    } catch (e) {
      if (e?.code === 'invalid_status_transition') {
        return res.status(409).send({ message: 'Invalid state transition for release.' });
      }
      throw e;
    }

    const stripeResult = await createExpertReleaseStripeTransfers({
      jobId,
      job,
      homeownerUid,
      tradieUid,
      destinationAccountId: tradie.stripeAccountId,
      currency: job.paymentCurrency || 'aud',
      platformFeePercent,
      createTransfer,
      getSucceededChargeIdForConnectTransfer,
      idempotencyPrefix: 'taskio_release',
    });

    if (stripeResult.error) {
      const e = stripeResult.error;
      return res.status(e.httpStatus).send({ message: e.message, code: e.code });
    }

    const { plan, baseTransfer, variationTransfers } = stripeResult;

    loggerForReq(req).info('taskio_release_audit', {
      phase: 'pre_persist',
      success: true,
      jobId,
      homeownerUid,
      tradieUid,
      paymentIntentId: job.paymentIntentId || null,
      destinationStripeAccountId: tradie.stripeAccountId,
      baseProviderCents: plan.baseSlice.providerCents,
      variationCount: variationTransfers.length,
      totalProviderCents: plan.totals.totalProviderCents,
      totalPlatformFeeCents: plan.totals.totalPlatformFeeCents,
      baseTransferId: baseTransfer.id,
      variationTransferIds: variationTransfers.map((v) => ({ variationId: v.variationId, transferId: v.transfer.id })),
      currency: job.paymentCurrency || 'aud',
      transferGroup: `taskio_job_${jobId}`,
    });

    await persistExpertReleaseAfterTransfers({
      jobRef,
      statusPaid: JOB_STATUSES.PAID,
      plan,
      baseTransfer,
      variationTransfers,
      extraJobFields: {},
    });

    await logJobEvent({
      jobId,
      actorId: homeownerUid,
      actorRole: 'homeowner',
      action: 'HOMEOWNER_RELEASE_PAYMENT',
      metadata: {
        transferId: baseTransfer.id,
        variationTransferCount: variationTransfers.length,
        releaseVariationTransferIds: Object.fromEntries(
          variationTransfers.map((v) => [v.variationId, v.transfer.id])
        ),
        totalProviderCents: plan.totals.totalProviderCents,
      },
    });

    loggerForReq(req).info('taskio_release_audit', {
      phase: 'complete',
      success: true,
      jobId,
      homeownerUid,
      tradieUid,
      paymentIntentId: job.paymentIntentId || null,
      destinationStripeAccountId: tradie.stripeAccountId,
      totalProviderCents: plan.totals.totalProviderCents,
      baseTransferId: baseTransfer.id,
      variationTransferIds: variationTransfers.map((v) => v.transfer.id),
      transferGroup: `taskio_job_${jobId}`,
    });

    return res.status(200).send({
      message: 'Payment released successfully.',
      transferId: baseTransfer.id,
      variationTransferIds: Object.fromEntries(
        variationTransfers.map((v) => [v.variationId, v.transfer.id])
      ),
      totalProviderAmountCents: plan.totals.totalProviderCents,
    });
  } catch (error) {
    loggerForReq(req).error('taskio_release_audit', {
      phase: 'error',
      success: false,
      jobId: req.params?.id,
      homeownerUid: req.user?.uid,
      message: error && error.message ? String(error.message) : 'unknown',
      code: error && error.code ? String(error.code) : null,
    });

    const mapped = getReleasePaymentErrorResponse(error);
    if (mapped) {
      return res.status(mapped.status).send({ message: mapped.message, code: error.code });
    }
    if (error && error.code === 'stripe_not_configured') {
      return res.status(400).send({ message: 'Stripe is not configured on the server.' });
    }
    // eslint-disable-next-line no-console
    console.error('Error releasing payment:', error);
    return res.status(500).send({ message: 'Failed to release payment.' });
  }
});

/**
 * POST /api/jobs/:id/cancel (homeowner-only)
 * Before payment: → CANCELLED. After escrow, work not started: → REFUND_PENDING + Stripe refund.
 */
router.post('/api/jobs/:id/cancel', requireAuth, requireRole('homeowner'), async (req, res) => {
  try {
    const jobId = req.params.id;
    const homeownerUid = req.user.uid;
    const jobRef = db.collection('jobs').doc(jobId);
    const jobDoc = await jobRef.get();
    if (!jobDoc.exists) return res.status(404).send({ message: 'Task not found.' });
    const job = jobDoc.data();
    if (job.homeownerUid !== homeownerUid) return res.status(403).send({ message: 'Forbidden: You do not own this task.' });

    const cur = normalizeStatus(job.status);
    const escrowPaid = job.paymentState === 'in_escrow' || job.paymentStatus === 'succeeded';

    if (cur === JOB_STATUSES.AWAITING_FUNDING && !escrowPaid) {
      await updateJobStatus(db, admin, jobRef, JOB_STATUSES.CANCELLED);
      await logJobEvent({ jobId, actorId: homeownerUid, actorRole: 'homeowner', action: 'HOMEOWNER_CANCEL_TASK' });
      return res.status(200).send({ message: 'Task cancelled.', status: JOB_STATUSES.CANCELLED });
    }

    if (cur === JOB_STATUSES.IN_PROGRESS) {
      return res.status(409).send({ message: 'This task cannot be cancelled here once work has started.' });
    }

    if (cur === JOB_STATUSES.AWAITING_FUNDING && escrowPaid) {
      if (process.env.STRIPE_ENABLED !== 'true') {
        return res.status(400).send({ message: 'Refunds require Stripe on this server.' });
      }
      if (!job.paymentIntentId) return res.status(400).send({ message: 'No payment to refund.' });
      const variationRefundIds = await refundFundedVariationsForCancellation({
        jobRef,
        jobId,
        createRefund,
        serverTimestamp: () => admin.firestore.FieldValue.serverTimestamp(),
      });
      const refund = await createRefund({
        paymentIntentId: job.paymentIntentId,
        amountInCents: null,
        reason: 'requested_by_customer',
        idempotencyKey: `taskio_homeowner_cancel_${jobId}`,
      });
      await updateJobStatus(db, admin, jobRef, JOB_STATUSES.REFUND_PENDING, {
        paymentState: 'refund_pending',
        refundId: refund.id,
        variationRefundIds,
        refundRequestedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      await logJobEvent({
        jobId,
        actorId: homeownerUid,
        actorRole: 'homeowner',
        action: 'HOMEOWNER_REQUEST_REFUND_CANCEL',
        metadata: { refundId: refund.id, variationRefundIds },
      });
      return res.status(200).send({ message: 'Refund started.', status: JOB_STATUSES.REFUND_PENDING, refundId: refund.id });
    }

    if (cur === JOB_STATUSES.FUNDED) {
      if (process.env.STRIPE_ENABLED !== 'true') {
        return res.status(400).send({ message: 'Refunds require Stripe on this server.' });
      }
      if (!job.paymentIntentId) return res.status(400).send({ message: 'No payment to refund.' });
      const variationRefundIds = await refundFundedVariationsForCancellation({
        jobRef,
        jobId,
        createRefund,
        serverTimestamp: () => admin.firestore.FieldValue.serverTimestamp(),
      });
      const refund = await createRefund({
        paymentIntentId: job.paymentIntentId,
        amountInCents: null,
        reason: 'requested_by_customer',
        idempotencyKey: `taskio_homeowner_cancel_${jobId}`,
      });
      await updateJobStatus(db, admin, jobRef, JOB_STATUSES.REFUND_PENDING, {
        paymentState: 'refund_pending',
        refundId: refund.id,
        variationRefundIds,
        refundRequestedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      await logJobEvent({
        jobId,
        actorId: homeownerUid,
        actorRole: 'homeowner',
        action: 'HOMEOWNER_REQUEST_REFUND_CANCEL',
        metadata: { refundId: refund.id, variationRefundIds },
      });
      return res.status(200).send({ message: 'Refund started.', status: JOB_STATUSES.REFUND_PENDING, refundId: refund.id });
    }

    return res.status(409).send({ message: 'This task cannot be cancelled in its current state.' });
  } catch (error) {
    if (error?.code === 'variation_already_released') {
      return res.status(409).send({
        message: 'A funded variation has already been released. Use the admin dispute workflow.',
        code: error.code,
        variationId: error.variationId,
      });
    }
    if (error && error.code === 'stripe_not_configured') {
      return res.status(400).send({ message: 'Stripe is not configured on the server.' });
    }
    if (error?.code === 'invalid_status_transition') {
      return res.status(409).send({ message: 'Invalid state transition for this task.' });
    }
    // eslint-disable-next-line no-console
    console.error('Error cancelling job:', error);
    return res.status(500).send({ message: 'Failed to cancel task.' });
  }
});

/**
 * POST /api/jobs/:id/report-issue (homeowner-only)
 * While awaiting approval: mark disputed — pauses release until reviewed.
 */
router.post('/api/jobs/:id/report-issue', requireAuth, requireRole('homeowner'), async (req, res) => {
  try {
    const jobId = req.params.id;
    const homeownerUid = req.user.uid;
    const reasonRaw = req.body && req.body.reason != null ? String(req.body.reason) : '';
    const reason = reasonRaw.trim().slice(0, 500);

    const jobRef = db.collection('jobs').doc(jobId);
    const jobDoc = await jobRef.get();
    if (!jobDoc.exists) return res.status(404).send({ message: 'Task not found.' });
    const job = jobDoc.data();
    if (job.homeownerUid !== homeownerUid) return res.status(403).send({ message: 'Forbidden: You do not own this task.' });

    const cur = normalizeStatus(job.status);
    if (cur !== JOB_STATUSES.COMPLETED) {
      return res.status(409).send({ message: 'An issue can only be reported while the task awaits your approval.' });
    }
    if (job.paymentState !== 'in_escrow') {
      return res.status(409).send({ message: 'Payment has not been secured for this task.' });
    }
    if (job.disputeFlag === true || job.paymentState === 'disputed') {
      return res.status(409).send({ message: 'This task is already under review.' });
    }

    await updateJobStatus(db, admin, jobRef, JOB_STATUSES.DISPUTED, {
      disputeFlag: true,
      paymentState: 'disputed',
      preDisputeStatus: JOB_STATUSES.COMPLETED,
      preDisputePaymentState: 'in_escrow',
      clientDisputeReason: reason || null,
      disputedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    await logJobEvent({
      jobId,
      actorId: homeownerUid,
      actorRole: 'homeowner',
      action: 'HOMEOWNER_REPORT_ISSUE',
      metadata: { hasReason: Boolean(reason) },
    });

    return res.status(200).send({ message: 'Issue reported.', status: JOB_STATUSES.DISPUTED });
  } catch (error) {
    if (error?.code === 'invalid_status_transition') {
      return res.status(409).send({ message: 'Invalid state transition for this task.' });
    }
    // eslint-disable-next-line no-console
    console.error('Error reporting issue:', error);
    return res.status(500).send({ message: 'Failed to report issue.' });
  }
});

module.exports = router;
