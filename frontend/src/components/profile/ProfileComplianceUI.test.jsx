import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { LockedField, ReadinessSummary } from './ProfileComplianceUI';

describe('ProfileComplianceUI', () => {
  it('shows locked overlay content when field is locked', () => {
    render(
      <LockedField locked label="DOB Locked" tooltip="Contact support">
        <input aria-label="dob-input" readOnly />
      </LockedField>
    );

    expect(screen.getByText('DOB Locked')).toBeInTheDocument();
    expect(screen.getByText('Contact support')).toBeInTheDocument();
  });

  it('renders children directly when field is unlocked', () => {
    render(
      <LockedField locked={false}>
        <input aria-label="dob-input" readOnly />
      </LockedField>
    );

    expect(screen.getByLabelText('dob-input')).toBeInTheDocument();
    expect(screen.queryByText('Field Locked')).toBeNull();
  });

  it('toggles compact readiness details and includes ABN row when required', () => {
    render(
      <ReadinessSummary
        compact
        checklist={{
          emailVerified: true,
          phoneVerified: true,
          serviceLocationSet: true,
          dob18Plus: true,
          businessTypeSet: true,
          abnRequired: true,
          abnVerified: false,
          stripeReady: true,
          profileCompleted: true,
        }}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: /6\/7 completed/i }));
    expect(screen.getByText('ABN verified')).toBeInTheDocument();
  });

  it('omits ABN row when ABN is not required', () => {
    render(
      <ReadinessSummary
        compact
        checklist={{
          emailVerified: true,
          phoneVerified: true,
          serviceLocationSet: true,
          dob18Plus: true,
          businessTypeSet: true,
          abnRequired: false,
          abnVerified: true,
          stripeReady: true,
          profileCompleted: true,
        }}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: /ready to quote/i }));
    expect(screen.queryByText('ABN verified')).toBeNull();
  });
});
