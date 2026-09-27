'use strict';

const {
  readExpertOnboardingAccess,
  resolveRuntimeExpertOnboardingMode,
} = require('../src/services/expertOnboardingAccess');

function settingsDb(data = null) {
  return {
    collection: () => ({
      doc: () => ({
        get: async () => ({
          exists: data !== null,
          data: () => data,
        }),
      }),
    }),
  };
}

describe('expertOnboardingAccess local early-pilot mode', () => {
  it('opens the server-authoritative signup gate for missing local development settings', async () => {
    await expect(readExpertOnboardingAccess(settingsDb(), {})).resolves.toEqual({
      persistedMode: 'OPEN',
      expertOnboarding: 'OPEN',
      canExpertApply: true,
      expertWaitlistAvailable: false,
    });
  });

  it('does not override explicit stored modes', () => {
    expect(resolveRuntimeExpertOnboardingMode(
      { expertOnboardingMode: 'WAITLIST' },
      { NODE_ENV: 'development' }
    )).toBe('WAITLIST');
    expect(resolveRuntimeExpertOnboardingMode(
      { expertOnboardingMode: 'OPEN' },
      { NODE_ENV: 'production' }
    )).toBe('OPEN');
  });

  it('fails closed for missing settings outside local development', async () => {
    await expect(readExpertOnboardingAccess(settingsDb(), {
      NODE_ENV: 'production',
      TASKIO_PUBLIC_SIGNUP_ENABLED: 'true',
    })).resolves.toEqual({
      persistedMode: 'WAITLIST',
      expertOnboarding: 'WAITLIST',
      canExpertApply: false,
      expertWaitlistAvailable: true,
    });
  });

  it('fails closed when settings cannot be read even in local development', async () => {
    const db = { collection: () => { throw new Error('unavailable'); } };
    await expect(readExpertOnboardingAccess(db, {
      NODE_ENV: 'development',
    })).resolves.toEqual({
      persistedMode: 'WAITLIST',
      expertOnboarding: 'WAITLIST',
      canExpertApply: false,
      expertWaitlistAvailable: true,
    });
  });
});
