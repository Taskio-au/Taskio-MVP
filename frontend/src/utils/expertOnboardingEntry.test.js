import { resolveExpertOnboarding } from './expertOnboardingEntry';

describe('resolveExpertOnboarding', () => {
  it('routes to signup only after a confirmed OPEN public status', () => {
    expect(resolveExpertOnboarding({
      loadState: 'ok',
      status: { canExpertApply: true, expertOnboarding: 'OPEN' },
    })).toEqual(expect.objectContaining({
      canApply: true,
      path: '/tradie/signup',
    }));
  });

  it('fails safe to the Expert waitlist while loading or on error', () => {
    expect(resolveExpertOnboarding({ loadState: 'loading', status: { canExpertApply: true } }).path)
      .toBe('/expert-waitlist');
    expect(resolveExpertOnboarding({
      loadState: 'error',
      status: { canExpertApply: false, expertOnboarding: 'WAITLIST' },
    }).path).toBe('/expert-waitlist');
  });
});
