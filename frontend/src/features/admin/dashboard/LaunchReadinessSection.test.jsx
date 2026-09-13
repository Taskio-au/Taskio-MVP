import React from 'react';
import { render, screen } from '@testing-library/react';
import LaunchReadinessSection from './LaunchReadinessSection';

function snapshot(overrides = {}) {
  return {
    overallStatus: 'NOT READY',
    scanComplete: true,
    supply: { status: 'READY', launchReady: 15, launchTarget: 15 },
    blockers: [
      { id: 'P03', label: 'P03 — production email not proven' },
      { id: 'P06', label: 'P06 — legal/privacy review open' },
    ],
    gates: [
      { id: 'P01', label: 'Payments', group: 'Payments', status: 'PASS / COMPLETE', required: true },
      { id: 'P03', label: 'Email', group: 'Production Services', status: 'STAGING PASS / PRODUCTION PENDING', required: true },
      { id: 'P06', label: 'Legal / Privacy', group: 'Legal / Privacy', status: 'OPEN', required: true },
      { id: 'P11', label: 'Controlled launch', group: 'Controlled Launch', status: 'BLOCKED', required: false },
    ],
    posting: { state: 'CLOSED', activateAvailable: false },
    ...overrides,
  };
}

describe('LaunchReadinessSection', () => {
  it('shows NOT READY with blockers and keeps posting closed', () => {
    render(<LaunchReadinessSection loadState="ok" snapshot={snapshot()} />);
    expect(screen.getByText('NOT READY')).toBeInTheDocument();
    expect(screen.getByText('P03 — production email not proven')).toBeInTheDocument();
    expect(screen.getByText('P06 — legal/privacy review open')).toBeInTheDocument();
    expect(screen.getByText('STAGING PASS / PRODUCTION PENDING')).toBeInTheDocument();
    expect(screen.getByText(/Homeowner posting:/)).toBeInTheDocument();
    expect(screen.getByText(/CLOSED/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /activate|open posting|open homeowner/i })).toBeNull();
  });

  it('shows READY TO OPEN only when the engine says so, still without an activate control', () => {
    render(
      <LaunchReadinessSection
        loadState="ok"
        snapshot={snapshot({
          overallStatus: 'READY TO OPEN',
          blockers: [],
          gates: [
            { id: 'P01', label: 'Payments', group: 'Payments', status: 'PASS', required: true },
            { id: 'P03', label: 'Email', group: 'Production Services', status: 'PRODUCTION PASS', required: true },
          ],
        })}
      />
    );
    expect(screen.getByText('READY TO OPEN')).toBeInTheDocument();
    expect(screen.getByText(/All required launch gates are satisfied/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /activate|open posting/i })).toBeNull();
    expect(screen.queryByText('STAGING PASS / PRODUCTION PENDING')).not.toBeInTheDocument();
  });

  it('shows DATA UNAVAILABLE without inventing READY TO OPEN', () => {
    render(<LaunchReadinessSection loadState="error" snapshot={null} />);
    expect(screen.getByText('DATA UNAVAILABLE')).toBeInTheDocument();
    expect(screen.queryByText('READY TO OPEN')).not.toBeInTheDocument();
  });

  it('shows DATA INCOMPLETE when the scan cannot prove readiness', () => {
    render(
      <LaunchReadinessSection
        loadState="ok"
        snapshot={snapshot({ overallStatus: 'DATA INCOMPLETE', blockers: [] })}
      />
    );
    expect(screen.getAllByText('DATA INCOMPLETE').length).toBeGreaterThan(0);
    expect(screen.queryByText('READY TO OPEN')).not.toBeInTheDocument();
  });
});
