import React from 'react';
import { isPublicAcquisitionEnabled } from '../config/publicAcquisitionConfig';
import PublicPageHeader from './PublicPageHeader';
import InviteOnlyNotice from './InviteOnlyNotice';
import ExpertSignUpPage from './ExpertSignUpPage';

const pageStyle = {
  minHeight: '100vh',
  backgroundColor: '#F7F9FA',
  fontFamily: 'Inter, sans-serif',
};

const mainStyle = {
  maxWidth: 880,
  margin: '0 auto',
  padding: '64px 24px',
};

export default function ExpertSignUpRoute() {
  if (isPublicAcquisitionEnabled()) {
    return <ExpertSignUpPage />;
  }

  return (
    <div style={pageStyle}>
      <PublicPageHeader homeTo="/" />
      <main style={mainStyle}>
        <InviteOnlyNotice
          title="Expert signup is invite-only"
          description="Taskio is onboarding founding Experts manually for the private Melbourne launch. If you already have an invited account, log in."
        />
      </main>
    </div>
  );
}
