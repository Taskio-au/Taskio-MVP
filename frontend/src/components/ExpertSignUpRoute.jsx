import React from 'react';
import { Navigate } from 'react-router-dom';
import usePublicPilotStatus from '../hooks/usePublicPilotStatus';
import { resolveExpertOnboarding } from '../utils/expertOnboardingEntry';
import ExpertSignUpPage from './ExpertSignUpPage';

export default function ExpertSignUpRoute() {
  const { loadState, status } = usePublicPilotStatus();
  const expert = resolveExpertOnboarding({ loadState, status });

  if (loadState === 'loading') {
    return <div role="status">Checking Expert applications…</div>;
  }

  if (!expert.canApply) {
    return <Navigate to="/expert-waitlist" replace />;
  }

  return <ExpertSignUpPage />;
}
