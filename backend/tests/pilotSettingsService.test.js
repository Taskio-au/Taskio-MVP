'use strict';

const { OPERATIONAL_STATES } = require('../src/services/pilotSettingsDerive');

const store = {
  settings: null,
  history: [],
};

jest.mock('../src/firebaseAdmin', () => ({
  admin: {
    firestore: {
      FieldValue: { serverTimestamp: () => 'SERVER_TIME' },
    },
  },
  db: {},
}));

function createFakeDb() {
  const settingsRef = {
    get: async () => ({
      exists: !!store.settings,
      data: () => store.settings,
    }),
    collection(name) {
      if (name !== 'history') throw new Error(`unexpected subcollection ${name}`);
      return {
        doc() {
          return { kind: 'history', id: `hist-${store.history.length + 1}` };
        },
      };
    },
  };
  return {
    collection(name) {
      if (name !== 'system') throw new Error(`unexpected collection ${name}`);
      return {
        doc(id) {
          if (id !== 'pilotSettings') throw new Error(`unexpected doc ${id}`);
          return settingsRef;
        },
      };
    },
    batch() {
      const ops = [];
      return {
        set(ref, payload) {
          ops.push({ ref, payload });
        },
        async commit() {
          for (const op of ops) {
            if (op.ref && op.ref.kind === 'history') {
              store.history.push(op.payload);
            } else {
              store.settings = { ...(store.settings || {}), ...op.payload };
            }
          }
        },
      };
    },
  };
}

const { readPilotSettings, updatePilotSettingsState, updateExpertOnboardingMode } = require('../src/services/pilotSettingsService');

describe('pilotSettingsService', () => {
  const db = createFakeDb();

  beforeEach(() => {
    store.settings = null;
    store.history = [];
  });

  it('reads missing settings as effective CLOSED without creating a document', async () => {
    const view = await readPilotSettings(db);
    expect(view.effectiveState).toBe(OPERATIONAL_STATES.CLOSED);
    expect(view.documentExists).toBe(false);
    expect(store.settings).toBe(null);
  });

  it('reads an invalid stored state as effective CLOSED', async () => {
    store.settings = { state: 'WATCH' };
    const view = await readPilotSettings(db);
    expect(view.effectiveState).toBe(OPERATIONAL_STATES.CLOSED);
    expect(view.configurationValid).toBe(false);
  });

  it('allows CLOSED -> OPEN when live readiness is READY TO OPEN and writes one audit event', async () => {
    const result = await updatePilotSettingsState(db, {
      nextState: 'OPEN',
      reason: 'owner activation',
      actorUid: 'admin-1',
      loadReadiness: async () => ({ overallStatus: 'READY TO OPEN', blockers: [] }),
    });
    expect(result.ok).toBe(true);
    expect(result.changed).toBe(true);
    expect(store.settings.state).toBe('OPEN');
    expect(store.settings.updatedByUid).toBe('admin-1');
    expect(store.settings.updatedAt).toBe('SERVER_TIME');
    expect(store.settings.activatedAt).toBe('SERVER_TIME');
    expect(store.history).toHaveLength(1);
    expect(store.history[0]).toEqual(expect.objectContaining({
      previousState: 'CLOSED',
      newState: 'OPEN',
      changedByUid: 'admin-1',
      reason: 'owner activation',
      changedAt: 'SERVER_TIME',
    }));
  });

  it('rejects CLOSED -> OPEN when readiness is NOT READY and writes no audit', async () => {
    const result = await updatePilotSettingsState(db, {
      nextState: 'OPEN',
      actorUid: 'admin-1',
      loadReadiness: async () => ({
        overallStatus: 'NOT READY',
        blockers: [{ id: 'P06', label: 'P06 — legal/privacy review open' }],
      }),
    });
    expect(result.ok).toBe(false);
    expect(result.status).toBe(409);
    expect(result.error.code).toBe('PILOT_NOT_READY');
    expect(result.error.blockers[0].id).toBe('P06');
    expect(store.settings).toBe(null);
    expect(store.history).toEqual([]);
  });

  it('rejects CLOSED -> OPEN when readiness is DATA INCOMPLETE', async () => {
    const result = await updatePilotSettingsState(db, {
      nextState: 'OPEN',
      actorUid: 'admin-1',
      loadReadiness: async () => ({ overallStatus: 'DATA INCOMPLETE', blockers: [] }),
    });
    expect(result.ok).toBe(false);
    expect(result.error.code).toBe('PILOT_NOT_READY');
    expect(result.error.overallStatus).toBe('DATA INCOMPLETE');
    expect(store.history).toEqual([]);
  });

  it('rejects CLOSED -> OPEN when readiness is DATA UNAVAILABLE or the loader throws', async () => {
    const unavailable = await updatePilotSettingsState(db, {
      nextState: 'OPEN',
      actorUid: 'admin-1',
      loadReadiness: async () => ({ overallStatus: 'DATA UNAVAILABLE', blockers: [] }),
    });
    expect(unavailable.error.code).toBe('PILOT_NOT_READY');

    const thrown = await updatePilotSettingsState(db, {
      nextState: 'OPEN',
      actorUid: 'admin-1',
      loadReadiness: async () => { throw new Error('scan failed'); },
    });
    expect(thrown.error.code).toBe('PILOT_NOT_READY');
    expect(thrown.error.overallStatus).toBe('DATA UNAVAILABLE');
    expect(store.history).toEqual([]);
  });

  it('allows PAUSED -> OPEN when readiness is READY TO OPEN', async () => {
    store.settings = { state: 'PAUSED', version: 2 };
    const result = await updatePilotSettingsState(db, {
      nextState: 'OPEN',
      actorUid: 'admin-1',
      loadReadiness: async () => ({ overallStatus: 'READY TO OPEN', blockers: [] }),
    });
    expect(result.ok).toBe(true);
    expect(store.settings.state).toBe('OPEN');
    expect(store.history).toHaveLength(1);
  });

  it('allows OPEN -> PAUSED and OPEN -> CLOSED regardless of readiness', async () => {
    store.settings = { state: 'OPEN', version: 1 };
    const paused = await updatePilotSettingsState(db, {
      nextState: 'PAUSED',
      actorUid: 'admin-1',
      loadReadiness: async () => ({ overallStatus: 'NOT READY', blockers: [] }),
    });
    expect(paused.ok).toBe(true);
    expect(store.settings.state).toBe('PAUSED');

    const closed = await updatePilotSettingsState(db, {
      nextState: 'CLOSED',
      actorUid: 'admin-1',
      loadReadiness: async () => ({ overallStatus: 'DATA UNAVAILABLE', blockers: [] }),
    });
    expect(closed.ok).toBe(true);
    expect(store.settings.state).toBe('CLOSED');
    expect(store.history).toHaveLength(2);
  });

  it('allows PAUSED -> CLOSED without readiness', async () => {
    store.settings = { state: 'PAUSED', version: 3 };
    const result = await updatePilotSettingsState(db, {
      nextState: 'CLOSED',
      actorUid: 'admin-1',
    });
    expect(result.ok).toBe(true);
    expect(store.settings.state).toBe('CLOSED');
  });

  it('rejects invalid transitions and same-state writes no audit', async () => {
    const invalid = await updatePilotSettingsState(db, {
      nextState: 'PAUSED',
      actorUid: 'admin-1',
    });
    expect(invalid.ok).toBe(false);
    expect(invalid.error.code).toBe('INVALID_TRANSITION');

    const noop = await updatePilotSettingsState(db, {
      nextState: 'CLOSED',
      actorUid: 'admin-1',
    });
    expect(noop.ok).toBe(true);
    expect(noop.changed).toBe(false);
    expect(store.history).toEqual([]);
  });

  it('updates Expert onboarding independently of homeowner state and READY TO OPEN', async () => {
    store.settings = { state: 'CLOSED', expertOnboardingMode: 'WAITLIST', version: 1 };
    const result = await updateExpertOnboardingMode(db, {
      nextMode: 'OPEN',
      reason: 'build supply',
      actorUid: 'admin-1',
    });
    expect(result.ok).toBe(true);
    expect(result.changed).toBe(true);
    expect(store.settings.state).toBe('CLOSED');
    expect(store.settings.expertOnboardingMode).toBe('OPEN');
    expect(store.history).toHaveLength(1);
    expect(store.history[0]).toEqual(expect.objectContaining({
      eventType: 'EXPERT_ONBOARDING_MODE_CHANGED',
      previousMode: 'WAITLIST',
      newMode: 'OPEN',
      changedByUid: 'admin-1',
      reason: 'build supply',
    }));
    expect(store.history[0].previousState).toBeUndefined();
    expect(store.history[0].newState).toBeUndefined();
  });

  it('treats same Expert onboarding mode as a no-op without audit', async () => {
    store.settings = { state: 'OPEN', expertOnboardingMode: 'WAITLIST', version: 4 };
    const result = await updateExpertOnboardingMode(db, {
      nextMode: 'WAITLIST',
      actorUid: 'admin-1',
    });
    expect(result.ok).toBe(true);
    expect(result.changed).toBe(false);
    expect(store.history).toEqual([]);
  });
});
