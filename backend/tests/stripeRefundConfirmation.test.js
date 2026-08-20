'use strict';

const {
  evaluateChargeRefundedConfirmation,
  evaluateSucceededRefundObjectConfirmation,
} = require('../src/services/stripeRefundConfirmation');

describe('evaluateChargeRefundedConfirmation', () => {
  const base = { paymentIntentId: 'pi_base', paymentAmountCents: 10000, refundId: 're_taskio' };

  it('does not confirm a partial charge.refunded', () => {
    const result = evaluateChargeRefundedConfirmation({
      charge: {
        refunded: false,
        amount: 10000,
        amount_refunded: 2000,
        payment_intent: 'pi_base',
        refunds: { data: [{ id: 're_partial' }] },
      },
      item: base,
      kind: 'base',
    });
    expect(result.confirm).toBe(false);
    expect(result.partial).toBe(true);
  });

  it('confirms a fully refunded charge when identifiers match', () => {
    const result = evaluateChargeRefundedConfirmation({
      charge: {
        refunded: true,
        amount: 10000,
        amount_refunded: 10000,
        payment_intent: 'pi_base',
        refunds: { data: [{ id: 're_taskio' }] },
      },
      item: base,
      kind: 'base',
    });
    expect(result.confirm).toBe(true);
  });

  it('does not confirm a partial variation charge.refunded', () => {
    const result = evaluateChargeRefundedConfirmation({
      charge: {
        refunded: false,
        amount: 5000,
        amount_refunded: 1000,
        payment_intent: 'pi_var',
      },
      item: { paymentIntentId: 'pi_var', priceChangeCents: 5000, refundId: 're_var' },
      kind: 'variation',
    });
    expect(result.confirm).toBe(false);
    expect(result.partial).toBe(true);
  });

  it('confirms a fully refunded variation charge when the PaymentIntent matches', () => {
    const result = evaluateChargeRefundedConfirmation({
      charge: {
        refunded: true,
        amount: 5000,
        amount_refunded: 5000,
        payment_intent: 'pi_var',
        refunds: { data: [{ id: 're_var' }] },
      },
      item: { paymentIntentId: 'pi_var', amountPaidCents: 5000, refundId: 're_var' },
      kind: 'variation',
    });
    expect(result.confirm).toBe(true);
  });
});

describe('evaluateSucceededRefundObjectConfirmation', () => {
  it('confirms the persisted Taskio refundId when amount covers the expected full refund', () => {
    const result = evaluateSucceededRefundObjectConfirmation({
      refund: {
        id: 're_taskio',
        status: 'succeeded',
        amount: 10000,
        payment_intent: 'pi_base',
        metadata: { type: 'job_refund', jobId: 'job-1' },
      },
      item: { paymentIntentId: 'pi_base', paymentAmountCents: 10000, refundId: 're_taskio' },
      kind: 'base',
    });
    expect(result.confirm).toBe(true);
  });

  it('does not confirm an unrelated refundId', () => {
    const result = evaluateSucceededRefundObjectConfirmation({
      refund: {
        id: 're_manual',
        status: 'succeeded',
        amount: 10000,
        payment_intent: 'pi_base',
        metadata: { type: 'job_refund' },
      },
      item: { paymentIntentId: 'pi_base', paymentAmountCents: 10000, refundId: 're_taskio' },
      kind: 'base',
    });
    expect(result.confirm).toBe(false);
    expect(result.reason).toBe('refund_id_mismatch');
  });

  it('does not confirm a refund amount below the expected full-refund amount', () => {
    const result = evaluateSucceededRefundObjectConfirmation({
      refund: {
        id: 're_taskio',
        status: 'succeeded',
        amount: 2000,
        payment_intent: 'pi_base',
        metadata: { type: 'job_refund' },
      },
      item: { paymentIntentId: 'pi_base', paymentAmountCents: 10000, refundId: 're_taskio' },
      kind: 'base',
    });
    expect(result.confirm).toBe(false);
    expect(result.partial).toBe(true);
  });

  it('does not confirm a variation refund against a different variation', () => {
    const result = evaluateSucceededRefundObjectConfirmation({
      refund: {
        id: 're_var_a',
        status: 'succeeded',
        amount: 5000,
        payment_intent: 'pi_var_a',
        metadata: { type: 'variation_refund', variationId: 'var-a' },
      },
      item: {
        id: 'var-b',
        paymentIntentId: 'pi_var_a',
        priceChangeCents: 5000,
        refundId: 're_var_a',
      },
      kind: 'variation',
    });
    expect(result.confirm).toBe(false);
    expect(result.reason).toBe('variation_id_mismatch');
  });
});
