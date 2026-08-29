'use strict';

const { spawnSync } = require('child_process');
const {
  parseStagingDeployArgv,
  buildHostingDeployPlan,
  buildHostingClonePlan,
  buildFirebaseSpawnSpec,
} = require('./stagingHostingLib.cjs');

function printPlan(plan) {
  const rendered = [plan.command, ...plan.args].join(' ');
  process.stdout.write(`${plan.dryRun ? '[dry-run] ' : ''}${rendered}\n`);
}

function executeHostingDeployPlan(plan, options = {}) {
  const spawn = options.spawnSync || spawnSync;
  const spec = buildFirebaseSpawnSpec(plan, options);
  const result = spawn(spec.command, spec.args, {
    cwd: plan.cwd,
    stdio: options.stdio || 'inherit',
    shell: spec.shell,
  });
  if (result.error) {
    throw new Error(`Firebase Hosting deploy command failed: ${result.error.message}`);
  }
  if (result.status !== 0) {
    throw new Error('Firebase Hosting deploy command failed.');
  }
  return result;
}

function main(argv = process.argv.slice(2)) {
  const args = parseStagingDeployArgv(argv);
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
  executeHostingDeployPlan(plan);
}

if (require.main === module) {
  try {
    main();
  } catch (err) {
    console.error('[staging-deploy]', err && err.message);
    process.exit(1);
  }
}

module.exports = { main, executeHostingDeployPlan };
