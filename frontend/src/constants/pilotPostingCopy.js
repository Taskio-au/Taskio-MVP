export const PILOT_POSTING_COPY = {
  CLOSED: "Taskio is preparing for its Melbourne pilot. Join the waitlist and we'll let you know when homeowner posting opens.",
  PAUSED: 'Taskio is temporarily pausing new job posts while we manage current demand. You can still join the waitlist.',
  UNAVAILABLE: 'New job posting is temporarily unavailable.',
};

export function publicPilotPostingCopy(homeownerPosting, loadState) {
  if (loadState === 'error') return PILOT_POSTING_COPY.UNAVAILABLE;
  if (homeownerPosting === 'PAUSED') return PILOT_POSTING_COPY.PAUSED;
  return PILOT_POSTING_COPY.CLOSED;
}
