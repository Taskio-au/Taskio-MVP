import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';

jest.mock('react-router-dom', () => ({
  __esModule: true,
  Link: ({ children, to, ...props }) => <a href={to} {...props}>{children}</a>,
}), { virtual: true });

import VerificationGateBanner from './VerificationGateBanner';

describe('VerificationGateBanner', () => {
  it('renders nothing when gate is not phone', () => {
    const { container } = render(
      <VerificationGateBanner
        dismissed={false}
        gate="email"
        reason=""
        next=""
        onDismiss={() => {}}
      />
    );
    expect(container.firstChild).toBeNull();
  });

  it('renders nothing when dismissed', () => {
    const { container } = render(
      <VerificationGateBanner
        dismissed
        gate="phone"
        reason="Verify to continue"
        next="/tradie/dashboard"
        onDismiss={() => {}}
      />
    );
    expect(container.firstChild).toBeNull();
  });

  it('shows provided reason and return hint when next exists', () => {
    render(
      <VerificationGateBanner
        dismissed={false}
        gate="phone"
        reason="Please verify your number before messaging."
        next="/chat/123"
        onDismiss={() => {}}
      />
    );

    expect(screen.getByText('Verify your phone number')).toBeInTheDocument();
    expect(screen.getByText('Please verify your number before messaging.')).toBeInTheDocument();
    expect(screen.getByText(/return here after verification/i)).toBeInTheDocument();
  });

  it('falls back to default copy and triggers dismiss callback', () => {
    const onDismiss = jest.fn();
    render(
      <VerificationGateBanner
        dismissed={false}
        gate="phone"
        reason=""
        next=""
        onDismiss={onDismiss}
      />
    );

    expect(screen.getByText('Verify your phone in Account settings to continue.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }));
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });
});
