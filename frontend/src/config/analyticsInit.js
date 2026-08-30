let initialized = false;
let activeConfig = { enabled: false, measurementId: '', environment: 'local' };

export function resetAnalyticsInitForTests() {
  initialized = false;
  activeConfig = { enabled: false, measurementId: '', environment: 'local' };
}

export function getActiveAnalyticsConfig() {
  return activeConfig;
}

function ensureGtag(windowRef) {
  windowRef.dataLayer = windowRef.dataLayer || [];
  if (typeof windowRef.gtag === 'function') return windowRef.gtag;
  function gtag() {
    windowRef.dataLayer.push(arguments);
  }
  windowRef.gtag = gtag;
  return gtag;
}

export function initializeTaskioAnalytics({
  config,
  windowRef,
  documentRef,
  appendScript,
} = {}) {
  activeConfig = config && typeof config === 'object'
    ? config
    : { enabled: false, measurementId: '', environment: 'local' };

  if (!activeConfig.enabled) {
    return { initialized: false, reason: activeConfig.reason || 'disabled' };
  }
  if (initialized) {
    return { initialized: true, reason: 'already_initialized' };
  }
  if (!windowRef || !activeConfig.measurementId) {
    activeConfig = { ...activeConfig, enabled: false };
    return { initialized: false, reason: 'missing_measurement_id' };
  }

  const gtag = ensureGtag(windowRef);
  gtag('js', new Date());
  gtag('config', activeConfig.measurementId, {
    anonymize_ip: true,
    send_page_view: false,
    allow_google_signals: false,
    allow_ad_personalization_signals: false,
  });

  const src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(activeConfig.measurementId)}`;
  if (typeof appendScript === 'function') {
    appendScript(src);
  } else if (documentRef && typeof documentRef.createElement === 'function') {
    const script = documentRef.createElement('script');
    script.async = true;
    script.src = src;
    const parent = documentRef.head || documentRef.body;
    if (parent && typeof parent.appendChild === 'function') parent.appendChild(script);
  }

  initialized = true;
  return { initialized: true, reason: 'initialized' };
}
