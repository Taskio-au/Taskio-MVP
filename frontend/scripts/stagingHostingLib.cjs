'use strict';

const fs = require('fs');
const path = require('path');

const STAGING_PROJECT_ID = 'taskio-v2-staging';
const PRODUCTION_PROJECT_ID = 'taskio-v2';
const STAGING_API_HOST = 'taskio-api-staging-d6mdcsrwea-ts.a.run.app';
const PRODUCTION_API_HOST = 'api.taskio.com.au';
const STAGING_API_URL = `https://${STAGING_API_HOST}`;
const NO_STORE_CACHE = 'no-store, max-age=0, must-revalidate';
const ROBOTS_HEADER = 'noindex, nofollow, noarchive';

const FIREBASE_ENV_KEYS = [
  'REACT_APP_FIREBASE_API_KEY',
  'REACT_APP_FIREBASE_AUTH_DOMAIN',
  'REACT_APP_FIREBASE_PROJECT_ID',
  'REACT_APP_FIREBASE_STORAGE_BUCKET',
  'REACT_APP_FIREBASE_MESSAGING_SENDER_ID',
  'REACT_APP_FIREBASE_APP_ID',
];

const ALLOWED_HOSTING_CONFIGS = [
  'firebase.staging.placeholder.json',
  'firebase.staging.hosting.json',
];

const PRODUCTION_FALLBACK_FINGERPRINTS = [
  'AIzaSyAVmOP2j8VIMHWRz9o49JHKqyiszQ5qMOg',
  'taskio-v2.firebaseapp.com',
  'taskio-v2.firebasestorage.app',
  '848916998874',
  '1:848916998874:web:718d57c9621cb15461d3e3',
];

const SCAN_EXTENSIONS = new Set(['.html', '.js', '.css', '.json', '.webmanifest', '.txt']);

const STAGING_REACT_APP_ALLOWLIST = new Set([
  'REACT_APP_FIREBASE_EXPECTED_PROJECT_ID',
  ...FIREBASE_ENV_KEYS,
  'REACT_APP_API_BASE_URL',
  'REACT_APP_STRIPE_PUBLISHABLE_KEY',
  'REACT_APP_DISABLE_PHONE_RECAPTCHA',
  'REACT_APP_E2E_AUTH_BYPASS',
  'REACT_APP_APPCHECK_ENABLED',
  'REACT_APP_APPCHECK_SITE_KEY',
]);

const OS_ESSENTIAL_NAMES = [
  'PATH',
  'PATHEXT',
  'SystemRoot',
  'SYSTEMROOT',
  'windir',
  'WINDIR',
  'ComSpec',
  'COMSPEC',
  'TEMP',
  'TMP',
  'TMPDIR',
  'HOME',
  'USERPROFILE',
  'HOMEDRIVE',
  'HOMEPATH',
  'APPDATA',
  'LOCALAPPDATA',
  'ProgramData',
  'ProgramFiles',
  'ProgramFiles(x86)',
  'ProgramW6432',
  'CommonProgramFiles',
  'CommonProgramFiles(x86)',
  'SystemDrive',
  'SYSTEMDRIVE',
  'OS',
  'PROCESSOR_ARCHITECTURE',
  'NUMBER_OF_PROCESSORS',
  'USER',
  'USERNAME',
  'LOGNAME',
  'SHELL',
  'LANG',
  'LC_ALL',
  'LC_CTYPE',
  'TZ',
  'TERM',
  'PUBLIC',
  'ALLUSERSPROFILE',
  'COMPUTERNAME',
  'USERDOMAIN',
  'SESSIONNAME',
  'PROMPT',
];

const ALLOWED_DEPLOY_FLAGS = new Set([
  '--execute',
  '--dry-run',
  '--project',
  '--config',
  '--clone-version',
]);

const FORBIDDEN_OVERRIDE_FLAGS = new Set([
  '--site',
  '--channel',
  '--version',
  '--only',
  '--token',
  '--except',
  '--message',
]);

function repoRootFromScripts() {
  return path.resolve(__dirname, '..', '..');
}

function isForbiddenChildEnvKey(key) {
  const upper = String(key).toUpperCase();
  if (upper === 'NODE_OPTIONS') return true;
  if (upper === 'FIREBASE_TOKEN' || upper === 'FIREBASE_AUTH_TOKEN') return true;
  if (upper.startsWith('TASKIO_STAGING_SCAN_')) return true;
  if (upper === 'GOOGLE_APPLICATION_CREDENTIALS' || upper === 'GOOGLE_GHA_CREDS_PATH') return true;
  if (upper.startsWith('CLOUDSDK_') || upper.startsWith('GCLOUD_')) return true;
  if (upper === 'NPM_TOKEN' || upper === 'NODE_AUTH_TOKEN' || upper === 'NPM_CONFIG_TOKEN') return true;
  if (upper === 'GITHUB_TOKEN' || upper === 'GH_TOKEN') return true;
  if (upper.startsWith('NPM_CONFIG_')) return true;
  return false;
}

function pickEnvKey(env, name) {
  if (Object.prototype.hasOwnProperty.call(env, name) && env[name] != null && env[name] !== '') {
    return name;
  }
  const found = Object.keys(env).find((key) => key.toLowerCase() === name.toLowerCase());
  if (found && env[found] != null && env[found] !== '') return found;
  return null;
}

function copyOsEssentials(dest, env) {
  const copied = new Set();
  for (const name of OS_ESSENTIAL_NAMES) {
    const key = pickEnvKey(env, name);
    if (!key || copied.has(key.toLowerCase()) || isForbiddenChildEnvKey(key)) continue;
    dest[key] = env[key];
    copied.add(key.toLowerCase());
  }
}

function collectDotenvReactAppKeys(frontendRoot) {
  const names = new Set();
  const files = ['.env', '.env.local', '.env.production', '.env.production.local'];
  for (const file of files) {
    const fullPath = path.join(frontendRoot, file);
    if (!fs.existsSync(fullPath)) continue;
    const text = fs.readFileSync(fullPath, 'utf8');
    for (const line of text.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const match = trimmed.match(/^(?:export\s+)?(REACT_APP_[A-Z0-9_]+)\s*=/);
      if (match) names.add(match[1]);
    }
  }
  return names;
}

function unapprovedReactAppKeyNames(env, frontendRoot) {
  const names = collectDotenvReactAppKeys(frontendRoot);
  for (const key of Object.keys(env)) {
    if (key.startsWith('REACT_APP_')) names.add(key);
  }
  for (const allowed of STAGING_REACT_APP_ALLOWLIST) names.delete(allowed);
  return names;
}

function containsProductionProjectId(text) {
  return /(?:^|[^a-z0-9-])taskio-v2(?!-staging)(?:[^a-z0-9-]|$)/i.test(String(text));
}

function parseApiUrl(value, label) {
  let parsed;
  try {
    parsed = new URL(String(value || '').trim());
  } catch (_error) {
    throw new Error(`${label} must be an absolute URL.`);
  }
  return parsed;
}

function assertStagingBuildEnv(env) {
  const expectedProject = String(env.REACT_APP_FIREBASE_EXPECTED_PROJECT_ID || '').trim();
  if (!expectedProject) {
    throw new Error('REACT_APP_FIREBASE_EXPECTED_PROJECT_ID is required for a staging build.');
  }
  if (expectedProject !== STAGING_PROJECT_ID) {
    throw new Error(`Staging build expected project must be ${STAGING_PROJECT_ID}.`);
  }

  const missing = FIREBASE_ENV_KEYS.filter((key) => !String(env[key] || '').trim());
  if (missing.length) {
    throw new Error(`Staging build requires complete explicit Firebase configuration. Missing: ${missing.join(', ')}.`);
  }

  if (String(env.REACT_APP_FIREBASE_PROJECT_ID).trim() === PRODUCTION_PROJECT_ID) {
    throw new Error('REACT_APP_FIREBASE_PROJECT_ID must be taskio-v2-staging.');
  }
  if (String(env.REACT_APP_FIREBASE_PROJECT_ID).trim() !== STAGING_PROJECT_ID) {
    throw new Error('REACT_APP_FIREBASE_PROJECT_ID must be taskio-v2-staging.');
  }
  if (String(env.REACT_APP_FIREBASE_AUTH_DOMAIN).trim() !== `${STAGING_PROJECT_ID}.firebaseapp.com`) {
    throw new Error('REACT_APP_FIREBASE_AUTH_DOMAIN must belong to taskio-v2-staging.');
  }
  const storageBucket = String(env.REACT_APP_FIREBASE_STORAGE_BUCKET).trim();
  if (
    storageBucket !== `${STAGING_PROJECT_ID}.firebasestorage.app`
    && storageBucket !== `${STAGING_PROJECT_ID}.appspot.com`
  ) {
    throw new Error('REACT_APP_FIREBASE_STORAGE_BUCKET must belong to taskio-v2-staging.');
  }

  const apiUrl = parseApiUrl(env.REACT_APP_API_BASE_URL, 'REACT_APP_API_BASE_URL');
  if (apiUrl.protocol !== 'https:') {
    throw new Error('Staging API URL must use HTTPS.');
  }
  if (apiUrl.hostname !== STAGING_API_HOST) {
    throw new Error(`Staging API URL must use host ${STAGING_API_HOST}.`);
  }
  if (apiUrl.hostname === PRODUCTION_API_HOST || /localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\]/i.test(apiUrl.hostname)) {
    throw new Error('Staging API URL must not use a production or loopback host.');
  }

  const stripeKey = String(env.REACT_APP_STRIPE_PUBLISHABLE_KEY || '').trim();
  if (stripeKey) {
    if (stripeKey.startsWith('pk_live_')) {
      throw new Error('Staging builds must not embed a live Stripe publishable key.');
    }
    if (!stripeKey.startsWith('pk_test_')) {
      throw new Error('If supplied, REACT_APP_STRIPE_PUBLISHABLE_KEY must be a pk_test_ key.');
    }
  }

  if (String(env.REACT_APP_DISABLE_PHONE_RECAPTCHA || '').toLowerCase() === 'true') {
    throw new Error('REACT_APP_DISABLE_PHONE_RECAPTCHA must not be true for a staging production build.');
  }
  if (String(env.REACT_APP_E2E_AUTH_BYPASS || '').toLowerCase() === 'true') {
    throw new Error('REACT_APP_E2E_AUTH_BYPASS must not be true for a staging production build.');
  }
  if (String(env.REACT_APP_APPCHECK_DEBUG_TOKEN || '').trim()) {
    throw new Error('REACT_APP_APPCHECK_DEBUG_TOKEN is forbidden in staging production builds.');
  }

  for (const key of FIREBASE_ENV_KEYS) {
    const value = String(env[key] || '').trim();
    if (PRODUCTION_FALLBACK_FINGERPRINTS.includes(value)) {
      throw new Error(`${key} must not reuse the production Firebase fallback.`);
    }
  }
}

function stagingBuildChildEnv(env, frontendRoot = path.resolve(__dirname, '..')) {
  assertStagingBuildEnv(env);
  const child = {};
  copyOsEssentials(child, env);

  child.NODE_ENV = 'production';
  child.CI = 'true';
  child.GENERATE_SOURCEMAP = 'false';
  child.INLINE_RUNTIME_CHUNK = 'false';

  child.REACT_APP_FIREBASE_EXPECTED_PROJECT_ID = String(env.REACT_APP_FIREBASE_EXPECTED_PROJECT_ID).trim();
  for (const key of FIREBASE_ENV_KEYS) {
    child[key] = String(env[key]).trim();
  }
  child.REACT_APP_API_BASE_URL = String(env.REACT_APP_API_BASE_URL).trim();

  const stripeKey = String(env.REACT_APP_STRIPE_PUBLISHABLE_KEY || '').trim();
  if (stripeKey) {
    child.REACT_APP_STRIPE_PUBLISHABLE_KEY = stripeKey;
  }

  if (String(env.REACT_APP_APPCHECK_ENABLED || '').trim() === 'true') {
    child.REACT_APP_APPCHECK_ENABLED = 'true';
    child.REACT_APP_APPCHECK_SITE_KEY = String(env.REACT_APP_APPCHECK_SITE_KEY || '').trim();
  }

  child.REACT_APP_DISABLE_PHONE_RECAPTCHA = 'false';
  child.REACT_APP_E2E_AUTH_BYPASS = 'false';

  for (const key of unapprovedReactAppKeyNames(env, frontendRoot)) {
    child[key] = '';
  }
  child.REACT_APP_APPCHECK_DEBUG_TOKEN = '';
  child.REACT_APP_E2E_HARNESS_BUILD = '';

  return child;
}

function walkFiles(dir, files = []) {
  if (!fs.existsSync(dir)) return files;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walkFiles(full, files);
    else files.push(full);
  }
  return files;
}

function listSourceMapFiles(buildDir) {
  return walkFiles(buildDir).filter((file) => file.endsWith('.map'));
}

function isScanTarget(filePath) {
  if (filePath.endsWith('.map')) return false;
  return SCAN_EXTENSIONS.has(path.extname(filePath).toLowerCase());
}

function loadOptionalFixtures(env) {
  const filePath = String(env.TASKIO_STAGING_SCAN_FIXTURE_FILE || '').trim();
  if (filePath) {
    const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    return {
      phone: parsed.phone ? String(parsed.phone) : '',
      otp: parsed.otp ? String(parsed.otp) : '',
    };
  }
  return {
    phone: String(env.TASKIO_STAGING_SCAN_PHONE || ''),
    otp: String(env.TASKIO_STAGING_SCAN_OTP || ''),
  };
}

function containsTestingBypassAssignment(text) {
  return /\bauth\.settings\.appVerificationDisabledForTesting\s*(?<![<>!=])=(?!=)\s*(?:true|!0)\b/.test(String(text));
}

function containsLoopbackApiBase(text) {
  const source = String(text);
  return (
    /REACT_APP_API_BASE_URL["']?\s*[:=]\s*["']https?:\/\/(?:localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\])/i.test(source)
    || /(?:API_BASE_URL|apiBaseUrl|baseURL)["']?\s*[:=]\s*["']https?:\/\/(?:localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\])/i.test(source)
    || /https?:\/\/(?:localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\]):8000\b/i.test(source)
    || /https?:\/\/(?:localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\])(?::\d+)?\/(?:api|v1)\b/i.test(source)
    || /return\s*["']https?:\/\/(?:localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\])/i.test(source)
  );
}

function scanText(text, fixtures) {
  const findings = [];
  if (containsTestingBypassAssignment(text)) {
    findings.push('application testing-bypass assignment is present');
  }
  if (/REACT_APP_DISABLE_PHONE_RECAPTCHA["']?\s*[:=]\s*["']true["']/.test(text)) {
    findings.push('testing-bypass env compiled as true');
  }
  if (containsProductionProjectId(text)) {
    findings.push('production Firebase project identifier is present');
  }
  if (PRODUCTION_FALLBACK_FINGERPRINTS.some((fingerprint) => fingerprint && text.includes(fingerprint))) {
    findings.push('production Firebase fallback identifier is present');
  }
  if (text.includes(PRODUCTION_API_HOST)) {
    findings.push('production API host is present');
  }
  if (containsLoopbackApiBase(text)) {
    findings.push('localhost or loopback API base is present');
  }
  if (/\bpk_live_/.test(text)) {
    findings.push('live Stripe publishable key is present');
  }
  if (fixtures.phone && text.includes(fixtures.phone)) {
    findings.push('configured phone fixture is present');
  }
  if (fixtures.otp && text.includes(fixtures.otp)) {
    findings.push('configured OTP fixture is present');
  }
  return findings;
}

function scanStagingBundle(buildDir, env = process.env) {
  if (!fs.existsSync(buildDir)) {
    throw new Error(`Staging build directory is missing: ${buildDir}`);
  }
  const maps = listSourceMapFiles(buildDir);
  if (maps.length) {
    throw new Error('Staging build must not contain source map files.');
  }
  const fixtures = loadOptionalFixtures(env);
  const files = walkFiles(buildDir).filter(isScanTarget);
  const allFindings = [];
  let combined = '';
  for (const file of files) {
    const text = fs.readFileSync(file, 'utf8');
    combined += `\n${text}`;
    const findings = scanText(text, fixtures);
    for (const finding of findings) {
      allFindings.push({ file: path.relative(buildDir, file).replace(/\\/g, '/'), finding });
    }
  }
  if (!combined.includes(STAGING_PROJECT_ID)) {
    allFindings.push({ file: '.', finding: 'staging project identifier is missing' });
  }
  if (!combined.includes(STAGING_API_HOST)) {
    allFindings.push({ file: '.', finding: 'staging API host is missing' });
  }
  if (allFindings.length) {
    const summary = allFindings.map((item) => `${item.file}: ${item.finding}`).join('; ');
    throw new Error(`Staging bundle scan failed: ${summary}`);
  }
  return { ok: true, filesScanned: files.length };
}

function resolveHostingConfigPath(configArg, root) {
  const base = path.basename(String(configArg || ''));
  if (!base || base === 'firebase.json') {
    throw new Error('Refusing firebase.json or a missing Hosting config.');
  }
  if (!ALLOWED_HOSTING_CONFIGS.includes(base)) {
    throw new Error(`Unknown staging Hosting config: ${base}`);
  }
  return path.join(root, base);
}

function parseEqualsFlag(token) {
  const equals = String(token).indexOf('=');
  if (equals <= 0) return null;
  return {
    flag: token.slice(0, equals),
    value: token.slice(equals + 1),
  };
}

function parseStagingDeployArgv(argv) {
  const parsed = {};
  const seen = {
    project: false,
    config: false,
    cloneVersion: false,
    execute: false,
    dryRun: false,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const token = String(argv[i] || '');
    const inline = parseEqualsFlag(token);
    const flag = inline ? inline.flag : token;

    if (FORBIDDEN_OVERRIDE_FLAGS.has(flag) || flag === '-P' || flag === '-c') {
      throw new Error(`Refusing ${flag}. Staging Hosting pins project, site, channel and version.`);
    }
    if (inline && (flag === '--project' || flag === '--config' || flag === '--clone-version')) {
      throw new Error(`Refusing inline ${flag}=. Use a separate argument.`);
    }
    if (!ALLOWED_DEPLOY_FLAGS.has(flag)) {
      throw new Error(`Unknown or overriding staging Hosting argument: ${flag || token}`);
    }

    if (flag === '--execute') {
      if (seen.execute) throw new Error('Duplicate --execute is refused.');
      seen.execute = true;
      parsed.execute = true;
      continue;
    }
    if (flag === '--dry-run') {
      if (seen.dryRun) throw new Error('Duplicate --dry-run is refused.');
      seen.dryRun = true;
      parsed.dryRun = true;
      continue;
    }
    if (flag === '--project') {
      if (seen.project) throw new Error('Duplicate --project is refused.');
      seen.project = true;
      parsed.project = argv[++i];
      if (!parsed.project || String(parsed.project).startsWith('-')) {
        throw new Error('Missing --project. Staging Hosting requires taskio-v2-staging.');
      }
      continue;
    }
    if (flag === '--config') {
      if (seen.config) throw new Error('Duplicate --config is refused.');
      seen.config = true;
      parsed.config = argv[++i];
      if (!parsed.config || String(parsed.config).startsWith('-')) {
        throw new Error('Refusing firebase.json or a missing Hosting config.');
      }
      continue;
    }
    if (flag === '--clone-version') {
      if (seen.cloneVersion) throw new Error('Duplicate --clone-version is refused.');
      seen.cloneVersion = true;
      parsed.cloneVersion = argv[++i];
      if (!parsed.cloneVersion || String(parsed.cloneVersion).startsWith('-')) {
        throw new Error('Clone version must be a bare Hosting version ID used as site@VERSION_ID.');
      }
    }
  }

  return parsed;
}

function buildHostingDeployPlan(options = {}) {
  for (const key of Object.keys(options)) {
    if (!['project', 'config', 'execute'].includes(key)) {
      throw new Error(`Unsupported deploy plan option: ${key}`);
    }
  }
  const { project, config, execute = false } = options;
  if (!project) {
    throw new Error('Missing --project. Staging Hosting requires taskio-v2-staging.');
  }
  if (project === PRODUCTION_PROJECT_ID || project !== STAGING_PROJECT_ID) {
    throw new Error(`Refusing project ${project}. Staging Hosting accepts only ${STAGING_PROJECT_ID}.`);
  }
  const root = repoRootFromScripts();
  const configPath = resolveHostingConfigPath(config, root);
  return {
    command: 'firebase',
    args: [
      'deploy',
      '--project',
      STAGING_PROJECT_ID,
      '--only',
      'hosting',
      '--config',
      configPath,
    ],
    cwd: root,
    execute: execute === true,
    dryRun: execute !== true,
  };
}

function buildHostingClonePlan(options = {}) {
  for (const key of Object.keys(options)) {
    if (!['project', 'versionId'].includes(key)) {
      throw new Error(`Unsupported clone plan option: ${key}`);
    }
  }
  const { project, versionId } = options;
  if (!project) {
    throw new Error(`Clone requires --project ${STAGING_PROJECT_ID}.`);
  }
  if (project !== STAGING_PROJECT_ID) {
    throw new Error(`Clone requires --project ${STAGING_PROJECT_ID}.`);
  }
  if (
    !versionId
    || String(versionId).startsWith('-')
    || String(versionId).includes(':')
    || String(versionId).startsWith('@')
  ) {
    throw new Error('Clone version must be a bare Hosting version ID used as site@VERSION_ID.');
  }
  if (!/^[A-Za-z0-9_-]+$/.test(versionId)) {
    throw new Error('Clone version ID has an unexpected shape.');
  }
  return {
    command: 'firebase',
    args: [
      'hosting:clone',
      `${STAGING_PROJECT_ID}@${versionId}`,
      `${STAGING_PROJECT_ID}:live`,
      '--project',
      STAGING_PROJECT_ID,
    ],
    dryRun: true,
  };
}

function assertSafeDeployPlanArgs(plan) {
  const root = repoRootFromScripts();
  const allowedConfigPaths = ALLOWED_HOSTING_CONFIGS.map((config) => path.join(root, config));
  const args = plan && Array.isArray(plan.args) ? plan.args : [];

  if (!plan || plan.command !== 'firebase' || plan.cwd !== root) {
    throw new Error('Refusing an invalid Firebase Hosting deploy plan.');
  }
  if (plan.execute !== true || plan.dryRun !== false) {
    throw new Error('Refusing to spawn a dry-run Firebase Hosting deploy plan.');
  }
  if (
    args.length !== 7
    || args[0] !== 'deploy'
    || args[1] !== '--project'
    || args[2] !== STAGING_PROJECT_ID
    || args[3] !== '--only'
    || args[4] !== 'hosting'
    || args[5] !== '--config'
    || !allowedConfigPaths.includes(args[6])
  ) {
    throw new Error('Refusing unsafe Firebase Hosting deploy arguments.');
  }
  return plan;
}

function isPathInside(parent, candidate) {
  const relative = path.relative(parent, candidate);
  return relative !== '' && !relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative);
}

function resolveFirebaseToolsCliEntry(options = {}) {
  const root = options.repoRoot || repoRootFromScripts();
  const resolvePackage = options.resolvePackage || ((request, resolveOptions) => require.resolve(request, resolveOptions));
  const readFileSync = options.readFileSync || fs.readFileSync;
  const realpathSync = options.realpathSync || fs.realpathSync;
  const statSync = options.statSync || fs.statSync;

  let packageJsonPath;
  try {
    packageJsonPath = resolvePackage('firebase-tools/package.json', { paths: [root] });
  } catch (_error) {
    throw new Error('Unable to resolve the repository firebase-tools package. Run npm ci at the repository root.');
  }

  let metadata;
  try {
    metadata = JSON.parse(readFileSync(packageJsonPath, 'utf8'));
  } catch (_error) {
    throw new Error('Unable to read valid firebase-tools package metadata.');
  }

  const binEntry = typeof metadata.bin === 'string' ? metadata.bin : metadata.bin && metadata.bin.firebase;
  if (typeof binEntry !== 'string' || !binEntry.trim() || path.isAbsolute(binEntry)) {
    throw new Error('firebase-tools package metadata does not declare a safe relative bin.firebase entry.');
  }

  const packageDir = path.dirname(packageJsonPath);
  const candidate = path.resolve(packageDir, binEntry);
  if (!isPathInside(packageDir, candidate)) {
    throw new Error('firebase-tools bin.firebase must stay inside its package directory.');
  }

  let realPackageDir;
  let realEntry;
  let entryStat;
  try {
    realPackageDir = realpathSync(packageDir);
    realEntry = realpathSync(candidate);
    entryStat = statSync(realEntry);
  } catch (_error) {
    throw new Error('Unable to resolve the installed firebase-tools CLI entry.');
  }
  if (!isPathInside(realPackageDir, realEntry) || !entryStat.isFile()) {
    throw new Error('The installed firebase-tools CLI entry is not a regular file inside its package.');
  }
  return realEntry;
}

function buildFirebaseSpawnSpec(plan, options = {}) {
  assertSafeDeployPlanArgs(plan);
  const entry = resolveFirebaseToolsCliEntry(options);
  return {
    command: options.nodeExecutable || process.execPath,
    args: [entry, ...plan.args],
    shell: false,
  };
}

function firebaseSourceMatches(source, requestPath) {
  if (source === '**') return true;
  if (source === '/') return requestPath === '/';
  if (source === '**/*.html') return requestPath.endsWith('.html');
  if (source === '**/*.@(html|css)') return /\.(html|css)$/.test(requestPath);
  if (source === '**/*.@(js|css|woff2)') return /\.(js|css|woff2)$/.test(requestPath);
  return source === requestPath;
}

function headersForHostingRequest(config, requestPath) {
  const headers = {};
  for (const rule of config.hosting.headers || []) {
    if (!firebaseSourceMatches(rule.source, requestPath)) continue;
    for (const header of rule.headers || []) {
      headers[header.key] = header.value;
    }
  }
  return headers;
}

function loadStagingHostingConfig(fileName) {
  const configPath = resolveHostingConfigPath(fileName, repoRootFromScripts());
  return JSON.parse(fs.readFileSync(configPath, 'utf8'));
}

function assertNoImmutableCache(config) {
  const serialized = JSON.stringify(config);
  if (/immutable/i.test(serialized) || /max-age=31536000/i.test(serialized)) {
    throw new Error('Staging Hosting must not set immutable long-cache headers.');
  }
}

module.exports = {
  STAGING_PROJECT_ID,
  PRODUCTION_PROJECT_ID,
  STAGING_API_HOST,
  PRODUCTION_API_HOST,
  STAGING_API_URL,
  NO_STORE_CACHE,
  ROBOTS_HEADER,
  ALLOWED_HOSTING_CONFIGS,
  containsProductionProjectId,
  assertStagingBuildEnv,
  stagingBuildChildEnv,
  isForbiddenChildEnvKey,
  listSourceMapFiles,
  scanStagingBundle,
  scanText,
  containsTestingBypassAssignment,
  containsLoopbackApiBase,
  parseStagingDeployArgv,
  buildHostingDeployPlan,
  buildHostingClonePlan,
  assertSafeDeployPlanArgs,
  resolveFirebaseToolsCliEntry,
  buildFirebaseSpawnSpec,
  resolveHostingConfigPath,
  headersForHostingRequest,
  loadStagingHostingConfig,
  assertNoImmutableCache,
  repoRootFromScripts,
};
