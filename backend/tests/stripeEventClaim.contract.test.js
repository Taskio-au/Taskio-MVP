'use strict';

const { createMemoryFirestore } = require('./helpers/memoryFirestore');

const mockMemory = createMemoryFirestore();

jest.mock('../src/firebaseAdmin', () => ({
  admin: mockMemory.admin,
  db: mockMemory.db,
}));

const handlerState = { calls: [] };

jest.mock('../src/services/stripeEventHandlers', () => ({
  dispatchStripeEventHandlers: jest.fn(async (event) => {
    handlerState.calls.push(event.id);
    if (typeof handlerState.delayMs === 'number' && handlerState.delayMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, handlerState.delayMs));
    }
    if (handlerState.fail) {
      throw new Error(handlerState.fail);
    }
  }),
  handleOperationalStripeEvent: jest.fn(async () => false),
}));

const { claimStripeEvent, settleStripeEvent } = require('../src/services/stripeEventClaim');
const { processVerifiedStripeEvent } = require('../src/services/stripeEventProcessor');
const { dispatchStripeEventHandlers } = require('../src/services/stripeEventHandlers');

function eventFor(id) {
  return {
    id,
    type: 'payout.failed',
    livemode: false,
    created: Math.floor(Date.now() / 1000),
    data: { object: { id: `obj_${id}`, object: 'payout' } },
  };
}

describe('atomic stripe_events claim', () => {
  const original = {};

  beforeAll(() => {
    original.STRIPE_EXPECTED_LIVEMODE = process.env.STRIPE_EXPECTED_LIVEMODE;
  });

  afterAll(() => {
    if (original.STRIPE_EXPECTED_LIVEMODE === undefined) delete process.env.STRIPE_EXPECTED_LIVEMODE;
    else process.env.STRIPE_EXPECTED_LIVEMODE = original.STRIPE_EXPECTED_LIVEMODE;
  });

  beforeEach(() => {
    mockMemory.reset();
    handlerState.calls = [];
    handlerState.delayMs = 0;
    handlerState.fail = null;
    dispatchStripeEventHandlers.mockClear();
    process.env.STRIPE_EXPECTED_LIVEMODE = 'false';
  });

  test('A. first event claims, handler runs once, processed', async () => {
    const result = await processVerifiedStripeEvent(eventFor('evt_a'));
    expect(result).toEqual({ httpStatus: 200, body: { received: true } });
    expect(handlerState.calls).toEqual(['evt_a']);
    expect(mockMemory.store('stripe_events').get('evt_a').processingState).toBe('processed');
    expect(mockMemory.store('stripe_events').get('evt_a').claimId).toBeNull();
  });

  test('B. already processed returns 200 duplicate without rerunning handler', async () => {
    await processVerifiedStripeEvent(eventFor('evt_b'));
    handlerState.calls = [];
    const result = await processVerifiedStripeEvent(eventFor('evt_b'));
    expect(result).toEqual({ httpStatus: 200, body: { received: true, duplicate: true } });
    expect(handlerState.calls).toEqual([]);
  });

  test('C. concurrent identical events run the handler once; other is in-flight', async () => {
    handlerState.delayMs = 40;
    const first = processVerifiedStripeEvent(eventFor('evt_c'));
    await new Promise((resolve) => setTimeout(resolve, 10));
    const second = processVerifiedStripeEvent(eventFor('evt_c'));
    const results = await Promise.all([first, second]);
    const statuses = results.map((r) => r.httpStatus).sort();
    expect(handlerState.calls).toEqual(['evt_c']);
    expect(statuses).toEqual([200, 503]);
    expect(results.some((r) => r.body && r.body.duplicate !== true && r.httpStatus === 200)).toBe(true);
    expect(results.some((r) => r.httpStatus === 503)).toBe(true);
  });

  test('D. expired processing lease may be reclaimed', async () => {
    const first = await claimStripeEvent(eventFor('evt_d'), { nowMs: 1_000, leaseMs: 50, claimId: 'claim-old' });
    expect(first.outcome).toBe('claimed');
    const inflight = await claimStripeEvent(eventFor('evt_d'), { nowMs: 1_020, leaseMs: 50, claimId: 'claim-too-soon' });
    expect(inflight.outcome).toBe('in_flight');
    const reclaimed = await claimStripeEvent(eventFor('evt_d'), { nowMs: 1_060, leaseMs: 50, claimId: 'claim-new' });
    expect(reclaimed.outcome).toBe('claimed');
    expect(reclaimed.claimId).toBe('claim-new');
    expect(mockMemory.store('stripe_events').get('evt_d').claimId).toBe('claim-new');
  });

  test('E. failed event can be reclaimed', async () => {
    handlerState.fail = 'handler boom';
    await expect(processVerifiedStripeEvent(eventFor('evt_e'))).rejects.toThrow('handler boom');
    expect(mockMemory.store('stripe_events').get('evt_e').processingState).toBe('failed');
    handlerState.fail = null;
    const retry = await processVerifiedStripeEvent(eventFor('evt_e'));
    expect(retry.httpStatus).toBe(200);
    expect(mockMemory.store('stripe_events').get('evt_e').processingState).toBe('processed');
  });

  test('F. stale worker cannot mark a newer claim processed or failed', async () => {
    const oldClaim = await claimStripeEvent(eventFor('evt_f'), { nowMs: 1_000, leaseMs: 10, claimId: 'worker-a' });
    expect(oldClaim.claimId).toBe('worker-a');
    const newer = await claimStripeEvent(eventFor('evt_f'), { nowMs: 1_020, leaseMs: 60_000, claimId: 'worker-b' });
    expect(newer.claimId).toBe('worker-b');

    const staleProcessed = await settleStripeEvent({
      eventId: 'evt_f',
      claimId: 'worker-a',
      result: 'processed',
    });
    expect(staleProcessed.outcome).toBe('stale');
    expect(mockMemory.store('stripe_events').get('evt_f').processingState).toBe('processing');
    expect(mockMemory.store('stripe_events').get('evt_f').claimId).toBe('worker-b');

    const staleFailed = await settleStripeEvent({
      eventId: 'evt_f',
      claimId: 'worker-a',
      result: 'failed',
      failureMessage: 'late',
    });
    expect(staleFailed.outcome).toBe('stale');
    expect(mockMemory.store('stripe_events').get('evt_f').processingState).toBe('processing');
    expect(mockMemory.store('stripe_events').get('evt_f').claimId).toBe('worker-b');

    const owner = await settleStripeEvent({
      eventId: 'evt_f',
      claimId: 'worker-b',
      result: 'processed',
    });
    expect(owner.outcome).toBe('settled');
    expect(mockMemory.store('stripe_events').get('evt_f').processingState).toBe('processed');
  });

  test('G. different event ids process independently', async () => {
    const [a, b] = await Promise.all([
      processVerifiedStripeEvent(eventFor('evt_g1')),
      processVerifiedStripeEvent(eventFor('evt_g2')),
    ]);
    expect(a.httpStatus).toBe(200);
    expect(b.httpStatus).toBe(200);
    expect(handlerState.calls.sort()).toEqual(['evt_g1', 'evt_g2']);
  });

  test('H. duplicate delivery after completion has no repeated side effects', async () => {
    await processVerifiedStripeEvent(eventFor('evt_h'));
    await processVerifiedStripeEvent(eventFor('evt_h'));
    await processVerifiedStripeEvent(eventFor('evt_h'));
    expect(handlerState.calls).toEqual(['evt_h']);
  });
});
