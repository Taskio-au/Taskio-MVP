'use strict';

const path = require('path');
const { scanStagingBundle } = require('./stagingHostingLib.cjs');

function main() {
  const buildDir = path.resolve(__dirname, '..', 'build');
  const result = scanStagingBundle(buildDir, process.env);
  process.stdout.write(`[staging-scan] ok files=${result.filesScanned}\n`);
}

try {
  main();
} catch (err) {
  console.error('[staging-scan]', err && err.message);
  process.exit(1);
}
