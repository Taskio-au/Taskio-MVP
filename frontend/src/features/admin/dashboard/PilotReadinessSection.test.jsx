import React from 'react';
import { render, screen } from '@testing-library/react';
import PilotReadinessSection from './PilotReadinessSection';

function readySnapshot(overrides = {}) {
  return {
    targets: {
      launchReady: 15,
      afterActivationFloor: 12,
      categoryCoverageMinimum: 4,
      categoryCoverageTarget: 5,
    },
    totals: {
      experts: 20,
      technicallyEligible: 18,
      launchReady: 15,
      truncated: false,
      scanComplete: true,
      ...(overrides.totals || {}),
    },
    categoryCoverage: overrides.categoryCoverage || [
      { category: 'Mounting', launchReadyCount: 5, minimum: 4, target: 5 },
      { category: 'Furniture Assembly', launchReadyCount: 5, minimum: 4, target: 5 },
    ],
    geographyCoverage: overrides.geographyCoverage || [
      { area: 'Richmond', launchReadyCount: 3 },
      { area: 'Carlton', launchReadyCount: 1 },
    ],
  };
}

describe('PilotReadinessSection', () => {
  it('shows launch-ready, target, and floor counts from the API snapshot', () => {
    render(<PilotReadinessSection loadState="ok" snapshot={readySnapshot()} />);
    expect(screen.getByText('15 / 15')).toBeInTheDocument();
    expect(screen.getByText('15 / 12')).toBeInTheDocument();
    expect(screen.getByText('20 total · 18 technically eligible')).toBeInTheDocument();
    expect(screen.getByText('TARGET MET')).toBeInTheDocument();
    expect(screen.getByText('AT OR ABOVE FLOOR')).toBeInTheDocument();
  });

  it('renders category HEALTHY / ADEQUATE / UNDER-COVERED from API counts', () => {
    render(
      <PilotReadinessSection
        loadState="ok"
        snapshot={readySnapshot({
          totals: { launchReady: 7, experts: 10, technicallyEligible: 8, truncated: false, scanComplete: true },
          categoryCoverage: [
            { category: 'Mounting', launchReadyCount: 7, minimum: 4, target: 5 },
            { category: 'Curtains & Blinds', launchReadyCount: 4, minimum: 4, target: 5 },
            { category: 'Minor Repairs', launchReadyCount: 3, minimum: 4, target: 5 },
          ],
        })}
      />
    );
    expect(screen.getByText('Mounting').closest('.ad-pilot-readiness__row')).toHaveTextContent('HEALTHY');
    expect(screen.getByText('Curtains & Blinds').closest('.ad-pilot-readiness__row')).toHaveTextContent('ADEQUATE');
    expect(screen.getByText('Minor Repairs').closest('.ad-pilot-readiness__row')).toHaveTextContent('UNDER-COVERED');
  });

  it('renders geography COVERED / UNCOVERED from API service-area counts', () => {
    render(
      <PilotReadinessSection
        loadState="ok"
        snapshot={readySnapshot({
          totals: { launchReady: 7, experts: 10, technicallyEligible: 8, truncated: false, scanComplete: true },
          geographyCoverage: [
            { area: 'Richmond', launchReadyCount: 2 },
            { area: 'Carlton', launchReadyCount: 0 },
          ],
        })}
      />
    );
    expect(screen.getByText('Richmond').closest('.ad-pilot-readiness__row')).toHaveTextContent('COVERED');
    expect(screen.getByText('Carlton').closest('.ad-pilot-readiness__row')).toHaveTextContent('UNCOVERED');
  });

  it('shows SUPPLY READY when supply criteria are met and never READY TO OPEN', () => {
    const { container } = render(<PilotReadinessSection loadState="ok" snapshot={readySnapshot()} />);
    expect(screen.getByText('Pilot supply status')).toBeInTheDocument();
    expect(screen.getAllByText('SUPPLY READY').length).toBeGreaterThan(0);
    expect(screen.getByText(/does not open homeowner posting/i)).toBeInTheDocument();
    expect(screen.getAllByText(/Other launch gates and explicit owner activation/i).length).toBeGreaterThan(0);
    expect(screen.queryByText('READY TO OPEN')).not.toBeInTheDocument();
    expect(screen.getAllByText('CLOSED').length).toBeGreaterThan(0);
    expect(screen.queryByRole('button', { name: /open posting|activate/i })).toBeNull();
    expect(container.querySelector('[data-open-posting]')).toBeNull();
  });

  it('shows SUPPLY NOT READY when target, category, or geography fail', () => {
    render(
      <PilotReadinessSection
        loadState="ok"
        snapshot={readySnapshot({
          totals: { launchReady: 7, experts: 10, technicallyEligible: 8, truncated: false, scanComplete: true },
        })}
      />
    );
    expect(screen.getAllByText('SUPPLY NOT READY').length).toBeGreaterThan(0);
    expect(screen.queryByText('READY TO OPEN')).not.toBeInTheDocument();
    expect(screen.queryByText('SUPPLY READY')).not.toBeInTheDocument();
    expect(screen.getByText('7 / 15')).toBeInTheDocument();
  });

  it('shows DATA INCOMPLETE when the scan is truncated', () => {
    render(
      <PilotReadinessSection
        loadState="ok"
        snapshot={readySnapshot({
          totals: { launchReady: 15, experts: 250, technicallyEligible: 200, truncated: true, scanComplete: false },
        })}
      />
    );
    expect(screen.getAllByText('DATA INCOMPLETE').length).toBeGreaterThan(0);
    expect(screen.queryByText('READY TO OPEN')).not.toBeInTheDocument();
    expect(screen.queryByText('SUPPLY READY')).not.toBeInTheDocument();
    expect(screen.getByText(/readiness cannot be proven/i)).toBeInTheDocument();
  });

  it('shows DATA UNAVAILABLE on API error without fake zero SUPPLY NOT READY', () => {
    render(<PilotReadinessSection loadState="error" snapshot={null} />);
    expect(screen.getByText('DATA UNAVAILABLE')).toBeInTheDocument();
    expect(screen.getByText('Pilot readiness data unavailable')).toBeInTheDocument();
    expect(screen.queryByText('SUPPLY NOT READY')).not.toBeInTheDocument();
    expect(screen.queryByText('READY TO OPEN')).not.toBeInTheDocument();
    expect(screen.queryByText('0 / 15')).not.toBeInTheDocument();
  });

  it('shows a useful empty state when there are zero Experts', () => {
    render(
      <PilotReadinessSection
        loadState="ok"
        snapshot={readySnapshot({
          totals: { launchReady: 0, experts: 0, technicallyEligible: 0, truncated: false, scanComplete: true },
          categoryCoverage: [{ category: 'Mounting', launchReadyCount: 0, minimum: 4, target: 5 }],
          geographyCoverage: [{ area: 'Richmond', launchReadyCount: 0 }],
        })}
      />
    );
    expect(screen.getByText('0 / 15')).toBeInTheDocument();
    expect(screen.getAllByText('SUPPLY NOT READY').length).toBeGreaterThan(0);
    expect(screen.queryByText('READY TO OPEN')).not.toBeInTheDocument();
    expect(screen.getByText(/Recruit and onboard launch-ready Experts/i)).toBeInTheDocument();
  });

  it('does not invent category counts from an Admin users table', () => {
    render(
      <PilotReadinessSection
        loadState="ok"
        snapshot={readySnapshot({
          categoryCoverage: [{ category: 'Mounting', launchReadyCount: 2, minimum: 4, target: 5 }],
        })}
      />
    );
    expect(screen.getByLabelText(/Mounting: 2 launch-ready Experts/)).toBeInTheDocument();
    expect(screen.queryByText(/verified and .* active/i)).not.toBeInTheDocument();
  });
});
