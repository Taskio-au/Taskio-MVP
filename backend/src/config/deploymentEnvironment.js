'use strict';

const DEPLOYMENT_ENV_PRODUCTION = 'production';
const DEPLOYMENT_ENV_STAGING = 'staging';
const STAGING_PROJECT_ID = 'taskio-v2-staging';

function getGoogleCloudProjectId() {
  const candidates = [
    process.env.GOOGLE_CLOUD_PROJECT,
    process.env.GCLOUD_PROJECT,
    process.env.FIREBASE_PROJECT_ID,
  ];
  const projectId = candidates.find((value) => typeof value === 'string' && value.trim());
  return projectId ? projectId.trim() : null;
}

function getDeploymentEnvironment() {
  const raw = typeof process.env.TASKIO_DEPLOYMENT_ENV === 'string'
    ? process.env.TASKIO_DEPLOYMENT_ENV.trim().toLowerCase()
    : '';
  return raw || DEPLOYMENT_ENV_PRODUCTION;
}

function validateDeploymentEnvironment() {
  const deploymentEnvironment = getDeploymentEnvironment();
  const projectId = getGoogleCloudProjectId();
  if (![DEPLOYMENT_ENV_PRODUCTION, DEPLOYMENT_ENV_STAGING].includes(deploymentEnvironment)) {
    throw new Error('TASKIO_DEPLOYMENT_ENV must be "production" or "staging".');
  }

  if (deploymentEnvironment === DEPLOYMENT_ENV_STAGING) {
    if (projectId !== STAGING_PROJECT_ID) {
      throw new Error(
        `Staging deployment requires Google Cloud project ${STAGING_PROJECT_ID}.`,
      );
    }
  }

  if (projectId === STAGING_PROJECT_ID && deploymentEnvironment !== DEPLOYMENT_ENV_STAGING) {
    throw new Error(
      `Google Cloud project ${STAGING_PROJECT_ID} requires TASKIO_DEPLOYMENT_ENV=staging.`,
    );
  }

  return deploymentEnvironment;
}

module.exports = {
  DEPLOYMENT_ENV_PRODUCTION,
  DEPLOYMENT_ENV_STAGING,
  STAGING_PROJECT_ID,
  getGoogleCloudProjectId,
  getDeploymentEnvironment,
  validateDeploymentEnvironment,
};
