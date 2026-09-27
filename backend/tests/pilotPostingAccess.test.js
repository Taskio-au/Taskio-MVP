'use strict';

const {
  serializePublicPilotStatus,
  publicPostingClosedError,
  readPublicPilotStatus,
} = require('../src/services/pilotPostingAccess');
const { OPERATIONAL_STATES } = require('../src/services/pilotSettingsDerive');

describe('pilotPostingAccess', () => {
  const expertWaitlist = {
    expertOnboarding: 'WAITLIST',
    canExpertApply: false,
    expertWaitlistAvailable: true,
  };

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

  it('serializes OPEN as canPost true and waitlist off', () => {
    expect(serializePublicPilotStatus({ effectiveState: OPERATIONAL_STATES.OPEN })).toEqual({
      homeownerPosting: 'OPEN',
      canPost: true,
      waitlistAvailable: false,
      ...expertWaitlist,
    });
  });

  it('serializes CLOSED and PAUSED as canPost false', () => {
    expect(serializePublicPilotStatus({ effectiveState: OPERATIONAL_STATES.CLOSED }).canPost).toBe(false);
    expect(serializePublicPilotStatus({ effectiveState: OPERATIONAL_STATES.PAUSED })).toEqual({
      homeownerPosting: 'PAUSED',
      canPost: false,
      waitlistAvailable: true,
      ...expertWaitlist,
    });
  });

  it('fails closed for missing or unknown states', () => {
    expect(serializePublicPilotStatus(null).homeownerPosting).toBe('CLOSED');
    expect(serializePublicPilotStatus({ effectiveState: 'WATCH' }).canPost).toBe(false);
    expect(serializePublicPilotStatus(null).canExpertApply).toBe(false);
  });

  it('never includes launch blockers in the public closed error', () => {
    const error = publicPostingClosedError(OPERATIONAL_STATES.CLOSED);
    expect(error).toEqual({
      code: 'PILOT_POSTING_CLOSED',
      state: 'CLOSED',
      message: 'Taskio is not accepting new jobs right now.',
    });
    expect(JSON.stringify(error)).not.toMatch(/P06|blocker|expert count|readiness/i);
  });

  it('fails closed when settings cannot be loaded', async () => {
    const db = {
      collection() {
        throw new Error('unavailable');
      },
    };
    await expect(readPublicPilotStatus(db)).resolves.toEqual({
      homeownerPosting: 'CLOSED',
      canPost: false,
      waitlistAvailable: true,
      ...expertWaitlist,
    });
  });

  it('keeps homeowner CLOSED and Expert OPEN independent', () => {
    expect(serializePublicPilotStatus(
      { effectiveState: OPERATIONAL_STATES.CLOSED, effectiveExpertOnboardingMode: 'OPEN' },
      { expertSignupSafetyEnabled: true }
    )).toEqual({
      homeownerPosting: 'CLOSED',
      canPost: false,
      waitlistAvailable: true,
      expertOnboarding: 'OPEN',
      canExpertApply: true,
      expertWaitlistAvailable: false,
    });
  });

  it('keeps homeowner OPEN and Expert WAITLIST independent', () => {
    expect(serializePublicPilotStatus(
      { effectiveState: OPERATIONAL_STATES.OPEN, effectiveExpertOnboardingMode: 'WAITLIST' },
      { expertSignupSafetyEnabled: true }
    )).toEqual({
      homeownerPosting: 'OPEN',
      canPost: true,
      waitlistAvailable: false,
      ...expertWaitlist,
    });
  });

  it('treats persisted Expert OPEN plus disabled safety switch as public WAITLIST', () => {
    expect(serializePublicPilotStatus(
      { effectiveState: OPERATIONAL_STATES.OPEN, effectiveExpertOnboardingMode: 'OPEN' },
      { expertSignupSafetyEnabled: false }
    ).canExpertApply).toBe(false);
  });

  it('uses OPEN for missing Expert mode only in local development', async () => {
    await expect(readPublicPilotStatus(settingsDb(), {})).resolves.toEqual({
      homeownerPosting: 'CLOSED',
      canPost: false,
      waitlistAvailable: true,
      expertOnboarding: 'OPEN',
      canExpertApply: true,
      expertWaitlistAvailable: false,
    });
  });

  it.each([
    ['production', { NODE_ENV: 'production' }],
    ['test', { NODE_ENV: 'test' }],
    ['staging deployment', { NODE_ENV: 'development', TASKIO_DEPLOYMENT_ENV: 'staging' }],
    ['managed runtime', { NODE_ENV: 'development', K_SERVICE: 'taskio-api' }],
  ])('keeps missing Expert mode fail-closed in %s', async (_label, env) => {
    await expect(readPublicPilotStatus(settingsDb(), env)).resolves.toEqual({
      homeownerPosting: 'CLOSED',
      canPost: false,
      waitlistAvailable: true,
      ...expertWaitlist,
    });
  });

  it('preserves explicit WAITLIST and invalid values in local development', async () => {
    const env = { NODE_ENV: 'development' };
    await expect(readPublicPilotStatus(settingsDb({
      state: 'CLOSED',
      expertOnboardingMode: 'WAITLIST',
    }), env)).resolves.toEqual(expect.objectContaining(expertWaitlist));
    await expect(readPublicPilotStatus(settingsDb({
      state: 'CLOSED',
      expertOnboardingMode: 'UNKNOWN',
    }), env)).resolves.toEqual(expect.objectContaining(expertWaitlist));
  });

  it('still applies the enrollment safety switch to local OPEN fallback', async () => {
    await expect(readPublicPilotStatus(settingsDb(), {
      NODE_ENV: 'development',
      TASKIO_PUBLIC_SIGNUP_ENABLED: 'false',
    })).resolves.toEqual(expect.objectContaining(expertWaitlist));
  });
});
