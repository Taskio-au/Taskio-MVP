'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const {
  assertStagingBuildEnv,
  stagingBuildChildEnv,
  listSourceMapFiles,
  STAGING_PROJECT_ID,
} = require('./stagingHostingLib.cjs');

function main() {
  assertStagingBuildEnv(process.env);
  const frontendRoot = path.resolve(__dirname, '..');
  const buildDir = path.join(frontendRoot, 'build');
  const childEnv = stagingBuildChildEnv(process.env);
  const npmCmd = process.platform === 'win32' ? 'npm.cmd' : 'npm';
  const result = spawnSync(npmCmd, ['run', 'build'], {
    cwd: frontendRoot,
    env: childEnv,
    stdio: 'inherit',
    shell: process.platform === 'win32',
  });
  if (result.status !== 0) {
    throw new Error('Staging frontend build failed.');
  }
  const maps = listSourceMapFiles(buildDir);
  if (maps.length) {
    throw new Error('Staging build produced source map files.');
  }
  if (!fs.existsSync(path.join(buildDir, 'index.html'))) {
    throw new Error('Staging build did not produce index.html.');
  }
  process.stdout.write(`[staging-build] ok project=${STAGING_PROJECT_ID} maps=0\n`);
}

try {
  main();
} catch (err) {
  console.error('[staging-build]', err && err.message);
  process.exit(1);
}
