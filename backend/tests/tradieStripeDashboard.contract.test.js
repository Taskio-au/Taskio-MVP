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
  ensureUserProfile: () => (_req, _res, next) => next(),
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
});
