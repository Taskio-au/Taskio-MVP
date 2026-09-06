const HOSTED_ORIGINS = new Set([
  'https://taskio-v2-staging.web.app',
  'https://taskio-v2-staging.firebaseapp.com',
  'https://taskio.com.au',
  'https://www.taskio.com.au',
  'https://taskio-v2.web.app',
  'https://taskio-v2.firebaseapp.com',
]);

const STATIC_PATHS = new Set([
  '/',
  '/login',
  '/admin',
  '/get-started',
  '/privacy',
  '/terms',
  '/tradie/signup',
  '/post-job',
  '/auth/action',
  '/account/deletion/confirm',
  '/account/complete',
  '/dashboard',
  '/profile',
  '/settings',
  '/payments',
  '/notifications',
  '/messages',
  '/support',
  '/tradie/dashboard',
  '/tradie/jobs',
  '/tradie/reviews',
  '/tradie/account-settings',
  '/admin/profile',
  '/admin/password',
  '/admin/dashboard',
  '/admin/task-queue',
  '/admin/monitoring',
  '/admin/support',
  '/admin/profile-change-requests',
  '/admin/daily-checklist',
  '/e2e/critical-flows',
]);

const DYNAMIC_PATHS = [
  [/^\/job\/[^/]+$/, '/job/:id'],
  [/^\/job-posted\/[^/]+$/, '/job-posted/:id'],
  [/^\/payment\/[^/]+\/[^/]+$/, '/payment/:id/:id'],
  [/^\/homeowner\/job\/[^/]+$/, '/homeowner/job/:id'],
  [/^\/homeowner\/payment\/[^/]+\/[^/]+$/, '/homeowner/payment/:id/:id'],
  [/^\/tradie\/job\/[^/]+$/, '/tradie/job/:id'],
  [/^\/admin\/job\/[^/]+$/, '/admin/job/:id'],
  [/^\/admin\/user\/[^/]+$/, '/admin/user/:id'],
];

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const FIRESTORE_ID_RE = /^[A-Za-z0-9]{18,28}$/;
const STRIPE_ID_RE = /^(cs|pi|ch|pm|re|tr|acct|evt|in|seti|price|prod)_/i;
const SAFE_SEGMENT_RE = /^[a-z0-9-]{1,32}$/i;

function trimOrigin(value) {
  return String(value || '').trim().replace(/\/+$/, '');
}

function isLoopbackHost(hostname) {
  return /^(localhost|127\.0\.0\.1|\[::1\]|0\.0\.0\.0)$/i.test(String(hostname || ''));
}

function parseUrl(value) {
  try {
    return new URL(String(value || '').trim());
  } catch (_err) {
    return null;
  }
}

function hostedOriginForEnvironment(environment) {
  if (environment === 'production') return 'https://taskio.com.au';
  if (environment === 'staging') return 'https://taskio-v2-staging.web.app';
  return '';
}

function resolvePageOrigin(hrefOrigin, environment) {
  const origin = trimOrigin(hrefOrigin);
  if (HOSTED_ORIGINS.has(origin)) return origin;
  const parsed = parseUrl(origin.includes('://') ? origin : `https://${origin}`);
  if (parsed && isLoopbackHost(parsed.hostname)) {
    return hostedOriginForEnvironment(environment);
  }
  return hostedOriginForEnvironment(environment);
}

function normalizePathname(pathname) {
  const raw = String(pathname || '/').trim() || '/';
  const withSlash = raw.startsWith('/') ? raw : `/${raw}`;
  if (withSlash === '/') return '/';
  return withSlash.replace(/\/+$/, '') || '/';
}

function isSensitiveSegment(segment) {
  const value = String(segment || '');
  if (!value) return true;
  if (value.includes('@')) return true;
  if (UUID_RE.test(value)) return true;
  if (STRIPE_ID_RE.test(value)) return true;
  if (FIRESTORE_ID_RE.test(value)) return true;
  if (value.length > 32) return true;
  if (/[._]/.test(value) && value.length > 12) return true;
  return false;
}

export function canonicalizeAnalyticsPathname(pathname) {
  const path = normalizePathname(pathname);
  if (STATIC_PATHS.has(path)) return path;
  for (const [pattern, canonical] of DYNAMIC_PATHS) {
    if (pattern.test(path)) return canonical;
  }
  const parts = path.split('/').filter(Boolean);
  if (!parts.length) return '/';
  const rebuilt = `/${parts.map((part) => {
    if (!SAFE_SEGMENT_RE.test(part) || isSensitiveSegment(part)) return ':id';
    return part;
  }).join('/')}`;
  if (STATIC_PATHS.has(rebuilt)) return rebuilt;
  return rebuilt.includes(':id') ? rebuilt : '/';
}

function hrefFromParts(href, pathname) {
  if (href) return href;
  const path = pathname || '/';
  return path.includes('://') ? path : `https://taskio.invalid${path.startsWith('/') ? path : `/${path}`}`;
}

export function sanitizeAnalyticsPageContext({
  href,
  pathname,
  referrer = '',
  environment = 'local',
} = {}) {
  const rawHref = hrefFromParts(href, pathname);
  const locationUrl = parseUrl(rawHref);
  const safePath = canonicalizeAnalyticsPathname(locationUrl?.pathname || pathname || '/');
  const origin = resolvePageOrigin(locationUrl?.origin, environment);
  const pageLocation = origin ? `${origin}${safePath}` : safePath;

  let pageReferrer = '';
  const referrerUrl = parseUrl(referrer);
  if (referrerUrl) {
    if (isLoopbackHost(referrerUrl.hostname) && !isLoopbackHost(locationUrl?.hostname)) {
      pageReferrer = '';
    } else if (locationUrl && referrerUrl.origin === locationUrl.origin) {
      const refPath = canonicalizeAnalyticsPathname(referrerUrl.pathname);
      pageReferrer = origin ? `${origin}${refPath}` : refPath;
    } else if (isLoopbackHost(referrerUrl.hostname)) {
      pageReferrer = '';
    } else {
      pageReferrer = referrerUrl.origin;
    }
  }

  return {
    page_location: pageLocation,
    page_referrer: pageReferrer,
  };
}

export function pageContextFromWindow(windowRef, documentRef, environment) {
  const loc = windowRef && windowRef.location;
  const doc = documentRef || (windowRef && windowRef.document);
  return sanitizeAnalyticsPageContext({
    href: loc && loc.href,
    pathname: loc && loc.pathname,
    referrer: doc && doc.referrer,
    environment,
  });
}
