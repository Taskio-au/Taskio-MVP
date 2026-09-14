import React from 'react';
import PublicPageHeader from './PublicPageHeader';
import PilotPostingUnavailable from './PilotPostingUnavailable';

export default function JobPostingAvailabilityScreen({ loadState, status }) {
  return (
    <div className="taskio-postJobPage">
      <PublicPageHeader homeTo="/" logoStyle={{ textDecoration: 'none' }} />
      <div className="public-page-shell" style={{ padding: '48px 24px' }}>
        {loadState === 'loading' ? (
          <p role="status">Checking posting availability…</p>
        ) : (
          <PilotPostingUnavailable
            homeownerPosting={status?.homeownerPosting}
            loadState={loadState}
            waitlistAvailable={status?.waitlistAvailable}
          />
        )}
      </div>
    </div>
  );
}
