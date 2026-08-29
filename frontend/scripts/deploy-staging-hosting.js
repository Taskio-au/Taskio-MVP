'use strict';

const { spawnSync } = require('child_process');
const {
  buildHostingDeployPlan,
  buildHostingClonePlan,
  STAGING_PROJECT_ID,
} = require('./stagingHostingLib.cjs');

function parseArgs(argv) {
  const parsed = { _: [] };
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === '--execute') parsed.execute = true;
    else if (token === '--dry-run') parsed.dryRun = true;
    else if (token === '--project') parsed.project = argv[++i];
    else if (token === '--config') parsed.config = argv[++i];
    else if (token === '--clone-version') parsed.cloneVersion = argv[++i];
    else parsed._.push(token);
  }
  return parsed;
}

function printPlan(plan) {
  const rendered = [plan.command, ...plan.args].join(' ');
  process.stdout.write(`${plan.dryRun ? '[dry-run] ' : ''}${rendered}\n`);
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.cloneVersion) {
    const plan = buildHostingClonePlan({
      project: args.project || STAGING_PROJECT_ID,
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
