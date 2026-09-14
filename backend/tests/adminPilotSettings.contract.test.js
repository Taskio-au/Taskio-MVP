'use strict';

const express = require('express');
const request = require('supertest');

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
  db: {
    collection(name) {
      if (name !== 'system') return { doc: () => ({ get: async () => ({ exists: false, data: () => ({}) }) }) };
      return {
        doc(id) {
          if (id !== 'pilotSettings') throw new Error(id);
          return {
            get: async () => ({
              exists: !!store.settings,
              data: () => store.settings,
            }),
            collection() {
              return { doc() { return { kind: 'history' }; } };
            },
          };
        },
      };
    },
    batch() {
      const ops = [];
      return {
        set(ref, payload) { ops.push({ ref, payload }); },
        async commit() {
          for (const op of ops) {
            if (op.ref && op.ref.kind === 'history') store.history.push(op.payload);
            else store.settings = { ...(store.settings || {}), ...op.payload };
          }
        },
      };
    },
  },
}));

jest.mock('../src/services/pilotLaunchStatusService', () => ({
  buildPilotLaunchReadinessSnapshot: jest.fn(async () => ({
    overallStatus: 'NOT READY',
    blockers: [{ id: 'P06', label: 'P06 — legal/privacy review open' }],
  })),
}));

jest.mock('../src/middleware/auth', () => ({
  requireAuth: (req, _res, next) => {
    req.user = { uid: 'admin-1', admin: req.headers['x-test-admin'] !== 'false' };
    next();
  },
  requireAdmin: (req, res, next) => {
    if (req.user?.admin) return next();
    return res.status(403).send({ message: 'Forbidden: Requires admin privileges' });
  },
}));

const { buildPilotLaunchReadinessSnapshot } = require('../src/services/pilotLaunchStatusService');
const pilotSettingsRoutes = require('../src/routes/admin/pilotSettingsRoutes');

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use(pilotSettingsRoutes);
  return app;
}

describe('admin pilot settings contract', () => {
  beforeEach(() => {
    store.settings = null;
    store.history = [];
    buildPilotLaunchReadinessSnapshot.mockResolvedValue({
      overallStatus: 'NOT READY',
      blockers: [{ id: 'P06', label: 'P06 — legal/privacy review open' }],
    });
  });

  it('rejects non-admin callers on read and mutation', async () => {
    const app = buildApp();
    const read = await request(app).get('/api/admin/pilot-settings').set('x-test-admin', 'false');
    const write = await request(app)
      .put('/api/admin/pilot-settings/state')
      .set('x-test-admin', 'false')
      .send({ state: 'OPEN' });
    expect(read.status).toBe(403);
    expect(write.status).toBe(403);
  });

  it('reads missing settings as effective CLOSED', async () => {
    const res = await request(buildApp()).get('/api/admin/pilot-settings');
    expect(res.status).toBe(200);
    expect(res.body.effectiveState).toBe('CLOSED');
    expect(res.body.documentExists).toBe(false);
    expect(res.body.postingWired).toBe(true);
    expect(res.body.postingBehaviour).toBe('CLOSED');
  });

  it('rejects OPEN while launch readiness is NOT READY', async () => {
    const res = await request(buildApp()).put('/api/admin/pilot-settings/state').send({ state: 'OPEN' });
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('PILOT_NOT_READY');
    expect(store.history).toEqual([]);
  });

  it('opens only after a live READY TO OPEN evaluation and records audit', async () => {
    buildPilotLaunchReadinessSnapshot.mockResolvedValueOnce({
      overallStatus: 'READY TO OPEN',
      blockers: [],
    });
    const res = await request(buildApp())
      .put('/api/admin/pilot-settings/state')
      .send({ state: 'OPEN', reason: 'controlled activation' });
    expect(res.status).toBe(200);
    expect(res.body.changed).toBe(true);
    expect(res.body.settings.effectiveState).toBe('OPEN');
    expect(store.history).toHaveLength(1);
    expect(JSON.stringify(res.body)).not.toMatch(/sk_live_|whsec_|SMTP_PASS|client_secret/);
  });
});
