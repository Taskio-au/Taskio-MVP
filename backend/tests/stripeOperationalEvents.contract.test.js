'use strict';

const stores = new Map();
const mockWorkItems = [];

function store(name) {
  if (!stores.has(name)) stores.set(name, new Map());
  return stores.get(name);
}

function mockClone(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function makeDocRef(collectionName, id) {
  const ref = {
    id,
    get: jest.fn(async () => {
      const value = store(collectionName).get(id);
      return { id, ref, exists: !!value, data: () => mockClone(value || {}) };
    }),
    set: jest.fn(async (payload, options = {}) => {
      const previous = store(collectionName).get(id) || {};
      store(collectionName).set(id, options.merge ? { ...previous, ...mockClone(payload) } : mockClone(payload));
    }),
    update: jest.fn(async (payload) => {
      const previous = store(collectionName).get(id) || {};
      store(collectionName).set(id, { ...previous, ...mockClone(payload) });
    }),
  };
  return ref;
}

const mockDb = {
  collection: jest.fn((name) => ({
    doc: jest.fn((id) => makeDocRef(name, String(id))),
    where: jest.fn((field, _operator, value) => ({
      limit: jest.fn(() => ({
        get: jest.fn(async () => {
          const rows = Array.from(store(name).entries())
            .filter(([, data]) => data[field] === value)
            .map(([id, data]) => {
              const ref = makeDocRef(name, id);
              return { id, ref, data: () => mockClone(data) };
            });
          return { empty: rows.length === 0, docs: rows.slice(0, 1) };
        }),
      })),
    })),
  })),
  runTransaction: jest.fn(async (callback) => callback({
    get: (ref) => ref.get(),
    update: (ref, payload) => ref.update(payload),
  })),
};

jest.mock('../src/firebaseAdmin', () => ({
  admin: {
    firestore: {
      FieldValue: {
        serverTimestamp: jest.fn(() => '__ts__'),
        arrayUnion: jest.fn((...values) => values),
      },
    },
  },
  db: mockDb,
}));

jest.mock('../src/services/stripe', () => ({
  constructWebhookEvent: jest.fn(),
  getExpectedStripeLivemode: jest.fn(() => false),
  retrievePaymentIntent: jest.fn(),
}));

jest.mock('../src/services/riskAutomationPipeline', () => ({
  evaluateJobRiskById: jest.fn(),
}));

jest.mock('../src/services/foundingExpertAutoEnrollmentService', () => ({
  DEFAULT_AUTO_ACTOR_UID: 'system',
  foundingExpertAutoEnrollEnabled: jest.fn(() => false),
  scheduleMaybeAutoEnrollFoundingExpert: jest.fn(),
}));

jest.mock('../src/services/adminWorkItemService', () => ({
  upsertWorkItemFromAutomation: jest.fn(async (item) => {
    mockWorkItems.push(mockClone(item));
  }),
}));

const { _test } = require('../src/routes/stripeWebhook');

describe('Stripe operational event handling', () => {
  beforeEach(() => {
    stores.clear();
    mockWorkItems.length = 0;
  });

  it('moves a released task into dispute review for a charge dispute', async () => {
    store('jobs').set('job-1', {
      status: 'PAID',
      paymentState: 'released',
      paymentIntentId: 'pi_1',
    });

    await _test.dispatchStripeEventHandlers({
      id: 'evt_dispute',
      type: 'charge.dispute.created',
      data: { object: { id: 'dp_1', status: 'needs_response', payment_intent: 'pi_1' } },
    });

    expect(store('jobs').get('job-1')).toMatchObject({
      status: 'DISPUTED',
      preDisputeStatus: 'PAID',
      requiresAdminAttention: true,
      paymentIncidentType: 'charge.dispute.created',
      paymentIncidentId: 'dp_1',
    });
    expect(mockWorkItems).toContainEqual(expect.objectContaining({
      entityType: 'job',
      entityId: 'job-1',
      category: 'payment',
      priority: 'critical',
    }));
  });

  it('flags a transfer reversal by deterministic job metadata', async () => {
    store('jobs').set('job-2', { status: 'PAID', paymentState: 'released' });

    await _test.dispatchStripeEventHandlers({
      id: 'evt_reversal',
      type: 'transfer.reversed',
      data: { object: { id: 'tr_1', reversed: true, metadata: { jobId: 'job-2' } } },
    });

    expect(store('jobs').get('job-2')).toMatchObject({
      status: 'DISPUTED',
      paymentIncidentType: 'transfer.reversed',
      paymentIncidentStatus: 'reversed',
    });
  });

  it('flags the connected expert and creates an admin work item on payout failure', async () => {
    store('users').set('expert-1', { stripeAccountId: 'acct_1', role: 'tradie' });

    await _test.dispatchStripeEventHandlers({
      id: 'evt_payout_failed',
      type: 'payout.failed',
      account: 'acct_1',
      data: {
        object: {
          id: 'po_1',
          status: 'failed',
          failure_code: 'account_closed',
          failure_message: 'The bank account was closed.',
        },
      },
    });

    expect(store('users').get('expert-1')).toMatchObject({
      stripePayoutStatus: 'failed',
      stripePayoutFailureCode: 'account_closed',
      requiresAdminAttention: true,
    });
    expect(mockWorkItems).toContainEqual(expect.objectContaining({
      entityType: 'expert',
      entityId: 'expert-1',
      sourceReasonCodes: ['PAYOUT_FAILED'],
    }));
  });

  it('closes the refund attempt when a Stripe Refund later fails', async () => {
    store('jobs').set('job-rf', {
      status: 'REFUND_PENDING',
      paymentState: 'refund_pending',
      paymentIntentId: 'pi_rf',
      refundAttempt: 1,
      refundAttemptOpen: true,
    });

    await _test.dispatchStripeEventHandlers({
      id: 'evt_refund_failed',
      type: 'refund.failed',
      data: {
        object: {
          id: 're_failed_1',
          status: 'failed',
          payment_intent: 'pi_rf',
          failure_reason: 'expired_or_canceled_card',
        },
      },
    });

    expect(store('jobs').get('job-rf')).toMatchObject({
      paymentState: 'refund_failed',
      refundAttemptOpen: false,
      refundLastFailedId: 're_failed_1',
      refundLastFailureCategory: 'refund_object_failed',
      refundLastFailureCode: 'expired_or_canceled_card',
    });
    expect(store('jobs').get('job-rf').refundId).toBeUndefined();
  });
});
