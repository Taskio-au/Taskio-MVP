export const LAUNCH_STATUS = Object.freeze({
  LOADING: 'LOADING',
  DATA_UNAVAILABLE: 'DATA UNAVAILABLE',
  DATA_INCOMPLETE: 'DATA INCOMPLETE',
  NOT_READY: 'NOT READY',
  READY_TO_OPEN: 'READY TO OPEN',
});

export const READY_TO_OPEN_POSTING_COPY =
  'All required launch gates are satisfied. Homeowner posting remains closed until explicitly activated by the owner.';

export function resolveLaunchView(snapshot, loadState = 'ok') {
  if (loadState === 'loading') {
    return { status: LAUNCH_STATUS.LOADING, snapshot: null };
  }
  if (loadState === 'error' || !snapshot || typeof snapshot !== 'object') {
    return { status: LAUNCH_STATUS.DATA_UNAVAILABLE, snapshot: null };
  }
  const overall = String(snapshot.overallStatus || '').trim();
  if (overall === LAUNCH_STATUS.DATA_UNAVAILABLE) {
    return { status: LAUNCH_STATUS.DATA_UNAVAILABLE, snapshot };
  }
  if (overall === LAUNCH_STATUS.DATA_INCOMPLETE) {
    return { status: LAUNCH_STATUS.DATA_INCOMPLETE, snapshot };
  }
  if (overall === LAUNCH_STATUS.READY_TO_OPEN) {
    return { status: LAUNCH_STATUS.READY_TO_OPEN, snapshot };
  }
  return { status: LAUNCH_STATUS.NOT_READY, snapshot };
}

export function toneForStatus(status) {
  if (status === LAUNCH_STATUS.READY_TO_OPEN || status === 'PASS' || status === 'PASS / COMPLETE' || status === 'COMPLETE' || status === 'PRODUCTION PASS' || status === 'READY') {
    return 'ok';
  }
  if (status === 'STAGING PASS / PRODUCTION PENDING' || status === 'PRODUCTION PENDING' || status === 'OPEN' || status === 'PENDING') {
    return 'watch';
  }
  if (status === LAUNCH_STATUS.NOT_READY || status === LAUNCH_STATUS.DATA_INCOMPLETE || status === 'BLOCKED' || status === 'NOT STARTED' || status === 'NOT READY') {
    return 'alert';
  }
  if (status === LAUNCH_STATUS.DATA_UNAVAILABLE) return 'info';
  return 'muted';
}
