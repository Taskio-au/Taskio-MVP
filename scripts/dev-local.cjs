'use strict';

// Runs inside `firebase emulators:exec` (see `npm run dev:local`): starts the API on :8000 and
// the React dev server on :3000, both wired to the Auth and Firestore emulators.

const path = require('path');
const { spawn, spawnSync } = require('child_process');
const { backendEnv, frontendEnv, readEmulatorEnv } = require('./localDevEnv.cjs');

const root = path.resolve(__dirname, '..');
const backendDir = path.join(root, 'backend');
const frontendDir = path.join(root, 'frontend');

function main() {
  let emulators;
  try {
    emulators = readEmulatorEnv(process.env);
  } catch (error) {
    console.error(`[dev:local] ${error.message}`);
    process.exit(1);
  }
  console.log(`[dev:local] ${emulators.projectId}: Auth emulator ${emulators.authHost}, Firestore emulator ${emulators.firestoreHost}`);

  const sync = spawnSync(process.execPath, ['scripts/syncShared.js'], { cwd: frontendDir, stdio: 'inherit' });
  if (sync.status !== 0) process.exit(sync.status || 1);

  const reactScriptsStart = require.resolve('react-scripts/scripts/start', { paths: [frontendDir] });
  const children = [
    spawn(process.execPath, ['src/server.js'], { cwd: backendDir, env: backendEnv(process.env), stdio: 'inherit' }),
    spawn(process.execPath, [reactScriptsStart], { cwd: frontendDir, env: frontendEnv(process.env), stdio: 'inherit' }),
  ];

  let stopping = false;
  const stopAll = (code) => {
    if (stopping) return;
    stopping = true;
    process.exitCode = code;
    children.forEach((child) => {
      if (child.exitCode === null) child.kill();
    });
  };
  children.forEach((child) => child.on('exit', (code) => stopAll(code ?? 1)));
  ['SIGINT', 'SIGTERM'].forEach((signal) => process.on(signal, () => stopAll(0)));
}

main();
