'use strict';

const { runHostedBuild } = require('./hostedBuildGuard.cjs');

try {
  runHostedBuild({
    env: process.env,
    loadEnv: () => require('react-scripts/config/env'),
    compile: () => require('react-scripts/scripts/build'),
  });
} catch (error) {
  // Do not print configuration values or errors from environment-file loading.
  const messages = {
    TASKIO_APPCHECK_DEBUG_BUILD: '[hosted-build] App Check debug configuration is forbidden.',
    TASKIO_EMULATOR_BUILD: '[hosted-build] Firebase emulator configuration is forbidden.',
  };
  console.error(messages[error.code]
    || '[hosted-build] Could not prepare the hosted build. Check environment and build configuration.');
  process.exitCode = 1;
}
