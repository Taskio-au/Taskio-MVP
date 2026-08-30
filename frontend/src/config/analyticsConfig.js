const MEASUREMENT_ID_PATTERN = /^G-[A-Z0-9]+$/i;

const PILOT_SUBURBS = new Set([
  'Melbourne',
  'Southbank',
  'Docklands',
  'South Yarra',
  'Prahran',
  'St Kilda',
  'Richmond',
  'Carlton',
]);

export function resolveAnalyticsEnvironment(projectId) {
  const project = String(projectId || '').trim();
  if (project === 'taskio-v2-staging') return 'staging';
  if (project === 'taskio-v2') return 'production';
  return 'local';
}

export function resolveAnalyticsConfig(env = {}) {
  const environment = resolveAnalyticsEnvironment(env.REACT_APP_FIREBASE_EXPECTED_PROJECT_ID);
  const measurementId = String(env.REACT_APP_GA_MEASUREMENT_ID || '').trim();
  const enabledRequested = env.REACT_APP_ANALYTICS_ENABLED === 'true';

  if (!enabledRequested) {
    return {
      enabled: false,
      measurementId: '',
      environment,
      reason: 'disabled',
    };
  }
  if (!MEASUREMENT_ID_PATTERN.test(measurementId)) {
    return {
      enabled: false,
      measurementId: '',
      environment,
      reason: 'missing_or_invalid_measurement_id',
    };
  }
  return {
    enabled: true,
    measurementId,
    environment,
    reason: 'enabled',
  };
}

export function coercePilotSuburb(value) {
  const suburb = String(value || '').trim();
  return PILOT_SUBURBS.has(suburb) ? suburb : '';
}

export function amountBucketFromCents(cents) {
  const n = Number(cents);
  if (!Number.isFinite(n) || n < 0) return '';
  if (n < 10000) return 'under_100';
  if (n < 25000) return '100_249';
  if (n < 50000) return '250_499';
  return '500_plus';
}
