'use strict';

const PRICING_VERSION = 'taskio_15_plus_5_v1';
const STANDARD_EXPERT_FEE_BPS = 1500;
const CUSTOMER_FEE_MIN_CENTS = 499;
const CUSTOMER_FEE_MAX_CENTS = 1999;

function customerServiceFeeCents(taskPriceCents) {
  if (!Number.isSafeInteger(taskPriceCents) || taskPriceCents <= 0 || taskPriceCents > 500000000) {
    throw new RangeError('Task price must be positive AUD cents within the supported limit.');
  }
  return Math.min(CUSTOMER_FEE_MAX_CENTS, Math.max(CUSTOMER_FEE_MIN_CENTS, Math.floor((taskPriceCents * 5 + 50) / 100)));
}

function calculateBookingPricing(taskPriceCents, expertFeeBps = STANDARD_EXPERT_FEE_BPS) {
  const customerFeeCents = customerServiceFeeCents(taskPriceCents);
  if (!Number.isInteger(expertFeeBps) || expertFeeBps < 0 || expertFeeBps > 10000) {
    throw new RangeError('Invalid Expert fee rate.');
  }
  const expertFeeCents = Math.floor((taskPriceCents * expertFeeBps + 5000) / 10000);
  return {
    version: PRICING_VERSION,
    currency: 'aud',
    taskPriceCents,
    expertFeeBps,
    expertFeeCents,
    customerFeeCents,
    customerTotalCents: taskPriceCents + customerFeeCents,
    expertProceedsCents: taskPriceCents - expertFeeCents,
    platformGrossFeesCents: expertFeeCents + customerFeeCents,
  };
}

function calculateVariationCustomerPricing(previousTaskCents, additionalTaskCents) {
  if (!Number.isSafeInteger(additionalTaskCents) || additionalTaskCents < 0) throw new RangeError('Invalid additional task price.');
  const previousFee = customerServiceFeeCents(previousTaskCents);
  const customerFeeCents = customerServiceFeeCents(previousTaskCents + additionalTaskCents) - previousFee;
  return { version: PRICING_VERSION, currency: 'aud', previousTaskCents, taskPriceCents: additionalTaskCents,
    customerFeeCents, customerTotalCents: additionalTaskCents + customerFeeCents };
}

// Customer quotes must not imply a standard Expert fee when that Expert may
// have a Founding Expert benefit. The Expert snapshot is locked at funding.
function calculateCustomerPricing(taskPriceCents) {
  const { version, currency, customerFeeCents, customerTotalCents } = calculateBookingPricing(taskPriceCents);
  return { version, currency, taskPriceCents, customerFeeCents, customerTotalCents };
}

function validCustomerPricing(p) {
  if (!p || p.version !== PRICING_VERSION || p.currency !== 'aud') return false;
  try {
    const expected = p.previousTaskCents == null ? calculateBookingPricing(p.taskPriceCents)
      : calculateVariationCustomerPricing(p.previousTaskCents, p.taskPriceCents);
    return p.customerFeeCents === expected.customerFeeCents && p.customerTotalCents === expected.customerTotalCents;
  } catch (_) { return false; }
}

module.exports = { PRICING_VERSION, STANDARD_EXPERT_FEE_BPS, customerServiceFeeCents, calculateBookingPricing, calculateCustomerPricing,
  calculateVariationCustomerPricing, validCustomerPricing };
