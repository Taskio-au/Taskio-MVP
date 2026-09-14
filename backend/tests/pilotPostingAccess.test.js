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
});
