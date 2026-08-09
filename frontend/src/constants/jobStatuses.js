/**
 * Task Status Constants for Frontend
 * Enums/transitions: generated from shared/jobStatusesCore.js (npm prestart / syncShared).
 */

import {
  JOB_STATUSES,
  LEGACY_STATUS_MAP,
  VALID_TRANSITIONS,
} from '../shared/jobStatusesConstants.generated.js';
import { resolveJobStatus } from '../shared/jobStatusResolve.js';

export { JOB_STATUSES, LEGACY_STATUS_MAP, VALID_TRANSITIONS };

/**
 * Client-facing status labels
 * Never show technical enum values to users
 */
export const STATUS_LABELS = {
  [JOB_STATUSES.OPEN]: 'Awaiting quotes',
  [JOB_STATUSES.QUOTED]: 'Quotes received',
  [JOB_STATUSES.ASSIGNED]: 'Expert selected',
  [JOB_STATUSES.AWAITING_FUNDING]: 'Payment required',
  [JOB_STATUSES.FUNDED]: 'Payment secured',
  [JOB_STATUSES.IN_PROGRESS]: 'Work in progress',
  [JOB_STATUSES.COMPLETED]: 'Awaiting approval',
  [JOB_STATUSES.PAID]: 'Completed',
  [JOB_STATUSES.DISPUTED]: 'Under review',
  [JOB_STATUSES.CANCELLED]: 'Cancelled',
  [JOB_STATUSES.REFUND_PENDING]: 'Refund in progress',
  [JOB_STATUSES.REFUNDED]: 'Refund completed',
};

/**
 * Primary CTA per status for clients
 * Defines the main action button for each task state
 */
export const PRIMARY_ACTIONS = {
  // NOTE: Router paths live in `src/App.js`. Homeowner job detail is `/job/:jobId`.
  [JOB_STATUSES.OPEN]: { label: 'View task', route: (jobId) => `/job/${jobId}` },
  [JOB_STATUSES.QUOTED]: { label: 'View quotes', route: (jobId) => `/job/${jobId}` },
  [JOB_STATUSES.ASSIGNED]: { label: 'Review quote', route: (jobId) => `/job/${jobId}` },
  // Payment route requires quoteId, so the dashboard will special-case this when it has acceptedQuoteId.
  [JOB_STATUSES.AWAITING_FUNDING]: { label: 'Complete payment', route: (jobId) => `/job/${jobId}` },
  [JOB_STATUSES.FUNDED]: { label: 'Message expert', route: (jobId) => `/job/${jobId}#chat` },
  [JOB_STATUSES.IN_PROGRESS]: { label: 'Message expert', route: (jobId) => `/job/${jobId}#chat` },
  [JOB_STATUSES.COMPLETED]: { label: 'Approve & release', route: (jobId) => `/job/${jobId}` },
  [JOB_STATUSES.PAID]: { label: 'View receipt', route: (jobId) => `/job/${jobId}` },
  [JOB_STATUSES.DISPUTED]: { label: 'View dispute', route: (jobId) => `/job/${jobId}` },
  [JOB_STATUSES.CANCELLED]: null,
  [JOB_STATUSES.REFUND_PENDING]: null,
  [JOB_STATUSES.REFUNDED]: null,
};

/**
 * Status badge color schemes
 * Returns Tailwind-style color values
 */
export const STATUS_COLORS = {
  [JOB_STATUSES.OPEN]: { bg: '#FFF4E6', text: '#B54708', border: '#FED7AA' },
  [JOB_STATUSES.QUOTED]: { bg: '#E0F2FE', text: '#075985', border: '#BAE6FD' },
  [JOB_STATUSES.ASSIGNED]: { bg: '#DCFCE7', text: '#15803D', border: '#BBF7D0' },
  [JOB_STATUSES.AWAITING_FUNDING]: { bg: '#FEF3C7', text: '#92400E', border: '#FDE68A' },
  [JOB_STATUSES.FUNDED]: { bg: '#D1FAE5', text: '#065F46', border: '#A7F3D0' },
  [JOB_STATUSES.IN_PROGRESS]: { bg: '#DBEAFE', text: '#1E40AF', border: '#BFDBFE' },
  [JOB_STATUSES.COMPLETED]: { bg: '#E9D5FF', text: '#6B21A8', border: '#D8B4FE' },
  [JOB_STATUSES.PAID]: { bg: '#D1FAE5', text: '#047857', border: '#A7F3D0' },
  [JOB_STATUSES.DISPUTED]: { bg: '#EEF2FF', text: '#4338CA', border: '#C7D2FE' },
  [JOB_STATUSES.CANCELLED]: { bg: '#F3F4F6', text: '#4B5563', border: '#E5E7EB' },
  [JOB_STATUSES.REFUND_PENDING]: { bg: '#F0FDFA', text: '#0F766E', border: '#99F6E4' },
  [JOB_STATUSES.REFUNDED]: { bg: '#F8FAFC', text: '#475569', border: '#E2E8F0' },
};

/**
 * Normalizes a status value (handles legacy statuses). Unknown values → OPEN (safe UI).
 */
export function normalizeStatus(status) {
  const r = resolveJobStatus(status);
  if (r.unknown && typeof console !== 'undefined' && typeof console.warn === 'function') {
    console.warn('[job_status_unknown]', r.rawInput);
  }
  return r.status;
}

/**
 * Gets the user-facing label for a status
 * @param {string} status - Status enum value
 * @returns {string} User-facing label
 */
export function getStatusLabel(status) {
  const normalized = normalizeStatus(status);
  return STATUS_LABELS[normalized] || status;
}

/**
 * Gets the color scheme for a status badge
 * @param {string} status - Status enum value
 * @returns {object} Color scheme { bg, text, border }
 */
export function getStatusColors(status) {
  const normalized = normalizeStatus(status);
  return STATUS_COLORS[normalized] || STATUS_COLORS[JOB_STATUSES.OPEN];
}

/**
 * Gets the primary action for a status
 * @param {string} status - Status enum value
 * @param {string} jobId - Job ID
 * @returns {object} Action { label, route }
 */
export function getPrimaryAction(status, jobId) {
  const normalized = normalizeStatus(status);
  const action = PRIMARY_ACTIONS[normalized];
  if (!action || !action.label) return null;

  return {
    label: action.label,
    route: typeof action.route === 'function' ? action.route(jobId) : action.route,
  };
}

/**
 * Determines which statuses allow chat
 * Chat is enabled after escrow is funded
 * @param {string} status - Status enum value
 * @returns {boolean}
 */
export function isChatEnabled(status) {
  const normalized = normalizeStatus(status);
  if (normalized === JOB_STATUSES.REFUNDED || normalized === JOB_STATUSES.CANCELLED) {
    return false;
  }
  return [
    JOB_STATUSES.FUNDED,
    JOB_STATUSES.IN_PROGRESS,
    JOB_STATUSES.COMPLETED,
    JOB_STATUSES.PAID,
    JOB_STATUSES.DISPUTED,
    JOB_STATUSES.REFUND_PENDING,
  ].includes(normalized);
}

/**
 * Gets stepper progress for client flow
 * Returns { currentStep: number, totalSteps: number, steps: array }
 * @param {string} status - Status enum value
 * @returns {object}
 */
export function getStepperProgress(status) {
  const normalized = normalizeStatus(status);
  
  const stepMap = {
    [JOB_STATUSES.OPEN]: 1,
    [JOB_STATUSES.QUOTED]: 2,
    [JOB_STATUSES.ASSIGNED]: 3,
    [JOB_STATUSES.AWAITING_FUNDING]: 3,
    [JOB_STATUSES.FUNDED]: 4,
    [JOB_STATUSES.IN_PROGRESS]: 5,
    [JOB_STATUSES.COMPLETED]: 6,
    [JOB_STATUSES.PAID]: 7,
    [JOB_STATUSES.DISPUTED]: 5,
    [JOB_STATUSES.CANCELLED]: 0,
    [JOB_STATUSES.REFUND_PENDING]: 4,
    [JOB_STATUSES.REFUNDED]: 0,
  };
  
  const steps = [
    { key: 1, label: 'Awaiting quotes', status: JOB_STATUSES.OPEN },
    { key: 2, label: 'Quotes received', status: JOB_STATUSES.QUOTED },
    { key: 3, label: 'Expert selected', status: JOB_STATUSES.ASSIGNED },
    { key: 4, label: 'Payment secured', status: JOB_STATUSES.FUNDED },
    { key: 5, label: 'Work in progress', status: JOB_STATUSES.IN_PROGRESS },
    { key: 6, label: 'Awaiting approval', status: JOB_STATUSES.COMPLETED },
    { key: 7, label: 'Completed', status: JOB_STATUSES.PAID },
  ];
  
  return {
    currentStep: stepMap[normalized] || 0,
    totalSteps: 7,
    steps,
    showPaymentWarning: normalized === JOB_STATUSES.AWAITING_FUNDING,
  };
}


