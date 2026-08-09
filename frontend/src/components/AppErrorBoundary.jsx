import React from 'react';
import BrandLogo from '../design/components/BrandLogo';

export default class AppErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error, info) {
    if (typeof console !== 'undefined' && typeof console.error === 'function') {
      console.error('AppErrorBoundary captured a render failure.', error, info);
    }
  }

  handleReload = () => {
    if (typeof window !== 'undefined') {
      window.location.reload();
    }
  };

  handleGoHome = () => {
    if (typeof window !== 'undefined') {
      window.location.assign('/');
    }
  };

  render() {
    if (!this.state.hasError) {
      return this.props.children;
    }

    return (
      <div
        role="alert"
        style={{
          minHeight: '100vh',
          display: 'grid',
          placeItems: 'center',
          padding: 24,
          background: 'linear-gradient(180deg, #F7F9FA 0%, #FFFFFF 100%)',
        }}
      >
        <div
          style={{
            width: 'min(520px, 100%)',
            padding: 32,
            borderRadius: 24,
            backgroundColor: '#FFFFFF',
            border: '1px solid #E5E7EB',
            boxShadow: '0 18px 42px rgba(15, 23, 42, 0.12)',
            textAlign: 'left',
          }}
        >
          <BrandLogo />
          <h1 style={{ margin: '24px 0 12px', fontSize: 32, lineHeight: 1.1 }}>
            Taskio hit an unexpected error.
          </h1>
          <p style={{ margin: 0, color: '#4B5563', lineHeight: 1.7 }}>
            The page failed to render cleanly. You can reload the app or return to the home page.
          </p>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginTop: 24 }}>
            <button
              type="button"
              onClick={this.handleReload}
              style={{
                minHeight: 44,
                padding: '10px 18px',
                borderRadius: 10,
                border: '1px solid transparent',
                backgroundColor: '#14C5C5',
                color: '#FFFFFF',
                fontWeight: 700,
              }}
            >
              Reload app
            </button>
            <button
              type="button"
              onClick={this.handleGoHome}
              style={{
                minHeight: 44,
                padding: '10px 18px',
                borderRadius: 10,
                border: '1px solid #D1D5DB',
                backgroundColor: '#FFFFFF',
                color: '#111827',
                fontWeight: 700,
              }}
            >
              Go home
            </button>
          </div>
        </div>
      </div>
    );
  }
}
