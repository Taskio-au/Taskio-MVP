export function resolveExpertOnboarding({ loadState, status } = {}) {
  const canApply = loadState === 'ok' && status?.canExpertApply === true;
  return {
    canApply,
    path: canApply ? '/tradie/signup' : '/expert-waitlist',
    label: canApply ? 'Become a Taskio Expert' : 'Join Expert waitlist',
    shortLabel: canApply ? 'Become an Expert' : 'Join Expert waitlist',
  };
}
