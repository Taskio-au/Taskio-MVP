/**
 * Compatibility wrapper around `jobStatuses`.
 * Keep this file for legacy imports while maintaining a single source of truth.
 */
import {
  JOB_STATUSES,
  STATUS_LABELS,
  PRIMARY_ACTIONS,
  STATUS_COLORS,
  LEGACY_STATUS_MAP,
  normalizeStatus,
  getStatusLabel,
  getStatusColors,
  getPrimaryAction,
  isChatEnabled,
  getStepperProgress,
} from './jobStatuses';

export {
  JOB_STATUSES,
  STATUS_LABELS,
  PRIMARY_ACTIONS,
  STATUS_COLORS,
  LEGACY_STATUS_MAP,
  normalizeStatus,
  getStatusLabel,
  getStatusColors,
  getPrimaryAction,
  isChatEnabled,
  getStepperProgress,
};

// Legacy aliases retained for older imports.
export const JOB_STATUS = JOB_STATUSES;
export const STATUS_ACTIONS = PRIMARY_ACTIONS;
export const normalizeLegacyStatus = normalizeStatus;

export const STATUS_FLOW_STEPS = getStepperProgress(JOB_STATUSES.OPEN).steps.map((s) => ({
  status: s.status,
  label: s.label,
}));

export const getStatusStep = (status) => {
  const { currentStep } = getStepperProgress(status);
  return currentStep <= 0 ? -1 : currentStep - 1;
};

export const isVariationEnabled = (status, paymentState) => {
  const normalized = normalizeStatus(status);
  return paymentState === 'in_escrow'
    && [JOB_STATUSES.IN_PROGRESS, JOB_STATUSES.COMPLETED].includes(normalized);
};

export const isValidStatus = (status) => {
  if (!status) return false;
  const normalized = normalizeStatus(status);
  return Object.values(JOB_STATUSES).includes(normalized);
};
