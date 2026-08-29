'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const test = require('node:test');
const assert = require('node:assert/strict');
const {
  STAGING_PROJECT_ID,
  STAGING_API_URL,
  NO_STORE_CACHE,
  ROBOTS_HEADER,
  containsProductionProjectId,
  assertStagingBuildEnv,
  stagingBuildChildEnv,
  scanText,
  scanStagingBundle,
  parseStagingDeployArgv,
  buildHostingDeployPlan,
  buildHostingClonePlan,
  assertSafeDeployPlanArgs,
  resolveFirebaseToolsCliEntry,
  buildFirebaseSpawnSpec,
  headersForHostingRequest,
  loadStagingHostingConfig,
  assertNoImmutableCache,
} = require('./stagingHostingLib.cjs');
const { executeHostingDeployPlan } = require('./deploy-staging-hosting.js');

const validEnv = {
  REACT_APP_FIREBASE_EXPECTED_PROJECT_ID: STAGING_PROJECT_ID,
  REACT_APP_FIREBASE_API_KEY: 'staging-api-key',
  REACT_APP_FIREBASE_AUTH_DOMAIN: 'taskio-v2-staging.firebaseapp.com',
  REACT_APP_FIREBASE_PROJECT_ID: STAGING_PROJECT_ID,
  REACT_APP_FIREBASE_STORAGE_BUCKET: 'taskio-v2-staging.firebasestorage.app',
  REACT_APP_FIREBASE_MESSAGING_SENDER_ID: 'staging-sender',
  REACT_APP_FIREBASE_APP_ID: 'staging-app',
  REACT_APP_API_BASE_URL: STAGING_API_URL,
};

const windowsEssentials = {
  Path: 'C:\\Windows\\System32;C:\\Program Files\\nodejs',
  SystemRoot: 'C:\\Windows',
  ComSpec: 'C:\\Windows\\System32\\cmd.exe',
  PATHEXT: '.COM;.EXE;.BAT;.CMD',
};

function assertMissingKey(object, key) {
  assert.equal(Object.prototype.hasOwnProperty.call(object, key), false, `forbidden key present: ${key}`);
}

function createFakeFirebaseTools(t, metadata = { bin: { firebase: './lib/bin/firebase.js' } }) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'taskio-firebase-tools-'));
  const packageDir = path.join(root, 'node_modules', 'firebase-tools');
  const packageJsonPath = path.join(packageDir, 'package.json');
  const entry = path.join(packageDir, 'lib', 'bin', 'firebase.js');
  fs.mkdirSync(path.dirname(entry), { recursive: true });
  fs.writeFileSync(packageJsonPath, JSON.stringify(metadata));
  fs.writeFileSync(entry, '#!/usr/bin/env node\n');
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  return { root, packageDir, packageJsonPath, entry };
}

test('boundary-aware production project matching does not fire on staging', () => {
  assert.equal(containsProductionProjectId('taskio-v2-staging'), false);
  assert.equal(containsProductionProjectId('https://taskio-v2-staging.firebaseapp.com'), false);
  assert.equal(containsProductionProjectId('taskio-v2'), true);
  assert.equal(containsProductionProjectId('taskio-v2.firebaseapp.com'), true);
});

test('staging build env accepts complete staging inputs and forces bypass off', () => {
  assert.doesNotThrow(() => assertStagingBuildEnv(validEnv));
  const child = stagingBuildChildEnv({
    ...validEnv,
    ...windowsEssentials,
    REACT_APP_STRIPE_PUBLISHABLE_KEY: 'pk_test_example',
    REACT_APP_STORAGE_BUCKET: 'taskio-v2.firebasestorage.app',
  });
  assert.equal(child.REACT_APP_DISABLE_PHONE_RECAPTCHA, 'false');
  assert.equal(child.GENERATE_SOURCEMAP, 'false');
  assert.equal(child.NODE_ENV, 'production');
  assert.equal(child.CI, 'true');
  assert.equal(child.REACT_APP_STORAGE_BUCKET, '');
  assert.equal(child.REACT_APP_FIREBASE_STORAGE_BUCKET, 'taskio-v2-staging.firebasestorage.app');
  assert.equal(child.Path, windowsEssentials.Path);
  assert.equal(child.SystemRoot, windowsEssentials.SystemRoot);
  assert.equal(child.ComSpec, windowsEssentials.ComSpec);
});

test('staging child env is an allowlist and drops scanner fixtures and tokens', () => {
  const child = stagingBuildChildEnv({
    ...validEnv,
    PATH: '/usr/bin:/opt/hostedtoolcache/node/bin',
    HOME: '/home/runner',
    CI: 'true',
    TASKIO_STAGING_SCAN_PHONE: 'redacted-phone',
    TASKIO_STAGING_SCAN_OTP: 'redacted-otp',
    TASKIO_STAGING_SCAN_FIXTURE_FILE: '/tmp/phone.json',
    FIREBASE_TOKEN: 'redacted-firebase-token',
    GOOGLE_APPLICATION_CREDENTIALS: '/tmp/creds.json',
    CLOUDSDK_AUTH_ACCESS_TOKEN: 'redacted-gcloud',
    NPM_TOKEN: 'redacted-npm',
    NODE_AUTH_TOKEN: 'redacted-node-auth',
    NODE_OPTIONS: '--require ./not-allowed.js',
    GITHUB_TOKEN: 'redacted-github',
    npm_config_registry: 'https://registry.npmjs.org/',
  });

  assertMissingKey(child, 'TASKIO_STAGING_SCAN_PHONE');
  assertMissingKey(child, 'TASKIO_STAGING_SCAN_OTP');
  assertMissingKey(child, 'TASKIO_STAGING_SCAN_FIXTURE_FILE');
  assertMissingKey(child, 'FIREBASE_TOKEN');
  assertMissingKey(child, 'GOOGLE_APPLICATION_CREDENTIALS');
  assertMissingKey(child, 'CLOUDSDK_AUTH_ACCESS_TOKEN');
  assertMissingKey(child, 'NPM_TOKEN');
  assertMissingKey(child, 'NODE_AUTH_TOKEN');
  assertMissingKey(child, 'NODE_OPTIONS');
  assertMissingKey(child, 'GITHUB_TOKEN');
  assertMissingKey(child, 'npm_config_registry');
  assert.equal(child.PATH, '/usr/bin:/opt/hostedtoolcache/node/bin');
  assert.equal(child.HOME, '/home/runner');
  assert.equal(child.CI, 'true');
  assert.equal(child.NODE_ENV, 'production');
  assert.equal(child.REACT_APP_API_BASE_URL, STAGING_API_URL);
  assert.equal(Object.keys(child).some((key) => key.startsWith('TASKIO_STAGING_SCAN_')), false);
});

test('staging build env refuses production Firebase fallback values', () => {
  assert.throws(() => assertStagingBuildEnv({
    ...validEnv,
    REACT_APP_FIREBASE_API_KEY: 'AIzaSyAVmOP2j8VIMHWRz9o49JHKqyiszQ5qMOg',
  }), /production Firebase fallback/);
});

test('staging build env refuses production API, live Stripe and testing bypass', () => {
  assert.throws(() => assertStagingBuildEnv({
    ...validEnv,
    REACT_APP_API_BASE_URL: 'https://api.taskio.com.au',
  }), /must use host/);
  assert.throws(() => assertStagingBuildEnv({
    ...validEnv,
    REACT_APP_API_BASE_URL: 'http://localhost:8000',
  }), /HTTPS/);
  assert.throws(() => assertStagingBuildEnv({
    ...validEnv,
    REACT_APP_STRIPE_PUBLISHABLE_KEY: 'pk_live_secret',
  }), /live Stripe/);
  assert.throws(() => assertStagingBuildEnv({
    ...validEnv,
    REACT_APP_DISABLE_PHONE_RECAPTCHA: 'true',
  }), /must not be true/);
  assert.throws(() => assertStagingBuildEnv({
    ...validEnv,
    REACT_APP_FIREBASE_EXPECTED_PROJECT_ID: 'taskio-v2',
  }), /expected project must be/);
});

test('scan fails on production identifiers and bypass assignment, not SDK property names', () => {
  const fixtures = { phone: '', otp: '' };
  assert.deepEqual(scanText('appVerificationDisabledForTesting', fixtures), []);
  assert.deepEqual(scanText('auth.settings.appVerificationDisabledForTesting === true', fixtures), []);
  assert.ok(scanText('auth.settings.appVerificationDisabledForTesting = true', fixtures)[0].includes('testing-bypass'));
  assert.ok(scanText('auth.settings.appVerificationDisabledForTesting=!0', fixtures)[0].includes('testing-bypass'));
  assert.ok(
    scanText('i.emulatorConfig=c,auth.settings.appVerificationDisabledForTesting=!0', fixtures)[0]
      .includes('testing-bypass'),
  );
  assert.deepEqual(scanText('i.emulatorConfig=c,i.settings.appVerificationDisabledForTesting=!0,Nt(a)', fixtures), []);
  assert.ok(scanText('taskio-v2.firebaseapp.com', fixtures).length);
  assert.equal(scanText('taskio-v2-staging.firebaseapp.com', fixtures).filter((f) => f.includes('production')).length, 0);
  assert.ok(scanText('https://api.taskio.com.au/api/me', fixtures).length);
  assert.deepEqual(scanText('continueUri:"http://localhost"', fixtures), []);
  assert.deepEqual(scanText('n="http://localhost"', fixtures), []);
  assert.ok(scanText('REACT_APP_API_BASE_URL:"http://localhost"', fixtures).length);
  assert.ok(scanText('https://localhost:8000/api', fixtures).length);
  assert.ok(scanText('pk_live_abc', fixtures).length);
});

test('scan equality-checks fixtures without using generic digit matching', () => {
  const fixtures = { phone: '+61400009999', otp: '424242' };
  assert.deepEqual(scanText('call 131 445 or code 123456', { phone: '', otp: '' }), []);
  assert.ok(scanText('user +61400009999 signed in', fixtures).some((f) => f.includes('phone fixture')));
  assert.ok(scanText('otp 424242', fixtures).some((f) => f.includes('OTP fixture')));
});

test('scanStagingBundle requires staging identifiers and rejects source maps', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'taskio-scan-'));
  fs.writeFileSync(path.join(dir, 'index.html'), '<html>taskio-v2-staging taskio-api-staging-d6mdcsrwea-ts.a.run.app</html>');
  const ok = scanStagingBundle(dir, {});
  assert.equal(ok.ok, true);
  fs.writeFileSync(path.join(dir, 'main.js.map'), '{}');
  assert.throws(() => scanStagingBundle(dir, {}), /source map/);
});

test('deploy wrapper refuses production project, firebase.json and unknown configs', () => {
  assert.throws(() => buildHostingDeployPlan({
    project: 'taskio-v2',
    config: 'firebase.staging.hosting.json',
  }), /Refusing project/);
  assert.throws(() => buildHostingDeployPlan({
    config: 'firebase.staging.hosting.json',
  }), /Missing --project/);
  assert.throws(() => buildHostingDeployPlan({
    project: STAGING_PROJECT_ID,
    config: 'firebase.json',
  }), /firebase.json/);
  assert.throws(() => buildHostingDeployPlan({
    project: STAGING_PROJECT_ID,
    config: 'firebase.maintenance.json',
  }), /Unknown staging Hosting config/);
  assert.throws(() => buildHostingDeployPlan({
    project: STAGING_PROJECT_ID,
    config: 'firebase.staging.hosting.json',
    extraArgs: ['--project', 'taskio-v2'],
  }), /Unsupported deploy plan option/);
});

test('deploy wrapper constructs a dry-run firebase command for staging configs', () => {
  const plan = buildHostingDeployPlan({
    project: STAGING_PROJECT_ID,
    config: 'firebase.staging.placeholder.json',
  });
  assert.equal(plan.dryRun, true);
  assert.equal(plan.execute, false);
  assert.equal(plan.args[0], 'deploy');
  assert.equal(plan.args[2], STAGING_PROJECT_ID);
  assert.ok(plan.args.includes('--config'));
  assert.ok(plan.args.at(-1).endsWith('firebase.staging.placeholder.json'));
  assert.equal(plan.args.includes('--site'), false);
  assert.equal(plan.args.includes('--channel'), false);
});

test('deploy argv rejects duplicate and overriding project, config, site, channel and version flags', () => {
  assert.throws(() => parseStagingDeployArgv([
    '--project', STAGING_PROJECT_ID,
    '--project', 'taskio-v2',
    '--config', 'firebase.staging.hosting.json',
  ]), /Duplicate --project/);
  assert.throws(() => parseStagingDeployArgv([
    '--project', STAGING_PROJECT_ID,
    '--config', 'firebase.staging.hosting.json',
    '--config', 'firebase.json',
  ]), /Duplicate --config/);
  assert.throws(() => parseStagingDeployArgv([
    '--project', STAGING_PROJECT_ID,
    '--config', 'firebase.staging.hosting.json',
    '--site', 'taskio-v2',
  ]), /--site/);
  assert.throws(() => parseStagingDeployArgv([
    '--project', STAGING_PROJECT_ID,
    '--config', 'firebase.staging.hosting.json',
    '--channel', 'live',
  ]), /--channel/);
  assert.throws(() => parseStagingDeployArgv([
    '--project', STAGING_PROJECT_ID,
    '--clone-version', 'abc123',
    '--version', 'abc123',
  ]), /--version/);
  assert.throws(() => parseStagingDeployArgv([
    '--project=taskio-v2',
    '--config', 'firebase.staging.hosting.json',
  ]), /inline --project=/);
  assert.throws(() => parseStagingDeployArgv([
    '--project', STAGING_PROJECT_ID,
    '--only', 'functions',
  ]), /--only/);
});

test('clone plan uses site@VERSION_ID and requires an explicit staging project', () => {
  const plan = buildHostingClonePlan({
    project: STAGING_PROJECT_ID,
    versionId: 'abc123def',
  });
  assert.equal(plan.args[1], 'taskio-v2-staging@abc123def');
  assert.equal(plan.args[2], 'taskio-v2-staging:live');
  assert.throws(() => buildHostingClonePlan({
    versionId: 'abc123def',
  }), /Clone requires --project/);
  const cloneWithoutProject = parseStagingDeployArgv(['--clone-version', 'abc123def']);
  assert.equal(cloneWithoutProject.project, undefined);
  assert.throws(() => buildHostingClonePlan({
    project: cloneWithoutProject.project,
    versionId: cloneWithoutProject.cloneVersion,
  }), /Clone requires --project/);
  assert.throws(() => buildHostingClonePlan({
    project: STAGING_PROJECT_ID,
    versionId: '@abc123def',
  }), /bare Hosting version ID/);
  assert.throws(() => buildHostingClonePlan({
    project: STAGING_PROJECT_ID,
    versionId: ':abc123def',
  }), /bare Hosting version ID/);
  assert.throws(() => buildHostingClonePlan({
    project: STAGING_PROJECT_ID,
    versionId: '--help',
  }), /bare Hosting version ID/);
  assert.throws(() => parseStagingDeployArgv([
    '--project', STAGING_PROJECT_ID,
    '--clone-version', '--help',
  ]), /bare Hosting version ID/);
});

test('safe deploy-plan validation refuses any change to the pinned command shape', () => {
  const plan = buildHostingDeployPlan({
    project: STAGING_PROJECT_ID,
    config: 'firebase.staging.hosting.json',
    execute: true,
  });
  assert.doesNotThrow(() => assertSafeDeployPlanArgs(plan));
  assert.throws(() => assertSafeDeployPlanArgs({ ...plan, args: [...plan.args, '--debug'] }), /unsafe/);
  assert.throws(() => assertSafeDeployPlanArgs({
    ...plan,
    args: plan.args.map((value, index) => (index === 2 ? 'taskio-v2' : value)),
  }), /unsafe/);
  assert.throws(() => assertSafeDeployPlanArgs({ ...plan, execute: false, dryRun: true }), /dry-run/);
});

test('firebase-tools CLI resolution accepts the installed package entry', (t) => {
  const fixture = createFakeFirebaseTools(t);
  const resolved = resolveFirebaseToolsCliEntry({
    repoRoot: fixture.root,
    resolvePackage: () => fixture.packageJsonPath,
  });
  assert.equal(resolved, fs.realpathSync(fixture.entry));
});

test('firebase-tools CLI resolution fails closed for invalid package states', (t) => {
  const fixture = createFakeFirebaseTools(t);
  assert.throws(() => resolveFirebaseToolsCliEntry({
    repoRoot: fixture.root,
    resolvePackage: () => { throw new Error('missing'); },
  }), /Unable to resolve/);
  assert.throws(() => resolveFirebaseToolsCliEntry({
    repoRoot: fixture.root,
    resolvePackage: () => fixture.packageJsonPath,
    readFileSync: () => '{',
  }), /valid firebase-tools package metadata/);

  fs.writeFileSync(fixture.packageJsonPath, JSON.stringify({ bin: {} }));
  assert.throws(() => resolveFirebaseToolsCliEntry({
    repoRoot: fixture.root,
    resolvePackage: () => fixture.packageJsonPath,
  }), /safe relative bin\.firebase/);

  fs.writeFileSync(fixture.packageJsonPath, JSON.stringify({ bin: { firebase: '../outside.js' } }));
  assert.throws(() => resolveFirebaseToolsCliEntry({
    repoRoot: fixture.root,
    resolvePackage: () => fixture.packageJsonPath,
  }), /inside its package/);

  fs.writeFileSync(fixture.packageJsonPath, JSON.stringify({ bin: { firebase: './missing.js' } }));
  assert.throws(() => resolveFirebaseToolsCliEntry({
    repoRoot: fixture.root,
    resolvePackage: () => fixture.packageJsonPath,
  }), /installed firebase-tools CLI entry/);

  fs.writeFileSync(fixture.packageJsonPath, JSON.stringify({ bin: { firebase: './lib/bin' } }));
  assert.throws(() => resolveFirebaseToolsCliEntry({
    repoRoot: fixture.root,
    resolvePackage: () => fixture.packageJsonPath,
  }), /not a regular file/);
});

test('Windows spawn spec uses Node and the installed firebase-tools entry without a shell', (t) => {
  const fixture = createFakeFirebaseTools(t);
  const plan = buildHostingDeployPlan({
    project: STAGING_PROJECT_ID,
    config: 'firebase.staging.placeholder.json',
    execute: true,
  });
  const spec = buildFirebaseSpawnSpec(plan, {
    platform: 'win32',
    nodeExecutable: 'C:\\Program Files\\nodejs\\node.exe',
    repoRoot: fixture.root,
    resolvePackage: () => fixture.packageJsonPath,
  });
  assert.equal(spec.command, 'C:\\Program Files\\nodejs\\node.exe');
  assert.equal(spec.args[0], fs.realpathSync(fixture.entry));
  assert.deepEqual(spec.args.slice(1), plan.args);
  assert.equal(spec.shell, false);
});

test('POSIX spawn spec preserves the validated argv array and disables the shell', () => {
  const plan = buildHostingDeployPlan({
    project: STAGING_PROJECT_ID,
    config: 'firebase.staging.hosting.json',
    execute: true,
  });
  const spec = buildFirebaseSpawnSpec(plan, { platform: 'linux' });
  assert.equal(spec.command, 'firebase');
  assert.deepEqual(spec.args, plan.args);
  assert.notEqual(spec.args, plan.args);
  assert.equal(spec.shell, false);
});

test('execution resolves before spawn and fails closed without invoking a process', () => {
  const plan = buildHostingDeployPlan({
    project: STAGING_PROJECT_ID,
    config: 'firebase.staging.hosting.json',
    execute: true,
  });
  let spawnCalls = 0;
  assert.throws(() => executeHostingDeployPlan(plan, {
    platform: 'win32',
    resolvePackage: () => { throw new Error('missing'); },
    spawnSync: () => { spawnCalls += 1; return { status: 0 }; },
  }), /Unable to resolve/);
  assert.equal(spawnCalls, 0);
});

test('execution spawns the exact Windows Node entry and reports process failures', (t) => {
  const fixture = createFakeFirebaseTools(t);
  const plan = buildHostingDeployPlan({
    project: STAGING_PROJECT_ID,
    config: 'firebase.staging.hosting.json',
    execute: true,
  });
  let captured;
  executeHostingDeployPlan(plan, {
    platform: 'win32',
    nodeExecutable: 'node-test.exe',
    repoRoot: fixture.root,
    resolvePackage: () => fixture.packageJsonPath,
    stdio: 'pipe',
    spawnSync: (command, args, options) => {
      captured = { command, args, options };
      return { status: 0 };
    },
  });
  assert.equal(captured.command, 'node-test.exe');
  assert.equal(captured.args[0], fs.realpathSync(fixture.entry));
  assert.deepEqual(captured.args.slice(1), plan.args);
  assert.equal(captured.options.shell, false);
  assert.equal(captured.options.cwd, plan.cwd);

  assert.throws(() => executeHostingDeployPlan(plan, {
    platform: 'linux',
    spawnSync: () => ({ error: new Error('ENOENT'), status: null }),
  }), /ENOENT/);
  assert.throws(() => executeHostingDeployPlan(plan, {
    platform: 'linux',
    spawnSync: () => ({ status: 1 }),
  }), /deploy command failed/);
});

test('deploy production sources contain no Windows command-shell fallback', () => {
  const script = fs.readFileSync(path.join(__dirname, 'deploy-staging-hosting.js'), 'utf8');
  const library = fs.readFileSync(path.join(__dirname, 'stagingHostingLib.cjs'), 'utf8');
  assert.equal(script.includes('shell: true'), false);
  assert.equal(library.includes('shell: true'), false);
  assert.equal(script.includes('firebase.cmd'), false);
  assert.equal(library.includes('firebase.cmd'), false);
});

test('staging Hosting configs pin no-store on /, rewritten SPA routes and static assets', () => {
  const spa = loadStagingHostingConfig('firebase.staging.hosting.json');
  const placeholder = loadStagingHostingConfig('firebase.staging.placeholder.json');
  assertNoImmutableCache(spa);
  assertNoImmutableCache(placeholder);
  assert.equal(spa.hosting.site, STAGING_PROJECT_ID);
  assert.equal(placeholder.hosting.site, STAGING_PROJECT_ID);
  assert.equal(spa.hosting.public, 'frontend/build');
  assert.equal(placeholder.hosting.public, 'staging-hosting-placeholder');
  assert.ok(spa.hosting.rewrites && spa.hosting.rewrites.length);
  assert.equal(placeholder.hosting.rewrites, undefined);

  const spaPaths = ['/', '/login', '/post-job', '/static/js/main.js', '/static/css/main.css', '/index.html'];
  for (const requestPath of spaPaths) {
    const headers = headersForHostingRequest(spa, requestPath);
    assert.equal(headers['Cache-Control'], NO_STORE_CACHE, requestPath);
    assert.equal(headers['X-Robots-Tag'], ROBOTS_HEADER, requestPath);
  }

  for (const requestPath of ['/', '/index.html', '/placeholder.css']) {
    const headers = headersForHostingRequest(placeholder, requestPath);
    assert.equal(headers['Cache-Control'], NO_STORE_CACHE, requestPath);
    assert.equal(headers['X-Robots-Tag'], ROBOTS_HEADER, requestPath);
  }
});
