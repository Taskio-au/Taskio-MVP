import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import App from './App';
import AppErrorBoundary from './components/AppErrorBoundary';
import reportWebVitals from './reportWebVitals';

function sendWebVitals(metric) {
  if (process.env.NODE_ENV !== 'production') return;
  if (typeof window === 'undefined') return;

  if (typeof window.__TASKIO_REPORT_WEB_VITALS__ === 'function') {
    window.__TASKIO_REPORT_WEB_VITALS__(metric);
  }

  if (typeof window.gtag === 'function') {
    window.gtag('event', metric.name, {
      event_category: 'Web Vitals',
      value: Math.round(metric.name === 'CLS' ? metric.value * 1000 : metric.value),
      event_label: metric.id,
      non_interaction: true,
    });
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
