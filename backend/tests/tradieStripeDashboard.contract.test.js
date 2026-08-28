const express = require('express');
const request = require('supertest');

const mockUserStore = new Map();

const mockState = {
  currentUser: {
    uid: 'tradie-1',
    role: 'tradie',
    email: '',
    email_verified: false,
  },
};

function resetState() {
  mockUserStore.clear();
  mockState.currentUser = {
    uid: 'tradie-1',
    role: 'tradie',
    email: '',
    email_verified: false,
  };
}

function seedUser(uid, data) {
  mockUserStore.set(String(uid), { ...data });
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
    collection: jest.fn((name) => {
      if (name === 'users') {
        return {
          doc: jest.fn((id) => ({
            get: jest.fn(async () => {
              const u = mockUserStore.get(String(id));
              return { exists: !!u, data: () => (u ? JSON.parse(JSON.stringify(u)) : null) };
            }),
            set: jest.fn(async (payload, options = {}) => {
              const existing = mockUserStore.get(String(id)) || {};
              const next = options.merge ? { ...existing, ...payload } : { ...payload };
              mockUserStore.set(String(id), next);
            }),
            update: jest.fn(async (payload) => {
              const existing = mockUserStore.get(String(id));
              if (!existing) {
                const err = new Error('NOT_FOUND: no entity to update');
                err.code = 5;
                throw err;
              }
              mockUserStore.set(String(id), { ...existing, ...payload });
            }),
          })),
        };
      }
      return { doc: jest.fn(() => ({ get: jest.fn(async () => ({ exists: false })) })) };
    }),
  },
}));

jest.mock('../src/middleware/auth', () => ({
  requireAuth: (req, _res, next) => {
    req.user = JSON.parse(JSON.stringify(mockState.currentUser));
    next();
  },
  requireRole: (role) => (req, res, next) => {
    if (req.user?.role !== role) {
      return res.status(403).send({ message: 'Forbidden' });
    }
    return next();
  },
}));

const mockCreateExpressDashboardLoginLink = jest.fn();

jest.mock('../src/services/stripe', () => ({
  createExpressAccount: jest.fn(),
  createAccountLink: jest.fn(),
  retrieveAccount: jest.fn(),
  createExpressDashboardLoginLink: (...a) => mockCreateExpressDashboardLoginLink(...a),
  retrieveConnectAccountBalance: jest.fn(),
}));

const tradieRoutes = require('../src/routes/tradie');

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use(tradieRoutes);
  return app;
}

describe('POST /api/tradie/stripe-dashboard-link', () => {
  let app;
  let envStripe;

  beforeEach(() => {
    resetState();
    envStripe = process.env.STRIPE_ENABLED;
    process.env.STRIPE_ENABLED = 'true';
    mockCreateExpressDashboardLoginLink.mockReset();
    mockCreateExpressDashboardLoginLink.mockResolvedValue({ url: 'https://connect.stripe.com/express/acct_test' });
    app = buildApp();
  });

  afterEach(() => {
    process.env.STRIPE_ENABLED = envStripe;
  });

  it('returns Stripe Express login URL when expert has connected account id', async () => {
    seedUser('tradie-1', { stripeAccountId: 'acct_123' });

    const res = await request(app).post('/api/tradie/stripe-dashboard-link');

    expect(res.status).toBe(200);
    expect(res.body.url).toBe('https://connect.stripe.com/express/acct_test');
    expect(mockCreateExpressDashboardLoginLink).toHaveBeenCalledWith('acct_123');
  });

  it('accepts stripeConnectedAccountId field name', async () => {
    seedUser('tradie-1', { stripeConnectedAccountId: 'acct_alt' });

    const res = await request(app).post('/api/tradie/stripe-dashboard-link');

    expect(res.status).toBe(200);
    expect(mockCreateExpressDashboardLoginLink).toHaveBeenCalledWith('acct_alt');
  });

  it('409 when payout account missing', async () => {
    seedUser('tradie-1', { name: 'Expert' });

    const res = await request(app).post('/api/tradie/stripe-dashboard-link');

    expect(res.status).toBe(409);
    expect(res.body.message).toBe('Your payout account is not fully set up yet.');
    expect(mockCreateExpressDashboardLoginLink).not.toHaveBeenCalled();
  });

  it('403 for homeowner', async () => {
    mockState.currentUser = { uid: 'h1', role: 'homeowner' };
    seedUser('h1', { stripeAccountId: 'acct_x' });

    const res = await request(app).post('/api/tradie/stripe-dashboard-link');

    expect(res.status).toBe(403);
    expect(mockCreateExpressDashboardLoginLink).not.toHaveBeenCalled();
  });

  it('returns stripe_disabled and does not create a login link when Stripe is disabled', async () => {
    process.env.STRIPE_ENABLED = 'false';
    process.env.STRIPE_SECRET_KEY = 'sk_test_present_but_disabled';
    seedUser('tradie-1', { stripeAccountId: 'acct_123' });

    const res = await request(app).post('/api/tradie/stripe-dashboard-link');

    expect(res.status).toBe(503);
    expect(res.body.code).toBe('stripe_disabled');
    expect(mockCreateExpressDashboardLoginLink).not.toHaveBeenCalled();
  });
});

describe('POST /api/tradie/stripe/onboarding-link', () => {
  let app;
  let envStripe;
  const stripe = require('../src/services/stripe');

  beforeEach(() => {
    resetState();
    envStripe = process.env.STRIPE_ENABLED;
    process.env.STRIPE_ENABLED = 'true';
    process.env.FRONTEND_URL = 'http://localhost:3000';
    stripe.createExpressAccount.mockReset();
    stripe.createAccountLink.mockReset();
    stripe.createExpressAccount.mockResolvedValue({ id: 'acct_new' });
    stripe.createAccountLink.mockResolvedValue({ url: 'https://connect.stripe.com/setup/s/acct_new' });
    app = buildApp();
  });

  afterEach(() => {
    process.env.STRIPE_ENABLED = envStripe;
  });

  it('creates an Express account and AccountLink when Stripe is enabled', async () => {
    seedUser('tradie-1', { email: 'expert@test.com' });

    const res = await request(app).post('/api/tradie/stripe/onboarding-link');

    expect(res.status).toBe(200);
    expect(res.body.url).toContain('connect.stripe.com');
    expect(stripe.createExpressAccount).toHaveBeenCalled();
    expect(stripe.createAccountLink).toHaveBeenCalled();
  });

  it('does not create Connect resources when Stripe is disabled even if a secret exists', async () => {
    process.env.STRIPE_ENABLED = 'false';
    process.env.STRIPE_SECRET_KEY = 'sk_test_present_but_disabled';
    seedUser('tradie-1', { email: 'expert@test.com' });

    const res = await request(app).post('/api/tradie/stripe/onboarding-link');

    expect(res.status).toBe(503);
    expect(res.body.code).toBe('stripe_disabled');
    expect(stripe.createExpressAccount).not.toHaveBeenCalled();
    expect(stripe.createAccountLink).not.toHaveBeenCalled();
  });
});
