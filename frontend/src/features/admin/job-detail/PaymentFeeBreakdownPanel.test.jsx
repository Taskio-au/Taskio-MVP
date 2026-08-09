import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import PaymentFeeBreakdownPanel, { adminReleaseStatusLabel } from './PaymentFeeBreakdownPanel';

const styles = {
  card: {},
  sectionTitle: {},
};

function mkSummary(partial = {}) {
  return {
    available: true,
    paymentState: 'released',
    paymentStatus: '',
    status: 'PAID',
    clientPaidCents: 100000,
    baseClientPaidCents: 60000,
    variationClientPaidCents: 40000,
    taskioFeeCents: 14000,
    baseTaskioFeeCents: 10000,
    variationTaskioFeeCents: 4000,
    expertReleasedCents: 86000,
    baseExpertReleasedCents: 50000,
    variationExpertReleasedCents: 36000,
    feeStage: 'standard_launch',
    feeBps: 1000,
    feeBenefitLabel: 'Founding Expert offer applied',
    zeroFeeSlotConsumed: true,
    baseReleaseFeeSource: 'fee_snapshot_v1',
    variationReleaseFeeSource: 'variation_fee_snapshot_v1',
    releasedToStripe: true,
    releasedAtMs: null,
    basePaymentIntentId: 'pi_test_support',
    baseTransferId: 'tr_base',
    variationTransferIds: { v1: 'tr_var1' },
    snapshotLockedAtMs: Date.UTC(2026, 0, 15, 12, 0),
    legacyOrMissingSnapshot: false,
    warning: null,
    ...partial,
  };
}

describe('PaymentFeeBreakdownPanel', () => {
  it('renders Client paid, Taskio fee, Expert released amount', () => {
    render(<PaymentFeeBreakdownPanel summary={mkSummary({ feeBenefitLabel: 'Standard launch fee', zeroFeeSlotConsumed: false })} styles={styles} />);
    expect(screen.getByText('Client paid')).toBeInTheDocument();
    expect(screen.getByText('Taskio fee')).toBeInTheDocument();
    expect(screen.getByText('Expert released amount')).toBeInTheDocument();
  });

  it('renders Founding Expert offer applied', () => {
    render(<PaymentFeeBreakdownPanel summary={mkSummary()} styles={styles} />);
    expect(screen.getByText('Founding Expert offer applied')).toBeInTheDocument();
  });

  it('shows base + variation sub-rows when variations paid', () => {
    render(<PaymentFeeBreakdownPanel summary={mkSummary()} styles={styles} />);
    expect(screen.getByText(/Base Taskio fee/i)).toBeInTheDocument();
    expect(screen.getByText(/Variation Taskio fee/i)).toBeInTheDocument();
  });

  it('renders Released to Stripe', () => {
    render(<PaymentFeeBreakdownPanel summary={mkSummary()} styles={styles} />);
    expect(screen.getByText('Released to Stripe')).toBeInTheDocument();
  });

  it('keeps Support & Stripe references collapsed by default', () => {
    render(<PaymentFeeBreakdownPanel summary={mkSummary()} styles={styles} />);
    const sum = screen.getByText(/Support \& Stripe references/i);
    const details = sum.closest('details');
    expect(details).not.toBeNull();
    expect(details?.open ?? false).toBe(false);
  });

  it('does not show raw feeSnapshot JSON blob in main region', () => {
    render(<PaymentFeeBreakdownPanel summary={mkSummary()} styles={styles} />);
    const main = screen.getByTestId('payment-fee-breakdown-main');
    expect(main.innerHTML).not.toMatch(/feeSnapshot|'feeStage'/);
    expect(main.textContent.toLowerCase()).not.toContain('tradie');
    expect(main.textContent.toLowerCase()).not.toContain('homeowner');
    expect(main.textContent.toLowerCase()).not.toMatch(/escrow/);
    expect(main.textContent.toLowerCase()).not.toContain('paid to bank');
  });

  it('expands support details without failing', () => {
    render(<PaymentFeeBreakdownPanel summary={mkSummary()} styles={styles} />);
    const sum = screen.getByText(/Support \& Stripe references/i);
    const details = sum.closest('details');
    fireEvent.click(sum);
    expect(details?.open ?? false).toBe(true);
    expect(screen.getByText('PaymentIntent ID')).toBeInTheDocument();
    expect(screen.getAllByText('pi_test_support').length).toBeGreaterThan(0);
  });
});

describe('adminReleaseStatusLabel', () => {
  it('uses secured copy without forbidden primary labels', () => {
    expect(
      adminReleaseStatusLabel({ releasedToStripe: false, paymentState: 'in_escrow', paymentStatus: 'succeeded' }),
    ).toBe('Payment secured — not released yet');
  });

  it('released state shows Released to Stripe', () => {
    expect(adminReleaseStatusLabel({ releasedToStripe: true, paymentState: 'released' })).toBe('Released to Stripe');
    expect(adminReleaseStatusLabel({ releasedToStripe: false, paymentState: 'released' })).toBe('Released to Stripe');
  });
});
