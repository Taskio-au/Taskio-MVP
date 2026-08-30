import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import App from './App';
import AppErrorBoundary from './components/AppErrorBoundary';
import reportWebVitals from './reportWebVitals';
import { resolveAnalyticsConfig } from './config/analyticsConfig';
import { initializeTaskioAnalytics } from './config/analyticsInit';
import { analyticsEnvFromProcess } from './config/runtimeEnv';

try {
  initializeTaskioAnalytics({
    config: resolveAnalyticsConfig(analyticsEnvFromProcess()),
    windowRef: typeof window !== 'undefined' ? window : undefined,
    documentRef: typeof document !== 'undefined' ? document : undefined,
  });
} catch (_err) {
  // Analytics init must never block the app.
}

function sendWebVitals(metric) {
  if (process.env.NODE_ENV !== 'production') return;
  if (typeof window === 'undefined') return;

  if (typeof window.__TASKIO_REPORT_WEB_VITALS__ === 'function') {
    window.__TASKIO_REPORT_WEB_VITALS__(metric);
  }
}

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  <React.StrictMode>
    <AppErrorBoundary>
      <App />
    </AppErrorBoundary>
  </React.StrictMode>
);

reportWebVitals(sendWebVitals);
