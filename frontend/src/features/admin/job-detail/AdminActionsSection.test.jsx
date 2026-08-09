import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import AdminActionsSection from './AdminActionsSection';

const styles = {
  card: {},
  sectionTitle: {},
  dangerZoneLabel: {},
  adminNote: {},
  disputeInfo: {},
  adminActionsRow: {},
  dangerButton: {},
  buttonSecondary: {},
  primaryButton: {},
  modalOverlay: {},
  modalCard: {},
  modalTitle: {},
  modalBody: {},
  modalTextarea: {},
  safetyLine: {},
  countdownText: {},
  modalActions: {},
};

function renderSection(overrides = {}) {
  const props = {
    job: { paymentState: 'in_escrow', paymentIntentId: 'pi_1', disputeReason: '' },
    isDisputed: false,
    adminBusy: false,
    adminAction: null,
    adminReason: '',
    safetyAck: false,
    safetyCountdown: 0,
    adminErr: '',
    onOpenAction: jest.fn(),
    onCloseModal: jest.fn(),
    onRunAction: jest.fn(),
    onAdminReasonChange: jest.fn(),
    onSafetyAckChange: jest.fn(),
    styles,
    ...overrides,
  };

  render(<AdminActionsSection {...props} />);
  return props;
}

describe('AdminActionsSection', () => {
  it('opens enabled actions when buttons are clicked', () => {
    const props = renderSection();

    fireEvent.click(screen.getByText('Flag dispute'));
    fireEvent.click(screen.getByText('Manual release'));
    fireEvent.click(screen.getByText('Refund (full)'));

    expect(props.onOpenAction).toHaveBeenNthCalledWith(1, 'dispute');
    expect(props.onOpenAction).toHaveBeenNthCalledWith(2, 'manual_release');
    expect(props.onOpenAction).toHaveBeenNthCalledWith(3, 'refund');
  });

  it('opens clear_dispute when task is already disputed', () => {
    const props = renderSection({ isDisputed: true, job: { paymentState: 'in_escrow', paymentIntentId: 'pi_1', disputeReason: 'Escrow mismatch' } });
    fireEvent.click(screen.getByText('Clear dispute'));
    expect(props.onOpenAction).toHaveBeenCalledWith('clear_dispute');
  });

  it('keeps confirm disabled for manual release until ack + countdown is ready', () => {
    renderSection({ adminAction: 'manual_release', safetyAck: false, safetyCountdown: 2 });
    const confirmBtn = screen.getByText('Confirm');
    expect(confirmBtn).toBeDisabled();
  });

  it('keeps confirm disabled for refund until ack + countdown is ready', () => {
    renderSection({ adminAction: 'refund', safetyAck: false, safetyCountdown: 1 });
    const confirmBtn = screen.getByText('Confirm');
    expect(confirmBtn).toBeDisabled();
  });

  it('enables and runs confirm when manual release safety checks are satisfied', () => {
    const props = renderSection({ adminAction: 'manual_release', safetyAck: true, safetyCountdown: 0 });
    const confirmBtn = screen.getByText('Confirm');
    expect(confirmBtn).not.toBeDisabled();
    fireEvent.click(confirmBtn);
    expect(props.onRunAction).toHaveBeenCalledTimes(1);
  });

  it('enables and runs confirm when refund safety checks are satisfied', () => {
    const props = renderSection({ adminAction: 'refund', safetyAck: true, safetyCountdown: 0 });
    const confirmBtn = screen.getByText('Confirm');
    expect(confirmBtn).not.toBeDisabled();
    fireEvent.click(confirmBtn);
    expect(props.onRunAction).toHaveBeenCalledTimes(1);
  });

  it('disables payment action buttons when payment prerequisites are missing', () => {
    renderSection({ job: { paymentState: 'open', paymentIntentId: '', disputeReason: '' } });
    expect(screen.getByText('Manual release')).toBeDisabled();
    expect(screen.getByText('Refund (full)')).toBeDisabled();
  });

  it('captures dispute reason text changes', () => {
    const props = renderSection({ adminAction: 'dispute' });
    const textarea = screen.getByPlaceholderText('e.g., Client reported incomplete work…');
    fireEvent.change(textarea, { target: { value: 'Incorrect scope and abusive chat' } });
    expect(props.onAdminReasonChange).toHaveBeenCalledWith('Incorrect scope and abusive chat');
  });
});
