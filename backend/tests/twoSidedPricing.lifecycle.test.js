'use strict';

jest.mock('../src/firebaseAdmin', () => ({ admin: { firestore: { FieldValue: {
  serverTimestamp: () => 'test-time', increment: n => ({ increment: n }),
} } } }));
jest.mock('../src/services/stripe', () => ({ retrieveCheckoutSession: jest.fn(), expireCheckoutSession: jest.fn() }));

const { calculateBookingPricing, calculateVariationCustomerPricing } = require('../../shared/bookingPricing');
const { createPricedVariation, closePricedVariation, publishVariationCheckout } = require('../src/services/variationCustomerPricing');
const { applyVariationPaymentSuccess } = require('../src/services/variationPaymentCompletion');
const { buildAdminFullRefundPlan } = require('../src/services/jobRefundPlan');
const { buildAdminPaymentFeeSummary } = require('../src/utils/adminPaymentFeeSummary');
const stripe = require('../src/services/stripe');

function memoryDb(entries) {
  const store = new Map(Object.entries(entries));
  function ref(path) { return { path, id: path.split('/').pop(), collection: name => collection(`${path}/${name}`) }; }
  function collection(path) { return { doc: id => ref(`${path}/${id}`), add: async () => {},
    get: async () => ({ docs: [...store].filter(([key]) => key.startsWith(`${path}/`))
      .map(([key, data]) => ({ id: key.split('/').pop(), data: () => data })) }) }; }
  const tx = {
    get: async r => ({ exists: store.has(r.path), data: () => store.get(r.path) }),
    set: (r, data) => store.set(r.path, data),
    update: (r, patch) => {
      const next = { ...store.get(r.path) };
      for (const [key, value] of Object.entries(patch)) next[key] = value?.increment != null
        ? (next[key] || 0) + value.increment : value;
      store.set(r.path, next);
    },
  };
  return { store, collection, runTransaction: fn => fn(tx) };
}
function pricedJob() { return { id: 'j', status: 'FUNDED', acceptedTradieUid: 'expert', paymentState: 'in_escrow',
  paymentStatus: 'succeeded', paymentIntentId: 'pi_base', paymentAmountCents: 18375,
  customerPricing: calculateBookingPricing(17500), feeSnapshot: { version: 1, source: 'base_job_funding',
    jobId: 'j', expertUid: 'expert', lockedAt: '2026-10-05T00:00:00.000Z', grossAmountCents: 17500, expertFeeBps: 1500,
    taskioFeeCents: 2625, expertNetCents: 14875, stage: 'standard_launch' } }; }

beforeEach(() => jest.resetAllMocks());

test('only one unresolved priced variation can consume the booking fee cap', async () => {
  const db = memoryDb({ 'jobs/j': pricedJob() });
  const jobRef = db.collection('jobs').doc('j');
  const payload = { status: 'pending', createdByUid: 'expert', priceChangeCents: 2500 };
  await createPricedVariation(db, jobRef, jobRef.collection('variations').doc('v'), payload);
  expect(db.store.get('jobs/j/variations/v').customerPricing.customerTotalCents).toBe(2625);
  await expect(createPricedVariation(db, jobRef, jobRef.collection('variations').doc('v2'), payload))
    .rejects.toMatchObject({ statusCode: 409 });
});

test('paid variation separates customer fees, preserves the task total and is idempotent', async () => {
  const db = memoryDb({ 'jobs/j': pricedJob(), 'jobs/j/variations/v': { status: 'awaiting_payment',
    priceChangeCents: 2500, customerPricing: calculateVariationCustomerPricing(17500, 2500) } });
  const payment = { jobId: 'j', variationId: 'v', paymentIntentId: 'pi_v', amountReceived: 2625, currency: 'aud' };
  expect(await applyVariationPaymentSuccess(db, payment)).toEqual({ applied: true });
  expect(await applyVariationPaymentSuccess(db, payment)).toEqual({ applied: false });
  expect(db.store.get('jobs/j')).toMatchObject({ securedVariationTotalInCents: 2500, securedCustomerVariationFeesCents: 125 });
  expect(db.store.get('jobs/j/variations/v')).toMatchObject({ amountPaidCents: 2625,
    feeSnapshot: { taskioFeeCents: 375, expertNetCents: 2125 } });
  const summary = await buildAdminPaymentFeeSummary(db.collection('jobs').doc('j'), db.store.get('jobs/j'));
  expect(summary.clientPaidCents).toBe(21000);
  expect(summary.taskioFeeCents).toBe(4000);
  expect(summary.expertReleasedCents).toBe(17000);
  const refund = buildAdminFullRefundPlan(db.store.get('jobs/j'), [{ id: 'v', data: db.store.get('jobs/j/variations/v') }]);
  expect(refund.base.amountCents).toBe(18375);
  expect(refund.variations[0].amountCents).toBe(2625);
});

test('rejects payment without the incremental customer fee', async () => {
  const db = memoryDb({ 'jobs/j': pricedJob(), 'jobs/j/variations/v': { status: 'awaiting_payment',
    priceChangeCents: 2500, customerPricing: calculateVariationCustomerPricing(17500, 2500) } });
  expect(await applyVariationPaymentSuccess(db, { jobId: 'j', variationId: 'v', amountReceived: 2500, currency: 'aud' }))
    .toEqual({ applied: false });
  expect(db.store.get('jobs/j').securedVariationTotalInCents).toBeUndefined();
});

test('closes an unpaid Stripe session before cancelling its variation', async () => {
  const variation = { status: 'awaiting_payment', checkoutSessionId: 'cs_test' };
  const db = memoryDb({ 'jobs/j/variations/v': variation });
  stripe.retrieveCheckoutSession.mockResolvedValue({ id: 'cs_test', status: 'open', payment_status: 'unpaid' });
  stripe.expireCheckoutSession.mockResolvedValue({ id: 'cs_test', status: 'expired' });
  await closePricedVariation(db, db.collection('jobs').doc('j').collection('variations').doc('v'), variation, { status: 'cancelled' });
  expect(stripe.expireCheckoutSession).toHaveBeenCalledWith('cs_test');
  expect(db.store.get('jobs/j/variations/v').status).toBe('cancelled');
});

test('cannot resurrect a cancelled variation when checkout creation completes late', async () => {
  const db = memoryDb({ 'jobs/j/variations/v': { status: 'cancelled', paymentCheckoutGeneration: 1 } });
  stripe.retrieveCheckoutSession.mockResolvedValue({ id: 'cs_late', status: 'open', payment_status: 'unpaid' });
  stripe.expireCheckoutSession.mockResolvedValue({ status: 'expired' });
  await expect(publishVariationCheckout(db, db.collection('jobs').doc('j').collection('variations').doc('v'),
    { customerPricing: calculateVariationCustomerPricing(17500, 2500) },
    { checkoutSessionId: 'cs_late', paymentCheckoutGeneration: 1, status: 'awaiting_payment' }))
    .rejects.toMatchObject({ code: 'not_pending' });
  expect(stripe.expireCheckoutSession).toHaveBeenCalledWith('cs_late');
  expect(db.store.get('jobs/j/variations/v').status).toBe('cancelled');
});
