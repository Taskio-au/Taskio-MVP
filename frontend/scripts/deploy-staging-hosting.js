'use strict';

const { spawnSync } = require('child_process');
const {
  parseStagingDeployArgv,
  buildHostingDeployPlan,
  buildHostingClonePlan,
} = require('./stagingHostingLib.cjs');

function printPlan(plan) {
  const rendered = [plan.command, ...plan.args].join(' ');
  process.stdout.write(`${plan.dryRun ? '[dry-run] ' : ''}${rendered}\n`);
}

function main() {
  const args = parseStagingDeployArgv(process.argv.slice(2));
  if (args.cloneVersion) {
    const plan = buildHostingClonePlan({
      project: args.project,
      versionId: args.cloneVersion,
    });
    printPlan(plan);
    return;
  }
  const plan = buildHostingDeployPlan({
    project: args.project,
    config: args.config,
    execute: args.execute === true && args.dryRun !== true,
  });
  printPlan(plan);
  if (!plan.execute) return;
  const result = spawnSync(plan.command, plan.args, {
    cwd: plan.cwd,
    stdio: 'inherit',
    shell: false,
  });
  if (result.status !== 0) {
    throw new Error('Firebase Hosting deploy command failed.');
  }
}

try {
  main();
} catch (err) {
  console.error('[staging-deploy]', err && err.message);
  process.exit(1);
}
