import { useCallback, useEffect, useState } from 'react';

export const FAILED_CLOSED_STATUS = Object.freeze({
  homeownerPosting: 'CLOSED',
  canPost: false,
  waitlistAvailable: true,
  expertOnboarding: 'WAITLIST',
  canExpertApply: false,
  expertWaitlistAvailable: true,
});
// Status load failure fail-closes posting and Expert applications.
// Homeowner and Expert waitlists stay advertised because those writes are
// separate routes. If the whole API is down, waitlist submit still fails safely.

let defaultApi;

function resolveApi(apiClient) {
  if (apiClient) return apiClient;
  if (!defaultApi) {
    const { createApiClient } = require('../api/createApiClient');
    defaultApi = createApiClient();
  }
  return defaultApi;
}

function normalizePublicPilotStatus(payload) {
  if (!payload || typeof payload !== 'object') return FAILED_CLOSED_STATUS;
  const expertOpen = payload.expertOnboarding === 'OPEN' && payload.canExpertApply === true;
  const expert = expertOpen
    ? {
      expertOnboarding: 'OPEN',
      canExpertApply: true,
      expertWaitlistAvailable: false,
    }
    : {
      expertOnboarding: 'WAITLIST',
      canExpertApply: false,
      expertWaitlistAvailable: true,
    };
  if (payload.homeownerPosting === 'OPEN' && payload.canPost === true) {
    return {
      homeownerPosting: 'OPEN',
      canPost: true,
      waitlistAvailable: false,
      ...expert,
    };
  }
  if (payload.homeownerPosting === 'PAUSED') {
    return {
      homeownerPosting: 'PAUSED',
      canPost: false,
      waitlistAvailable: true,
      ...expert,
    };
  }
  return {
    homeownerPosting: 'CLOSED',
    canPost: false,
    waitlistAvailable: true,
    ...expert,
  };
}

export default function usePublicPilotStatus(apiClient) {
  const api = resolveApi(apiClient);
  const [loadState, setLoadState] = useState('loading');
  const [status, setStatus] = useState(FAILED_CLOSED_STATUS);

  const refresh = useCallback(async () => {
    if (!api?.get) {
      setStatus(FAILED_CLOSED_STATUS);
      setLoadState('error');
      return FAILED_CLOSED_STATUS;
    }
    try {
      const res = await api.get('/api/pilot-status');
      const next = normalizePublicPilotStatus(res?.data);
      setStatus(next);
      setLoadState('ok');
      return next;
    } catch (_) {
      setStatus(FAILED_CLOSED_STATUS);
      setLoadState('error');
      return FAILED_CLOSED_STATUS;
    }
  }, [api]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { loadState, status, refresh };
}
