'use strict';

/**
 * SLA targets (hours from work item creation or event time).
 * Tune here without changing workflow services.
 */

const SLA_HOURS = {
  payment: 6,
  dispute: 24,
  trust: 12,
  support: 12,
  verification: 12,
  risk: 48,
};

/** Escalation-based overrides for support tickets (hours). */
const SUPPORT_ESCALATION_SLA_HOURS = {
  priority: 12,
  ops: 6,
  super_admin: 4,
  normal: 24,
};

/** Expert / user trust review required */
const EXPERT_TRUST_REVIEW_HOURS = 24;

/** "Due soon" = within this many hours of dueAt */
const DUE_SOON_HOURS_BEFORE = 2;

/** Max snooze duration (hours) for critical categories */
const MAX_SNOOZE_HOURS_CRITICAL = 4;

/** Categories where snooze cannot extend past SLA without staying visible as overdue chip */
const CRITICAL_CATEGORIES = new Set(['payment', 'dispute']);

module.exports = {
  SLA_HOURS,
  SUPPORT_ESCALATION_SLA_HOURS,
  EXPERT_TRUST_REVIEW_HOURS,
  DUE_SOON_HOURS_BEFORE,
  MAX_SNOOZE_HOURS_CRITICAL,
  CRITICAL_CATEGORIES,
};
