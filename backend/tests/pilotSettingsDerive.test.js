'use strict';

const {
  OPERATIONAL_STATES,
  normalizeStoredSettings,
  serializePilotSettings,
  evaluateTransition,
  sanitizeReason,
} = require('../src/services/pilotSettingsDerive');

describe('pilotSettingsDerive', () => {
  it('fails closed to CLOSED when the settings document is missing', () => {
    const normalized = normalizeStoredSettings(null);
    const view = serializePilotSettings(normalized, null);
    expect(normalized.effectiveState).toBe(OPERATIONAL_STATES.CLOSED);
    expect(normalized.configurationValid).toBe(true);
    expect(view.documentExists).toBe(false);
    expect(view.postingWired).toBe(false);
    expect(view.postingBehaviour).toBe(OPERATIONAL_STATES.CLOSED);
  });

  it('fails closed and marks configuration invalid for an unknown stored state', () => {
    const normalized = normalizeStoredSettings({ state: 'WATCH' });
    expect(normalized.effectiveState).toBe(OPERATIONAL_STATES.CLOSED);
    expect(normalized.configurationValid).toBe(false);
    expect(normalized.configurationWarning).toMatch(/invalid/i);
  });

  it('allows CLOSED -> OPEN only after a READY TO OPEN check', () => {
    const result = evaluateTransition('CLOSED', 'OPEN');
    expect(result.ok).toBe(true);
    expect(result.requiresReadyToOpen).toBe(true);
  });

  it('rejects CLOSED -> PAUSED', () => {
    const result = evaluateTransition('CLOSED', 'PAUSED');
    expect(result.ok).toBe(false);
    expect(result.code).toBe('INVALID_TRANSITION');
  });

  it('allows OPEN -> PAUSED and OPEN -> CLOSED without readiness', () => {
    expect(evaluateTransition('OPEN', 'PAUSED')).toEqual(expect.objectContaining({ ok: true, requiresReadyToOpen: false }));
    expect(evaluateTransition('OPEN', 'CLOSED')).toEqual(expect.objectContaining({ ok: true, requiresReadyToOpen: false }));
  });

  it('allows PAUSED -> OPEN only after a READY TO OPEN check and PAUSED -> CLOSED always', () => {
    expect(evaluateTransition('PAUSED', 'OPEN')).toEqual(expect.objectContaining({ ok: true, requiresReadyToOpen: true }));
    expect(evaluateTransition('PAUSED', 'CLOSED')).toEqual(expect.objectContaining({ ok: true, requiresReadyToOpen: false }));
  });

  it('treats same-state requests as no-ops', () => {
    expect(evaluateTransition('CLOSED', 'CLOSED').noop).toBe(true);
    expect(evaluateTransition('OPEN', 'OPEN').noop).toBe(true);
    expect(evaluateTransition('PAUSED', 'PAUSED').noop).toBe(true);
  });

  it('rejects unknown target states', () => {
    const result = evaluateTransition('CLOSED', 'READY TO OPEN');
    expect(result.ok).toBe(false);
    expect(result.code).toBe('INVALID_STATE');
  });

  it('bounds optional reasons', () => {
    expect(sanitizeReason('  keep the marketplace calm  ')).toBe('keep the marketplace calm');
    expect(sanitizeReason('x'.repeat(300)).length).toBe(240);
  });
});
