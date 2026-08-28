'use strict';

const fs = require('fs');
const path = require('path');

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
    collection: jest.fn((subName) => ({
      get: jest.fn(async () => {
        const rows = Array.from(store(`${collectionName}/${id}/${subName}`).entries()).map(([vid, data]) => ({
          id: vid,
          data: () => mockClone(data),
        }));
        return { empty: rows.length === 0, docs: rows };
      }),
      doc: jest.fn((vid) => makeDocRef(`${collectionName}/${id}/${subName}`, String(vid))),
    })),
    get: jest.fn(async () => {
      const value = store(collectionName).get(id);
      return { id, ref, exists: !!value, data: () => mockClone(value || {}) };
    }),
    set: jest.fn(async (payload, options = {}) => {
      const previous = store(collectionName).get(id) || {};
      store(collectionName).set(id, options.merge ? { ...previous, ...mockClone(payload) } : mockClone(payload));
    }),
    update: jest.fn(async (payload) => {
      const previous = store(collectionName).get(id);
      if (!previous) {
        const err = new Error('NOT_FOUND: no entity to update');
        err.code = 5;
        throw err;
      }
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
    set: (ref, payload, options) => ref.set(payload, options),
  })),
};

jest.mock('../src/firebaseAdmin', () => ({
  admin: {
    firestore: {
      FieldValue: {
        serverTimestamp: jest.fn(() => '__ts__'),
        arrayUnion: jest.fn((...values) => values),
      },
      Timestamp: {
        fromDate: (d) => ({ _seconds: Math.floor(d.getTime() / 1000) }),
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

  it('does not flag a payment incident for stale transfer.failed or the UI alias transfer.canceled', async () => {
    store('jobs').set('job-stale-failed', { status: 'PAID', paymentState: 'released' });
    store('jobs').set('job-ui-alias', { status: 'PAID', paymentState: 'released' });

    await _test.dispatchStripeEventHandlers({
      id: 'evt_stale_failed',
      type: 'transfer.failed',
      data: { object: { id: 'tr_failed', status: 'failed', metadata: { jobId: 'job-stale-failed' } } },
    });
    await _test.dispatchStripeEventHandlers({
      id: 'evt_ui_alias',
      type: 'transfer.canceled',
      data: { object: { id: 'tr_canceled', status: 'canceled', metadata: { jobId: 'job-ui-alias' } } },
    });

    expect(store('jobs').get('job-stale-failed')).toEqual({ status: 'PAID', paymentState: 'released' });
    expect(store('jobs').get('job-ui-alias')).toEqual({ status: 'PAID', paymentState: 'released' });
    expect(mockWorkItems).toEqual([]);
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

  it('acknowledges payout.failed without creating a profile when none exists', async () => {
    const warnSpy = jest.spyOn(require('../src/observability/logger').logger, 'warn').mockImplementation(() => require('../src/observability/logger').logger);

    await _test.dispatchStripeEventHandlers({
      id: 'evt_payout_failed_missing',
      type: 'payout.failed',
      account: 'acct_missing',
      data: {
        object: {
          id: 'po_missing',
          status: 'failed',
          failure_code: 'account_closed',
        },
      },
    });

    expect(store('users').size).toBe(0);
    expect(mockWorkItems).toEqual([]);
    expect(warnSpy).toHaveBeenCalledWith(
      'stripe_payout_failed_skipped',
      expect.objectContaining({ reason: 'profile_missing' })
    );
    expect(JSON.stringify(warnSpy.mock.calls)).not.toMatch(/acct_missing|expert-/);
    warnSpy.mockRestore();
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

  it('does not mark the job REFUNDED when charge.refunded is only the base payment', async () => {
    store('jobs').set('job-br', {
      status: 'REFUND_PENDING',
      paymentState: 'refund_pending',
      paymentIntentId: 'pi_base_only',
      paymentAmountCents: 10000,
      refundId: 're_base',
    });
    store('jobs/job-br/variations').set('var-1', {
      paymentState: 'in_escrow',
      paymentStatus: 'paid',
      priceChangeCents: 5000,
      paymentIntentId: 'pi_var_1',
    });

    await _test.dispatchStripeEventHandlers({
      id: 'evt_charge_refunded_base',
      type: 'charge.refunded',
      data: {
        object: {
          id: 'ch_1',
          payment_intent: 'pi_base_only',
          refunded: true,
          amount: 10000,
          amount_refunded: 10000,
          metadata: { jobId: 'job-br' },
          refunds: { data: [{ id: 're_base' }] },
        },
      },
    });

    expect(store('jobs').get('job-br').status).toBe('REFUND_PENDING');
    expect(store('jobs').get('job-br').paymentState).toBe('refund_pending');
    expect(store('jobs').get('job-br').baseRefundConfirmed).toBe(true);
  });

  it('maps a variation refund.updated to the variation and does not mark the job REFUNDED', async () => {
    store('jobs').set('job-vr', {
      status: 'REFUND_PENDING',
      paymentState: 'refund_pending',
      paymentIntentId: 'pi_base_vr',
      paymentAmountCents: 10000,
      refundId: 're_base_vr',
    });
    store('jobs/job-vr/variations').set('var-x', {
      paymentState: 'refund_pending',
      paymentStatus: 'paid',
      priceChangeCents: 4000,
      paymentIntentId: 'pi_var_x',
      refundId: 're_var_x',
    });

    await _test.dispatchStripeEventHandlers({
      id: 'evt_var_refund_ok',
      type: 'refund.updated',
      data: {
        object: {
          id: 're_var_x',
          status: 'succeeded',
          amount: 4000,
          payment_intent: 'pi_var_x',
          metadata: {
            type: 'variation_refund',
            paymentType: 'variation',
            jobId: 'job-vr',
            variationId: 'var-x',
          },
        },
      },
    });

    expect(store('jobs/job-vr/variations').get('var-x').paymentState).toBe('refunded');
    expect(store('jobs').get('job-vr').status).toBe('REFUND_PENDING');
    expect(store('jobs').get('job-vr').paymentState).toBe('refund_pending');
  });

  it('finalises the job only after a pending variation refund later succeeds', async () => {
    store('jobs').set('job-final-var', {
      status: 'REFUND_PENDING',
      paymentState: 'refund_pending',
      paymentIntentId: 'pi_final_var_base',
      paymentAmountCents: 10000,
      refundId: 're_final_var_base',
      refundStatus: 'succeeded',
      baseRefundConfirmed: true,
    });
    store('jobs/job-final-var/variations').set('var-b', {
      paymentState: 'refund_pending',
      paymentStatus: 'paid',
      priceChangeCents: 4000,
      paymentIntentId: 'pi_final_var_b',
      refundId: 're_final_var_b',
      refundStatus: 'pending',
    });

    await _test.dispatchStripeEventHandlers({
      id: 'evt_var_still_pending',
      type: 'refund.updated',
      data: {
        object: {
          id: 're_final_var_b',
          status: 'pending',
          amount: 4000,
          payment_intent: 'pi_final_var_b',
          metadata: {
            type: 'variation_refund',
            jobId: 'job-final-var',
            variationId: 'var-b',
          },
        },
      },
    });
    expect(store('jobs').get('job-final-var').status).toBe('REFUND_PENDING');
    expect(store('jobs').get('job-final-var').paymentState).toBe('refund_pending');

    await _test.dispatchStripeEventHandlers({
      id: 'evt_var_now_ok',
      type: 'refund.updated',
      data: {
        object: {
          id: 're_final_var_b',
          status: 'succeeded',
          amount: 4000,
          payment_intent: 'pi_final_var_b',
          metadata: {
            type: 'variation_refund',
            jobId: 'job-final-var',
            variationId: 'var-b',
          },
        },
      },
    });

    expect(store('jobs/job-final-var/variations').get('var-b').paymentState).toBe('refunded');
    expect(store('jobs').get('job-final-var').status).toBe('REFUNDED');
    expect(store('jobs').get('job-final-var').paymentState).toBe('refunded');
  });

  it('finalises the job when a pending base refund later succeeds and variations are already confirmed', async () => {
    store('jobs').set('job-final-base', {
      status: 'REFUND_PENDING',
      paymentState: 'refund_pending',
      paymentIntentId: 'pi_final_base',
      paymentAmountCents: 10000,
      refundId: 're_final_base',
      refundStatus: 'pending',
    });
    store('jobs/job-final-base/variations').set('var-ok', {
      paymentState: 'refunded',
      paymentStatus: 'paid',
      priceChangeCents: 4000,
      paymentIntentId: 'pi_final_base_v',
      refundId: 're_final_base_v',
      refundStatus: 'succeeded',
    });

    await _test.dispatchStripeEventHandlers({
      id: 'evt_base_now_ok',
      type: 'refund.updated',
      data: {
        object: {
          id: 're_final_base',
          status: 'succeeded',
          amount: 10000,
          payment_intent: 'pi_final_base',
          metadata: { type: 'job_refund', paymentType: 'base', jobId: 'job-final-base' },
        },
      },
    });

    expect(store('jobs').get('job-final-base').status).toBe('REFUNDED');
    expect(store('jobs').get('job-final-base').paymentState).toBe('refunded');
    expect(store('jobs').get('job-final-base').baseRefundConfirmed).toBe(true);
  });

  it('dispute refund stays DISPUTED with paymentState refunded once all items succeed via webhook', async () => {
    store('jobs').set('job-final-disp', {
      status: 'DISPUTED',
      paymentState: 'refund_pending',
      disputeFlag: true,
      paymentIntentId: 'pi_final_disp',
      paymentAmountCents: 10000,
      refundId: 're_final_disp',
      refundStatus: 'succeeded',
      baseRefundConfirmed: true,
      lastAdminActionBy: 'admin-uid',
    });
    store('jobs/job-final-disp/variations').set('vx', {
      paymentState: 'refund_pending',
      paymentStatus: 'paid',
      priceChangeCents: 8000,
      paymentIntentId: 'pi_final_disp_v',
      refundId: 're_final_disp_v',
      refundStatus: 'pending',
    });

    await _test.dispatchStripeEventHandlers({
      id: 'evt_disp_var_ok',
      type: 'refund.updated',
      data: {
        object: {
          id: 're_final_disp_v',
          status: 'succeeded',
          amount: 8000,
          payment_intent: 'pi_final_disp_v',
          metadata: {
            type: 'variation_refund',
            jobId: 'job-final-disp',
            variationId: 'vx',
          },
        },
      },
    });

    expect(store('jobs').get('job-final-disp').status).toBe('DISPUTED');
    expect(store('jobs').get('job-final-disp').paymentState).toBe('refunded');
    expect(store('jobs').get('job-final-disp').disputeResolution).toBe('refunded');
  });

  it('does not confirm a base payment from a partial charge.refunded', async () => {
    store('jobs').set('job-partial-base', {
      status: 'REFUND_PENDING',
      paymentState: 'refund_pending',
      paymentIntentId: 'pi_partial_base',
      paymentAmountCents: 10000,
      refundId: 're_taskio_base',
    });

    await _test.dispatchStripeEventHandlers({
      id: 'evt_partial_base',
      type: 'charge.refunded',
      data: {
        object: {
          id: 'ch_partial_base',
          payment_intent: 'pi_partial_base',
          refunded: false,
          amount: 10000,
          amount_refunded: 2000,
          metadata: { jobId: 'job-partial-base' },
          refunds: { data: [{ id: 're_manual_20' }] },
        },
      },
    });

    const job = store('jobs').get('job-partial-base');
    expect(job.baseRefundConfirmed).not.toBe(true);
    expect(job.paymentState).toBe('refund_pending');
    expect(job.status).toBe('REFUND_PENDING');
    expect(job.refundPartial).toBe(true);
    expect(job.requiresAdminAttention).toBe(true);
  });

  it('does not confirm a variation from a partial charge.refunded', async () => {
    store('jobs').set('job-partial-var', {
      status: 'REFUND_PENDING',
      paymentState: 'refund_pending',
      paymentIntentId: 'pi_partial_var_base',
      paymentAmountCents: 10000,
      refundId: 're_partial_var_base',
      refundStatus: 'succeeded',
      baseRefundConfirmed: true,
    });
    store('jobs/job-partial-var/variations').set('var-p', {
      paymentState: 'refund_pending',
      paymentStatus: 'paid',
      priceChangeCents: 5000,
      paymentIntentId: 'pi_partial_var',
      refundId: 're_var_taskio',
    });

    await _test.dispatchStripeEventHandlers({
      id: 'evt_partial_var',
      type: 'charge.refunded',
      data: {
        object: {
          id: 'ch_partial_var',
          payment_intent: 'pi_partial_var',
          refunded: false,
          amount: 5000,
          amount_refunded: 1000,
          metadata: {
            type: 'variation_payment',
            paymentType: 'variation',
            jobId: 'job-partial-var',
            variationId: 'var-p',
          },
          refunds: { data: [{ id: 're_manual_var' }] },
        },
      },
    });

    expect(store('jobs/job-partial-var/variations').get('var-p').paymentState).toBe('refund_pending');
    expect(store('jobs').get('job-partial-var').status).toBe('REFUND_PENDING');
    expect(store('jobs').get('job-partial-var').paymentState).toBe('refund_pending');
  });

  it('does not confirm a Taskio item from an unrelated succeeded refundId', async () => {
    store('jobs').set('job-unrelated', {
      status: 'REFUND_PENDING',
      paymentState: 'refund_pending',
      paymentIntentId: 'pi_unrelated',
      paymentAmountCents: 10000,
      refundId: 're_taskio_unrelated',
    });

    await _test.dispatchStripeEventHandlers({
      id: 'evt_unrelated_refund',
      type: 'refund.updated',
      data: {
        object: {
          id: 're_manual_other',
          status: 'succeeded',
          amount: 10000,
          payment_intent: 'pi_unrelated',
          metadata: { type: 'job_refund', jobId: 'job-unrelated' },
        },
      },
    });

    const job = store('jobs').get('job-unrelated');
    expect(job.baseRefundConfirmed).not.toBe(true);
    expect(job.status).toBe('REFUND_PENDING');
    expect(job.paymentState).toBe('refund_pending');
  });

  it('does not finalise when the base refund is only partial even if variations succeeded', async () => {
    store('jobs').set('job-mix-partial', {
      status: 'REFUND_PENDING',
      paymentState: 'refund_pending',
      paymentIntentId: 'pi_mix_partial',
      paymentAmountCents: 10000,
      refundId: 're_mix_base',
    });
    store('jobs/job-mix-partial/variations').set('var-ok', {
      paymentState: 'refunded',
      paymentStatus: 'paid',
      priceChangeCents: 4000,
      paymentIntentId: 'pi_mix_var',
      refundId: 're_mix_var',
      refundStatus: 'succeeded',
    });

    await _test.dispatchStripeEventHandlers({
      id: 'evt_mix_partial_base',
      type: 'charge.refunded',
      data: {
        object: {
          id: 'ch_mix_partial',
          payment_intent: 'pi_mix_partial',
          refunded: false,
          amount: 10000,
          amount_refunded: 2000,
          refunds: { data: [{ id: 're_manual_20' }] },
        },
      },
    });

    const job = store('jobs').get('job-mix-partial');
    expect(job.baseRefundConfirmed).not.toBe(true);
    expect(job.status).toBe('REFUND_PENDING');
    expect(job.paymentState).toBe('refund_pending');
  });

  it('does not confirm a succeeded refund whose amount is below the expected full refund', async () => {
    store('jobs').set('job-small-amt', {
      status: 'REFUND_PENDING',
      paymentState: 'refund_pending',
      paymentIntentId: 'pi_small_amt',
      paymentAmountCents: 10000,
      refundId: 're_small_amt',
    });

    await _test.dispatchStripeEventHandlers({
      id: 'evt_small_amt',
      type: 'refund.updated',
      data: {
        object: {
          id: 're_small_amt',
          status: 'succeeded',
          amount: 2000,
          payment_intent: 'pi_small_amt',
          metadata: { type: 'job_refund', jobId: 'job-small-amt' },
        },
      },
    });

    const job = store('jobs').get('job-small-amt');
    expect(job.baseRefundConfirmed).not.toBe(true);
    expect(job.status).toBe('REFUND_PENDING');
    expect(job.refundPartial).toBe(true);
  });

  it('confirms a full variation charge.refunded only when identifiers match', async () => {
    store('jobs').set('job-full-var-ch', {
      status: 'REFUND_PENDING',
      paymentState: 'refund_pending',
      paymentIntentId: 'pi_full_var_base',
      paymentAmountCents: 10000,
      refundId: 're_full_var_base',
      refundStatus: 'succeeded',
      baseRefundConfirmed: true,
    });
    store('jobs/job-full-var-ch/variations').set('var-full', {
      paymentState: 'refund_pending',
      paymentStatus: 'paid',
      priceChangeCents: 5000,
      paymentIntentId: 'pi_full_var',
      refundId: 're_full_var',
    });

    await _test.dispatchStripeEventHandlers({
      id: 'evt_full_var_ch',
      type: 'charge.refunded',
      data: {
        object: {
          id: 'ch_full_var',
          payment_intent: 'pi_full_var',
          refunded: true,
          amount: 5000,
          amount_refunded: 5000,
          metadata: {
            type: 'variation_payment',
            jobId: 'job-full-var-ch',
            variationId: 'var-full',
          },
          refunds: { data: [{ id: 're_full_var' }] },
        },
      },
    });

    expect(store('jobs/job-full-var-ch/variations').get('var-full').paymentState).toBe('refunded');
    expect(store('jobs').get('job-full-var-ch').status).toBe('REFUNDED');
    expect(store('jobs').get('job-full-var-ch').paymentState).toBe('refunded');
  });

  it('dispute path does not finalise after a partial base charge.refunded', async () => {
    store('jobs').set('job-disp-partial', {
      status: 'DISPUTED',
      paymentState: 'refund_pending',
      disputeFlag: true,
      paymentIntentId: 'pi_disp_partial',
      paymentAmountCents: 10000,
      refundId: 're_disp_partial',
    });
    store('jobs/job-disp-partial/variations').set('vx', {
      paymentState: 'refunded',
      paymentStatus: 'paid',
      priceChangeCents: 8000,
      paymentIntentId: 'pi_disp_partial_v',
      refundId: 're_disp_partial_v',
      refundStatus: 'succeeded',
    });

    await _test.dispatchStripeEventHandlers({
      id: 'evt_disp_partial',
      type: 'charge.refunded',
      data: {
        object: {
          id: 'ch_disp_partial',
          payment_intent: 'pi_disp_partial',
          refunded: false,
          amount: 10000,
          amount_refunded: 2000,
          refunds: { data: [{ id: 're_manual_20' }] },
        },
      },
    });

    const job = store('jobs').get('job-disp-partial');
    expect(job.status).toBe('DISPUTED');
    expect(job.paymentState).toBe('refund_pending');
    expect(job.baseRefundConfirmed).not.toBe(true);
    expect(job.disputeResolution).not.toBe('refunded');
  });

  it('associates checkout.session.completed without retrieving or funding when PI is a string', async () => {
    const stripe = require('../src/services/stripe');
    store('jobs').set('job-cs-string', {
      status: 'AWAITING_FUNDING',
      paymentState: 'pending_payment',
    });

    await _test.dispatchStripeEventHandlers({
      id: 'evt_cs_string',
      type: 'checkout.session.completed',
      data: {
        object: {
          id: 'cs_string_1',
          mode: 'payment',
          payment_status: 'paid',
          payment_intent: 'pi_cs_string',
          metadata: { jobId: 'job-cs-string' },
        },
      },
    });

    expect(stripe.retrievePaymentIntent).not.toHaveBeenCalled();
    expect(store('jobs').get('job-cs-string')).toMatchObject({
      status: 'AWAITING_FUNDING',
      paymentState: 'pending_payment',
      paymentCheckoutSessionId: 'cs_string_1',
      paymentIntentId: 'pi_cs_string',
    });
  });

  it('funds from checkout.session.completed only when the event already includes a succeeded PI object', async () => {
    const stripe = require('../src/services/stripe');
    store('jobs').set('job-cs-obj', {
      status: 'AWAITING_FUNDING',
      paymentState: 'pending_payment',
      acceptedQuoteId: 'q1',
    });

    await _test.dispatchStripeEventHandlers({
      id: 'evt_cs_obj',
      type: 'checkout.session.completed',
      data: {
        object: {
          id: 'cs_obj_1',
          mode: 'payment',
          payment_status: 'paid',
          payment_intent: {
            id: 'pi_cs_obj',
            object: 'payment_intent',
            status: 'succeeded',
            amount: 10000,
            currency: 'aud',
          },
          metadata: { jobId: 'job-cs-obj' },
        },
      },
    });

    expect(stripe.retrievePaymentIntent).not.toHaveBeenCalled();
    expect(store('jobs').get('job-cs-obj').paymentCheckoutSessionId).toBe('cs_obj_1');
  });

  it('runtime handler source has no transfer.failed or transfer.canceled contract', () => {
    const src = fs.readFileSync(
      path.join(__dirname, '../src/services/stripeEventHandlers.js'),
      'utf8',
    );
    expect(src).toMatch(/transfer\.reversed/);
    expect(src).not.toMatch(/transfer\.failed/);
    expect(src).not.toMatch(/transfer\.canceled/);
  });
});
