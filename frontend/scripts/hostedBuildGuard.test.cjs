'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { runHostedBuild, assertNoHostedAppCheckDebug, assertNoHostedFirebaseEmulators } = require('./hostedBuildGuard.cjs');
const marker = 'P05_SYNTHETIC_MARKER_NOT_A_CREDENTIAL';

for (const project of ['taskio-v2', 'taskio-v2-staging']) {
  for (const source of ['process', 'dotenv']) {
    test(`${project}: ${source} debug configuration cannot reach compiler or artifact`, () => {
      const env = { REACT_APP_FIREBASE_EXPECTED_PROJECT_ID: project };
      if (source === 'process') env.REACT_APP_APPCHECK_DEBUG_TOKEN = marker;
      let artifact;
      let compiled = false;
      assert.throws(() => runHostedBuild({ env,
        loadEnv: () => { env.REACT_APP_APPCHECK_DEBUG_TOKEN = marker; },
        compile: () => { compiled = true; artifact = JSON.stringify(env); },
      }), /forbidden/);
      assert.equal(compiled, false);
      assert.equal(artifact, undefined);
    });
  }
  test(`${project}: clean hosted environment reaches compiler in production mode`, () => {
    const env = { NODE_ENV: 'development', REACT_APP_FIREBASE_EXPECTED_PROJECT_ID: project };
    let loaded = false;
    runHostedBuild({ env, loadEnv: () => { loaded = true; }, compile: () => {
      assert.equal(loaded, true);
      assert.equal(env.NODE_ENV, 'production');
      assert.equal(env.BABEL_ENV, 'production');
      assert.equal(JSON.stringify(env).includes(marker), false);
    } });
  });
}
test('rejects true and SDK debug configuration without disclosing values', () => {
  for (const key of ['REACT_APP_APPCHECK_DEBUG_TOKEN', 'FIREBASE_APPCHECK_DEBUG_TOKEN']) {
    for (const value of ['true', marker]) {
      assert.throws(() => assertNoHostedAppCheckDebug({ [key]: value }), error =>
        error.message.includes('forbidden') && !error.message.includes(value));
    }
  }
});

for (const project of ['taskio-v2', 'taskio-v2-staging']) {
  for (const key of ['REACT_APP_USE_FIREBASE_EMULATORS', 'REACT_APP_FIREBASE_AUTH_EMULATOR_HOST', 'REACT_APP_FIRESTORE_EMULATOR_HOST']) {
    test(`${project}: ${key} from process or dotenv cannot reach the compiler`, () => {
      for (const source of ['process', 'dotenv']) {
        const env = { REACT_APP_FIREBASE_EXPECTED_PROJECT_ID: project };
        const value = key === 'REACT_APP_USE_FIREBASE_EMULATORS' ? 'true' : '127.0.0.1:9099';
        if (source === 'process') env[key] = value;
        let compiled = false;
        assert.throws(() => runHostedBuild({ env,
          loadEnv: () => { env[key] = value; },
          compile: () => { compiled = true; },
        }), (error) => error.code === 'TASKIO_EMULATOR_BUILD' && /forbidden/.test(error.message));
        assert.equal(compiled, false);
      }
    });
  }
}
test('emulator guard accepts a clean hosted environment', () => {
  assert.doesNotThrow(() => assertNoHostedFirebaseEmulators({ REACT_APP_USE_FIREBASE_EMULATORS: '' }));
});

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
for (const filename of ['.env.production.local', '.env.local', '.env.production', '.env']) {
  test(`actual hosted entry rejects debug from ${filename} without creating an artifact`, t => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'taskio-hosted-guard-'));
    t.after(() => fs.rmSync(root, { recursive: true, force: true }));
    fs.writeFileSync(path.join(root, 'package.json'), '{"name":"synthetic-build-fixture"}');
    fs.writeFileSync(path.join(root, filename), `REACT_APP_APPCHECK_DEBUG_TOKEN=${marker}\n`);
    const env = {};
    for (const key of ['PATH', 'Path', 'SystemRoot', 'SYSTEMROOT', 'TEMP', 'TMP']) {
      if (process.env[key]) env[key] = process.env[key];
    }
    const result = spawnSync(process.execPath, [path.join(__dirname, 'build-hosted.cjs')], {
      cwd: root, env, encoding: 'utf8', timeout: 15000,
    });
    assert.equal(result.status, 1);
    assert.match(result.stderr, /App Check debug configuration is forbidden/);
    assert.equal((result.stdout + result.stderr).includes(marker), false);
    assert.equal(fs.existsSync(path.join(root, 'build')), false);
  });
}
test('actual hosted entry rejects Firebase emulator settings from .env.local', t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'taskio-hosted-guard-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.writeFileSync(path.join(root, 'package.json'), '{"name":"synthetic-build-fixture"}');
  fs.writeFileSync(path.join(root, '.env.local'), 'REACT_APP_USE_FIREBASE_EMULATORS=true\n');
  const env = {};
  for (const key of ['PATH', 'Path', 'SystemRoot', 'SYSTEMROOT', 'TEMP', 'TMP']) {
    if (process.env[key]) env[key] = process.env[key];
  }
  const result = spawnSync(process.execPath, [path.join(__dirname, 'build-hosted.cjs')], {
    cwd: root, env, encoding: 'utf8', timeout: 15000,
  });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /Firebase emulator configuration is forbidden/);
  assert.equal(fs.existsSync(path.join(root, 'build')), false);
});
