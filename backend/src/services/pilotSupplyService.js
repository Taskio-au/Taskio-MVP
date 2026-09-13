'use strict';

/**
 * Server-side Expert supply aggregation for the Controlled Open-Demand Pilot.
 * Pages through all tradie profiles so Admin counts are not truncated by UI limit=50.
 * A truncated scan must never be interpreted as positively proving readiness.
 */

const { admin } = require('../firebaseAdmin');
const { phase1ExpertiseCatalog } = require('../../../shared/expertiseCatalog');
const { computeLaunchReadiness } = require('../utils/pilotLaunchReadiness');
const { getCanonicalPilotServiceAreas } = require('../utils/pilotOperationalFields');

const PILOT_SUPPLY_PAGE_SIZE = 100;
const PILOT_SUPPLY_EXPERT_CAP = 250;
const LAUNCH_READY_TARGET = 15;
const AFTER_ACTIVATION_FLOOR = 12;
const CATEGORY_COVERAGE_MINIMUM = 4;
const CATEGORY_COVERAGE_TARGET = 5;

function enabledPhase1Categories() {
  const seen = new Set();
  const rows = [];
  for (const item of phase1ExpertiseCatalog) {
    const category = String(item.category || '').trim();
    if (!category || seen.has(category)) continue;
    seen.add(category);
    rows.push({
      category,
      keys: phase1ExpertiseCatalog.filter((row) => row.category === category).map((row) => row.key),
    });
  }
  return rows;
}

function categoryStatus(count) {
  if (count >= CATEGORY_COVERAGE_TARGET) return 'HEALTHY';
  if (count >= CATEGORY_COVERAGE_MINIMUM) return 'ADEQUATE';
  return 'UNDER-COVERED';
}

function launchReadinessFromExpertDoc(data) {
  return computeLaunchReadiness({
    userDoc: data,
    decodedToken: {
      email_verified: data?.emailVerified === true,
    },
  });
}

async function listAllPilotExperts(db, {
  pageSize = PILOT_SUPPLY_PAGE_SIZE,
  cap = PILOT_SUPPLY_EXPERT_CAP,
} = {}) {
  const experts = [];
  let lastDoc = null;
  let truncated = false;

  while (experts.length < cap) {
    let query = db.collection('users')
      .where('role', '==', 'tradie')
      .orderBy(admin.firestore.FieldPath.documentId())
      .limit(pageSize);
    if (lastDoc) {
      query = query.startAfter(lastDoc);
    }
    const snap = await query.get();
    if (!snap || snap.empty || !Array.isArray(snap.docs) || snap.docs.length === 0) break;

    for (let i = 0; i < snap.docs.length; i += 1) {
      const doc = snap.docs[i];
      experts.push({ uid: doc.id, data: doc.data() || {} });
      if (experts.length >= cap) {
        // Fail closed: leftover docs on this page, or a full page at the cap,
        // means the scan did not prove it saw every Expert.
        const moreInThisPage = i + 1 < snap.docs.length;
        truncated = moreInThisPage || snap.docs.length >= pageSize;
        break;
      }
    }
    lastDoc = snap.docs[snap.docs.length - 1];
    if (experts.length >= cap || snap.docs.length < pageSize) break;
  }

  return { experts, truncated, scanned: experts.length, cap };
}

function aggregatePilotSupply(experts) {
  const categories = enabledPhase1Categories();
  const areas = getCanonicalPilotServiceAreas();
  const categoryCounts = Object.fromEntries(categories.map((row) => [row.category, 0]));
  const geographyCounts = Object.fromEntries(areas.map((area) => [area, 0]));

  let totalExperts = 0;
  let technicallyEligible = 0;
  let launchReady = 0;

  for (const expert of experts) {
    totalExperts += 1;
    const readiness = launchReadinessFromExpertDoc(expert.data);
    if (readiness.technicallyEligible) technicallyEligible += 1;
    if (!readiness.launchReady) continue;
    launchReady += 1;

    const approved = new Set(
      Array.isArray(expert.data?.expertiseApproved) ? expert.data.expertiseApproved : []
    );
    for (const row of categories) {
      if (row.keys.some((key) => approved.has(key))) {
        categoryCounts[row.category] += 1;
      }
    }
    for (const area of readiness.serviceAreas) {
      if (Object.prototype.hasOwnProperty.call(geographyCounts, area)) {
        geographyCounts[area] += 1;
      }
    }
  }

  return {
    source: {
      categories: 'shared/expertiseCatalog.js phase1ExpertiseCatalog — all Phase 1 categories enabled (no persisted Pilot Settings switch yet)',
      geography: 'shared/auLocations.js melbournePilotSuburbNames — all 8 Inner Melbourne areas enabled (no persisted Pilot Settings switch yet)',
    },
    targets: {
      launchReady: LAUNCH_READY_TARGET,
      afterActivationFloor: AFTER_ACTIVATION_FLOOR,
      categoryCoverageMinimum: CATEGORY_COVERAGE_MINIMUM,
      categoryCoverageTarget: CATEGORY_COVERAGE_TARGET,
    },
    totals: {
      experts: totalExperts,
      technicallyEligible,
      launchReady,
    },
    categoryCoverage: categories.map((row) => ({
      category: row.category,
      launchReadyCount: categoryCounts[row.category],
      minimum: CATEGORY_COVERAGE_MINIMUM,
      target: CATEGORY_COVERAGE_TARGET,
      status: categoryStatus(categoryCounts[row.category]),
    })),
    geographyCoverage: areas.map((area) => ({
      area,
      launchReadyCount: geographyCounts[area],
    })),
  };
}

async function buildPilotSupplySnapshot(db, options) {
  const listed = await listAllPilotExperts(db, options);
  const snapshot = aggregatePilotSupply(listed.experts);
  snapshot.totals.truncated = listed.truncated;
  snapshot.totals.scanned = listed.scanned;
  snapshot.totals.cap = listed.cap;
  // Future Pilot Status / READY must not treat an incomplete scan as proof.
  snapshot.totals.scanComplete = listed.truncated !== true;
  return snapshot;
}

module.exports = {
  PILOT_SUPPLY_PAGE_SIZE,
  PILOT_SUPPLY_EXPERT_CAP,
  LAUNCH_READY_TARGET,
  AFTER_ACTIVATION_FLOOR,
  CATEGORY_COVERAGE_MINIMUM,
  CATEGORY_COVERAGE_TARGET,
  enabledPhase1Categories,
  listAllPilotExperts,
  aggregatePilotSupply,
  buildPilotSupplySnapshot,
  launchReadinessFromExpertDoc,
};
