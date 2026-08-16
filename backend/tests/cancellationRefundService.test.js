'use strict';

const {
  refundFundedVariationsForCancellation,
  variationNeedsCancellationRefund,
} = require('../src/services/cancellationRefundService');

function variationDoc(id, data) {
  const writes = [];
  return {
    id,
    data: () => ({ ...data }),
    ref: {
      set: jest.fn(async (payload, options) => {
        writes.push({ payload, options });
      }),
    },
    writes,
  };
}

function jobRefWith(docs) {
  return {
    collection: jest.fn(() => ({
      get: jest.fn(async () => ({ docs })),
    })),
  };
}

describe('funded variation cancellation refunds', () => {
  it('identifies only paid, unreleased positive variations', () => {
    expect(variationNeedsCancellationRefund({
      priceChangeCents: 5000,
      paymentIntentId: 'pi_var',
      paymentState: 'in_escrow',
    })).toBe(true);
    expect(variationNeedsCancellationRefund({
      priceChangeCents: 5000,
      paymentIntentId: 'pi_var',
      paymentState: 'in_escrow',
      releaseStatus: 'released',
    })).toBe(false);
    expect(variationNeedsCancellationRefund({ priceChangeCents: 0 })).toBe(false);
  });

  it('refunds every funded variation once with stable idempotency keys', async () => {
    const first = variationDoc('var-a', {
      priceChangeCents: 5000,
      paymentIntentId: 'pi_a',
      paymentState: 'in_escrow',
    });
    const second = variationDoc('var-b', {
      amountPaidCents: 2500,
      paymentIntentId: 'pi_b',
      paymentStatus: 'paid',
    });
    const createRefund = jest.fn()
      .mockResolvedValueOnce({ id: 're_a' })
      .mockResolvedValueOnce({ id: 're_b' });

    const result = await refundFundedVariationsForCancellation({
      jobRef: jobRefWith([first, second]),
      jobId: 'job-1',
      createRefund,
      serverTimestamp: () => '__ts__',
    });

    expect(result).toEqual({ 'var-a': 're_a', 'var-b': 're_b' });
    expect(createRefund).toHaveBeenNthCalledWith(1, expect.objectContaining({
      paymentIntentId: 'pi_a',
      idempotencyKey: 'taskio_homeowner_cancel_var_job-1_var-a',
    }));
    expect(createRefund).toHaveBeenNthCalledWith(2, expect.objectContaining({
      paymentIntentId: 'pi_b',
      idempotencyKey: 'taskio_homeowner_cancel_var_job-1_var-b',
    }));
    expect(first.ref.set).toHaveBeenCalledWith(expect.objectContaining({
      paymentState: 'refund_pending',
      refundId: 're_a',
    }), { merge: true });
  });

  it('resumes safely after a partial retry without issuing the same refund again', async () => {
    const pending = variationDoc('var-a', {
      priceChangeCents: 5000,
      paymentIntentId: 'pi_a',
      paymentState: 'refund_pending',
      refundId: 're_a',
    });
    const outstanding = variationDoc('var-b', {
      priceChangeCents: 2500,
      paymentIntentId: 'pi_b',
      paymentState: 'in_escrow',
    });
    const createRefund = jest.fn().mockResolvedValue({ id: 're_b' });

    const result = await refundFundedVariationsForCancellation({
      jobRef: jobRefWith([pending, outstanding]),
      jobId: 'job-1',
      createRefund,
      serverTimestamp: () => '__ts__',
    });

    expect(result).toEqual({ 'var-a': 're_a', 'var-b': 're_b' });
    expect(createRefund).toHaveBeenCalledTimes(1);
    expect(createRefund).toHaveBeenCalledWith(expect.objectContaining({ paymentIntentId: 'pi_b' }));
  });

  it('requires the admin dispute workflow if any paid variation was released', async () => {
    const released = variationDoc('var-released', {
      priceChangeCents: 5000,
      paymentIntentId: 'pi_released',
      paymentState: 'released',
      releaseStatus: 'released',
    });

    await expect(refundFundedVariationsForCancellation({
      jobRef: jobRefWith([released]),
      jobId: 'job-1',
      createRefund: jest.fn(),
      serverTimestamp: () => '__ts__',
    })).rejects.toMatchObject({
      code: 'variation_already_released',
      variationId: 'var-released',
    });
  });
});
