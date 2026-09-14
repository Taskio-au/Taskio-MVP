'use strict';

const express = require('express');
const request = require('supertest');

const mockState = {
  collections: new Map(),
};

function resetState() {
  mockState.collections = new Map();
}

function mockGetCollectionStore(name) {
  const key = String(name);
  if (!mockState.collections.has(key)) {
    mockState.collections.set(key, new Map());
  }
  return mockState.collections.get(key);
}

function mockClone(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

jest.mock('../src/firebaseAdmin', () => ({
  admin: {
    firestore: {
      FieldValue: {
        serverTimestamp: jest.fn(() => '__server_ts__'),
      },
    },
  },
  db: {
    collection: jest.fn((name) => ({
      async add(payload) {
        const id = `${String(name)}-${mockGetCollectionStore(name).size + 1}`;
        mockGetCollectionStore(name).set(id, { id, ...mockClone(payload) });
        return { id };
      },
      doc: jest.fn((id) => ({
        get: jest.fn(async () => {
          const existing = mockGetCollectionStore(name).get(id);
          return { exists: !!existing, data: () => mockClone(existing) };
        }),
        set: jest.fn(async (payload, options = {}) => {
          const existing = mockGetCollectionStore(name).get(id) || {};
          const next = options.merge ? { ...existing, ...mockClone(payload) } : mockClone(payload);
          mockGetCollectionStore(name).set(id, { id, ...next });
        }),
      })),
    })),
  },
}));

const publicPilotStatusRoutes = require('../src/routes/publicPilotStatus');
const {
  CONSENT_VERSION,
  EMAIL_MAX,
  SUBURB_MAX,
  waitlistDocId,
} = require('../src/services/pilotWaitlistService');
const {
  CONSENT_VERSION: EXPERT_CONSENT_VERSION,
  waitlistDocId: expertWaitlistDocId,
} = require('../src/services/expertWaitlistService');

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use(publicPilotStatusRoutes);
  return app;
}

describe('public pilot status and waitlist', () => {
  let app;

  beforeEach(() => {
    resetState();
    app = buildApp();
  });

  it('returns canPost true for OPEN and no admin metadata', async () => {
    mockGetCollectionStore('system').set('pilotSettings', { id: 'pilotSettings', state: 'OPEN' });
    const res = await request(app).get('/api/pilot-status');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      homeownerPosting: 'OPEN',
      canPost: true,
      waitlistAvailable: false,
      expertOnboarding: 'WAITLIST',
      canExpertApply: false,
      expertWaitlistAvailable: true,
    });
    expect(JSON.stringify(res.body)).not.toMatch(/P0[0-9]|blocker|updatedBy|manifest|TASKIO_PUBLIC_SIGNUP|expert count|launchReady/i);
  });

  it('returns canPost false for CLOSED', async () => {
    mockGetCollectionStore('system').set('pilotSettings', { id: 'pilotSettings', state: 'CLOSED' });
    const res = await request(app).get('/api/pilot-status');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      homeownerPosting: 'CLOSED',
      canPost: false,
      waitlistAvailable: true,
      expertOnboarding: 'WAITLIST',
      canExpertApply: false,
      expertWaitlistAvailable: true,
    });
  });

  it('returns canPost false for PAUSED', async () => {
    mockGetCollectionStore('system').set('pilotSettings', { id: 'pilotSettings', state: 'PAUSED' });
    const res = await request(app).get('/api/pilot-status');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      homeownerPosting: 'PAUSED',
      canPost: false,
      waitlistAvailable: true,
      expertOnboarding: 'WAITLIST',
      canExpertApply: false,
      expertWaitlistAvailable: true,
    });
  });

  it('fails closed when settings are missing', async () => {
    const res = await request(app).get('/api/pilot-status');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      homeownerPosting: 'CLOSED',
      canPost: false,
      waitlistAvailable: true,
      expertOnboarding: 'WAITLIST',
      canExpertApply: false,
      expertWaitlistAvailable: true,
    });
  });

  it('allows Expert applications while homeowner posting is CLOSED', async () => {
    mockGetCollectionStore('system').set('pilotSettings', {
      id: 'pilotSettings',
      state: 'CLOSED',
      expertOnboardingMode: 'OPEN',
    });
    const res = await request(app).get('/api/pilot-status');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      homeownerPosting: 'CLOSED',
      canPost: false,
      waitlistAvailable: true,
      expertOnboarding: 'OPEN',
      canExpertApply: true,
      expertWaitlistAvailable: false,
    });
  });

  it('blocks Expert applications while homeowner posting is OPEN', async () => {
    mockGetCollectionStore('system').set('pilotSettings', {
      id: 'pilotSettings',
      state: 'OPEN',
      expertOnboardingMode: 'WAITLIST',
    });
    const res = await request(app).get('/api/pilot-status');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      homeownerPosting: 'OPEN',
      canPost: true,
      waitlistAvailable: false,
      expertOnboarding: 'WAITLIST',
      canExpertApply: false,
      expertWaitlistAvailable: true,
    });
  });

  it('accepts a minimal waitlist email without opening posting', async () => {
    const res = await request(app)
      .post('/api/pilot-waitlist')
      .send({
        email: '  Homeowner@Example.com ',
        suburb: 'Richmond',
        source: 'landing',
        consentAccepted: true,
        role: 'admin',
        createdAt: 'client-supplied',
        status: 'OPEN',
      });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true, message: "You're on the waitlist." });
    const id = waitlistDocId('homeowner@example.com');
    const stored = mockGetCollectionStore('pilotWaitlist').get(id);
    expect(stored).toEqual(expect.objectContaining({
      email: 'homeowner@example.com',
      suburb: 'Richmond',
      source: 'landing',
      consentVersion: CONSENT_VERSION,
      consentAcceptedAt: '__server_ts__',
      createdAt: '__server_ts__',
      updatedAt: '__server_ts__',
    }));
    expect(stored.role).toBeUndefined();
    expect(stored.status).toBeUndefined();
    expect(stored.createdAt).toBe('__server_ts__');
    expect(mockGetCollectionStore('system').size).toBe(0);
  });

  it('rejects an invalid waitlist email', async () => {
    const res = await request(app)
      .post('/api/pilot-waitlist')
      .send({ email: 'not-an-email', consentAccepted: true });
    expect(res.status).toBe(400);
    expect(mockGetCollectionStore('pilotWaitlist').size).toBe(0);
  });

  it('rejects an overlong waitlist email', async () => {
    const res = await request(app)
      .post('/api/pilot-waitlist')
      .send({ email: `${'a'.repeat(EMAIL_MAX)}@x.io`, consentAccepted: true });
    expect(res.status).toBe(400);
    expect(mockGetCollectionStore('pilotWaitlist').size).toBe(0);
  });

  it('accepts waitlist contact consent only as boolean true', async () => {
    const accepted = await request(app)
      .post('/api/pilot-waitlist')
      .send({ email: 'homeowner@example.com', consentAccepted: true });
    expect(accepted.status).toBe(200);
    expect(accepted.body).toEqual({ ok: true, message: "You're on the waitlist." });
    const stored = mockGetCollectionStore('pilotWaitlist').get(waitlistDocId('homeowner@example.com'));
    expect(stored.consentVersion).toBe(CONSENT_VERSION);
    expect(stored.consentAcceptedAt).toBe('__server_ts__');
  });

  it.each([
    ['missing', { email: 'homeowner@example.com' }],
    ['false', { email: 'homeowner@example.com', consentAccepted: false }],
    ['string true', { email: 'homeowner@example.com', consentAccepted: 'true' }],
  ])('rejects waitlist writes when consentAccepted is %s', async (_label, body) => {
    const res = await request(app).post('/api/pilot-waitlist').send(body);
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/contact you about the melbourne pilot/i);
    expect(mockGetCollectionStore('pilotWaitlist').size).toBe(0);
  });

  it('bounds suburb, maps unknown source, and upserts duplicates without enumeration', async () => {
    const longSuburb = `Richmond ${'x'.repeat(200)}`;
    const first = await request(app)
      .post('/api/pilot-waitlist')
      .send({
        email: '  Repeat@Example.com ',
        suburb: longSuburb,
        source: 'not-a-source',
        consentAccepted: true,
      });
    expect(first.status).toBe(200);
    expect(first.body).toEqual({ ok: true, message: "You're on the waitlist." });
    const id = waitlistDocId('repeat@example.com');
    expect(mockGetCollectionStore('pilotWaitlist').get(id).suburb).toHaveLength(SUBURB_MAX);
    expect(mockGetCollectionStore('pilotWaitlist').get(id).source).toBe('waitlist');
    mockGetCollectionStore('pilotWaitlist').get(id).consentAcceptedAt = 'first-consent-ts';

    const second = await request(app)
      .post('/api/pilot-waitlist')
      .send({
        email: 'repeat@example.com',
        suburb: 'South Yarra',
        source: 'post-job',
        consentAccepted: true,
      });
    expect(second.status).toBe(200);
    expect(second.body).toEqual(first.body);
    expect(JSON.stringify(second.body)).not.toMatch(/already|exists|registered/i);

    const rows = Array.from(mockGetCollectionStore('pilotWaitlist').values());
    expect(rows).toHaveLength(1);
    expect(rows[0].email).toBe('repeat@example.com');
    expect(rows[0].suburb).toBe('South Yarra');
    expect(rows[0].source).toBe('post-job');
    expect(rows[0].createdAt).toBe('__server_ts__');
    expect(rows[0].updatedAt).toBe('__server_ts__');
    expect(rows[0].consentVersion).toBe(CONSENT_VERSION);
    expect(rows[0].consentAcceptedAt).toBe('first-consent-ts');
  });

  it('accepts Expert waitlist email with strict consent and canonical optional fields', async () => {
    const res = await request(app)
      .post('/api/expert-waitlist')
      .send({
        email: '  Expert@Example.com ',
        expertise: 'mounting_shelves',
        suburb: 'Richmond',
        source: 'landing',
        consentAccepted: true,
        role: 'admin',
        createdAt: 'client-supplied',
      });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true, message: "You're on the waitlist." });
    const id = expertWaitlistDocId('expert@example.com');
    const stored = mockGetCollectionStore('expertWaitlist').get(id);
    expect(stored).toEqual(expect.objectContaining({
      email: 'expert@example.com',
      expertise: 'mounting_shelves',
      suburb: 'Richmond',
      source: 'landing',
      consentVersion: EXPERT_CONSENT_VERSION,
      consentAcceptedAt: '__server_ts__',
    }));
    expect(stored.role).toBeUndefined();
    expect(mockGetCollectionStore('pilotWaitlist').size).toBe(0);
  });

  it.each([
    ['missing', { email: 'expert@example.com' }],
    ['false', { email: 'expert@example.com', consentAccepted: false }],
    ['string true', { email: 'expert@example.com', consentAccepted: 'true' }],
  ])('rejects Expert waitlist writes when consentAccepted is %s', async (_label, body) => {
    const res = await request(app).post('/api/expert-waitlist').send(body);
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/becoming a taskio expert/i);
    expect(mockGetCollectionStore('expertWaitlist').size).toBe(0);
  });

  it('rejects non-canonical Expert waitlist expertise and suburb', async () => {
    const badCategory = await request(app)
      .post('/api/expert-waitlist')
      .send({ email: 'expert@example.com', expertise: 'electrical', consentAccepted: true });
    expect(badCategory.status).toBe(400);
    const badSuburb = await request(app)
      .post('/api/expert-waitlist')
      .send({ email: 'expert@example.com', suburb: 'Sydney', consentAccepted: true });
    expect(badSuburb.status).toBe(400);
    expect(mockGetCollectionStore('expertWaitlist').size).toBe(0);
  });

  it('upserts Expert waitlist duplicates without enumeration', async () => {
    const first = await request(app)
      .post('/api/expert-waitlist')
      .send({ email: '  Repeat.Expert@Example.com ', consentAccepted: true });
    expect(first.status).toBe(200);
    const id = expertWaitlistDocId('repeat.expert@example.com');
    mockGetCollectionStore('expertWaitlist').get(id).consentAcceptedAt = 'first-consent-ts';
    const second = await request(app)
      .post('/api/expert-waitlist')
      .send({
        email: 'repeat.expert@example.com',
        expertise: 'mounting_tv',
        suburb: 'Carlton',
        source: 'get-started',
        consentAccepted: true,
      });
    expect(second.status).toBe(200);
    expect(second.body).toEqual(first.body);
    expect(JSON.stringify(second.body)).not.toMatch(/already|exists|registered/i);
    const rows = Array.from(mockGetCollectionStore('expertWaitlist').values());
    expect(rows).toHaveLength(1);
    expect(rows[0].expertise).toBe('mounting_tv');
    expect(rows[0].suburb).toBe('Carlton');
    expect(rows[0].consentAcceptedAt).toBe('first-consent-ts');
  });

  it('rate-limits waitlist writes', async () => {
    let okCount = 0;
    let limited = false;
    for (let i = 0; i < 40; i += 1) {
      const res = await request(app)
        .post('/api/pilot-waitlist')
        .send({ email: `ratelimit${i}@example.com`, consentAccepted: true });
      if (res.status === 200) okCount += 1;
      if (res.status === 429) {
        limited = true;
        expect(res.body.message).toMatch(/too many waitlist requests/i);
        break;
      }
    }
    expect(okCount).toBeGreaterThan(0);
    expect(limited).toBe(true);
  });
});
