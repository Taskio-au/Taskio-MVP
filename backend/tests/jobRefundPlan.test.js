'use strict';

const {
  buildAdminFullRefundPlan,
  planOutstandingItems,
  webhookMayMarkJobRefunded,
  allRequiredRefundsConfirmed,
  classifyPersistedRefundState,
  classifyStripeRefundCreateStatus,
} = require('../src/services/jobRefundPlan');

describe('buildAdminFullRefundPlan', () => {
  it('includes funded base and funded variations and skips unpaid or declined', () => {
    const plan = buildAdminFullRefundPlan(
      { paymentState: 'in_escrow', paymentIntentId: 'pi_base', paymentAmountCents: 10000 },
      [
        { id: 'paid', data: { paymentState: 'in_escrow', paymentStatus: 'paid', priceChangeCents: 5000, paymentIntentId: 'pi_v' } },
        { id: 'unpaid', data: { status: 'awaiting_payment', paymentState: 'pending_payment', priceChangeCents: 4000 } },
        { id: 'declined', data: { status: 'declined', priceChangeCents: 4000, paymentIntentId: 'pi_d' } },
        { id: 'zero', data: { paymentState: 'not_required', priceChangeCents: 0 } },
      ]
    );
    expect(plan.blocked).toBeNull();
    expect(plan.base.refundable).toBe(true);
    expect(planOutstandingItems(plan).map((item) => item.kind === 'base' ? 'base' : item.variationId)).toEqual(['base', 'paid']);
  });

  it('fails closed when base or a funded variation is released', () => {
    const releasedBase = buildAdminFullRefundPlan(
      { paymentState: 'released', paymentIntentId: 'pi_base', transferId: 'tr_1' },
      []
    );
    expect(releasedBase.blocked.code).toBe('funds_already_released');

    const releasedVar = buildAdminFullRefundPlan(
      { paymentState: 'in_escrow', paymentIntentId: 'pi_base' },
      [{
        id: 'v1',
        data: {
          paymentState: 'in_escrow',
          paymentStatus: 'paid',
          priceChangeCents: 5000,
          paymentIntentId: 'pi_v',
          releaseStatus: 'released',
          transferId: 'tr_v',
        },
      }]
    );
    expect(releasedVar.blocked.code).toBe('funds_already_released');
    expect(releasedVar.blocked.releasedVariationIds).toEqual(['v1']);
  });

  it('does not treat refundId alone as confirmed completion', () => {
    const plan = buildAdminFullRefundPlan(
      { paymentState: 'refund_pending', paymentIntentId: 'pi_base', refundId: 're_base', refundStatus: 'pending' },
      [{
        id: 'v1',
        data: {
          paymentState: 'refund_pending',
          paymentStatus: 'paid',
          priceChangeCents: 5000,
          paymentIntentId: 'pi_v',
          refundId: 're_v',
        },
      }]
    );
    expect(plan.base.settled).toBe(false);
    expect(plan.base.confirmation).toBe('pending');
    expect(plan.base.refundable).toBe(false);
    expect(plan.variations[0].settled).toBe(false);
    expect(plan.variations[0].confirmation).toBe('pending');
    expect(plan.variations[0].refundable).toBe(false);
    expect(allRequiredRefundsConfirmed(
      { paymentState: 'refund_pending', paymentIntentId: 'pi_base', refundId: 're_base', refundStatus: 'pending' },
      plan.variations.map((v) => ({ id: v.variationId, data: { paymentState: 'refund_pending', paymentStatus: 'paid', priceChangeCents: 5000, paymentIntentId: 'pi_v', refundId: 're_v' } }))
    )).toBe(false);
  });

  it('treats Stripe succeeded status as confirmed', () => {
    const plan = buildAdminFullRefundPlan(
      { paymentState: 'refund_pending', paymentIntentId: 'pi_base', refundId: 're_base', refundStatus: 'succeeded', baseRefundConfirmed: true },
      [{
        id: 'v1',
        data: {
          paymentState: 'refunded',
          paymentStatus: 'paid',
          priceChangeCents: 5000,
          paymentIntentId: 'pi_v',
          refundId: 're_v',
          refundStatus: 'succeeded',
        },
      }]
    );
    expect(plan.base.settled).toBe(true);
    expect(plan.variations[0].settled).toBe(true);
    expect(plan.variations[0].refundable).toBe(false);
  });
});

describe('classifyStripeRefundCreateStatus', () => {
  it('maps Stripe Refund.status values', () => {
    expect(classifyStripeRefundCreateStatus('succeeded')).toBe('succeeded');
    expect(classifyStripeRefundCreateStatus('pending')).toBe('pending');
    expect(classifyStripeRefundCreateStatus('requires_action')).toBe('pending');
    expect(classifyStripeRefundCreateStatus(undefined)).toBe('pending');
    expect(classifyStripeRefundCreateStatus('failed')).toBe('failed');
    expect(classifyStripeRefundCreateStatus('canceled')).toBe('failed');
    expect(classifyStripeRefundCreateStatus('cancelled')).toBe('failed');
  });
});

describe('allRequiredRefundsConfirmed', () => {
  it('requires every funded payment to be confirmed succeeded', () => {
    const job = {
      paymentState: 'refund_pending',
      paymentIntentId: 'pi_base',
      refundId: 're_base',
      refundStatus: 'succeeded',
      baseRefundConfirmed: true,
    };
    expect(allRequiredRefundsConfirmed(job, [{
      id: 'v1',
      data: {
        paymentState: 'refund_pending',
        paymentStatus: 'paid',
        priceChangeCents: 5000,
        paymentIntentId: 'pi_v',
        refundId: 're_v',
        refundStatus: 'pending',
      },
    }])).toBe(false);

    expect(allRequiredRefundsConfirmed(job, [{
      id: 'v1',
      data: {
        paymentState: 'refunded',
        paymentStatus: 'paid',
        priceChangeCents: 5000,
        paymentIntentId: 'pi_v',
        refundId: 're_v',
        refundStatus: 'succeeded',
      },
    }])).toBe(true);
  });
});

describe('webhookMayMarkJobRefunded', () => {
  it('does not complete the job while a funded variation is still unrefunded', () => {
    const ok = webhookMayMarkJobRefunded(
      { paymentState: 'refund_pending', paymentIntentId: 'pi_base', refundId: 're_base', refundStatus: 'succeeded', baseRefundConfirmed: true },
      [{
        id: 'v1',
        data: {
          paymentState: 'in_escrow',
          paymentStatus: 'paid',
          priceChangeCents: 5000,
          paymentIntentId: 'pi_v',
        },
      }]
    );
    expect(ok).toBe(false);
  });

  it('allows completion only when remaining variations are unpaid or confirmed succeeded', () => {
    const job = {
      paymentState: 'refund_pending',
      paymentIntentId: 'pi_base',
      refundId: 're_base',
      refundStatus: 'succeeded',
      baseRefundConfirmed: true,
    };
    expect(webhookMayMarkJobRefunded(job, [
      { id: 'unpaid', data: { status: 'pending', priceChangeCents: 1000 } },
      {
        id: 'pending-id-only',
        data: {
          paymentState: 'refund_pending',
          paymentStatus: 'paid',
          priceChangeCents: 5000,
          paymentIntentId: 'pi_v',
          refundId: 're_v',
        },
      },
    ])).toBe(false);

    expect(webhookMayMarkJobRefunded(job, [
      { id: 'unpaid', data: { status: 'pending', priceChangeCents: 1000 } },
      {
        id: 'done',
        data: {
          paymentState: 'refunded',
          paymentStatus: 'paid',
          priceChangeCents: 5000,
          paymentIntentId: 'pi_v',
          refundId: 're_v',
          refundStatus: 'succeeded',
        },
      },
    ])).toBe(true);
  });
});

describe('classifyPersistedRefundState', () => {
  it('does not confirm a refund from refundId without a succeeded status', () => {
    expect(classifyPersistedRefundState({ refundId: 're_1', refundStatus: 'pending' }, 'base')).toBe('pending');
    expect(classifyPersistedRefundState({ refundId: 're_1' }, 'variation')).toBe('pending');
    expect(classifyPersistedRefundState({ refundId: 're_1', refundStatus: 'succeeded' }, 'base')).toBe('confirmed');
  });
});
