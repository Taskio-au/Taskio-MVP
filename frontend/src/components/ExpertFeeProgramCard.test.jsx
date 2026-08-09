import React from 'react';
import { render, screen } from '@testing-library/react';

jest.mock('react-router-dom', () => {
  const R = require('react');
  return {
    Link: ({ children, to, ...rest }) => R.createElement('a', { href: to, ...rest }, children),
  };
}, { virtual: true });

const ExpertFeeProgramCard = require('./expert/ExpertFeeProgramCard').default;

describe('ExpertFeeProgramCard', () => {
  it('Founding Expert first-three: badge, 0%, remaining count, View payments', () => {
    render(
      <ExpertFeeProgramCard
        foundingExpertFeeProfile={{
          enrolled: true,
          status: 'active',
          stage: 'founding_first_three',
          expertFeeBps: 0,
          badgeLabel: 'Founding Expert',
          zeroFeeSlotsUsed: 1,
          zeroFeeTaskLimit: 3,
          zeroFeeSlotsRemaining: 2,
        }}
      />
    );
    expect(screen.getByText('Founding Expert')).toBeInTheDocument();
    expect(screen.getByText('0% Taskio fee on your first 3 funded tasks')).toBeInTheDocument();
    expect(screen.getByText('1 of 3 zero-fee tasks used / 2 remaining')).toBeInTheDocument();
    expect(screen.getByText(/^0%$/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /View payments/i })).toHaveAttribute('href', '/payments');
  });

  it('Founding Expert reduced: 7.5%, date, badge', () => {
    const end = new Date('2099-12-31T00:00:00.000Z').getTime();
    render(
      <ExpertFeeProgramCard
        foundingExpertFeeProfile={{
          enrolled: true,
          status: 'active',
          stage: 'founding_reduced',
          expertFeeBps: 750,
          badgeLabel: 'Founding Expert',
          reducedFeeEndsAtMs: end,
        }}
      />
    );
    expect(screen.getByText('Founding Expert')).toBeInTheDocument();
    expect(screen.getByText('Reduced Founding Expert fee')).toBeInTheDocument();
    expect(screen.getByText(/7\.5% Taskio fee until /)).toBeInTheDocument();
    expect(screen.getAllByText(/7\.5%/).length).toBeGreaterThanOrEqual(1);
  });

  it('Standard launch: 10%, no Founding Expert badge', () => {
    render(
      <ExpertFeeProgramCard
        foundingExpertFeeProfile={{
          enrolled: false,
          stage: 'standard_launch',
          expertFeeBps: 1000,
          badgeLabel: null,
          benefitLabel: 'Standard launch fee',
        }}
        compact
      />
    );
    expect(screen.queryByText(/^Founding Expert$/)).not.toBeInTheDocument();
    expect(screen.getByText('Standard launch fee')).toBeInTheDocument();
    expect(screen.getByText(/^10%$/)).toBeInTheDocument();
  });

  it('removed / standard mapping: no Founding Expert badge', () => {
    render(
      <ExpertFeeProgramCard
        foundingExpertFeeProfile={{
          enrolled: true,
          status: 'removed',
          stage: 'standard_launch',
          expertFeeBps: 1000,
          badgeLabel: null,
        }}
        compact
      />
    );
    expect(screen.queryByText(/^Founding Expert$/)).not.toBeInTheDocument();
  });

  it('quiet unavailable state when api flag set', () => {
    render(<ExpertFeeProgramCard foundingExpertFeeProfile={null} apiUnavailable compact />);
    expect(screen.getByText(/Fee programme unavailable/i)).toBeInTheDocument();
  });

  it('does not surface forbidden Expert vocabulary', () => {
    render(
      <ExpertFeeProgramCard
        foundingExpertFeeProfile={{
          enrolled: true,
          stage: 'founding_reduced',
          expertFeeBps: 750,
          badgeLabel: 'Founding Expert',
          reducedFeeEndsAtMs: Date.now(),
        }}
      />
    );
    const root = screen.getByRole('region', { name: /fee programme/i });
    const t = (root.textContent || '').toLowerCase();

    expect(t).not.toMatch(/\bescrow\b/);
    expect(t).not.toMatch(/\btradie\b/);
    expect(t).not.toMatch(/\bhomeowner\b/);
    expect(t).not.toMatch(/\bpaid to bank\b/);
  });

  it('payments blurb helpers for payout overview line', () => {
    const { expertFeeProgramPaymentsBlurb } = require('./expert/ExpertFeeProgramCard');

    expect(
      expertFeeProgramPaymentsBlurb({
        stage: 'founding_first_three',
        zeroFeeSlotsRemaining: 2,
      })
    ).toMatch(/Founding Expert: 0% Taskio fee — 2 zero-fee funded tasks remaining/);

    expect(
      expertFeeProgramPaymentsBlurb({
        stage: 'standard_launch',
      })
    ).toMatch(/Standard launch fee — 10%/);
  });
});
