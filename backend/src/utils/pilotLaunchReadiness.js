'use strict';

/**
 * Derived launch-readiness. Do not persist a launchReady boolean.
 * Launch-ready = existing technical eligibility AND acceptingJobs === true
 * AND at least one enabled canonical serviceAreas[] value.
 */

const { computeEligibility } = require('./v11TradieEligibility');
const {
  readAcceptingJobs,
  readServiceAreas,
  hasEnabledPilotServiceArea,
} = require('./pilotOperationalFields');

function decodedTokenFromStoredUser(userDoc, decodedToken) {
  if (decodedToken && typeof decodedToken === 'object') {
    return {
      ...decodedToken,
      email_verified: decodedToken.email_verified === true || userDoc?.emailVerified === true,
    };
  }
  return {
    email_verified: userDoc?.emailVerified === true,
  };
}

function computeLaunchReadiness({ decodedToken, userDoc } = {}) {
  const token = decodedTokenFromStoredUser(userDoc, decodedToken);
  const technical = computeEligibility({ decodedToken: token, userDoc });
  const acceptingJobs = readAcceptingJobs(userDoc);
  const serviceAreas = readServiceAreas(userDoc);
  const hasEnabledServiceArea = hasEnabledPilotServiceArea(serviceAreas);

  const reasons = [...technical.reasons];
  if (!acceptingJobs) reasons.push('NOT_ACCEPTING_JOBS');
  if (!hasEnabledServiceArea) reasons.push('NO_SERVICE_AREA');

  return {
    launchReady: technical.eligible === true && acceptingJobs && hasEnabledServiceArea,
    technicallyEligible: technical.eligible === true,
    acceptingJobs,
    serviceAreas,
    hasEnabledServiceArea,
    reasons,
    technicalReasons: technical.reasons,
    checklist: {
      ...technical.checklist,
      acceptingJobs,
      hasEnabledServiceArea,
    },
    derived: technical.derived,
  };
}

module.exports = {
  computeLaunchReadiness,
  decodedTokenFromStoredUser,
};
