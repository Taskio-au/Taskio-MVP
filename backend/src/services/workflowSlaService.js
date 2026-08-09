'use strict';

const {
  SLA_HOURS,
  SUPPORT_ESCALATION_SLA_HOURS,
  EXPERT_TRUST_REVIEW_HOURS,
  DUE_SOON_HOURS_BEFORE,
  CRITICAL_CATEGORIES,
} = require('../config/workflowSlaConfig');

function hoursFromCategory(category, context = {}) {
  const c = String(category || '').toLowerCase();
  if (c === 'support' && context.escalationStatus) {
    const e = String(context.escalationStatus).toLowerCase();
    if (SUPPORT_ESCALATION_SLA_HOURS[e] != null) return SUPPORT_ESCALATION_SLA_HOURS[e];
    return SLA_HOURS.support;
  }
  if ((c === 'verification' || c === 'trust') && context.expertTrustReview) {
    return EXPERT_TRUST_REVIEW_HOURS;
  }
  return SLA_HOURS[c] ?? 24;
}

function computeDueAtMs({ category, createdAtMs, nowMs, context = {} }) {
  const start = typeof createdAtMs === 'number' && createdAtMs > 0 ? createdAtMs : nowMs;
  const c = String(category || '').toLowerCase();
  const now = nowMs != null ? nowMs : Date.now();

  if (c === 'dispute' && context.disputeOverdue === true) {
    return Math.min(start, now);
  }

  let h = hoursFromCategory(c, context);
  if (c === 'support' && context.escalationStatus) {
    const e = String(context.escalationStatus).toLowerCase();
    h = SUPPORT_ESCALATION_SLA_HOURS[e] ?? SLA_HOURS.support;
  }

  return start + h * 60 * 60 * 1000;
}

function computeSlaState({ dueAtMs, snoozedUntilMs, nowMs, status, category }) {
  if (String(status || '') === 'resolved') return { slaState: 'on_track', timeRemainingLabel: '—' };
  const now = nowMs != null ? nowMs : Date.now();
  const due = Number(dueAtMs) || 0;
  const snooze = Number(snoozedUntilMs) || 0;

  const crit = CRITICAL_CATEGORIES.has(String(category || '').toLowerCase());
  if (snooze > now && String(status || '') === 'snoozed') {
    if (crit) {
      return {
        slaState: due > 0 && now > due ? 'overdue' : 'due_soon',
        timeRemainingLabel: due > 0 ? formatRemaining(due, now) : '—',
      };
    }
    return { slaState: 'on_track', timeRemainingLabel: `Snoozed · ${formatDuration(snooze - now)}` };
  }

  if (!due) return { slaState: 'on_track', timeRemainingLabel: '—' };
  if (now > due) return { slaState: 'overdue', timeRemainingLabel: `Overdue ${formatDuration(now - due)}` };
  const untilDue = due - now;
  const dueSoonMs = DUE_SOON_HOURS_BEFORE * 60 * 60 * 1000;
  if (untilDue <= dueSoonMs) {
    return { slaState: 'due_soon', timeRemainingLabel: `${formatDuration(untilDue)} left` };
  }
  return { slaState: 'on_track', timeRemainingLabel: `${formatDuration(untilDue)} left` };
}

function formatDuration(ms) {
  const m = Math.max(0, Math.floor(ms / 60000));
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 48) return `${h}h`;
  return `${Math.floor(h / 24)}d`;
}

function formatRemaining(dueAtMs, nowMs) {
  if (nowMs >= dueAtMs) return `Overdue ${formatDuration(nowMs - dueAtMs)}`;
  return `${formatDuration(dueAtMs - nowMs)} left`;
}

module.exports = {
  computeDueAtMs,
  computeSlaState,
  hoursFromCategory,
};
